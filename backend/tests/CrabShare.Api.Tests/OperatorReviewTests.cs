using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
public class OperatorReviewTests(OperatorDatabaseFixture fixture) : IClassFixture<OperatorDatabaseFixture>
{
    private async Task<(HttpClient Client, AuthResponse Auth)> UserAsync(string? role = null)
    {
        var client = fixture.Factory.CreateClient();
        const string password = "Test-password-123";
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"{Guid.NewGuid():N}@test.local", password, fullName = "VI02 test", role = "Customer" });
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        if (role is not null)
        {
            await using var db = fixture.OpenDb();
            db.AppUserRoles.Add(new AppUserRole { UserId = auth.User.UserId, RoleCode = role,
                GrantedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            auth = (await (await client.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password }))
                .Content.ReadFromJsonAsync<AuthResponse>())!;
        }
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private static async Task<long> OperatorAsync(HttpClient owner, bool submit = true)
    {
        var response = await owner.PostAsJsonAsync("/api/operators", new
        { legalName = "HTX VI02", taxCode = Random.Shared.NextInt64(1000000000, 9999999999).ToString(), businessRegNo = "VI02", farmAddress = "Cà Mau" });
        response.EnsureSuccessStatusCode();
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operatorId").GetInt64();
        if (submit) (await owner.PostAsync("/api/operators/me/submit", null)).EnsureSuccessStatusCode();
        return id;
    }

    [Fact]
    public async Task Admin_list_filters_and_paginates_and_enforces_permissions()
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (admin, _) = await UserAsync(Roles.PlatformAdmin);
        var page = await admin.GetFromJsonAsync<JsonElement>("/api/admin/operators?status=Submitted&page=1&pageSize=100");
        Assert.Contains(page.GetProperty("items").EnumerateArray(), x => x.GetProperty("operatorId").GetInt64() == id);
        Assert.All(page.GetProperty("items").EnumerateArray(), x => Assert.Equal("Submitted", x.GetProperty("status").GetString()));
        var single = await admin.GetFromJsonAsync<JsonElement>("/api/admin/operators?status=Submitted&pageSize=1");
        Assert.Single(single.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/operators?status=Unknown")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/operators?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/admin/operators")).StatusCode);
        var (reviewer, _) = await UserAsync(Roles.EvidenceReviewer);
        Assert.Equal(HttpStatusCode.Forbidden, (await reviewer.GetAsync("/api/admin/operators")).StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(155)]
    [InlineData(int.MaxValue)]
    public async Task Approve_persists_capacity_actor_and_audit(int capacity)
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (admin, auth) = await UserAsync(Roles.PlatformAdmin);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = capacity })).StatusCode);
        await using var db = fixture.OpenDb();
        var op = await db.Operators.SingleAsync(o => o.OperatorId == id);
        Assert.Equal("Approved", op.Status);
        Assert.Equal(capacity, op.ApprovedSlotCapacity);
        Assert.Equal(auth.User.UserId, op.ApprovedBy);
        Assert.NotNull(op.ApprovedAt);
        var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == "operator" && a.EntityId == id);
        Assert.Equal("approve", audit.ActionType);
        Assert.Equal(auth.User.UserId, audit.ActorUserId);
        Assert.Equal("Submitted", JsonDocument.Parse(audit.OldValue!).RootElement.GetProperty("status").GetString());
        Assert.Equal(capacity, JsonDocument.Parse(audit.NewValue!).RootElement.GetProperty("approvedSlotCapacity").GetInt32());
        Assert.Equal(op.ApprovedAt, audit.OccurredAt);
        Assert.Matches("^[0-9a-f]{64}$", audit.RowHash);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 999 })).StatusCode);
        Assert.Single(await db.AuditLogs.Where(a => a.EntityId == id && a.EntityType == "operator").ToListAsync());
    }

    [Theory]
    [InlineData("reject", "Submitted", "Rejected")]
    [InlineData("suspend", "Approved", "Suspended")]
    public async Task Decision_requires_reason_and_records_it(string action, string source, string target)
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (admin, _) = await UserAsync(Roles.PlatformAdmin);
        if (source == "Approved") (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 20 })).EnsureSuccessStatusCode();
        foreach (var body in new object[] { new { }, new { reason = "   " } })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/{action}", body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/{action}", new { reason = "  Cần bổ sung hồ sơ  " })).StatusCode);
        await using var db = fixture.OpenDb();
        Assert.Equal(target, (await db.Operators.FindAsync(id))!.Status);
        var audit = await db.AuditLogs.SingleAsync(a => a.EntityId == id && a.EntityType == "operator" && a.ActionType == action);
        var value = JsonDocument.Parse(audit.NewValue!).RootElement;
        Assert.Equal(target, value.GetProperty("status").GetString());
        Assert.Equal("Cần bổ sung hồ sơ", value.GetProperty("reason").GetString());
        Assert.Equal(source, JsonDocument.Parse(audit.OldValue!).RootElement.GetProperty("status").GetString());
    }

    [Theory]
    [InlineData("approve", "Draft")]
    [InlineData("approve", "Rejected")]
    [InlineData("reject", "Approved")]
    [InlineData("reject", "Suspended")]
    [InlineData("suspend", "Submitted")]
    [InlineData("suspend", "Suspended")]
    public async Task Invalid_transitions_do_not_write_audit(string action, string status)
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner, false);
        await using var db = fixture.OpenDb();
        await db.Operators.Where(o => o.OperatorId == id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, status));
        var (admin, _) = await UserAsync(Roles.PlatformAdmin);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/{action}", new { approvedSlotCapacity = 10, reason = "test" })).StatusCode);
        Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityId == id && a.EntityType == "operator"));
        Assert.Equal(status, (await db.Operators.FindAsync(id))!.Status);
    }

    [Fact]
    public async Task Invalid_capacity_and_missing_operator_and_revoked_admin_are_rejected()
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (admin, auth) = await UserAsync(Roles.PlatformAdmin);
        foreach (var body in new object[] { new { }, new { approvedSlotCapacity = -1 }, new { approvedSlotCapacity = 1.5 }, new { approvedSlotCapacity = 2147483648L } })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", body)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync("/api/admin/operators/9223372036854775807/approve", new { approvedSlotCapacity = 10 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 10 })).StatusCode);
        await using var db = fixture.OpenDb();
        await db.AppUserRoles.Where(r => r.UserId == auth.User.UserId && r.RoleCode == Roles.PlatformAdmin).ExecuteDeleteAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/admin/operators")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 10 })).StatusCode);
    }

    [Fact]
    public async Task Concurrent_decisions_have_one_winner_and_audit_chain_does_not_fork()
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (admin, _) = await UserAsync(Roles.PlatformAdmin);
        var results = await Task.WhenAll(
            admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 10 }),
            admin.PostAsJsonAsync($"/api/admin/operators/{id}/reject", new { reason = "test" }));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        var (other, _) = await UserAsync();
        var otherId = await OperatorAsync(other);
        var (third, _) = await UserAsync();
        var thirdId = await OperatorAsync(third);
        var concurrent = await Task.WhenAll(
            admin.PostAsJsonAsync($"/api/admin/operators/{otherId}/approve", new { approvedSlotCapacity = 1 }),
            admin.PostAsJsonAsync($"/api/admin/operators/{thirdId}/approve", new { approvedSlotCapacity = 2 }));
        Assert.All(concurrent, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        await using var db = fixture.OpenDb();
        Assert.Single(await db.AuditLogs.Where(a => a.EntityId == id && a.EntityType == "operator").ToListAsync());
        var rows = await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync();
        string? previous = null;
        foreach (var row in rows)
        {
            Assert.Equal(previous, row.PrevHash);
            var content = JsonSerializer.Serialize(new { entityType = row.EntityType, entityId = row.EntityId,
                actionType = row.ActionType, oldValue = row.OldValue, newValue = row.NewValue,
                actorUserId = row.ActorUserId, occurredAt = row.OccurredAt });
            Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previous ?? "") + content))), row.RowHash);
            previous = row.RowHash;
        }
    }

    [Fact]
    public async Task Owner_manages_staff_without_trusting_client_scope_and_old_token_loses_access()
    {
        var (owner, ownerAuth) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (staff, staffAuth) = await UserAsync();
        var add = await owner.PostAsJsonAsync("/api/operators/me/members", new { email = staffAuth.User.Email.ToUpperInvariant(), memberRole = "Owner", operatorId = 999 });
        Assert.Equal(HttpStatusCode.Created, add.StatusCode);
        var created = await add.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Staff", created.GetProperty("memberRole").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync("/api/operators/me/members", new { email = staffAuth.User.Email })).StatusCode);
        var members = await owner.GetFromJsonAsync<JsonElement>("/api/operators/me/members");
        Assert.Equal(2, members.GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/operators/me/members")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/api/operators/me/members", new { email = ownerAuth.User.Email })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.DeleteAsync($"/api/operators/me/members/{ownerAuth.User.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.DeleteAsync($"/api/operators/me/members/{ownerAuth.User.UserId}")).StatusCode);
        var login = await staff.PostAsJsonAsync("/api/auth/login", new { email = staffAuth.User.Email, password = "Test-password-123" });
        var token = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        staff.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        Assert.Equal(id, token.User.OperatorId);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/operators/me/members/{staffAuth.User.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await staff.GetAsync("/api/operators/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/operators/me/members")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync("/api/operators/me", new { legalName = "Attack", taxCode = "1", businessRegNo = "1", farmAddress = "1" })).StatusCode);
        await using var db = fixture.OpenDb();
        Assert.False(await db.AppUserRoles.AnyAsync(r => r.UserId == staffAuth.User.UserId && r.RoleCode == Roles.OperatorMember));
        Assert.True(await db.AppUserRoles.AnyAsync(r => r.UserId == staffAuth.User.UserId && r.RoleCode == Roles.Customer));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"/api/operators/me/members/{staffAuth.User.UserId}")).StatusCode);
    }

    [Fact]
    public async Task Cross_operator_management_and_invalid_staff_are_rejected()
    {
        var (first, firstAuth) = await UserAsync();
        await OperatorAsync(first);
        var (second, secondAuth) = await UserAsync();
        await OperatorAsync(second);
        Assert.Equal(HttpStatusCode.NotFound, (await first.DeleteAsync($"/api/operators/me/members/{secondAuth.User.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await first.PostAsJsonAsync("/api/operators/me/members", new { email = secondAuth.User.Email })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await first.PostAsJsonAsync("/api/operators/me/members", new { email = firstAuth.User.Email })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await first.PostAsJsonAsync("/api/operators/me/members", new { email = "invalid" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await first.PostAsJsonAsync("/api/operators/me/members", new { email = "missing@test.local" })).StatusCode);
        var (_, lockedAuth) = await UserAsync();
        await using var db = fixture.OpenDb();
        await db.AppUsers.Where(u => u.UserId == lockedAuth.User.UserId).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await first.PostAsJsonAsync("/api/operators/me/members", new { email = lockedAuth.User.Email })).StatusCode);
    }

    [Fact]
    public async Task Audit_failure_rolls_back_operator_and_audit_together()
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (_, adminAuth) = await UserAsync(Roles.PlatformAdmin);
        await using var failing = fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddDbContext<AppDbContext>(options => options.AddInterceptors(new FailAfterSave()))));
        using var client = failing.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.AccessToken);
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await client.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 100 })).StatusCode);
        await using var db = fixture.OpenDb();
        var op = (await db.Operators.FindAsync(id))!;
        Assert.Equal("Submitted", op.Status);
        Assert.Equal(0, op.ApprovedSlotCapacity);
        Assert.Null(op.ApprovedAt);
        Assert.Null(op.ApprovedBy);
        Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityType == "operator" && a.EntityId == id));
    }

    private sealed class FailAfterSave : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException("VI02 test: fail before transaction commit");
        }
    }

    [Fact]
    public async Task Shared_audit_writer_failure_rolls_back_operator_and_audit_together()
    {
        var (owner, _) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (_, adminAuth) = await UserAsync(Roles.PlatformAdmin);
        await using var failing = fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddScoped<IAuditLog, FailAfterAuditWrite>()));
        using var client = failing.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.AccessToken);

        Assert.Equal(HttpStatusCode.InternalServerError,
            (await client.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 100 })).StatusCode);

        await using var db = fixture.OpenDb();
        var op = (await db.Operators.FindAsync(id))!;
        Assert.Equal("Submitted", op.Status);
        Assert.Equal(0, op.ApprovedSlotCapacity);
        Assert.Null(op.ApprovedAt);
        Assert.Null(op.ApprovedBy);
        Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityType == "operator" && a.EntityId == id));
    }

    private sealed class FailAfterAuditWrite(AppDbContext db, ICurrentUser me, TimeProvider clock) : IAuditLog
    {
        private readonly AuditLogService inner = new(db, me, clock);

        public Task LockAsync(CancellationToken ct) => inner.LockAsync(ct);

        public Task WriteAsync(string entityType, long entityId, string action, object? oldValue, object? newValue, CancellationToken ct)
            => WriteAsync(entityType, entityId, action, oldValue, newValue, clock.GetUtcNow(), ct);

        public async Task WriteAsync(string entityType, long entityId, string action, object? oldValue, object? newValue,
            DateTimeOffset occurredAt, CancellationToken ct)
        {
            await inner.WriteAsync(entityType, entityId, action, oldValue, newValue, occurredAt, ct);
            throw new InvalidOperationException("VI02 test: shared audit writer failed after saving");
        }

        public Task<AuditChainResult> VerifyChainAsync(long? fromAuditId, long? toAuditId, CancellationToken ct)
            => inner.VerifyChainAsync(fromAuditId, toAuditId, ct);
    }

    [Fact]
    public async Task Concurrent_staff_additions_keep_one_membership_and_one_role()
    {
        var (first, _) = await UserAsync();
        var firstId = await OperatorAsync(first);
        var (second, _) = await UserAsync();
        var secondId = await OperatorAsync(second);
        var (_, staff) = await UserAsync();
        var responses = await Task.WhenAll(
            first.PostAsJsonAsync("/api/operators/me/members", new { email = staff.User.Email }),
            second.PostAsJsonAsync("/api/operators/me/members", new { email = staff.User.Email }));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        await using var db = fixture.OpenDb();
        var member = await db.OperatorMembers.SingleAsync(m => m.UserId == staff.User.UserId);
        Assert.Contains(member.OperatorId, new[] { firstId, secondId });
        Assert.Equal("Staff", member.MemberRole);
        Assert.Equal(1, await db.AppUserRoles.CountAsync(r => r.UserId == staff.User.UserId && r.RoleCode == Roles.OperatorMember));
    }

    [Fact]
    public async Task Token_for_previous_operator_cannot_access_new_membership()
    {
        var (first, _) = await UserAsync();
        await OperatorAsync(first);
        var (second, _) = await UserAsync();
        await OperatorAsync(second);
        var (staff, auth) = await UserAsync();
        (await first.PostAsJsonAsync("/api/operators/me/members", new { email = auth.User.Email })).EnsureSuccessStatusCode();
        var login = await staff.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password = "Test-password-123" });
        var token = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        staff.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        (await first.DeleteAsync($"/api/operators/me/members/{auth.User.UserId}")).EnsureSuccessStatusCode();
        (await second.PostAsJsonAsync("/api/operators/me/members", new { email = auth.User.Email })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/operators/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/operators/me/members")).StatusCode);
    }

    [Fact]
    public async Task Member_write_failure_rolls_back_membership_and_role_for_add_and_remove()
    {
        var (owner, auth) = await UserAsync();
        await OperatorAsync(owner);
        var (_, staff) = await UserAsync();
        await using var failing = fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddDbContext<AppDbContext>(options => options.AddInterceptors(new FailAfterSave()))));
        using var client = failing.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await client.PostAsJsonAsync("/api/operators/me/members", new { email = staff.User.Email })).StatusCode);
        await using var db = fixture.OpenDb();
        Assert.False(await db.OperatorMembers.AnyAsync(m => m.UserId == staff.User.UserId));
        Assert.False(await db.AppUserRoles.AnyAsync(r => r.UserId == staff.User.UserId && r.RoleCode == Roles.OperatorMember));
        (await owner.PostAsJsonAsync("/api/operators/me/members", new { email = staff.User.Email })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await client.DeleteAsync($"/api/operators/me/members/{staff.User.UserId}")).StatusCode);
        Assert.True(await db.OperatorMembers.AnyAsync(m => m.UserId == staff.User.UserId && m.MemberRole == "Staff"));
        Assert.True(await db.AppUserRoles.AnyAsync(r => r.UserId == staff.User.UserId && r.RoleCode == Roles.OperatorMember));
    }

    [Fact]
    public async Task Inactive_admin_and_inactive_or_revoked_owner_cannot_manage()
    {
        var (owner, ownerAuth) = await UserAsync();
        var id = await OperatorAsync(owner);
        var (admin, adminAuth) = await UserAsync(Roles.PlatformAdmin);
        var (_, staff) = await UserAsync();
        await using var db = fixture.OpenDb();
        await db.AppUsers.Where(u => u.UserId == adminAuth.User.UserId || u.UserId == ownerAuth.User.UserId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await admin.GetAsync("/api/admin/operators")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await admin.PostAsJsonAsync($"/api/admin/operators/{id}/approve", new { approvedSlotCapacity = 10 })).StatusCode);
        async Task AssertOwnerDenied(HttpStatusCode expected = HttpStatusCode.Forbidden)
        {
            Assert.Equal(expected, (await owner.GetAsync("/api/operators/me/members")).StatusCode);
            Assert.Equal(expected, (await owner.PostAsJsonAsync("/api/operators/me/members", new { email = staff.User.Email })).StatusCode);
            Assert.Equal(expected, (await owner.DeleteAsync($"/api/operators/me/members/{staff.User.UserId}")).StatusCode);
        }
        await AssertOwnerDenied(HttpStatusCode.Unauthorized);
        await db.AppUsers.Where(u => u.UserId == ownerAuth.User.UserId).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Active"));
        await db.AppUserRoles.Where(r => r.UserId == ownerAuth.User.UserId && r.RoleCode == Roles.OperatorMember).ExecuteDeleteAsync();
        await AssertOwnerDenied();
    }
}
