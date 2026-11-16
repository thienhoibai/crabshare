using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public partial class AlertDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Farm(long UserId, long BatchId, string Code);
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
    private HttpClient Client(long id, string role = Roles.OperatorMember)
    {
        var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", role); return client;
    }
    private Task<Farm> SetupFarm(string memberRole = "Owner") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var user = new AppUser { Email = $"alert-{Guid.NewGuid():N}@test.local", FullName = "Alert Owner", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.OperatorMember, GrantedAt = now, CreatedAt = now });
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Alert Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved", CreatedAt = now, UpdatedAt = now };
        op.OperatorMembers.Add(new OperatorMember { User = user, MemberRole = memberRole, JoinedAt = now, CreatedAt = now });
        var batch = new Batch { BatchCode = "AL-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Alert Test", Status = "InProduction",
            SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300,
            MinContribution = 10, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, StockedAt = now.AddDays(-3), CreatedAt = now, UpdatedAt = now };
        db.Batches.Add(batch); await db.SaveChangesAsync(); return new Farm(user.UserId, batch.BatchId, batch.BatchCode);
    });
    private async Task<AlertResponse> Raise(Farm farm, string message = "Water quality", AlertSeverity severity = AlertSeverity.High, AlertType type = AlertType.WaterQuality)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<AlertService>().RaiseAsync(farm.BatchId, type, severity, message, TimeSpan.FromHours(2));
    }
    private Task<bool> AssertChain() => Db(async db =>
    {
        string? previous = null;
        foreach (var audit in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync())
        {
            Assert.Equal(previous, audit.PrevHash); Assert.Matches("^[0-9a-f]{64}$", audit.RowHash); Assert.True(AuditChain.VerifyHash(audit)); previous = audit.RowHash;
        }
        return true;
    });

    [Fact]
    public async Task Duplicate_raise_preserves_deadline_and_never_downgrades_severity()
    {
        var farm = await SetupFarm(); var first = await Raise(farm);
        var next = await Raise(farm, "Updated water quality", AlertSeverity.Low);
        Assert.Equal(first.Id, next.Id); Assert.Equal(first.RaisedAt, next.RaisedAt); Assert.Equal(first.AckDeadline, next.AckDeadline); Assert.Equal("High", next.Severity);
        Assert.Equal(1, await Db(db => db.Alerts.CountAsync(a => a.BatchId == farm.BatchId)));
        await AssertChain();
    }

    [Fact]
    public async Task Concurrent_raises_create_one_open_alert_and_a_single_audit_chain()
    {
        var farm = await SetupFarm();
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(i => Raise(farm, "Concurrent " + i)));
        Assert.Single(results.Select(a => a.Id).Distinct());
        Assert.Equal(1, await Db(db => db.Alerts.CountAsync(a => a.BatchId == farm.BatchId && a.Status == "Open")));
        await AssertChain();
    }

    [Theory]
    [InlineData("Owner")]
    [InlineData("Staff")]
    public async Task Member_can_list_and_acknowledge_only_their_farm(string memberRole)
    {
        var own = await SetupFarm(memberRole); var other = await SetupFarm(); var alert = await Raise(own); var foreign = await Raise(other);
        using var client = Client(own.UserId);
        var list = (await client.GetFromJsonAsync<List<AlertResponse>>("/api/operators/me/alerts"))!;
        Assert.Contains(list, a => a.Id == alert.Id); Assert.DoesNotContain(list, a => a.Id == foreign.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/alerts/{foreign.Id}/acknowledge", new { responseNote = "Other farm" })).StatusCode);
        var response = await client.PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "  Water adjusted  " }); response.EnsureSuccessStatusCode();
        var result = (await response.Content.ReadFromJsonAsync<AlertResponse>())!;
        Assert.Equal("Acknowledged", result.Status); Assert.Equal("Water adjusted", result.ResponseNote); Assert.Equal(own.UserId, result.AcknowledgedBy);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "Repeated" })).StatusCode);
        await AssertChain();
    }

    [Fact]
    public async Task Late_response_stays_escalated_and_repeated_raise_does_not_create_another_alert()
    {
        var farm = await SetupFarm(); var alert = await Raise(farm);
        await Db(async db => { (await db.Alerts.SingleAsync(a => a.AlertId == alert.Id)).AckDeadline = DateTimeOffset.UtcNow.AddMinutes(-1); await db.SaveChangesAsync(); return true; });
        using var client = Client(farm.UserId);
        var response = await client.PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "Late action" }); response.EnsureSuccessStatusCode();
        var result = (await response.Content.ReadFromJsonAsync<AlertResponse>())!;
        Assert.Equal("Escalated", result.Status); Assert.NotNull(result.EscalatedAt); Assert.NotNull(result.AcknowledgedAt);
        Assert.Equal(alert.Id, (await Raise(farm, "Still affected")).Id);
    }

    [Fact]
    public async Task Investor_must_have_a_confirmed_interest_in_the_batch()
    {
        var farm = await SetupFarm(); await Raise(farm);
        var id = await fixture.CreateInvestorAsync();
        await Db(async db => { db.AppUserRoles.Add(new AppUserRole { UserId = id, RoleCode = Roles.Investor, GrantedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); return true; });
        using var client = Client(id, Roles.Investor);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/batches/{farm.Code}/alerts")).StatusCode);
        await Db(async db => { db.CapitalShares.Add(new CapitalShare { BatchId = farm.BatchId, InvestorId = id, ConfirmedAmount = 10, SnapshottedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); return true; });
        Assert.Single((await client.GetFromJsonAsync<List<AlertResponse>>($"/api/batches/{farm.Code}/alerts"))!);
    }

    [Fact]
    public async Task Stale_role_or_locked_user_cannot_acknowledge()
    {
        var farm = await SetupFarm(); var alert = await Raise(farm);
        await Db(async db => { db.AppUserRoles.RemoveRange(await db.AppUserRoles.Where(r => r.UserId == farm.UserId).ToListAsync()); await db.SaveChangesAsync(); return true; });
        using var client = Client(farm.UserId);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "Stale JWT" })).StatusCode);
        await Db(async db => { (await db.AppUsers.SingleAsync(u => u.UserId == farm.UserId)).Status = "Locked"; await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/operators/me/alerts")).StatusCode);
    }

    [Fact]
    public async Task Concurrent_acknowledgements_commit_only_one_response()
    {
        var farm = await SetupFarm(); var alert = await Raise(farm);
        using var a = Client(farm.UserId); using var b = Client(farm.UserId);
        var results = await Task.WhenAll(a.PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "First" }),
            b.PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "Second" }));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await Db(db => db.AuditLogs.CountAsync(a => a.EntityType == "Alert" && a.EntityId == alert.Id && a.ActionType == "AcknowledgeAlert")));
        await AssertChain();
    }

    [Fact]
    public async Task Raise_participates_in_the_callers_transaction_and_rolls_back_with_it()
    {
        var farm = await SetupFarm();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var service = scope.ServiceProvider.GetRequiredService<AlertService>();
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            await AuditChain.LockAndReadTailAsync(db, default);
            await service.RaiseAsync(farm.BatchId, AlertType.WaterQuality, AlertSeverity.High, "Rollback", TimeSpan.FromHours(1));
            await transaction.RollbackAsync();
        });
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId)));
        await AssertChain();
    }
}
