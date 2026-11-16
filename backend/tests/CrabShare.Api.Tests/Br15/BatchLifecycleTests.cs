using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>G1: thiết lập Lô, chào giá, kế hoạch chi phí, mốc giải ngân, duyệt, gọi vốn và mở Lô (BR-018…083, BR-145, BR-146).</summary>
[Trait("Category", "Database")]
public sealed class BatchLifecycleTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    /// <summary>Bên cam kết thu mua đã xác minh, vai trò đang hoạt động.</summary>
    private async Task<long> OfftakeBuyerAsync()
    {
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var party = new Party
        {
            LegalName = $"Nhà hàng thu mua {f.Next()}", PartyType = "Company", VerificationStatus = "Verified", VerifiedAt = now,
            RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
        };
        party.Roles.Add(new PartnerRole { RoleType = "OfftakeBuyer", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        db.Parties.Add(party);
        await db.SaveChangesAsync();
        return party.PartyId;
    }

    private static object Terms(long buyerId, int planned = 200, string crabType = "FatteningMudCrab", long floor = 300_000) => new
    {
        title = "Lô vỗ béo cua thịt tháng 12", crabType, plannedQuantity = planned, hasHolding = true, holdingDays = 35,
        expectedAvgWeightG = 420, expectedGrade = "Cấp 1", saleDays = 14, deliveryRadiusKm = 300,
        expectedReceiptDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(40)),
        minViableCapital = 50_000_000, minViableBasis = "Chi phí cố định: điện, lọc nước, nhân công 50 triệu",
        survivalThresholdPct = 85m, baseRemunerationPct = 10m,
        remunerationTiers = new[]
        {
            new { survivalFromPct = 0m, survivalToPct = 85m, ratePct = 5m },
            new { survivalFromPct = 85m, survivalToPct = 100m, ratePct = 10m },
        },
        floorPricePerKg = floor, offtakeBuyerPartyId = buyerId, settlementBasis = "StandardCost",
        offers = new[]
        {
            new { specCode = "FAT-L-SPECIAL", pricePerKg = 450_000L, conversionWeightG = 450, offeredQuantity = 120 },
            new { specCode = "FAT-L-G1", pricePerKg = 420_000L, conversionWeightG = 450, offeredQuantity = 120 },
            new { specCode = "FAT-M-G1", pricePerKg = 380_000L, conversionWeightG = 350, offeredQuantity = 80 },
        },
    };

    /// <summary>Tổng 100.000.001 đ cho 200 con: Chi phí chuẩn mỗi con làm tròn lên 500.001 đ (BR-033).</summary>
    private static object CostPlan() => new
    {
        items = new object[]
        {
            new { category = "Seed", description = "Cua giống 200 con", quantity = 200m, unit = "con", unitPrice = 250_000L },
            new { category = "Feed", description = "Thức ăn", quantity = 1m, unit = "gói", unitPrice = 20_000_001L },
            new { category = "Utilities", description = "Điện nước", quantity = 1m, unit = "gói", unitPrice = 10_000_000L },
            new { category = "Labour", description = "Nhân công", quantity = 1m, unit = "gói", unitPrice = 10_000_000L },
            new { category = "MortalityReserve", description = "Dự phòng hao hụt", quantity = 1m, unit = "gói", unitPrice = 10_000_000L },
        },
    };

    private async Task<(Br15Fixture.Farmer Farmer, string Code)> DraftAsync()
    {
        var farmer = await f.CreateFarmerAsync();
        var buyer = await OfftakeBuyerAsync();
        using var client = farmer.Client(f);
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/batches", Terms(buyer)));
        var code = created.GetProperty("batchCode").GetString()!;
        await Br15Fixture.Body(await client.PutAsJsonAsync($"/api/batches/{code}/cost-plan", CostPlan(), Br15Fixture.Json));
        return (farmer, code);
    }

    private async Task<string> FundingBatchAsync()
    {
        var (farmer, code) = await DraftAsync();
        using var client = farmer.Client(f);
        await Br15Fixture.Body(await client.PostAsync($"/api/batches/{code}/submit", null));
        using var admin = f.Admin();
        await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new
        {
            fundingOpenAt = DateTimeOffset.UtcNow.AddMinutes(-1), fundingDeadline = DateTimeOffset.UtcNow.AddDays(10),
        }));
        return code;
    }

    [Fact]
    public async Task Cost_plan_rounds_cost_per_crab_up_and_builds_default_milestones()
    {
        var (farmer, code) = await DraftAsync();
        using var client = farmer.Client(f);
        var batch = await Br15Fixture.Body(await client.GetAsync($"/api/operators/me/batches/{code}"));
        var plan = batch.GetProperty("costPlan");
        Assert.Equal(100_000_001, plan.GetProperty("total").GetInt64());
        Assert.Equal(500_001, plan.GetProperty("costPerCrab").GetInt64());
        Assert.Equal(100_000_200, batch.GetProperty("targetCapital").GetInt64());
        var milestones = plan.GetProperty("milestones").EnumerateArray().ToList();
        Assert.Equal(["Receipt", "MidCycle", "Settlement"], milestones.Select(m => m.GetProperty("kind").GetString()));
        Assert.Equal(100m, milestones.Sum(m => m.GetProperty("pct").GetDecimal()));
        Assert.Equal("P", batch.GetProperty("batchMode").GetString());
        Assert.Equal(3, batch.GetProperty("offers").GetArrayLength());
    }

    [Fact]
    public async Task Offer_price_order_floor_and_tier_rules_are_enforced()
    {
        var farmer = await f.CreateFarmerAsync();
        var buyer = await OfftakeBuyerAsync();
        using var client = farmer.Client(f);

        var json = JsonSerializer.SerializeToNode(Terms(buyer), Br15Fixture.Json)!;
        json["offers"]![1]!["pricePerKg"] = 460_000; // Cấp 1 đắt hơn Đặc cấp cùng size
        var badOrder = await client.PostAsJsonAsync("/api/batches", json, Br15Fixture.Json);
        Assert.Equal("batch.offer_price_order", await Br15Fixture.ErrorCode(badOrder));

        var floor = await Br15Fixture.PostJson(client, "/api/batches", Terms(buyer, floor: 390_000));
        Assert.Equal("batch.floor_above_offer", await Br15Fixture.ErrorCode(floor));

        json = JsonSerializer.SerializeToNode(Terms(buyer), Br15Fixture.Json)!;
        json["remunerationTiers"]![0]!["survivalToPct"] = 80; // hở từ 80 tới 85
        var gap = await client.PostAsJsonAsync("/api/batches", json, Br15Fixture.Json);
        Assert.Equal("batch.tier_coverage", await Br15Fixture.ErrorCode(gap));

        json = JsonSerializer.SerializeToNode(Terms(buyer), Br15Fixture.Json)!;
        json["remunerationTiers"]![0]!["ratePct"] = 12; // sống thấp hơn mà thù lao cao hơn
        var order = await client.PostAsJsonAsync("/api/batches", json, Br15Fixture.Json);
        Assert.Equal("batch.tier_order", await Br15Fixture.ErrorCode(order));

        var softShell = await Br15Fixture.PostJson(client, "/api/batches", Terms(buyer, crabType: "SoftShellCrab"));
        Assert.Equal(HttpStatusCode.BadRequest, softShell.StatusCode);
    }

    [Fact]
    public async Task Cost_plan_requires_mortality_reserve_and_milestones_sum_to_100()
    {
        var (farmer, code) = await DraftAsync();
        using var client = farmer.Client(f);
        var noReserve = await client.PutAsJsonAsync($"/api/batches/{code}/cost-plan", new
        {
            items = new[] { new { category = "Seed", description = "Cua", quantity = 1m, unit = "lô", unitPrice = 1_000_000L } },
        }, Br15Fixture.Json);
        Assert.Equal("batch.mortality_reserve_required", await Br15Fixture.ErrorCode(noReserve));
        var badMilestones = await client.PutAsJsonAsync($"/api/batches/{code}/cost-plan", new
        {
            items = new[]
            {
                new { category = "Seed", description = "Cua", quantity = 1m, unit = "lô", unitPrice = 1_000_000L },
                new { category = "MortalityReserve", description = "Dự phòng", quantity = 1m, unit = "lô", unitPrice = 100_000L },
            },
            milestones = new[]
            {
                new { no = 1, kind = "Receipt", name = "Nhận cua", pct = 60m },
                new { no = 2, kind = "Settlement", name = "Quyết toán", pct = 30m },
            },
        }, Br15Fixture.Json);
        Assert.Equal("batch.milestone_total", await Br15Fixture.ErrorCode(badMilestones));
    }

    [Fact]
    public async Task Revision_creates_new_cost_version_and_approval_locks_terms_and_fee_rate()
    {
        var (farmer, code) = await DraftAsync();
        using var client = farmer.Client(f);
        await Br15Fixture.Body(await client.PostAsync($"/api/batches/{code}/submit", null));
        using var admin = f.Admin();
        var revision = await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{code}/request-revision", new { reason = "Thêm chi phí vận chuyển" }));
        Assert.Equal("NeedsRevision", revision.GetProperty("batch").GetProperty("status").GetString());

        var saved = await Br15Fixture.Body(await client.PutAsJsonAsync($"/api/batches/{code}/cost-plan", CostPlan(), Br15Fixture.Json));
        Assert.Equal(2, saved.GetProperty("costPlan").GetProperty("versionNo").GetInt32());
        await Br15Fixture.Body(await client.PostAsync($"/api/batches/{code}/submit", null));

        var lateDeadline = await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new
        {
            fundingOpenAt = DateTimeOffset.UtcNow, fundingDeadline = DateTimeOffset.UtcNow.AddDays(60),
        });
        Assert.Equal("batch.deadline_after_receipt", await Br15Fixture.ErrorCode(lateDeadline));

        var approved = await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new
        {
            fundingOpenAt = DateTimeOffset.UtcNow, fundingDeadline = DateTimeOffset.UtcNow.AddDays(7),
        }));
        var batch = approved.GetProperty("batch");
        Assert.Equal("Funding", batch.GetProperty("status").GetString());
        Assert.Equal(2m, batch.GetProperty("platformFeeRatePct").GetDecimal());
        Assert.Equal(1_000_000, batch.GetProperty("minContribution").GetInt64());
        Assert.Equal("Locked", batch.GetProperty("costPlan").GetProperty("status").GetString());
        Assert.False(batch.GetProperty("canEdit").GetBoolean());

        var edit = await Br15Fixture.PostJson(client, $"/api/batches/{code}/submit", new { });
        Assert.Equal("batch.invalid_transition", await Br15Fixture.ErrorCode(edit));
        await using var db = f.OpenDb();
        var batchId = await db.Batches.Where(b => b.BatchCode == code).Select(b => b.BatchId).SingleAsync();
        Assert.True(await db.BatchAccounts.AnyAsync(a => a.BatchId == batchId && a.Status == "Open"));
        Assert.True(await db.BatchParticipants.AnyAsync(p => p.BatchId == batchId && p.ParticipantRole == "OfftakeBuyer"));
    }

    [Fact]
    public async Task Funding_close_opens_batch_with_funded_crabs_odd_capital_refund_and_milestone_tranches()
    {
        var code = await FundingBatchAsync();
        var investors = new[] { await f.CreateUserAsync("NĐT A", Roles.Investor), await f.CreateUserAsync("NĐT B", Roles.Investor),
            await f.CreateUserAsync("NĐT C", Roles.Investor) };
        long batchId;
        await using (var db = f.OpenDb())
        {
            var batch = await db.Batches.SingleAsync(b => b.BatchCode == code);
            batchId = batch.BatchId;
            var now = DateTimeOffset.UtcNow;
            // 50 + 30 + 20,3 triệu = 100,3 triệu > vốn mục tiêu cũng không sao vì dữ liệu ghi thẳng; số con được cấp vốn chặn ở 200.
            long[] amounts = [40_000_000, 30_000_000, 20_300_000];
            for (var i = 0; i < 3; i++)
                db.Contributions.Add(new Contribution
                {
                    BatchId = batchId, InvestorId = investors[i], Amount = amounts[i], Status = "Confirmed", ReservedAt = now, ExpiresAt = now,
                    ConfirmedAt = now, CreatedAt = now, UpdatedAt = now,
                });
            batch.FundingDeadline = now.AddSeconds(-1);
            // Lô này chưa có đơn đặt trước: hạ tỷ lệ đặt trước tối thiểu về 0 kể từ trước lúc mở gọi vốn.
            db.PlatformParameters.Add(new PlatformParameter
            {
                ParamKey = "MinPreorderRatioPct", Value = 0, EffectiveFrom = batch.FundingOpenAt!.Value.AddSeconds(-30), CreatedAt = now,
            });
            await db.SaveChangesAsync();
        }

        await using (var scope = f.Factory.Services.CreateAsyncScope())
        {
            var outcome = await scope.ServiceProvider.GetRequiredService<FundingCloseService>().CloseBatchAsync(batchId, CancellationToken.None);
            Assert.Equal(FundingCloseService.OutcomeCapitalClosed, outcome!.Outcome);
        }

        await using (var db = f.OpenDb())
        {
            var batch = await db.Batches.SingleAsync(b => b.BatchId == batchId);
            // 90.300.000 ÷ 500.001 = 180 con; giữ 90.000.180 đ, hoàn 299.820 đ chia theo tỷ lệ vốn.
            Assert.Equal("Sourcing", batch.Status);
            Assert.Equal(180, batch.FundedQuantity);
            Assert.Equal(90_000_180m, batch.TotalConfirmedCapital);
            var shares = await db.CapitalShares.Where(s => s.BatchId == batchId).ToListAsync();
            Assert.Equal(90_000_180m, shares.Sum(s => s.ConfirmedAmount));
            var refunds = await db.PaymentInstructions.Where(p => p.InstructionType == "Refund" && p.Contribution != null && p.Contribution.BatchId == batchId).ToListAsync();
            Assert.Equal(299_820m, refunds.Sum(r => r.Amount));
            var tranches = await db.DisbursementTranches.Where(t => t.BatchId == batchId).OrderBy(t => t.TrancheNo).ToListAsync();
            Assert.Equal(["Receipt", "MidCycle", "Settlement"], tranches.Select(t => t.MilestoneKind));
            Assert.Equal(90_000_180m, tranches.Sum(t => t.PlannedAmount));
            Assert.Equal(3, await db.BatchParticipants.CountAsync(p => p.BatchId == batchId && p.ParticipantRole == "Investor"));
        }
    }

    [Fact]
    public async Task Funding_close_cancels_when_preorder_ratio_is_below_minimum()
    {
        var code = await FundingBatchAsync();
        var investor = await f.CreateUserAsync("NĐT", Roles.Investor);
        long batchId;
        await using (var db = f.OpenDb())
        {
            var batch = await db.Batches.SingleAsync(b => b.BatchCode == code);
            batchId = batch.BatchId;
            var now = DateTimeOffset.UtcNow;
            db.Contributions.Add(new Contribution
            {
                BatchId = batchId, InvestorId = investor, Amount = 60_000_000, Status = "Confirmed", ReservedAt = now, ExpiresAt = now,
                ConfirmedAt = now, CreatedAt = now, UpdatedAt = now,
            });
            batch.FundingDeadline = now.AddSeconds(-1);
            await db.SaveChangesAsync();
        }
        await using (var scope = f.Factory.Services.CreateAsyncScope())
        {
            var outcome = await scope.ServiceProvider.GetRequiredService<FundingCloseService>().CloseBatchAsync(batchId, CancellationToken.None);
            Assert.Equal(FundingCloseService.OutcomeCancelled, outcome!.Outcome);
        }
        await using (var db = f.OpenDb())
        {
            var batch = await db.Batches.SingleAsync(b => b.BatchId == batchId);
            Assert.Equal("Cancelled", batch.Status);
            Assert.Contains("đặt trước", batch.CancelReason);
            Assert.Equal(60_000_000m, await db.PaymentInstructions.Where(p => p.InstructionType == "Refund" && p.Contribution!.BatchId == batchId).SumAsync(p => p.Amount));
        }
    }

    [Fact]
    public async Task Contribution_by_percentage_converts_to_amount_of_target()
    {
        var code = await FundingBatchAsync();
        var investor = await f.CreateUserAsync("NĐT góp %", Roles.Investor);
        using var client = f.Client(investor, Roles.Investor, Roles.Customer);
        var rd = await Br15Fixture.Body(await client.GetAsync("/api/risk-disclosures/active"));
        await Br15Fixture.Body(await client.PostAsJsonAsync("/api/risk-acknowledgements", new { riskDisclosureId = rd.GetProperty("riskDisclosureId").GetInt64(), scrolledToEnd = true }));
        var reserved = await Br15Fixture.Body(await client.PostAsJsonAsync($"/api/batches/{code}/contributions", new { pct = 12.5m }));
        // 12,5% × 100.000.200 = 12.500.025 đ
        Assert.Equal(12_500_025, reserved.GetProperty("amount").GetInt64());
        var both = await client.PostAsJsonAsync($"/api/batches/{code}/contributions", new { pct = 5m, amount = 5_000_000 });
        Assert.Equal(HttpStatusCode.BadRequest, both.StatusCode);
    }

    [Fact]
    public async Task Admin_t_batch_goes_to_sourcing_with_planned_quantity_and_no_funding()
    {
        var farmer = await f.CreateFarmerAsync();
        var buyer = await OfftakeBuyerAsync();
        using var admin = f.Admin();
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/batches", new
        {
            batchMode = "T", operatorId = farmer.OperatorId, terms = Terms(buyer),
        }));
        var code = created.GetProperty("batchCode").GetString()!;
        Assert.Equal("T", created.GetProperty("batchMode").GetString());
        Assert.Equal(0, created.GetProperty("remunerationTiers").GetArrayLength());
        await Br15Fixture.Body(await admin.PutAsJsonAsync($"/api/batches/{code}/cost-plan", CostPlan(), Br15Fixture.Json));
        await Br15Fixture.Body(await admin.PostAsync($"/api/batches/{code}/submit", null));
        var approved = await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new
        {
            preorderDeadline = DateTimeOffset.UtcNow.AddDays(10),
        }));
        var batch = approved.GetProperty("batch");
        Assert.Equal("Sourcing", batch.GetProperty("status").GetString());
        Assert.Equal(200, batch.GetProperty("fundedQuantity").GetInt32());
        Assert.Equal("CrabShare", batch.GetProperty("executor").GetProperty("legalName").GetString());

        // Người nuôi không sửa được lô T.
        using var farmerClient = farmer.Client(f);
        var edit = await farmerClient.PutAsJsonAsync($"/api/batches/{code}", Terms(buyer), Br15Fixture.Json);
        Assert.Equal(HttpStatusCode.Forbidden, edit.StatusCode);
    }

    [Fact]
    public async Task Farmer_cancels_funding_batch_without_confirmed_capital()
    {
        var code = await FundingBatchAsync();
        await using var db = f.OpenDb();
        var operatorId = await db.Batches.Where(b => b.BatchCode == code).Select(b => b.OperatorId).SingleAsync();
        var owner = await db.OperatorMembers.Where(m => m.OperatorId == operatorId).Select(m => m.UserId).SingleAsync();
        using var client = f.Client(owner, operatorId, Roles.OperatorMember);
        var cancelled = await Br15Fixture.Body(await client.PostAsJsonAsync($"/api/batches/{code}/cancel", new { reason = "Thời tiết xấu" }));
        Assert.Equal("Cancelled", cancelled.GetProperty("status").GetString());
        Assert.Equal("Thời tiết xấu", cancelled.GetProperty("cancelReason").GetString());
    }

    [Fact]
    public async Task Explore_lists_open_batches_and_filters_by_delivery_radius()
    {
        var code = await FundingBatchAsync();
        using var anon = f.Factory.CreateClient();
        // Trại ở Năm Căn (8,76; 105,05). TP.HCM cách khoảng 260 km, trong bán kính 300 km; Hà Nội ngoài bán kính.
        var hcm = await Br15Fixture.Body(await anon.GetAsync("/api/batches?latitude=10.7769&longitude=106.7009&pageSize=100"));
        var item = hcm.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("batchCode").GetString() == code);
        Assert.InRange(item.GetProperty("distanceKm").GetDecimal(), 200m, 300m);
        Assert.Equal(450_000, item.GetProperty("offers").EnumerateArray()
            .Single(o => o.GetProperty("specCode").GetString() == "FAT-L-SPECIAL").GetProperty("pricePerKg").GetInt64());
        Assert.Equal(300_000, item.GetProperty("floorPricePerKg").GetInt64());
        var hanoi = await Br15Fixture.Body(await anon.GetAsync("/api/batches?latitude=21.0285&longitude=105.8542&pageSize=100"));
        Assert.DoesNotContain(hanoi.GetProperty("items").EnumerateArray(), i => i.GetProperty("batchCode").GetString() == code);
        var detail = await Br15Fixture.Body(await anon.GetAsync($"/api/batches/{code}"));
        Assert.NotEqual(0, detail.GetProperty("costByCategory").GetArrayLength());
        var text = detail.GetRawText().ToLowerInvariant();
        Assert.DoesNotContain("roi", text.Replace("receipt", ""));
        Assert.DoesNotContain("yield", text);
    }
}
