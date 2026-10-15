using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Portfolio;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

public class NotificationControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData(null)] [InlineData(Roles.Customer)] [InlineData(Roles.OperatorMember)] [InlineData(Roles.PlatformAdmin)]
    public async Task Investor_authorization_is_required(string? role)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient();
        if (role != null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        Assert.Equal(role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await client.GetAsync("/api/me/notifications")).StatusCode);
    }
    [Theory]
    [InlineData("after=invalid")] [InlineData("until=invalid")] [InlineData("page=0")] [InlineData("pageSize=101")]
    [InlineData("after=2099-01-01T00:00:00Z")] [InlineData("until=2099-01-01T00:00:00Z")]
    public async Task Invalid_windows_or_paging_return_400(string query)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/me/notifications?" + query)).StatusCode);
    }
}

[Trait("Category", "Database"), Collection("KycDatabase")]
public class NotificationDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed class User(long id) : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public long UserId => id;
        public long? OperatorId => null;
        public bool IsInRole(string role) => role == Roles.Investor;
        public long RequireOperatorId() => throw new NotSupportedException();
    }
    private sealed record Scenario(long User, long Other, long Batch, string Code, long Contribution, DateTimeOffset At);
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private HttpClient Client(long id)
    { var c = fixture.Factory.CreateClient(); c.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); c.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor); return c; }
    private Task<Scenario> Setup(bool frozen = false, bool confirmed = true) => Db(async db =>
    {
        var at = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.AddHours(-2).ToUnixTimeMilliseconds());
        AppUser User() { var u = new AppUser { Email = $"nf-{Guid.NewGuid():N}@test.local", FullName = "Notification Investor", PasswordHash = "test", Status = "Active", CreatedAt = at, UpdatedAt = at, Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Unverified", CreatedAt = at } }; u.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Investor, GrantedAt = at }); return u; }
        var user = User(); var other = User(); db.AppUsers.AddRange(user, other);
        var batch = new Batch { BatchCode = "NF-" + Guid.NewGuid().ToString("N")[..12], Operator = new Infrastructure.Persistence.Entities.Operator { LegalName = "Notification Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved" },
            Title = "Notifications", CrabType = "FatteningMudCrab", Status = frozen ? "InProduction" : "Funding", SeedQuantity = 100, CycleDays = 90, ExpectedOutputKg = 50, RestockCutoffDays = 10,
            MinViableCapital = 10000000, TargetCapital = 50000001, MaxCapital = 100000000, MinContribution = 1000000, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10,
            CapitalClosedAt = frozen ? at : null, TotalConfirmedCapital = frozen ? 50000001 : null, CreatedAt = at, UpdatedAt = at };
        var own = new Contribution { Batch = batch, Investor = user.Investor!, Amount = 20000001, Status = confirmed ? "Confirmed" : "Reserved", ConfirmedAt = confirmed ? at : null, ReservedAt = at.AddMinutes(-5), ExpiresAt = at.AddMinutes(25), CreatedAt = at, UpdatedAt = at };
        batch.Contributions.Add(own); batch.Contributions.Add(new Contribution { Investor = other.Investor!, Amount = 30000000, Status = "Confirmed", ConfirmedAt = at, ReservedAt = at.AddMinutes(-5), ExpiresAt = at.AddMinutes(25), CreatedAt = at, UpdatedAt = at });
        if (frozen) { batch.CapitalShares.Add(new CapitalShare { Investor = user.Investor!, ConfirmedAmount = 20000001, SnapshottedAt = at, CreatedAt = at }); batch.CapitalShares.Add(new CapitalShare { Investor = other.Investor!, ConfirmedAmount = 30000000, SnapshottedAt = at, CreatedAt = at }); }
        db.Batches.Add(batch); await db.SaveChangesAsync(); return new Scenario(user.UserId, other.UserId, batch.BatchId, batch.BatchCode, own.ContributionId, at);
    });
    private Task<bool> Events(Scenario s, string settlementStatus = "Approved", string payoutStatus = "Succeeded") => Db(async db => {
        var at = s.At;
        var c = await db.Contributions.SingleAsync(c => c.ContributionId == s.Contribution);
        c.InvestmentContract = new InvestmentContract { ContractNo = "NF-" + Guid.NewGuid().ToString("N")[..12], Template = new ContractTemplate { VersionCode = "NF-" + Guid.NewGuid().ToString("N")[..12], ContentHash = new string('a', 64), Status = "Active", CreatedAt = at, UpdatedAt = at }, Status = "FullySigned", SigningMethod = "DigitalSignature", DraftHash = new string('b', 64), FinalHash = new string('c', 64), FinalFileUri = "private/secret.pdf", FullySignedAt = at, CreatedAt = at, UpdatedAt = at };
        db.ProductionLogs.Add(new ProductionLog { BatchId = s.Batch, LogDate = DateOnly.FromDateTime(at.UtcDateTime), Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = at, CreatedAt = at });
        db.Alerts.Add(new Alert { BatchId = s.Batch, AlertType = "WaterQuality", Severity = "High", Message = "Sensitive internal note", RaisedAt = at, AckDeadline = at.AddHours(1), Status = "Resolved", CreatedAt = at, UpdatedAt = at });
        var settlement = new Settlement { BatchId = s.Batch, Status = settlementStatus, RevisionNo = 1, ActualRevenue = 60000001, LockedStandardCost = 50000001, RevenuePool = 10000000, OperatorSharePct = 5, OperatorRemuneration = 500000, ProposedAt = at, ApprovedAt = settlementStatus is "Approved" or "PaidOut" or "Closed" ? at : null, ApprovedBy = settlementStatus == "Approved" ? s.User : null, CreatedAt = at, UpdatedAt = at };
        var line = new SettlementLine { BatchId = s.Batch, InvestorId = s.User, CapitalReturn = 20000001, ProfitShare = 3000000, TaxWithheld = 300000, NetPayout = 22700001, CreatedAt = at }; settlement.SettlementLines.Add(line); db.Settlements.Add(settlement);
        db.PaymentInstructions.Add(new PaymentInstruction { BatchAccount = new BatchAccount { BatchId = s.Batch, ProviderName = "TEST", ProviderAccountNo = Guid.NewGuid().ToString("N"), Status = "Open", CreatedAt = at, UpdatedAt = at }, SettlementLine = line, InstructionType = "Payout", Status = payoutStatus, Amount = 22700001, CompletedAt = payoutStatus == "Succeeded" ? at : null, BeneficiaryNote = "private bank details", CreatedAt = at, UpdatedAt = at });
        var finalStatus = settlement.Status; settlement.Status = "Draft";
        await db.SaveChangesAsync(); settlement.Status = finalStatus; await db.SaveChangesAsync(); return true;
    });
    [Fact]
    public async Task Confirming_payment_produces_actual_received_money_notification()
    {
        var s = await Setup(confirmed: false); using var client = Client(s.User);
        Assert.Empty((await Db(db => new NotificationService(db, new User(s.User), TimeProvider.System).ListAsync(new(), new(), default))).Items);
        Assert.Empty((await client.GetFromJsonAsync<NotificationPage>("/api/me/notifications"))!.Items);
        await Db(async db => { var c = await db.Contributions.SingleAsync(c => c.ContributionId == s.Contribution); c.Status = "Confirmed"; c.ConfirmedAt = s.At; await db.SaveChangesAsync(); return true; });
        var response = await client.GetAsync("/api/me/notifications"); var item = Assert.Single((await response.Content.ReadFromJsonAsync<NotificationPage>())!.Items);
        Assert.Equal("Đã nhận tiền", item.Title); Assert.Equal(20000001, item.Amount); Assert.Contains("20.000.001 đ", item.Body); Assert.True(item.CanOpenPortfolio); Assert.True(response.Headers.CacheControl!.NoStore);
    }
    [Fact]
    public async Task Six_event_sources_are_scoped_stable_and_read_only()
    {
        var s = await Setup(frozen: true); await Events(s); var foreign = await Setup(frozen: true); await Events(foreign);
        var before = await Db(db => db.AuditLogs.CountAsync()); using var client = Client(s.User);
        var response = await client.GetAsync("/api/me/notifications"); var first = (await response.Content.ReadFromJsonAsync<NotificationPage>())!;
        Assert.Equal(6, first.Total); Assert.Equal(6, first.Items.Select(e => e.Id).Distinct().Count()); Assert.All(first.Items, e => Assert.Equal(s.Code, e.BatchCode));
        Assert.Equal(new[] { "PaymentConfirmed", "ContractSigned", "ProductionReceived", "AlertRaised", "SettlementPublished", "PayoutSucceeded" }, first.Items.Select(e => e.Type));
        Assert.Equal(22700001, first.Items.Single(e => e.Type == "PayoutSucceeded").Amount); Assert.Null(first.Items.Single(e => e.Type == "SettlementPublished").Amount);
        var second = (await client.GetFromJsonAsync<NotificationPage>("/api/me/notifications"))!; Assert.Equal(first.Items, second.Items);
        var json = await response.Content.ReadAsStringAsync(); Assert.DoesNotContain("private/", json); Assert.DoesNotContain("private bank", json); Assert.DoesNotContain("Sensitive internal", json); Assert.DoesNotContain("profitShare", json); Assert.Equal(before, await Db(db => db.AuditLogs.CountAsync()));
    }
    [Fact]
    public async Task Paging_handles_tied_times_after_is_exclusive_and_until_is_inclusive()
    {
        var s = await Setup(frozen: true); await Events(s); using var client = Client(s.User);
        var full = (await client.GetFromJsonAsync<NotificationPage>("/api/me/notifications"))!;
        var ids = new List<string>(); for (var p = 1; p <= 3; p++) { var page = (await client.GetFromJsonAsync<NotificationPage>($"/api/me/notifications?page={p}&pageSize=2&until={Uri.EscapeDataString(full.AsOf.ToString("O"))}"))!; ids.AddRange(page.Items.Select(e => e.Id)); Assert.Equal(full.AsOf, page.AsOf); }
        Assert.Equal(full.Items.Select(e => e.Id), ids); Assert.Empty((await client.GetFromJsonAsync<NotificationPage>($"/api/me/notifications?after={Uri.EscapeDataString(s.At.ToString("O"))}"))!.Items);
        Assert.Equal(6, (await client.GetFromJsonAsync<NotificationPage>($"/api/me/notifications?until={Uri.EscapeDataString(s.At.ToString("O"))}"))!.Total);
    }
    [Theory]
    [InlineData("Draft", "Succeeded", false)] [InlineData("Proposed", "Succeeded", true)] [InlineData("Approved", "Sent", true)] [InlineData("Approved", "Failed", true)]
    public async Task Only_publication_and_executed_payouts_are_announced(string status, string payout, bool published)
    {
        var s = await Setup(frozen: true); await Events(s, status, payout); using var client = Client(s.User);
        var page = (await client.GetFromJsonAsync<NotificationPage>("/api/me/notifications"))!;
        Assert.Equal(published, page.Items.Any(e => e.Type == "SettlementPublished")); Assert.DoesNotContain(page.Items, e => e.Type == "PayoutSucceeded");
    }
    [Theory]
    [InlineData("Locked")] [InlineData("NoRole")]
    public async Task Revoked_database_access_is_denied(string change)
    {
        var s = await Setup(); await Db(async db => { if (change == "Locked") (await db.AppUsers.SingleAsync(u => u.UserId == s.User)).Status = "Locked"; else db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == s.User)); await db.SaveChangesAsync(); return true; });
        using var client = Client(s.User); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/me/notifications")).StatusCode);
    }
    [Fact]
    public async Task Future_events_are_hidden_and_refunded_cash_receipt_remains_historical()
    {
        var s = await Setup(); await Db(async db => { var c = await db.Contributions.SingleAsync(c => c.ContributionId == s.Contribution); c.Status = "Refunded"; c.RefundedAt = DateTimeOffset.UtcNow;
            db.ProductionLogs.Add(new ProductionLog { BatchId = s.Batch, LogDate = DateOnly.FromDateTime(s.At.UtcDateTime), Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = DateTimeOffset.UtcNow.AddDays(1), CreatedAt = s.At }); await db.SaveChangesAsync(); return true; });
        using var client = Client(s.User); var item = Assert.Single((await client.GetFromJsonAsync<NotificationPage>("/api/me/notifications"))!.Items); Assert.Equal("PaymentConfirmed", item.Type); Assert.False(item.CanOpenPortfolio);
    }
}
