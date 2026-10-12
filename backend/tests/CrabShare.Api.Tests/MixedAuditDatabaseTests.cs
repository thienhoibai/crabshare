using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class MixedAuditDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
    private HttpClient Client(long id, string role)
    {
        var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", role); return client;
    }
    private Task<(long AdminId, long OperatorId)> Setup() => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var admin = new AppUser { FullName = "Audit Admin", Email = $"audit-admin-{Guid.NewGuid():N}@test.local", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now };
        admin.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.PlatformAdmin, GrantedAt = now, CreatedAt = now });
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Audit Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "AUDIT", FarmAddress = "Test", Status = "Submitted", CreatedAt = now, UpdatedAt = now };
        db.AppUsers.Add(admin); db.Operators.Add(op); await db.SaveChangesAsync(); return (admin.UserId, op.OperatorId);
    });
    private static object Bank() => new { bankCode = "VCB", accountNo = Random.Shared.NextInt64(1000000000, 9999999999).ToString(), accountHolderName = "KYC Test" };

    private Task<int> AssertChain() => Db(async db =>
    {
        var rows = await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync();
        string? previous = null;
        foreach (var row in rows)
        {
            Assert.Equal(previous, row.PrevHash);
            Assert.Matches("^[0-9a-f]{64}$", row.RowHash);
            if (row.PrevHash is not null) Assert.Matches("^[0-9a-f]{64}$", row.PrevHash);
            // Serializer và thứ tự trường độc lập, đúng nguyên mẫu CS-25, không gọi helper đang kiểm thử.
            var content = JsonSerializer.Serialize(new { entityType = row.EntityType, entityId = row.EntityId, actionType = row.ActionType,
                oldValue = row.OldValue, newValue = row.NewValue, actorUserId = row.ActorUserId, occurredAt = row.OccurredAt });
            Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previous ?? "") + content))), row.RowHash);
            Assert.Equal(0, row.OccurredAt.Ticks % TimeSpan.TicksPerMillisecond);
            foreach (var snapshot in new[] { row.OldValue, row.NewValue }.Where(v => v is not null))
            {
                using var json = JsonDocument.Parse(snapshot!);
                Assert.All(json.RootElement.EnumerateObject(), property => Assert.True(char.IsLower(property.Name[0])));
            }
            previous = row.RowHash;
        }
        return rows.Count;
    });

    [Fact]
    public async Task All_Accounts_features_and_CS25_form_one_verifiable_lowercase_chain()
    {
        var before = await Db(db => db.AuditLogs.CountAsync());
        var setup = await Setup(); var userId = await fixture.CreateInvestorAsync();
        using var investor = Client(userId, Roles.Investor); using var admin = Client(setup.AdminId, Roles.PlatformAdmin);
        using var images = KycControllerTests.Images();
        (await investor.PostAsync("/api/kyc/ekyc", images)).EnsureSuccessStatusCode();
        (await investor.PutAsJsonAsync("/api/me/payout-account", Bank())).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync($"/api/admin/users/{userId}/lock", new { reason = "Audit test" })).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync($"/api/admin/users/{userId}/unlock", new { reason = "Audit test" })).EnsureSuccessStatusCode();
        var rejectedId = await fixture.CreateInvestorAsync("Rejected");
        var checkId = await Db(async db => { var now = DateTimeOffset.UtcNow; var check = new KycCheck { UserId = rejectedId, CheckType = "EkycIdFace", Result = "Failed", ConsentAt = now, CheckedAt = now, CreatedAt = now }; db.KycChecks.Add(check); await db.SaveChangesAsync(); return check.KycCheckId; });
        (await admin.PostAsJsonAsync($"/api/admin/kyc-checks/{checkId}/approve-exception", new { reason = "Audit test" })).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync($"/api/admin/operators/{setup.OperatorId}/approve", new { approvedSlotCapacity = 10 })).EnsureSuccessStatusCode();
        Assert.Equal(before + 6, await AssertChain());
    }

    [Fact]
    public async Task Concurrent_eKYC_payout_and_CS25_writers_do_not_fork_the_chain()
    {
        var before = await Db(db => db.AuditLogs.CountAsync());
        var setup = await Setup(); var userId = await fixture.CreateInvestorAsync();
        using var investorA = Client(userId, Roles.Investor); using var investorB = Client(userId, Roles.Investor); using var admin = Client(setup.AdminId, Roles.PlatformAdmin);
        using var images = KycControllerTests.Images();
        var responses = await Task.WhenAll(investorA.PostAsync("/api/kyc/ekyc", images), investorB.PutAsJsonAsync("/api/me/payout-account", Bank()),
            admin.PostAsJsonAsync($"/api/admin/operators/{setup.OperatorId}/approve", new { approvedSlotCapacity = 10 }));
        foreach (var response in responses) response.EnsureSuccessStatusCode();
        Assert.Equal(before + 3, await AssertChain());
    }
}
