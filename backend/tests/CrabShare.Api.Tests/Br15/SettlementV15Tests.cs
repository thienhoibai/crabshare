using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Settlement;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>
/// G7: sáu điều kiện chờ quyết toán (BR-183), quyết toán lô P với phí trên doanh thu thực thu, Chi phí chuẩn trừ, bậc thù lao theo tỷ lệ sống
/// (BR-187 – BR-199), lô T (BR-200), lô A (BR-201), duyệt khi số dư theo đối soát khớp (BR-205), đóng Lô khi mọi lệnh chi thành công (BR-209),
/// biểu quyết theo vốn và thanh lý sớm (BR-210, BR-211), ba số tiền (BR-232), cổng bằng chứng của mốc giải ngân và biên bản thăm trại (BR-145, BR-233).
/// </summary>
[Trait("Category", "Database")]
public sealed class SettlementV15Tests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    private async Task<long> QcAsync(long batchId, string kind = "GradingSession")
    {
        await using var db = f.OpenDb();
        return await db.QcAssignments.Where(a => a.BatchId == batchId && a.AssignmentKind == kind).OrderByDescending(a => a.QcAssignmentId)
            .Select(a => a.QcUserId).FirstAsync();
    }

    /// <summary>Đo tay (320 g, CL 7,5 cm → FAT-L-SPECIAL) rồi Nhân viên kiểm phẩm được phân duyệt.</summary>
    private async Task GradeAsync(HttpClient farmer, long batchId, string crabCode)
    {
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions", new { crabCode, procedure = "Manual" }));
        var measured = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, $"/api/measurement-sessions/{session.GetProperty("sessionNo").GetString()}/values",
            new { weightG = 320m, carapaceLengthCm = 7.5m }));
        using var qc = f.Client(await QcAsync(batchId), Roles.QcInspector);
        await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{measured.GetProperty("decision").GetProperty("decisionNo").GetString()}/approve", new { }));
    }

    /// <summary>Hết số ngày bán, bán toàn bộ cua còn lại cho bên cam kết và thu tiền (BR-179 – BR-181).</summary>
    private async Task<long> SellRemainingAsync(HttpClient farmer, string code, long batchId, decimal kg, long price)
    {
        await using (var db = f.OpenDb())
            await db.Batches.Where(b => b.BatchId == batchId).ExecuteUpdateAsync(u => u.SetProperty(b => b.SellingStartedAt, DateTimeOffset.UtcNow.AddDays(-20)));
        var final = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, $"/api/batches/{code}/final-order", new { kg, pricePerKg = price }));
        await Br15Scenario.PayAsync(f, final.GetProperty("payment").GetProperty("referenceCode").GetString()!);
        return final.GetProperty("totalAmount").GetInt64();
    }

    /// <summary>Lỗi nghiệp vụ 422 tranche.not_eligible kèm lý do trong detail.</summary>
    private static async Task<string> DetailAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("tranche.not_eligible", body.GetProperty("code").GetString());
        return body.GetProperty("detail").GetString()!;
    }

    private async Task AdvanceAsync()
    {
        await using var scope = f.Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<SettlementReadinessService>().AdvanceAsync(CancellationToken.None);
    }

    private async Task PayoutAccountAsync(long? userId, long? operatorId)
    {
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        db.PayoutAccounts.Add(new PayoutAccount
        {
            OwnerUserId = userId, OwnerOperatorId = operatorId, BankCode = "VCB", AccountNo = $"{f.Next():D10}", AccountHolderName = "NGUYEN VAN A",
            NameMatchStatus = "Matched", Status = "Active", CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>Ghi thẳng phiếu nhận đã kiểm xong và các con cua vừa nhận cho Lô không lưu nuôi (giá mua 250.000 đ một con).</summary>
    private async Task<IReadOnlyList<string>> ReceiveAsync(long batchId, long farmerUserId, int count)
    {
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var supplier = new Party { LegalName = $"Vựa {f.Next()}", PartyType = "Household", VerificationStatus = "Verified", VerifiedAt = now, RegisteredAt = now, CreatedAt = now, UpdatedAt = now };
        db.Parties.Add(supplier);
        await db.SaveChangesAsync();
        var po = new ProcurementOrder
        {
            PoNo = $"PO{Guid.NewGuid():N}"[..12], BatchId = batchId, SupplierPartyId = supplier.PartyId, OrderedOn = DateOnly.FromDateTime(now.UtcDateTime),
            AgreedSpec = "Cua thịt", Quantity = count, UnitPrice = 250_000, Status = "Received", CreatedBy = farmerUserId, CreatedAt = now, UpdatedAt = now,
        };
        db.ProcurementOrders.Add(po);
        await db.SaveChangesAsync();
        var lot = new SupplyLot
        {
            LotCode = $"LN{Guid.NewGuid():N}"[..12], ProcurementOrderId = po.ProcurementOrderId, BatchId = batchId, OriginRegion = "Năm Căn, Cà Mau",
            HarvestedOn = DateOnly.FromDateTime(now.UtcDateTime), DeclaredSpecies = "Scylla paramamosain", DeclaredCount = count, DeclaredWeightKg = count * 0.3m, CreatedAt = now,
        };
        db.SupplyLots.Add(lot);
        await db.SaveChangesAsync();
        var receipt = new GoodsReceipt
        {
            ReceiptNo = $"GR{Guid.NewGuid():N}"[..12], SupplyLotId = lot.SupplyLotId, BatchId = batchId, ReceivedAt = now, ReceivedBy = farmerUserId,
            AcceptedCount = count, AcceptedWeightG = count * 300, Status = "Completed", CompletedAt = now, CreatedAt = now,
        };
        db.GoodsReceipts.Add(receipt);
        await db.SaveChangesAsync();
        var codes = new List<string>();
        for (var i = 0; i < count; i++)
        {
            var crab = new CrabUnit
            {
                CrabCode = $"CU{Guid.NewGuid():N}"[..10].ToUpperInvariant(), BatchId = batchId, SupplyLotId = lot.SupplyLotId, GoodsReceiptId = receipt.GoodsReceiptId,
                Species = "Scylla paramamosain", Sex = "Male", Maturity = "Mature", ReceivedWeightG = 300, InventoryStatus = "Received", ReceivedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.CrabUnits.Add(crab);
            await db.SaveChangesAsync();
            codes.Add(crab.CrabCode);
        }
        return codes;
    }

    [Fact]
    public async Task P_batch_settles_with_fee_on_revenue_standard_cost_survival_tier_then_balance_checked_payouts_close_the_batch()
    {
        await f.CreateUserAsync("Kiểm phẩm", Roles.QcInspector);
        var set = await Br15Scenario.CrabsAsync(f, 2);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        foreach (var c in set.CrabCodes) await GradeAsync(farmer, set.Batch.BatchId, c);

        var notYet = await Br15Fixture.Body(await farmer.GetAsync($"/api/batches/{set.Batch.Code}/settlement-readiness"));
        Assert.False(notYet.GetProperty("ready").GetBoolean());
        Assert.False(notYet.GetProperty("conditions")[0].GetProperty("met").GetBoolean()); // 2 con chưa bán
        var revenue = await SellRemainingAsync(farmer, set.Batch.Code, set.Batch.BatchId, 0.82m, 320_000);
        Assert.Equal(262_400, revenue);
        var ready = await Br15Fixture.Body(await farmer.GetAsync($"/api/batches/{set.Batch.Code}/settlement-readiness"));
        Assert.True(ready.GetProperty("ready").GetBoolean());
        await AdvanceAsync();

        using var admin = f.Admin();
        var calc = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/batches/{set.Batch.Code}/settlements", new { }));
        var id = calc.GetProperty("settlementId").GetInt64();
        var b = calc.GetProperty("breakdown");
        // Phí 2 % × 262.400 = 5.248; Chi phí chuẩn trừ = 500.001 × 200 con = 100.000.200; Pool = 262.400 − 5.248 − 100.000.200.
        Assert.Equal("P", b.GetProperty("mode").GetString());
        Assert.Equal(5_248, b.GetProperty("platformFee").GetInt64());
        Assert.Equal(100_000_200, calc.GetProperty("lockedStandardCost").GetInt64());
        Assert.Equal(-99_743_048, calc.GetProperty("revenuePool").GetInt64());
        Assert.Equal(100m, b.GetProperty("survivalRatePct").GetDecimal());
        Assert.Equal(10m, calc.GetProperty("operatorSharePct").GetDecimal()); // bậc 85–100 %
        Assert.Equal(0, calc.GetProperty("operatorRemuneration").GetInt64()); // Pool âm: không có thù lao
        Assert.Equal(257_152, calc.GetProperty("lines")[0].GetProperty("netPayout").GetInt64()); // vốn − phần lỗ
        Assert.Equal(100_000_200, b.GetProperty("undisbursedCost").GetInt64());
        Assert.Equal("Settling", calc.GetProperty("batchStatus").GetString());

        Assert.Equal("settlement.not_proposed", await Br15Fixture.ErrorCode(await admin.PostAsync($"/api/admin/settlements/{id}/approve", null)));
        await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/settlements/{id}/propose", new { feedbackDays = 7 }));
        Assert.Equal("settlement.window_open", await Br15Fixture.ErrorCode(await admin.PostAsync($"/api/admin/settlements/{id}/approve", null)));
        await Br15Fixture.Body(await admin.PostAsync($"/api/dev/settlements/{id}/end-feedback-window", null));
        Assert.Equal("payment.no_payout_account", await Br15Fixture.ErrorCode(await admin.PostAsync($"/api/admin/settlements/{id}/approve", null)));

        long investor;
        await using (var db = f.OpenDb())
            investor = await db.CapitalShares.Where(s => s.BatchId == set.Batch.BatchId).Select(s => s.InvestorId).SingleAsync();
        await PayoutAccountAsync(null, set.Batch.Farmer.OperatorId);
        await PayoutAccountAsync(investor, null);
        // BR-205: số dư theo đối soát = 100.000.200 góp + 262.400 tiền hàng = 257.152 + 100.000.200 + 5.248.
        var approved = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{id}/approve", null));
        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        await using (var db = f.OpenDb())
        {
            var account = await db.BatchAccounts.Where(a => a.BatchId == set.Batch.BatchId).Select(a => a.BatchAccountId).SingleAsync();
            var instructions = await db.PaymentInstructions.Where(i => i.BatchAccountId == account).Select(i => new { i.InstructionType, i.Amount }).ToListAsync();
            Assert.Contains(instructions, i => i.InstructionType == "PlatformFee" && i.Amount == 5_248);
            Assert.Contains(instructions, i => i.InstructionType == "Payout" && i.Amount == 100_000_200);
            Assert.Contains(instructions, i => i.InstructionType == "Payout" && i.Amount == 257_152);
        }
        var paid = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{id}/send-payouts", null));
        Assert.Equal("Closed", paid.GetProperty("batchStatus").GetString());
        Assert.Equal("Closed", paid.GetProperty("status").GetString());

        using var investorClient = f.Client(investor, Roles.Investor);
        var money = await Br15Fixture.Body(await investorClient.GetAsync($"/api/batches/{set.Batch.Code}/money-summary"));
        // Nhà đầu tư có vốn ở Lô xem được sáu điều kiện quyết toán; nhà đầu tư khác thì không.
        var seen = await Br15Fixture.Body(await investorClient.GetAsync($"/api/batches/{set.Batch.Code}/settlement-readiness"));
        Assert.Equal(6, seen.GetProperty("conditions").GetArrayLength());
        using (var outsider = f.Client(await f.CreateUserAsync("Nhà đầu tư ngoài Lô", Roles.Investor), Roles.Investor))
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, (await outsider.GetAsync($"/api/batches/{set.Batch.Code}/settlement-readiness")).StatusCode);
        Assert.Equal(100_000_200, money.GetProperty("mine").GetProperty("contributed").GetInt64());
        Assert.Equal(0, money.GetProperty("batch").GetProperty("heldInAccount").GetInt64());
    }

    [Fact]
    public async Task T_batch_settles_internally_and_A_batch_pays_commission_and_supplier()
    {
        await f.CreateUserAsync("Kiểm phẩm", Roles.QcInspector);
        using var admin = f.Admin();

        // Lô T (BR-200): kết quả = doanh thu − giá vốn mua cua − chi phí trực tiếp có chứng từ; CrabShare hưởng lãi, chịu lỗ.
        var t = await Br15Scenario.TBatchAsync(f, holding: false);
        using (var farmer = t.Farmer.Client(f))
        {
            foreach (var c in await ReceiveAsync(t.BatchId, t.Farmer.UserId, 2)) await GradeAsync(farmer, t.BatchId, c);
            Assert.Equal(204_800, await SellRemainingAsync(farmer, t.Code, t.BatchId, 0.64m, 320_000));
        }
        await AdvanceAsync();
        var tCalc = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/batches/{t.Code}/settlements", new { }));
        Assert.Equal("T", tCalc.GetProperty("breakdown").GetProperty("mode").GetString());
        Assert.Equal(500_000, tCalc.GetProperty("lockedStandardCost").GetInt64());
        Assert.Equal(-295_200, tCalc.GetProperty("revenuePool").GetInt64());
        Assert.Equal(0, tCalc.GetProperty("lines").GetArrayLength());
        var tDone = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{tCalc.GetProperty("settlementId").GetInt64()}/approve", null));
        Assert.Equal("Closed", tDone.GetProperty("batchStatus").GetString());

        // Lô A (BR-201): hoa hồng 8 % trên hàng đã giao và đã thu tiền; phần còn lại chi cho nhà cung cấp.
        var farmerA = await f.CreateFarmerAsync();
        var buyer = await Br15Scenario.OfftakeBuyerAsync(f);
        long supplier;
        await using (var db = f.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            var party = new Party { LegalName = $"Hợp tác xã cua {f.Next()}", PartyType = "Cooperative", VerificationStatus = "Verified", VerifiedAt = now, RegisteredAt = now, CreatedAt = now, UpdatedAt = now };
            party.Roles.Add(new PartnerRole { RoleType = "Supplier", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
            db.Parties.Add(party);
            await db.SaveChangesAsync();
            supplier = party.PartyId;
        }
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/batches", new
        {
            batchMode = "A", operatorId = farmerA.OperatorId, supplierPartyId = supplier, commissionPct = 8m, terms = Br15Scenario.Terms(buyer, holding: false),
        }));
        var aCode = created.GetProperty("batchCode").GetString()!;
        await Br15Fixture.Body(await admin.PutAsJsonAsync($"/api/batches/{aCode}/cost-plan", Br15Scenario.CostPlan(), Br15Fixture.Json));
        await Br15Fixture.Body(await admin.PostAsync($"/api/batches/{aCode}/submit", null));
        await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{aCode}/approve", new { preorderDeadline = DateTimeOffset.UtcNow.AddDays(10) }));
        long aId;
        await using (var db = f.OpenDb()) aId = await db.Batches.Where(x => x.BatchCode == aCode).Select(x => x.BatchId).SingleAsync();
        using (var farmer = farmerA.Client(f))
        {
            foreach (var c in await ReceiveAsync(aId, farmerA.UserId, 2)) await GradeAsync(farmer, aId, c);
            await SellRemainingAsync(farmer, aCode, aId, 0.64m, 320_000);
        }
        await AdvanceAsync();
        var aCalc = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/batches/{aCode}/settlements", new { }));
        Assert.Equal(16_384, aCalc.GetProperty("breakdown").GetProperty("commissionAmount").GetInt64());
        Assert.Equal(188_416, aCalc.GetProperty("breakdown").GetProperty("supplierPayout").GetInt64());
        await PayoutAccountAsync(null, farmerA.OperatorId);
        var aId2 = aCalc.GetProperty("settlementId").GetInt64();
        await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{aId2}/approve", null));
        var aDone = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{aId2}/send-payouts", null));
        Assert.Equal("Closed", aDone.GetProperty("batchStatus").GetString());
    }

    [Fact]
    public async Task Capital_weighted_vote_excludes_the_farmer_and_passed_liquidation_stops_unreleased_milestones()
    {
        var batch = await Br15Scenario.FundingBatchAsync(f, zeroPreorderRatio: true);
        var a = await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 100 * Br15Scenario.CostPerCrab);
        var bInvestor = await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 60 * Br15Scenario.CostPerCrab);
        // Người nuôi cũng góp vốn như nhà đầu tư (BR-198) nhưng không được biểu quyết ở quyết định có xung đột lợi ích (BR-211).
        await using (var db = f.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            db.AppUserRoles.Add(new AppUserRole { UserId = batch.Farmer.UserId, RoleCode = Roles.Investor, GrantedAt = now, CreatedAt = now });
            db.Investors.Add(new Investor { UserId = batch.Farmer.UserId, InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now, CreatedAt = now });
            await db.SaveChangesAsync();
        }
        await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 40 * Br15Scenario.CostPerCrab, batch.Farmer.UserId);
        Assert.Equal("CapitalClosed", await Br15Scenario.CloseFundingAsync(f, batch.BatchId));

        using var farmer = batch.Farmer.Client(f);
        var decision = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, $"/api/batches/{batch.Code}/decisions",
            new { kind = "EarlyLiquidation", proposal = "Dịch bệnh ở vùng nuôi, đề nghị thanh lý sớm", votingHours = 48 }));
        var no = decision.GetProperty("decisionNo").GetString()!;
        Assert.Equal(160 * Br15Scenario.CostPerCrab, decision.GetProperty("eligibleCapital").GetInt64()); // vốn của người nuôi không biểu quyết
        using (var farmerAsInvestor = f.Client(batch.Farmer.UserId, batch.Farmer.OperatorId, Roles.Investor))
            Assert.Equal("decision.not_eligible", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(farmerAsInvestor, $"/api/decisions/{no}/votes", new { choice = "Yes" })));
        using (var b = f.Client(bInvestor, Roles.Investor))
            Assert.Equal("Open", (await Br15Fixture.Body(await Br15Fixture.PostJson(b, $"/api/decisions/{no}/votes", new { choice = "No" }))).GetProperty("status").GetString());
        using (var investorA = f.Client(a, Roles.Investor))
        {
            var passed = await Br15Fixture.Body(await Br15Fixture.PostJson(investorA, $"/api/decisions/{no}/votes", new { choice = "Yes" }));
            Assert.Equal("Passed", passed.GetProperty("status").GetString());
            Assert.Equal(62.5m, passed.GetProperty("yesPct").GetDecimal());
            Assert.Equal("decision.closed", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(investorA, $"/api/decisions/{no}/votes", new { choice = "No" })));
        }
        await using (var db = f.OpenDb())
        {
            var b = await db.Batches.SingleAsync(x => x.BatchId == batch.BatchId);
            Assert.Equal("Liquidating", b.Status);
            Assert.NotNull(b.LiquidationStartedAt);
            Assert.All(await db.DisbursementTranches.Where(t => t.BatchId == batch.BatchId).ToListAsync(), t => Assert.Equal("Stopped", t.Status));
        }
        Assert.Equal("tranche.not_eligible", await Br15Fixture.ErrorCode(await farmer.PostAsync($"/api/batches/{batch.Code}/tranches/1/request", null)));
    }

    [Fact]
    public async Task Milestones_open_only_with_their_evidence_and_the_mid_cycle_one_needs_an_on_farm_site_visit_report()
    {
        var qcUser = await f.CreateUserAsync("Kiểm phẩm thăm trại", Roles.QcInspector);
        var set = await Br15Scenario.CrabsAsync(f, 2);
        using var farmer = set.Batch.Farmer.Client(f);
        Assert.Contains("2/200", await DetailAsync(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/tranches/1/request", null)));

        // Giả định mốc nhận cua đã giải ngân; mốc giữa vụ kiểm ảnh hộp và biên bản thăm trại.
        await using (var db = f.OpenDb())
            await db.DisbursementTranches.Where(t => t.BatchId == set.Batch.BatchId && t.TrancheNo == 1)
                .ExecuteUpdateAsync(u => u.SetProperty(t => t.Status, "Released").SetProperty(t => t.ReleasedAt, DateTimeOffset.UtcNow.AddDays(-1)));
        Assert.Contains("2 hộp", await DetailAsync(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/tranches/2/request", null)));

        using var admin = f.Admin();
        var camera = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/devices",
            new { deviceCode = $"RC-{f.Next()}", deviceType = "RailCamera", operatorId = set.Batch.Farmer.OperatorId, rackCode = "R01" }));
        await using (var db = f.OpenDb())
        {
            var deviceId = await db.Devices.Where(d => d.DeviceCode == camera.GetProperty("device").GetProperty("deviceCode").GetString()).Select(d => d.DeviceId).SingleAsync();
            var now = DateTimeOffset.UtcNow;
            foreach (var slot in await db.BoxAssignments.Where(x => x.BatchId == set.Batch.BatchId && x.LeftAt == null).Select(x => x.SlotId).ToListAsync())
                db.DeviceImages.Add(new DeviceImage
                {
                    DeviceId = deviceId, BatchId = set.Batch.BatchId, SlotId = slot, MessageId = Guid.NewGuid(), CapturedAt = now, ReceivedAt = now, FileUri = "devices/test.jpg",
                    Sha256 = new string('a', 64), CrabDetected = true, CreatedAt = now,
                });
            await db.SaveChangesAsync();
        }
        Assert.Contains("thăm trại", await DetailAsync(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/tranches/2/request", null)));

        await Br15Fixture.Body(await admin.PostAsync($"/api/admin/batches/{set.Batch.Code}/site-visits", null));
        var assignment = await QcAsync(set.Batch.BatchId, "SiteVisit");
        long assignmentId;
        await using (var db = f.OpenDb())
            assignmentId = await db.QcAssignments.Where(x => x.BatchId == set.Batch.BatchId && x.AssignmentKind == "SiteVisit").Select(x => x.QcAssignmentId).SingleAsync();
        using var qc = f.Client(assignment, Roles.QcInspector);
        MultipartFormDataContent Report(decimal lat, decimal lng)
        {
            var form = new MultipartFormDataContent
            {
                { new StringContent(lat.ToString(System.Globalization.CultureInfo.InvariantCulture)), "Latitude" },
                { new StringContent(lng.ToString(System.Globalization.CultureInfo.InvariantCulture)), "Longitude" },
                { new StringContent("0001,0002"), "BoxCodes" }, { new StringContent("2"), "CrabsSeen" },
                { new StringContent("Hai hộp đủ nước, cua khoẻ, nhật ký khớp"), "Findings" },
            };
            var photo = new ByteArrayContent(Br15Scenario.Jpeg("visit"));
            photo.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(photo, "Photo", "visit.jpg");
            return form;
        }
        Assert.Equal("sitevisit.not_at_farm", await Br15Fixture.ErrorCode(await qc.PostAsync($"/api/qc/site-visits/{assignmentId}/report", Report(10.77m, 106.70m))));
        var report = await Br15Fixture.Body(await qc.PostAsync($"/api/qc/site-visits/{assignmentId}/report", Report(8.7601m, 105.0502m)));
        Assert.True(report.GetProperty("distanceToFarmM").GetInt32() < 100);

        var requested = await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/tranches/2/request", null));
        Assert.Equal("Requested", requested.GetProperty("status").GetString());
        _ = qcUser;
    }
}
