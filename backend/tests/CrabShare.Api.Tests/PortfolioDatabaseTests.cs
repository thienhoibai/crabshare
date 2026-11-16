using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Portfolio;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class PortfolioDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Scenario(long Investor, long Other, long Batch, string Code, long Contribution);
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private HttpClient Client(long id)
    { var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor); return client; }
    private Task<Scenario> Setup(bool frozen = false, string status = "Funding") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        AppUser User() { var u = new AppUser { Email = $"portfolio-{Guid.NewGuid():N}@test.local", FullName = "Portfolio Investor", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now, Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now, CreatedAt = now } }; u.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Investor, GrantedAt = now }); return u; }
        var user = User(); var other = User();
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Portfolio Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved" };
        var batch = new Batch { BatchCode = "PF-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Portfolio Test", Status = status,
            SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 10000000, TargetCapital = 100000004, MaxCapital = 150000000, MinContribution = 1000000,
            OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, FundingOpenAt = now.AddDays(-5), FundingDeadline = now.AddDays(2), CreatedAt = now, UpdatedAt = now,
            CapitalClosedAt = frozen ? now.AddDays(-3) : null, TotalConfirmedCapital = frozen ? 100000004 : null };
        var own = new Contribution { Batch = batch, Investor = user.Investor!, Amount = frozen ? 30000000 : 20000001, Status = "Confirmed", ReservedAt = now.AddDays(-4), ExpiresAt = now.AddDays(-4).AddMinutes(30), ConfirmedAt = now.AddDays(-4).AddMinutes(1), CreatedAt = now, UpdatedAt = now };
        batch.Contributions.Add(own);
        batch.Contributions.Add(new Contribution { Investor = other.Investor!, Amount = 30000000, Status = "Confirmed", ReservedAt = now.AddDays(-4), ExpiresAt = now.AddDays(-4).AddMinutes(30), ConfirmedAt = now.AddDays(-4).AddMinutes(1), CreatedAt = now, UpdatedAt = now });
        if (frozen) { batch.CapitalShares.Add(new CapitalShare { Investor = user.Investor!, ConfirmedAmount = 25000001, SnapshottedAt = now.AddDays(-3), CreatedAt = now }); batch.CapitalShares.Add(new CapitalShare { Investor = other.Investor!, ConfirmedAmount = 75000003, SnapshottedAt = now.AddDays(-3), CreatedAt = now }); }
        db.AppUsers.AddRange(user, other);
        db.Batches.Add(batch); await db.SaveChangesAsync(); return new Scenario(user.UserId, other.UserId, batch.BatchId, batch.BatchCode, own.ContributionId);
    });
    [Fact]
    public async Task Live_capital_sums_confirmed_only_and_keeps_exact_integer_dong()
    {
        var test = await Setup(); await Db(async db => {
            foreach (var status in new[] { "Reserved", "Expired", "Refunded" }) db.Contributions.Add(new Contribution { BatchId = test.Batch, InvestorId = test.Investor, Amount = 90000000, Status = status, ReservedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30), CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); return true;
        }); using var client = Client(test.Investor);
        var response = await client.GetAsync("/api/investor/portfolio"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = (await response.Content.ReadFromJsonAsync<PortfolioPage>())!; var item = Assert.Single(page.Items);
        Assert.Equal(20000001, item.ConfirmedAmount); Assert.Equal(50000001, item.Batch.RaisedCapital); Assert.Equal(0.400000m, item.CapitalRatio); Assert.Equal("LiveConfirmed", item.CapitalBasis);
        Assert.Equal(item.ConfirmedAmount, page.Summary.ActiveConfirmedAmount); Assert.Equal(1, page.Summary.TotalBatches); Assert.Null(item.Batch.AliveCount); Assert.Null(item.Batch.DayOfCycle);
        var json = await response.Content.ReadAsStringAsync(); foreach (var field in new[] { "yield", "expectedProfit", "expectedReturn", "roi", "returnRate" }) Assert.DoesNotContain(field, json, StringComparison.OrdinalIgnoreCase);
        Assert.True(response.Headers.CacheControl!.NoStore);
    }
    [Fact]
    public async Task Frozen_positions_use_view_amount_and_ratio_even_if_live_contributions_differ()
    {
        var test = await Setup(frozen: true, status: "InProduction"); using var client = Client(test.Investor);
        var item = Assert.Single((await client.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!.Items);
        var view = await Db(db => db.VInvestorPortfolios.AsNoTracking().SingleAsync(v => v.InvestorId == test.Investor && v.BatchId == test.Batch));
        Assert.Equal((long)view.ConfirmedAmount, item.ConfirmedAmount); Assert.Equal(view.CapitalRatio, item.CapitalRatio); Assert.Equal(25000001, item.ConfirmedAmount); Assert.Equal(0.25m, item.CapitalRatio); Assert.Equal(100000004, item.Batch.RaisedCapital); Assert.Equal("Frozen", item.CapitalBasis);
        var detail = (await client.GetFromJsonAsync<PortfolioDetail>($"/api/investor/portfolio/{test.Code}"))!;
        Assert.Equal(item, detail.Position); Assert.Equal(30000000, Assert.Single(detail.Contributions).Amount);
    }
    [Fact]
    public async Task Null_frozen_denominator_stays_unknown_instead_of_becoming_zero_percent()
    {
        var test = await Setup(frozen: true); await Db(async db => { (await db.Batches.SingleAsync(b => b.BatchId == test.Batch)).TotalConfirmedCapital = null; await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Investor); var item = Assert.Single((await client.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!.Items); Assert.Null(item.CapitalRatio); Assert.Equal("Frozen", item.CapitalBasis);
    }
    [Fact]
    public async Task Empty_investor_and_foreign_batch_do_not_return_sample_holdings()
    {
        var own = await Setup(); var foreign = await Setup(); var empty = await fixture.CreateInvestorAsync("Verified");
        await Db(async db => { db.AppUserRoles.Add(new AppUserRole { UserId = empty, RoleCode = Roles.Investor, GrantedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); return true; });
        using var a = Client(own.Investor); using var b = Client(empty);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/investor/portfolio/{foreign.Code}")).StatusCode);
        var page = (await b.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!; Assert.Empty(page.Items); Assert.Equal(0, page.Total); Assert.Equal(0, page.Summary.TotalConfirmedAmount);
    }
    [Theory]
    [InlineData("Locked")] [InlineData("NoRole")]
    public async Task Stale_investor_tokens_are_denied_after_database_access_changes(string change)
    {
        var test = await Setup(); await Db(async db => { if (change == "Locked") (await db.AppUsers.SingleAsync(u => u.UserId == test.Investor)).Status = "Locked"; else db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == test.Investor)); await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Investor); foreach (var suffix in new[] { "", "/" + test.Code }) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/investor/portfolio" + suffix)).StatusCode);
    }
    [Fact]
    public async Task Draft_settlement_is_hidden_and_approved_actual_amounts_are_returned()
    {
        var test = await Setup(frozen: true, status: "Settlement");
        var settlementId = await Db(async db => { var now = DateTimeOffset.UtcNow; var settlement = new Settlement { BatchId = test.Batch, RevisionNo = 1, ActualRevenue = 120000000, LockedStandardCost = 100000000, RevenuePool = 20000000, OperatorSharePct = 5, OperatorRemuneration = 1000000, Status = "Draft", CreatedAt = now, UpdatedAt = now }; settlement.SettlementLines.Add(new SettlementLine { BatchId = test.Batch, InvestorId = test.Investor, CapitalReturn = 25000001, ProfitShare = 5000000, TaxWithheld = 500000, NetPayout = 29500001, InKindQtyKg = 2.5m, CreatedAt = now }); db.Settlements.Add(settlement); await db.SaveChangesAsync(); return settlement.SettlementId; });
        using var client = Client(test.Investor); Assert.Null(Assert.Single((await client.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!.Items).Settlement);
        await Db(async db => { var row = await db.Settlements.SingleAsync(s => s.SettlementId == settlementId); row.Status = "Approved"; row.ApprovedAt = DateTimeOffset.UtcNow.AddMinutes(-1); row.ApprovedBy = test.Investor; await db.SaveChangesAsync(); return true; });
        var page = (await client.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!; var actual = Assert.Single(page.Items).Settlement!;
        Assert.Equal(29500001, actual.NetPayout); Assert.Equal(5000000, actual.ProfitShare); Assert.Equal(2.5m, actual.InKindQtyKg); Assert.Equal(actual.NetPayout, page.Summary.ApprovedNetPayout);
    }
    private sealed class Clock(DateTimeOffset value) : TimeProvider { public override DateTimeOffset GetUtcNow() => value; }
    [Fact]
    public async Task Cycle_uses_vietnam_days_and_growing_registry_and_freezes_at_close()
    {
        var test = await Setup(frozen: true, status: "Closed");
        await Db(async db => { var batch = await db.Batches.Include(b => b.Operator).SingleAsync(b => b.BatchId == test.Batch); batch.StockedAt = new DateTimeOffset(2026, 10, 14, 17, 0, 0, TimeSpan.Zero); batch.ClosedAt = new DateTimeOffset(2026, 10, 16, 17, 0, 0, TimeSpan.Zero);
            for (var i = 0; i < 3; i++) { var slot = new PhysicalSlot { Operator = batch.Operator, SlotCode = $"00{i + 1:00}", Status = "Occupied", CreatedAt = batch.StockedAt.Value, UpdatedAt = batch.StockedAt.Value }; var allocation = new SlotAllocation { Batch = batch, Slot = slot, AllocatedAt = batch.StockedAt.Value, CreatedAt = batch.StockedAt.Value }; db.CrabItems.Add(new CrabItem { Batch = batch, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), StockedAt = batch.StockedAt.Value, Status = i == 2 ? "Dead" : "Growing", CreatedAt = batch.StockedAt.Value, UpdatedAt = batch.StockedAt.Value }); } await db.SaveChangesAsync(); return true; });
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<TimeProvider>(new Clock(new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.Zero)))));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", test.Investor.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor);
        var page = (await client.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!; var item = Assert.Single(page.Items); Assert.Equal(3, item.Batch.DayOfCycle); Assert.Equal(2, item.Batch.AliveCount); Assert.Equal(0, page.Summary.ActiveConfirmedAmount); Assert.Equal(25000001, page.Summary.TotalConfirmedAmount);
    }
    [Fact]
    public async Task Filters_paging_contract_metadata_and_timeline_are_read_only_and_scoped()
    {
        var test = await Setup(); var before = await Db(db => db.AuditLogs.CountAsync());
        await Db(async db => { var now = DateTimeOffset.UtcNow; var contribution = await db.Contributions.SingleAsync(c => c.ContributionId == test.Contribution); contribution.InvestmentContract = new InvestmentContract { ContractNo = "PF-" + Guid.NewGuid().ToString("N")[..12], Template = new ContractTemplate { VersionCode = "PF-" + Guid.NewGuid().ToString("N")[..12], ContentHash = new string('a', 64), Status = "Active", CreatedAt = now, UpdatedAt = now }, Status = "FullySigned", SigningMethod = "DigitalSignature", DraftHash = new string('b', 64), FinalHash = new string('c', 64), FinalFileUri = "private/contract.pdf", FullySignedAt = now.AddHours(-1), CreatedAt = now, UpdatedAt = now }; db.ProductionLogs.Add(new ProductionLog { BatchId = test.Batch, LogDate = DateOnly.FromDateTime(now.UtcDateTime), Ph = 7.8m, Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = now.AddMinutes(-1), CreatedAt = now }); await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Investor);
        var page = (await client.GetFromJsonAsync<PortfolioPage>($"/api/investor/portfolio?status=Funding&q={test.Code}&pageSize=1"))!; Assert.Equal(1, page.Total);
        Assert.Empty((await client.GetFromJsonAsync<PortfolioPage>($"/api/investor/portfolio?q={test.Code}&pageSize=1&page=2"))!.Items);
        Assert.Empty((await client.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio?status=Closed"))!.Items);
        var response = await client.GetAsync($"/api/investor/portfolio/{test.Code}"); var detail = (await response.Content.ReadFromJsonAsync<PortfolioDetail>())!;
        Assert.Equal(test.Contribution, Assert.Single(detail.Contributions).Id); Assert.Equal("FullySigned", Assert.Single(detail.Contributions).ContractStatus); Assert.DoesNotContain("private/contract.pdf", await response.Content.ReadAsStringAsync()); Assert.Equal(7.8m, detail.LatestProduction!.Ph); Assert.Contains(detail.Timeline, e => e.Type == "Contract"); Assert.Contains(detail.Timeline, e => e.Type == "Production"); Assert.Equal(before, await Db(db => db.AuditLogs.CountAsync()));
    }
    [Fact]
    public async Task Reserved_only_and_confirmed_without_frozen_share_do_not_create_positions()
    {
        var reserved = await Setup();
        await Db(async db => { var own = await db.Contributions.SingleAsync(c => c.ContributionId == reserved.Contribution); own.Status = "Reserved"; own.ConfirmedAt = null; await db.SaveChangesAsync(); return true; });
        using var a = Client(reserved.Investor);
        Assert.Empty((await a.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!.Items);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/investor/portfolio/{reserved.Code}")).StatusCode);
        var frozen = await Setup(frozen: true);
        var outsider = await fixture.CreateInvestorAsync("Verified");
        await Db(async db => { var now = DateTimeOffset.UtcNow; db.AppUserRoles.Add(new AppUserRole { UserId = outsider, RoleCode = Roles.Investor, GrantedAt = now }); db.Contributions.Add(new Contribution { BatchId = frozen.Batch, InvestorId = outsider, Amount = 1000000, Status = "Confirmed", ReservedAt = now.AddMinutes(-10), ExpiresAt = now.AddMinutes(20), ConfirmedAt = now, CreatedAt = now, UpdatedAt = now }); await db.SaveChangesAsync(); return true; });
        using var b = Client(outsider);
        Assert.Empty((await b.GetFromJsonAsync<PortfolioPage>("/api/investor/portfolio"))!.Items);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/investor/portfolio/{frozen.Code}")).StatusCode);
    }
    [Fact]
    public async Task Multiple_contributions_aggregate_and_filtered_paging_keeps_global_totals()
    {
        var own = await Setup(); var closed = await Setup(frozen: true, status: "Closed");
        await Db(async db => {
            var now = DateTimeOffset.UtcNow;
            db.Contributions.Add(new Contribution { BatchId = own.Batch, InvestorId = own.Investor, Amount = 1000001, Status = "Confirmed", ReservedAt = now.AddMinutes(-10), ExpiresAt = now.AddMinutes(20), ConfirmedAt = now.AddMinutes(-1), CreatedAt = now, UpdatedAt = now });
            db.CapitalShares.Add(new CapitalShare { BatchId = closed.Batch, InvestorId = own.Investor, ConfirmedAmount = 1000000, SnapshottedAt = now, CreatedAt = now });
            foreach (var status in new[] { "Open", "Escalated", "Acknowledged", "Resolved" }) db.Alerts.Add(new Alert { BatchId = own.Batch, AlertType = "WaterQuality", Severity = "Medium", Message = status, Status = status, RaisedAt = now, AckDeadline = now.AddMinutes(30), CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        using var client = Client(own.Investor);
        var page = (await client.GetFromJsonAsync<PortfolioPage>($"/api/investor/portfolio?q={own.Code}&pageSize=1"))!;
        var item = Assert.Single(page.Items); Assert.Equal(21000002, item.ConfirmedAmount); Assert.Equal(51000002, item.Batch.RaisedCapital); Assert.Equal(decimal.Round(21000002m / 51000002m, 6), item.CapitalRatio); Assert.Equal(2, item.Batch.OpenAlerts);
        Assert.Equal(1, page.Total); Assert.Equal(2, page.Summary.TotalBatches); Assert.Equal(22000002, page.Summary.TotalConfirmedAmount); Assert.Equal(21000002, page.Summary.ActiveConfirmedAmount);
        var next = (await client.GetFromJsonAsync<PortfolioPage>($"/api/investor/portfolio?q={own.Code}&pageSize=1&page=2"))!; Assert.Empty(next.Items); Assert.Equal(page.Summary, next.Summary);
    }
    [Fact]
    public async Task Investor_role_without_profile_cannot_read_portfolio()
    {
        var id = await Db(async db => { var now = DateTimeOffset.UtcNow; var u = new AppUser { Email = $"no-profile-{Guid.NewGuid():N}@test.local", FullName = "No profile", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now }; u.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Investor, GrantedAt = now }); db.AppUsers.Add(u); await db.SaveChangesAsync(); return u.UserId; });
        using var client = Client(id);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/investor/portfolio")).StatusCode);
    }
}
