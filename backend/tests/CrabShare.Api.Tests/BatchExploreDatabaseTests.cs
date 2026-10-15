using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class BatchExploreDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> work)
    { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await work(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }

    private async Task<(HttpClient Client, long User)> Investor()
    {
        var id = await fixture.CreateInvestorAsync(); // Discovery does not require verified KYC.
        await Db(async db => { db.AppUserRoles.Add(new AppUserRole { UserId = id, RoleCode = Roles.Investor, GrantedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); return true; });
        var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor);
        return (client, id);
    }

    private Task<(long Id, string Code)> Batch(long user, string status = "Funding", bool locked = true, bool approved = true, bool future = false, string crab = "SoftShellCrab") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var batch = new Batch {
            BatchCode = "EX-" + Guid.NewGuid().ToString("N")[..12], Title = "Lô khám phá", Status = status,
            Operator = new Infrastructure.Persistence.Entities.Operator { LegalName = "Hộ nuôi", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Cà Mau", Status = "Approved" },
            CrabType = crab, SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 45, RestockCutoffDays = 10,
            MinViableCapital = 10000000, TargetCapital = 75000000, MaxCapital = 100000000, MinContribution = 1000000, OperatorSharePct = 7,
            FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            ApprovedAt = approved ? now.AddDays(-2) : null, ApprovedBy = approved ? user : null,
            FundingOpenAt = future ? now.AddDays(1) : now.AddDays(-1), FundingDeadline = now.AddDays(5), CreatedAt = now, UpdatedAt = now
        };
        db.Batches.Add(batch); await db.SaveChangesAsync();
        // Raw SQL deliberately creates a newer draft alongside the published version. The read must select Locked, not MAX(version_no).
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT dbo.standard_cost_version(batch_id,version_no,status) VALUES ({batch.BatchId},1,'Draft'),({batch.BatchId},2,'Draft')");
        var version = await db.StandardCostVersions.SingleAsync(v => v.BatchId == batch.BatchId && v.VersionNo == 1);
        db.StandardCostItems.Add(new StandardCostItem { CostVersionId = version.CostVersionId, Category = "MortalityReserve", Description = "Dự phòng", Quantity = 1, Unit = "đợt", UnitPrice = 1000000, TrancheNo = 0 });
        await db.SaveChangesAsync();
        if (locked) { version.Status = "Locked"; version.LockedAt = now.AddDays(-2); await db.SaveChangesAsync(); }
        return (batch.BatchId, batch.BatchCode);
    });

    [Theory]
    [InlineData("Draft", true, true, false)] [InlineData("PendingApproval", true, true, false)] [InlineData("Rejected", true, true, false)]
    [InlineData("Funding", false, true, false)] [InlineData("Funding", true, false, false)] [InlineData("Funding", true, true, true)]
    public async Task List_and_direct_code_hide_unpublished_batches(string status, bool locked, bool approved, bool future)
    {
        var (client, user) = await Investor(); using var _ = client;
        var batch = await Batch(user, status, locked, approved, future);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/batches/{batch.Code}")).StatusCode);
        var page = await client.GetFromJsonAsync<JsonElement>($"/api/batches?status={status}&pageSize=100");
        Assert.DoesNotContain(page.GetProperty("items").EnumerateArray(), b => b.GetProperty("batchCode").GetString() == batch.Code);
    }

    [Theory]
    [InlineData("Funding")] [InlineData("Cancelled")] [InlineData("Stocked")] [InlineData("InProduction")]
    [InlineData("Harvesting")] [InlineData("Settlement")] [InlineData("Closed")]
    public async Task Published_lifecycle_is_discoverable_with_locked_cost_and_terms(string status)
    {
        var (client, user) = await Investor(); using var _ = client;
        var batch = await Batch(user, status);
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/batches/{batch.Code}");
        Assert.Equal(status, detail.GetProperty("status").GetString());
        Assert.Equal(7, detail.GetProperty("operatorSharePct").GetDecimal());
        Assert.Equal(75000000, detail.GetProperty("targetCapital").GetInt64());
        var cost = detail.GetProperty("standardCost");
        Assert.Equal(1, cost.GetProperty("versionNo").GetInt32()); Assert.Equal("Locked", cost.GetProperty("status").GetString());
        Assert.Equal(1000000, cost.GetProperty("total").GetInt64());
        var progress = detail.GetProperty("fundingProgress"); Assert.Equal(0, progress.GetProperty("pctOfTarget").GetDecimal());
        Assert.Equal("0,00%", progress.GetProperty("percentLabel").GetString());
        foreach (var field in new[] { "roi", "yield", "expectedReturn", "rejectionReason", "approvedBy", "canEdit" }) Assert.False(detail.TryGetProperty(field, out var ignored));
        var page = await client.GetFromJsonAsync<JsonElement>($"/api/batches?status={status}&crabType=SoftShellCrab&pageSize=100");
        Assert.Contains(page.GetProperty("items").EnumerateArray(), b => b.GetProperty("batchCode").GetString() == batch.Code);
    }

    [Fact]
    public async Task Pagination_is_stable_and_progress_is_exactly_the_view()
    {
        var (client, user) = await Investor(); using var _ = client;
        var first = await Batch(user, crab: "RoeCrab"); var second = await Batch(user, crab: "RoeCrab");
        await Db(async db => {
            var now = DateTimeOffset.UtcNow;
            foreach (var status in new[] { "Confirmed", "Reserved", "Expired" }) db.Contributions.Add(new Contribution { BatchId = second.Id, InvestorId = user, Amount = 25000000, Status = status, ReservedAt = now, ExpiresAt = now.AddHours(1), ConfirmedAt = status == "Confirmed" ? now : null, CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        var a = await client.GetFromJsonAsync<JsonElement>("/api/batches?status=Funding&crabType=RoeCrab&pageSize=1");
        var b = await client.GetFromJsonAsync<JsonElement>("/api/batches?status=Funding&crabType=RoeCrab&pageSize=1&page=2");
        Assert.Equal(second.Code, a.GetProperty("items")[0].GetProperty("batchCode").GetString());
        Assert.Equal(first.Code, b.GetProperty("items")[0].GetProperty("batchCode").GetString());
        var progress = a.GetProperty("items")[0].GetProperty("fundingProgress");
        var view = await Db(db => db.VBatchFundingProgresses.SingleAsync(v => v.BatchId == second.Id));
        Assert.Equal(view.PctOfTarget, progress.GetProperty("pctOfTarget").GetDecimal());
        Assert.Equal("33,33%", progress.GetProperty("percentLabel").GetString());
        Assert.Equal(25000000, progress.GetProperty("confirmedCapital").GetInt64());
        Assert.Equal(25000000, progress.GetProperty("reservedCapital").GetInt64());
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/batches/{second.Code}");
        Assert.Equal(progress.ToString(), detail.GetProperty("fundingProgress").ToString());
        var beyond = await client.GetFromJsonAsync<JsonElement>("/api/batches?page=2147483647&pageSize=100");
        Assert.Empty(beyond.GetProperty("items").EnumerateArray());
    }

    [Theory]
    [InlineData(true)] [InlineData(false)]
    public async Task Current_database_permissions_override_stale_token(bool locked)
    {
        var (client, user) = await Investor(); using var _ = client; var batch = await Batch(user);
        await Db(async db => { if (locked) await db.AppUsers.Where(u => u.UserId == user).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked"));
            else await db.AppUserRoles.Where(r => r.UserId == user).ExecuteDeleteAsync(); return true; });
        foreach (var path in new[] { "/api/batches", $"/api/batches/{batch.Code}" }) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }
}
