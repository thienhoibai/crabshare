using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class AdminAccountDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private const string Password = "TestOnly2026!";
    private async Task<T> Run<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
    private HttpClient Client(long id, string role = Roles.PlatformAdmin)
    {
        var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", role); return client;
    }
    private Task<AppUser> CreateUser(string role = Roles.PlatformAdmin, string status = "Active", string? name = null)
        => Run(async db =>
        {
            var user = new AppUser { Email = $"kh04-{Guid.NewGuid():N}@test.local", FullName = name ?? "KH04 Test", Status = status,
                CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, Password);
            user.AppUserRoles.Add(new AppUserRole { RoleCode = role });
            if (role == Roles.Investor) user.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Rejected" };
            db.AppUsers.Add(user); await db.SaveChangesAsync(); return user;
        });
    private Task<long> Check(long userId, string type = "EkycIdFace", string result = "Failed", int daysAgo = 0)
        => Run(async db =>
        {
            var now = DateTimeOffset.UtcNow.AddDays(-daysAgo);
            var check = new KycCheck { UserId = userId, CheckType = type, Result = result, ConsentAt = type == "EkycIdFace" ? now : null,
                FailureReason = "Provider failed", ProviderRef = "TEST-ONLY", CheckedAt = now, CreatedAt = now };
            db.KycChecks.Add(check); await db.SaveChangesAsync(); return check.KycCheckId;
        });

    [Fact]
    public async Task User_list_filters_roles_status_search_and_paginates_without_private_credentials()
    {
        var admin = await CreateUser(); var tag = Guid.NewGuid().ToString("N");
        await CreateUser(Roles.Investor, "Active", tag); await CreateUser(Roles.Investor, "Locked", tag); await CreateUser(Roles.Customer, "Active", tag);
        using var client = Client(admin.UserId);
        var list = (await client.GetFromJsonAsync<PagedResult<AdminUserResponse>>($"/api/admin/users?role=Investor&q={tag}&pageSize=1"))!;
        Assert.Equal(2, list.Total); Assert.Single(list.Items); Assert.Contains(Roles.Investor, list.Items[0].Roles);
        var next = (await client.GetFromJsonAsync<PagedResult<AdminUserResponse>>($"/api/admin/users?role=Investor&q={tag}&pageSize=1&page=2"))!;
        Assert.NotEqual(list.Items[0].UserId, next.Items[0].UserId);
        var active = (await client.GetFromJsonAsync<PagedResult<AdminUserResponse>>($"/api/admin/users?role=Investor&status=Active&q={tag}"))!;
        Assert.Single(active.Items); Assert.Equal("Active", active.Items[0].Status);
        Assert.Empty((await client.GetFromJsonAsync<PagedResult<AdminUserResponse>>("/api/admin/users?page=2147483647&pageSize=100"))!.Items);
        var json = await client.GetStringAsync($"/api/admin/users/{active.Items[0].UserId}");
        Assert.DoesNotContain("password", json, StringComparison.OrdinalIgnoreCase); Assert.DoesNotContain("image", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Lock_blocks_login_and_existing_jwt_unlock_restores_access_with_audit()
    {
        var admin = await CreateUser(); var user = await CreateUser(Roles.Customer);
        using var manager = Client(admin.UserId);
        using var jwtFactory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.PostConfigure<AuthenticationOptions>(o =>
        { o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme; o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme; o.DefaultForbidScheme = JwtBearerDefaults.AuthenticationScheme; })));
        using var jwtClient = jwtFactory.CreateClient();
        var login = await jwtClient.PostAsJsonAsync("/api/auth/login", new { user.Email, Password }); login.EnsureSuccessStatusCode();
        var token = (await login.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;
        jwtClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.OK, (await jwtClient.GetAsync("/api/auth/me")).StatusCode);
        (await manager.PostAsJsonAsync($"/api/admin/users/{user.UserId}/lock", new { reason = "Test lock" })).EnsureSuccessStatusCode();
        var denied = await jwtClient.PostAsJsonAsync("/api/auth/login", new { user.Email, Password });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("auth.locked", (await denied.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await jwtClient.GetAsync("/api/auth/me")).StatusCode);
        (await manager.PostAsJsonAsync($"/api/admin/users/{user.UserId}/unlock", new { reason = "Test unlock" })).EnsureSuccessStatusCode();
        (await jwtClient.PostAsJsonAsync("/api/auth/login", new { user.Email, Password })).EnsureSuccessStatusCode();
        await Run(async db => { var audits = await db.AuditLogs.Where(a => a.EntityType == "AppUser" && a.EntityId == user.UserId).OrderBy(a => a.AuditId).ToListAsync();
            Assert.Equal(new[] { "LockUser", "UnlockUser" }, audits.Select(a => a.ActionType)); Assert.All(audits, a => Assert.Equal(admin.UserId, a.ActorUserId)); return true; });
    }

    [Fact]
    public async Task Pending_status_is_restored_and_self_lock_and_stale_admin_rights_are_denied()
    {
        var admin = await CreateUser(); var pending = await CreateUser(Roles.Customer, "PendingVerification"); using var client = Client(admin.UserId);
        (await client.PostAsJsonAsync($"/api/admin/users/{pending.UserId}/lock", new { reason = "Test" })).EnsureSuccessStatusCode();
        var response = await client.PostAsJsonAsync($"/api/admin/users/{pending.UserId}/unlock", new { reason = "Test" }); response.EnsureSuccessStatusCode();
        Assert.Equal("PendingVerification", (await response.Content.ReadFromJsonAsync<AdminUserResponse>())!.Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/admin/users/{admin.UserId}/lock", new { reason = "Test" })).StatusCode);
        await Run(async db => { db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == admin.UserId)); await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/users")).StatusCode);
    }

    [Fact]
    public async Task Exception_verifies_investor_records_reviewer_and_preserves_provider_result_metadata()
    {
        var admin = await CreateUser(); var investor = await CreateUser(Roles.Investor); var id = await Check(investor.UserId); using var client = Client(admin.UserId);
        var queue = (await client.GetFromJsonAsync<PagedResult<AdminKycResponse>>("/api/admin/kyc-checks?result=Failed"))!;
        Assert.True(queue.Items.Single(c => c.Id == id).CanApproveException);
        var response = await client.PostAsJsonAsync($"/api/admin/kyc-checks/{id}/approve-exception", new { reason = "Reviewed metadata" }); response.EnsureSuccessStatusCode();
        var check = (await response.Content.ReadFromJsonAsync<AdminKycResponse>())!;
        Assert.Equal("ExceptionApproved", check.Result); Assert.Equal(admin.UserId, check.ReviewedBy); Assert.Equal("Provider failed", check.FailureReason); Assert.False(check.CanApproveException);
        var detail = (await client.GetFromJsonAsync<AdminUserDetailResponse>($"/api/admin/users/{investor.UserId}"))!;
        Assert.Equal("Verified", detail.User.VerificationStatus); Assert.NotNull(detail.VerifiedAt);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync($"/api/admin/kyc-checks/{id}/approve-exception", new { reason = "Again" })).StatusCode);
        await Run(async db => { var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == "KycCheck" && a.EntityId == id);
            Assert.Equal(admin.UserId, audit.ActorUserId); Assert.Contains("Reviewed metadata", audit.NewValue);
            var content = JsonSerializer.Serialize(new { audit.EntityType, audit.EntityId, audit.ActionType, audit.OldValue, audit.NewValue, audit.ActorUserId, audit.OccurredAt });
            Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((audit.PrevHash ?? "") + content))), audit.RowHash); return true; });
    }

    [Fact]
    public async Task Bank_checks_old_attempts_passed_checks_and_locked_investors_cannot_be_approved()
    {
        var admin = await CreateUser(); var investor = await CreateUser(Roles.Investor); using var client = Client(admin.UserId);
        var bank = await Check(investor.UserId, "BankNameMatch"); var old = await Check(investor.UserId, daysAgo: 2); var latest = await Check(investor.UserId, result: "Passed");
        foreach (var id in new[] { bank, old, latest })
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync($"/api/admin/kyc-checks/{id}/approve-exception", new { reason = "Test" })).StatusCode);
        var locked = await CreateUser(Roles.Investor, "Locked"); var lockedId = await Check(locked.UserId);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync($"/api/admin/kyc-checks/{lockedId}/approve-exception", new { reason = "Test" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/admin/users/9223372036854775807")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/admin/kyc-checks/9223372036854775807/approve-exception", new { reason = "Test" })).StatusCode);
    }

    [Fact]
    public async Task Concurrent_approvals_have_one_success_and_one_audit()
    {
        var admin = await CreateUser(); var investor = await CreateUser(Roles.Investor); var id = await Check(investor.UserId);
        using var a = Client(admin.UserId); using var b = Client(admin.UserId);
        var responses = await Task.WhenAll(a.PostAsJsonAsync($"/api/admin/kyc-checks/{id}/approve-exception", new { reason = "First" }), b.PostAsJsonAsync($"/api/admin/kyc-checks/{id}/approve-exception", new { reason = "Second" }));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(responses, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        Assert.Equal(1, await Run(db => db.AuditLogs.CountAsync(a => a.EntityType == "KycCheck" && a.EntityId == id)));
    }

    [Fact]
    public async Task Self_approval_is_forbidden_and_failure_before_commit_rolls_back_kyc_investor_and_audit()
    {
        var admin = await CreateUser(); var investor = await CreateUser(Roles.Investor); var id = await Check(investor.UserId);
        await Run(async db => { db.Investors.Add(new Investor { UserId = admin.UserId, InvestorKind = "Individual", VerificationStatus = "Rejected" }); await db.SaveChangesAsync(); return true; });
        var ownId = await Check(admin.UserId);
        using var manager = Client(admin.UserId);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PostAsJsonAsync($"/api/admin/kyc-checks/{ownId}/approve-exception", new { reason = "Self" })).StatusCode);
        using var failing = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddDbContext<AppDbContext>(o => o.AddInterceptors(new FailAfterApprovalSave()))));
        using var client = failing.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", admin.UserId.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.PlatformAdmin);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsJsonAsync($"/api/admin/kyc-checks/{id}/approve-exception", new { reason = "Fail transaction" })).StatusCode);
        await Run(async db => {
            var check = await db.KycChecks.SingleAsync(c => c.KycCheckId == id);
            Assert.Equal("Failed", check.Result); Assert.Null(check.ReviewedBy);
            Assert.Equal("Rejected", (await db.Investors.SingleAsync(i => i.UserId == investor.UserId)).VerificationStatus);
            Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityType == "KycCheck" && a.EntityId == id)); return true;
        });
    }

    private sealed class FailAfterApprovalSave : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<AuditLog>().Any(a => a.Entity.ActionType == "ApproveKycException"))
                throw new InvalidOperationException("Test: fail before transaction commit.");
            return base.SavedChangesAsync(eventData, result, cancellationToken);
        }
    }
}
