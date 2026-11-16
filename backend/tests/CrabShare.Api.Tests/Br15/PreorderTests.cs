using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Sales;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>G2: đặt trước sỉ theo quy cách, cọc, không bán vượt, đợt giao, Lô mở và Lô huỷ (BR-055, 077, 084…097, 234).</summary>
[Trait("Category", "Database")]
public sealed class PreorderTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    private static object Order(string code, long siteId, int lCount = 20, decimal mKg = 7m, object? tranches = null) => new
    {
        batchCode = code, deliverySiteId = siteId,
        lines = new object[]
        {
            new { specCode = "FAT-L-SPECIAL", mode = "ByCount", qtyCrabs = lCount },
            new { specCode = "FAT-M-G1", mode = "ByKg", qtyKg = mKg, minGrade = "G1" },
        },
        tranches,
    };

    /// <summary>Lô P đang gọi vốn đã có 100 con được cấp vốn (50.000.100 đ ÷ 500.001 đ).</summary>
    private async Task<Br15Scenario.BatchHandle> BatchWith100CrabsAsync(bool zeroRatio = true)
    {
        var batch = await Br15Scenario.FundingBatchAsync(f, zeroRatio);
        await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 100 * Br15Scenario.CostPerCrab);
        return batch;
    }

    [Fact]
    public async Task Preorder_converts_kg_to_crabs_and_computes_deposit_on_estimated_value()
    {
        var batch = await BatchWith100CrabsAsync();
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId)));
        // 20 con × 0,45 kg × 450.000 = 4.050.000 đ; 7 kg ÷ 0,35 kg = 20 con, 7 × 380.000 = 2.660.000 đ.
        Assert.Equal("PendingDeposit", order.GetProperty("status").GetString());
        Assert.Equal(40, order.GetProperty("convertedCrabs").GetInt32());
        Assert.Equal(6_710_000, order.GetProperty("estimatedValue").GetInt64());
        Assert.Equal(1_342_000, order.GetProperty("depositAmount").GetInt64());
        Assert.Equal(1_342_000, order.GetProperty("deposit").GetProperty("amount").GetInt64());
        Assert.Single(order.GetProperty("tranches").EnumerateArray());

        var availability = await Br15Fixture.Body(await client.GetAsync($"/api/batches/{batch.Code}/availability"));
        Assert.Equal(100, availability.GetProperty("sellableCrabs").GetInt32());
        Assert.Equal(60, availability.GetProperty("remainingCrabs").GetInt32());
    }

    [Fact]
    public async Task No_oversell_against_funded_crabs_offer_quantity_and_minimum()
    {
        var batch = await BatchWith100CrabsAsync();
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var tooMany = await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId, lCount: 90, mKg: 7m));
        Assert.Equal("preorder.exceeds_sellable", await Br15Fixture.ErrorCode(tooMany));
        var small = await Br15Fixture.PostJson(client, "/api/preorders", new
        {
            batchCode = batch.Code, deliverySiteId = customer.SiteId, lines = new[] { new { specCode = "FAT-L-G1", mode = "ByCount", qtyCrabs = 5 } },
        });
        Assert.Equal("preorder.below_minimum", await Br15Fixture.ErrorCode(small));
        await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 100 * Br15Scenario.CostPerCrab); // 200 con được cấp vốn
        var offer = await Br15Fixture.PostJson(client, "/api/preorders", new
        {
            batchCode = batch.Code, deliverySiteId = customer.SiteId, lines = new[] { new { specCode = "FAT-M-G1", mode = "ByCount", qtyCrabs = 81 } },
        });
        Assert.Equal("preorder.exceeds_offer", await Br15Fixture.ErrorCode(offer));
    }

    [Fact]
    public async Task Farmer_related_party_and_out_of_radius_customers_are_rejected()
    {
        var batch = await BatchWith100CrabsAsync();
        // Người nuôi của Lô có vai trò khách và có địa chỉ giao.
        await using (var db = f.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            db.PartySites.Add(new Infrastructure.Persistence.Entities.PartySite
            {
                PartyId = batch.Farmer.PartyId, SiteCode = "DC-1", SiteType = "DeliveryAddress", Name = "Nhà", AddressLine = "Cà Mau",
                Latitude = 9.17m, Longitude = 105.15m, IsDefault = true, Status = "Active", CreatedAt = now, UpdatedAt = now,
            });
            await db.SaveChangesAsync();
        }
        long farmerSite;
        await using (var db = f.OpenDb())
            farmerSite = await db.PartySites.Where(s => s.PartyId == batch.Farmer.PartyId && s.SiteType == "DeliveryAddress").Select(s => s.SiteId).SingleAsync();
        using var farmer = f.Client(batch.Farmer.UserId, Roles.Customer);
        var own = await Br15Fixture.PostJson(farmer, "/api/preorders", Order(batch.Code, farmerSite));
        Assert.Equal("preorder.related_party", await Br15Fixture.ErrorCode(own));

        // Bên liên quan khai trong danh sách của người nuôi, có liên kết tới đối tác trên nền tảng.
        var relative = await Br15Scenario.CustomerAsync(f);
        await using (var db = f.OpenDb())
        {
            db.RelatedParties.Add(new Infrastructure.Persistence.Entities.RelatedParty
            {
                PartyId = batch.Farmer.PartyId, FullName = "Em ruột", Relation = "Em", IdNumberDigest = new string('a', 64), IdNumberLast4 = "1234",
                LinkedPartyId = relative.PartyId, CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }
        using var relClient = relative.Client(f);
        Assert.Equal("preorder.related_party", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(relClient, "/api/preorders", Order(batch.Code, relative.SiteId))));

        var hanoi = await Br15Scenario.CustomerAsync(f, 21.0285m, 105.8542m);
        using var far = hanoi.Client(f);
        Assert.Equal("preorder.out_of_radius", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(far, "/api/preorders", Order(batch.Code, hanoi.SiteId))));
    }

    [Fact]
    public async Task Deposit_counts_toward_ratio_and_batch_open_confirms_order()
    {
        var batch = await BatchWith100CrabsAsync(zeroRatio: false); // tỷ lệ tối thiểu 30%
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId)));
        var orderNo = order.GetProperty("orderNo").GetString()!;
        await Br15Scenario.PayAsync(f, order.GetProperty("deposit").GetProperty("referenceCode").GetString()!);
        var deposited = await Br15Fixture.Body(await client.GetAsync($"/api/preorders/{orderNo}"));
        Assert.Equal("Deposited", deposited.GetProperty("status").GetString());

        var explore = await Br15Fixture.Body(await f.Factory.CreateClient().GetAsync($"/api/batches/{batch.Code}"));
        Assert.Equal(40, explore.GetProperty("depositedPreorderCrabs").GetInt32());
        Assert.Equal(40m, explore.GetProperty("preorderRatioPct").GetDecimal()); // 40 / 100 con

        Assert.Equal("CapitalClosed", await Br15Scenario.CloseFundingAsync(f, batch.BatchId));
        var confirmed = await Br15Fixture.Body(await client.GetAsync($"/api/preorders/{orderNo}"));
        Assert.Equal("Confirmed", confirmed.GetProperty("status").GetString());
        await using var db = f.OpenDb();
        Assert.True(await db.BatchParticipants.AnyAsync(p => p.BatchId == batch.BatchId && p.PartyId == customer.PartyId && p.ParticipantRole == "Customer"));
        Assert.True(await db.PaymentApplications.AnyAsync(a => a.TargetType == "OrderDeposit"));
    }

    [Fact]
    public async Task Cancel_after_deposit_waits_for_close_then_forfeits_when_batch_opens()
    {
        var batch = await BatchWith100CrabsAsync();
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId)));
        var orderNo = order.GetProperty("orderNo").GetString()!;
        await Br15Scenario.PayAsync(f, order.GetProperty("deposit").GetProperty("referenceCode").GetString()!);
        var cancelled = await Br15Fixture.Body(await client.PostAsJsonAsync($"/api/preorders/{orderNo}/cancel", new { reason = "Đổi kế hoạch" }));
        Assert.Equal("CancelRequested", cancelled.GetProperty("status").GetString());
        Assert.Equal("CapitalClosed", await Br15Scenario.CloseFundingAsync(f, batch.BatchId));
        var after = await Br15Fixture.Body(await client.GetAsync($"/api/preorders/{orderNo}"));
        Assert.Equal("Forfeited", after.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Batch_not_opening_refunds_every_deposit()
    {
        var batch = await Br15Scenario.FundingBatchAsync(f);
        await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 20 * Br15Scenario.CostPerCrab); // dưới vốn tối thiểu khả thi
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", new
        {
            batchCode = batch.Code, deliverySiteId = customer.SiteId, lines = new[] { new { specCode = "FAT-L-G1", mode = "ByCount", qtyCrabs = 15 } },
        }));
        await Br15Scenario.PayAsync(f, order.GetProperty("deposit").GetProperty("referenceCode").GetString()!);
        Assert.Equal("Cancelled", await Br15Scenario.CloseFundingAsync(f, batch.BatchId));
        var after = await Br15Fixture.Body(await client.GetAsync($"/api/preorders/{order.GetProperty("orderNo").GetString()}"));
        Assert.Equal("Refunded", after.GetProperty("status").GetString());
        await using var db = f.OpenDb();
        var refund = await db.PaymentInstructions.Where(p => p.InstructionType == "Refund" && p.Order!.BatchId == batch.BatchId).SumAsync(p => p.Amount);
        Assert.Equal(order.GetProperty("depositAmount").GetInt64(), (long)refund);
    }

    [Fact]
    public async Task Expired_hold_cancels_order_and_releases_quantity()
    {
        var batch = await BatchWith100CrabsAsync();
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId, lCount: 50, mKg: 3.5m)));
        await using (var db = f.OpenDb())
            await db.SalesOrders.Where(o => o.OrderNo == order.GetProperty("orderNo").GetString())
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.HoldExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        await using (var scope = f.Factory.Services.CreateAsyncScope())
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<PreorderHoldExpiryService>().ExpireAsync(CancellationToken.None));
        var availability = await Br15Fixture.Body(await client.GetAsync($"/api/batches/{batch.Code}/availability"));
        Assert.Equal(100, availability.GetProperty("remainingCrabs").GetInt32());
    }

    [Fact]
    public async Task Tranches_must_sum_to_each_line_and_can_be_resplit_before_selling()
    {
        var batch = await BatchWith100CrabsAsync();
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var due1 = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(76));
        var due2 = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(83));
        var bad = await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId, tranches: new object[]
        {
            new { seq = 1, dueDate = due1, lines = new object[] { new { specCode = "FAT-L-SPECIAL", qtyCrabs = 10 }, new { specCode = "FAT-M-G1", qtyKg = 7m } } },
            new { seq = 2, dueDate = due2, lines = new object[] { new { specCode = "FAT-L-SPECIAL", qtyCrabs = 5 } } },
        }));
        Assert.Equal("preorder.tranche_total", await Br15Fixture.ErrorCode(bad));
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId, tranches: new object[]
        {
            new { seq = 1, dueDate = due1, lines = new object[] { new { specCode = "FAT-L-SPECIAL", qtyCrabs = 10 }, new { specCode = "FAT-M-G1", qtyKg = 3.5m } } },
            new { seq = 2, dueDate = due2, lines = new object[] { new { specCode = "FAT-L-SPECIAL", qtyCrabs = 10 }, new { specCode = "FAT-M-G1", qtyKg = 3.5m } } },
        })));
        Assert.Equal(2, order.GetProperty("tranches").GetArrayLength());
        var resplit = await Br15Fixture.Body(await client.PutAsJsonAsync($"/api/preorders/{order.GetProperty("orderNo").GetString()}/tranches", new
        {
            tranches = new object[]
            {
                new { seq = 1, dueDate = due1, lines = new object[] { new { specCode = "FAT-L-SPECIAL", qtyCrabs = 20 }, new { specCode = "FAT-M-G1", qtyKg = 7m } } },
            },
        }, Br15Fixture.Json));
        Assert.Single(resplit.GetProperty("tranches").EnumerateArray());
    }

    [Fact]
    public async Task T_batch_deposit_confirms_order_immediately()
    {
        var batch = await Br15Scenario.TBatchAsync(f);
        var customer = await Br15Scenario.CustomerAsync(f);
        using var client = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/preorders", Order(batch.Code, customer.SiteId)));
        await Br15Scenario.PayAsync(f, order.GetProperty("deposit").GetProperty("referenceCode").GetString()!);
        var after = await Br15Fixture.Body(await client.GetAsync($"/api/preorders/{order.GetProperty("orderNo").GetString()}"));
        Assert.Equal("Confirmed", after.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Concurrent_preorders_never_exceed_funded_crabs()
    {
        var batch = await BatchWith100CrabsAsync();
        var customers = new List<Br15Scenario.Customer>();
        for (var i = 0; i < 20; i++) customers.Add(await Br15Scenario.CustomerAsync(f));
        var tasks = customers.Select(async c =>
        {
            using var client = c.Client(f);
            var response = await Br15Fixture.PostJson(client, "/api/preorders", new
            {
                batchCode = batch.Code, deliverySiteId = c.SiteId, lines = new[] { new { specCode = "FAT-L-G1", mode = "ByCount", qtyCrabs = 12 } },
            });
            return response.StatusCode;
        }).ToList();
        var results = await Task.WhenAll(tasks);
        Assert.Equal(8, results.Count(r => r == HttpStatusCode.Created)); // 8 × 12 = 96 ≤ 100 < 9 × 12
        await using var db = f.OpenDb();
        var committed = await db.SalesOrderLines.Where(l => l.BatchId == batch.BatchId &&
            db.SalesOrders.Any(o => o.OrderId == l.OrderId && o.Status == "PendingDeposit")).SumAsync(l => l.ConvertedCrabs);
        Assert.True(committed <= 100);
    }
}
