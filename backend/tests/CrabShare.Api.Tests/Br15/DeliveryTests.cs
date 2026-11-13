using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Delivery;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>
/// G6: phân bổ cua đã duyệt cho đợt giao sớm nhất, chuyến giao cân hai lần, nghiệm thu, cọc trừ trên cả đơn, phần còn lại, hoá đơn,
/// mất cọc và bán lại, khiếu nại, đơn có hoá đơn, đơn hàng cuối, QR đơn, dòng doanh thu (BR-160 – BR-185, BR-234).
/// Lô T không lưu nuôi: cua nhận xong đo bằng cân tay và thước kẹp rồi Nhân viên kiểm phẩm duyệt.
/// </summary>
[Trait("Category", "Database")]
public sealed class DeliveryTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    // Cua thịt (bảng 3.2, 3.3): 320 g là size L; C = khối lượng ÷ CL³.
    private static readonly (decimal W, decimal Cl) LSpecial = (320m, 7.5m); // C = 0,7585 → FAT-L-SPECIAL
    private static readonly (decimal W, decimal Cl) LGrade1 = (320m, 7.95m); // C = 0,6369 → FAT-L-G1
    private static readonly (decimal W, decimal Cl) MGrade1 = (250m, 7.3m);  // C = 0,6427 → FAT-M-G1
    private static readonly (decimal W, decimal Cl) Below = (320m, 8.2m);    // C = 0,5804 → dưới chuẩn

    private sealed record Setup(Br15Scenario.BatchHandle Batch, Br15Scenario.Customer Customer, string OrderNo, HttpClient Farmer, HttpClient Buyer);

    /// <summary>Lô T không lưu nuôi, một khách đặt trước và đã cọc (Lô T mở ngay nên đơn Confirmed).</summary>
    private async Task<Setup> OrderAsync(params (string Spec, int Crabs)[] lines)
    {
        await f.CreateUserAsync("Kiểm phẩm", Roles.QcInspector);
        var batch = await Br15Scenario.TBatchAsync(f, holding: false);
        var customer = await Br15Scenario.CustomerAsync(f);
        var buyer = customer.Client(f);
        var order = await Br15Fixture.Body(await Br15Fixture.PostJson(buyer, "/api/preorders", new
        {
            batchCode = batch.Code, deliverySiteId = customer.SiteId,
            lines = lines.Select(l => new { specCode = l.Spec, mode = "ByCount", qtyCrabs = l.Crabs }).ToArray(),
        }));
        await Br15Scenario.PayAsync(f, order.GetProperty("deposit").GetProperty("referenceCode").GetString()!);
        return new Setup(batch, customer, order.GetProperty("orderNo").GetString()!, batch.Farmer.Client(f), buyer);
    }

    /// <summary>Ghi thẳng một phiếu nhận đã kiểm xong với các con cua vừa nhận (bỏ qua kiểm đầu vào của G3).</summary>
    private async Task<IReadOnlyList<string>> ReceiveAsync(Br15Scenario.BatchHandle batch, int count)
    {
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var supplier = new Party { LegalName = $"Vựa {f.Next()}", PartyType = "Household", VerificationStatus = "Verified", VerifiedAt = now, RegisteredAt = now, CreatedAt = now, UpdatedAt = now };
        db.Parties.Add(supplier);
        await db.SaveChangesAsync();
        var po = new ProcurementOrder
        {
            PoNo = $"PO{Guid.NewGuid():N}"[..12], BatchId = batch.BatchId, SupplierPartyId = supplier.PartyId, OrderedOn = DateOnly.FromDateTime(now.UtcDateTime),
            AgreedSpec = "Cua thịt", Quantity = count, UnitPrice = 250_000, Status = "Received", CreatedBy = batch.Farmer.UserId, CreatedAt = now, UpdatedAt = now,
        };
        db.ProcurementOrders.Add(po);
        await db.SaveChangesAsync();
        var lot = new SupplyLot
        {
            LotCode = $"LN{Guid.NewGuid():N}"[..12], ProcurementOrderId = po.ProcurementOrderId, BatchId = batch.BatchId, OriginRegion = "Năm Căn, Cà Mau",
            HarvestedOn = DateOnly.FromDateTime(now.UtcDateTime.AddDays(-1)), DeclaredSpecies = "Scylla paramamosain", DeclaredCount = count, DeclaredWeightKg = count * 0.3m, CreatedAt = now,
        };
        db.SupplyLots.Add(lot);
        await db.SaveChangesAsync();
        var receipt = new GoodsReceipt
        {
            ReceiptNo = $"GR{Guid.NewGuid():N}"[..12], SupplyLotId = lot.SupplyLotId, BatchId = batch.BatchId, ReceivedAt = now, ReceivedBy = batch.Farmer.UserId,
            AcceptedCount = count, AcceptedWeightG = count * 300, Status = "Completed", CompletedAt = now, CreatedAt = now,
        };
        db.GoodsReceipts.Add(receipt);
        await db.SaveChangesAsync();
        var codes = new List<string>();
        for (var i = 0; i < count; i++)
        {
            var crab = new CrabUnit
            {
                CrabCode = $"CU{Guid.NewGuid():N}"[..10].ToUpperInvariant(), BatchId = batch.BatchId, SupplyLotId = lot.SupplyLotId, GoodsReceiptId = receipt.GoodsReceiptId,
                Species = "Scylla paramamosain", Sex = "Male", Maturity = "Mature", ReceivedWeightG = 300, InventoryStatus = "Received", ReceivedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.CrabUnits.Add(crab);
            await db.SaveChangesAsync();
            codes.Add(crab.CrabCode);
        }
        return codes;
    }

    /// <summary>Đo tay (cân và thước kẹp) rồi Nhân viên kiểm phẩm được phân duyệt; trả mã quyết định.</summary>
    private async Task<string> GradeAsync(Setup s, string crabCode, (decimal W, decimal Cl) m)
    {
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, "/api/measurement-sessions", new { crabCode, procedure = "Manual" }));
        var no = session.GetProperty("sessionNo").GetString()!;
        var measured = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/measurement-sessions/{no}/values", new { weightG = m.W, carapaceLengthCm = m.Cl }));
        var decision = measured.GetProperty("decision").GetProperty("decisionNo").GetString()!;
        using var qc = f.Client(await QcAsync(s.Batch.BatchId), Roles.QcInspector);
        await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{decision}/approve", new { }));
        return decision;
    }

    private async Task<long> QcAsync(long batchId)
    {
        await using var db = f.OpenDb();
        return await db.QcAssignments.Where(a => a.BatchId == batchId && a.AssignmentKind == "GradingSession")
            .OrderByDescending(a => a.QcAssignmentId).Select(a => a.QcUserId).FirstAsync();
    }

    private static object Lines(JsonElement tranche, params (decimal Kg, int? Crabs)[] values)
        => tranche.GetProperty("lines").EnumerateArray().Select((l, i) => new
        {
            lineId = l.GetProperty("lineId").GetInt64(),
            dispatchedCrabs = values[i].Crabs ?? l.GetProperty("allocatedCrabs").GetInt32(),
            dispatchedKg = values[i].Kg,
        }).ToArray();

    private async Task<JsonElement> TrancheAsync(Setup s)
        => (await Br15Fixture.Body(await s.Farmer.GetAsync($"/api/batches/{s.Batch.Code}/delivery-tranches"))).EnumerateArray()
            .Single(t => t.GetProperty("orderNo").GetString() == s.OrderNo);

    /// <summary>Lập chuyến, xuất (cân lần một) và ghi cân lần hai với kg nhận bằng kg chấp nhận.</summary>
    private async Task<string> ShipAsync(Setup s, params decimal[] kgs)
    {
        var tranche = await TrancheAsync(s);
        var shipment = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/delivery-tranches/{tranche.GetProperty("trancheId").GetInt64()}/shipments",
            new { scheduledAt = DateTimeOffset.UtcNow.AddHours(2), transportCondition = "Thùng xốp, đá khô, 18–22 °C" }));
        var no = shipment.GetProperty("shipmentNo").GetString()!;
        tranche = await TrancheAsync(s);
        await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/shipments/{no}/dispatch",
            new { lines = Lines(tranche, kgs.Select(k => (k, (int?)null)).ToArray()) }));
        var receipt = tranche.GetProperty("lines").EnumerateArray().Select((l, i) => new
        {
            lineId = l.GetProperty("lineId").GetInt64(), receivedCrabs = l.GetProperty("allocatedCrabs").GetInt32(), receivedKg = kgs[i] - (kgs[i] > 0 ? 0.01m : 0),
            acceptedCrabs = l.GetProperty("allocatedCrabs").GetInt32(), acceptedKg = kgs[i] - (kgs[i] > 0 ? 0.01m : 0),
        }).ToArray();
        await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/shipments/{no}/receipt", new { lines = receipt }));
        return no;
    }

    [Fact]
    public async Task Approved_crabs_fill_the_order_then_two_weighings_acceptance_deposit_balance_invoice_trace_and_revenue()
    {
        var s = await OrderAsync(("FAT-L-SPECIAL", 6), ("FAT-M-G1", 4));
        // Cọc = 20 % × (6 × 0,45 kg × 450.000 + 4 × 0,35 kg × 380.000) = 20 % × 1.747.000 = 349.400 đ.
        var codes = await ReceiveAsync(s.Batch, 11);
        for (var i = 0; i < 6; i++) await GradeAsync(s, codes[i], LSpecial);
        for (var i = 6; i < 9; i++) await GradeAsync(s, codes[i], MGrade1);
        await GradeAsync(s, codes[9], LGrade1); // không có dòng L Cấp 1 nên ở lại tồn
        await GradeAsync(s, codes[10], Below);  // dưới chuẩn, không phân bổ cho đơn đặt trước

        var tranche = await TrancheAsync(s);
        Assert.Equal(new[] { 6, 3 }, tranche.GetProperty("lines").EnumerateArray().Select(l => l.GetProperty("allocatedCrabs").GetInt32()));
        Assert.Equal("Planned", tranche.GetProperty("status").GetString()); // còn thiếu 1 con M Cấp 1
        await using (var db = f.OpenDb())
        {
            Assert.Equal("Selling", await db.Batches.Where(b => b.BatchId == s.Batch.BatchId).Select(b => b.Status).SingleAsync());
            var statuses = await db.CrabUnits.Where(c => c.BatchId == s.Batch.BatchId).GroupBy(c => c.InventoryStatus).ToDictionaryAsync(g => g.Key, g => g.Count());
            Assert.Equal(9, statuses["Allocated"]);
            Assert.Equal(2, statuses["Graded"]);
        }

        // Cân lần một: số con xuất phải bằng số con đã phân bổ.
        var shipment = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/delivery-tranches/{tranche.GetProperty("trancheId").GetInt64()}/shipments",
            new { scheduledAt = DateTimeOffset.UtcNow.AddHours(2) }));
        var no = shipment.GetProperty("shipmentNo").GetString()!;
        var traceCode = shipment.GetProperty("traceCode").GetString()!;
        Assert.StartsWith("QR", traceCode);
        var wrong = await Br15Fixture.PostJson(s.Farmer, $"/api/shipments/{no}/dispatch", new { lines = Lines(tranche, (1.95m, 5), (0.76m, null)) });
        Assert.Equal("delivery.dispatch_count", await Br15Fixture.ErrorCode(wrong));
        var dispatched = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/shipments/{no}/dispatch", new { lines = Lines(tranche, (1.95m, null), (0.76m, null)) }));
        Assert.Equal("Dispatched", dispatched.GetProperty("status").GetString());
        Assert.Equal("Delivering", (await Br15Fixture.Body(await s.Buyer.GetAsync($"/api/preorders/{s.OrderNo}/deliveries"))).GetProperty("status").GetString());

        // Cân lần hai: hao hụt vận chuyển chỉ ghi lại; tiền hàng theo kg nghiệm thu.
        var lineIds = tranche.GetProperty("lines").EnumerateArray().Select(l => l.GetProperty("lineId").GetInt64()).ToArray();
        await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/shipments/{no}/receipt", new
        {
            lines = new[]
            {
                new { lineId = lineIds[0], receivedCrabs = 6, receivedKg = 1.93m, acceptedCrabs = 6, acceptedKg = 1.93m },
                new { lineId = lineIds[1], receivedCrabs = 3, receivedKg = 0.75m, acceptedCrabs = 3, acceptedKg = 0.75m },
            },
        }));
        Assert.Equal(HttpStatusCode.Forbidden, (await s.Farmer.PostAsync($"/api/shipments/{no}/acceptance/confirm", null)).StatusCode);
        var accepted = await Br15Fixture.Body(await s.Buyer.PostAsync($"/api/shipments/{no}/acceptance/confirm", null));
        // 1,93 × 450.000 + 0,75 × 380.000 = 868.500 + 285.000 = 1.153.500 đ; trừ cọc 349.400 → còn 804.100 đ.
        var acceptance = accepted.GetProperty("acceptance");
        Assert.Equal(1_153_500, acceptance.GetProperty("goodsValue").GetInt64());
        Assert.Equal(349_400, acceptance.GetProperty("depositApplied").GetInt64());
        Assert.Equal(804_100, acceptance.GetProperty("balanceDue").GetInt64());
        Assert.Equal(0.02m, accepted.GetProperty("lines")[0].GetProperty("transportLossKg").GetDecimal());
        var balance = accepted.GetProperty("balance");
        Assert.Equal(804_100, balance.GetProperty("amount").GetInt64());
        await Br15Scenario.PayAsync(f, balance.GetProperty("referenceCode").GetString()!);

        var deliveries = await Br15Fixture.Body(await s.Buyer.GetAsync($"/api/preorders/{s.OrderNo}/deliveries"));
        Assert.Equal("Delivered", deliveries.GetProperty("status").GetString());
        var invoice = Assert.Single(deliveries.GetProperty("invoices").EnumerateArray());
        Assert.Equal(1_153_500, invoice.GetProperty("amount").GetInt64());

        // QR đơn: ai có mã đều xem được Lô, trại, lô nguồn, quy cách; không lộ thông tin khách (BR-163).
        using var anonymous = f.Factory.CreateClient();
        var traceResponse = await anonymous.GetAsync($"/api/trace/orders/{traceCode}");
        var raw = await traceResponse.Content.ReadAsStringAsync();
        var trace = JsonDocument.Parse(raw).RootElement;
        Assert.Equal(s.Batch.Code, trace.GetProperty("batchCode").GetString());
        Assert.Equal("Năm Căn, Cà Mau", trace.GetProperty("sourceLots")[0].GetProperty("originRegion").GetString());
        Assert.Equal(new[] { ("FAT-L-SPECIAL", 6), ("FAT-M-G1", 3) },
            trace.GetProperty("lines").EnumerateArray().Select(l => (l.GetProperty("specCode").GetString()!, l.GetProperty("crabs").GetInt32())));
        Assert.DoesNotContain("Anh Bếp Trưởng", raw);
        Assert.DoesNotContain("Quận 1", raw);

        // Hết hạn đổi trả, không khiếu nại: đơn hoàn tất, tiền hàng thành dòng doanh thu (BR-175, BR-184).
        await using (var db = f.OpenDb())
            await db.SalesOrders.Where(o => o.OrderNo == s.OrderNo).ExecuteUpdateAsync(u => u.SetProperty(o => o.ReturnWindowEndsAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        await using (var scope = f.Factory.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<DeliveryJobService>().CompleteOrdersAsync(CancellationToken.None);
        await using (var db = f.OpenDb())
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == s.OrderNo);
            Assert.Equal("Completed", order.Status);
            Assert.Equal(1_153_500, await db.RevenueLines.Where(r => r.OrderId == order.OrderId && r.SourceType == "PreOrderDelivered").Select(r => r.Amount).SingleAsync());
            Assert.Equal(9, await db.CrabUnits.CountAsync(c => c.BatchId == s.Batch.BatchId && c.InventoryStatus == "Delivered"));
        }
        Assert.Equal(HttpStatusCode.OK, (await Br15Fixture.PostJson(s.Buyer, $"/api/preorders/{s.OrderNo}/rating", new { stars = 5, comment = "Cua chắc thịt" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Br15Fixture.PostJson(s.Buyer, $"/api/preorders/{s.OrderNo}/rating", new { stars = 4 })).StatusCode);
    }

    [Fact]
    public async Task Deposit_above_goods_is_refunded_and_accepted_claim_refunds_by_kg_and_counts_against_the_inspector()
    {
        var s = await OrderAsync(("FAT-L-SPECIAL", 10));
        // Cọc = 20 % × 10 × 0,45 × 450.000 = 405.000 đ; chỉ có 1 con đạt quy cách.
        var codes = await ReceiveAsync(s.Batch, 1);
        await GradeAsync(s, codes[0], LSpecial);
        var no = await ShipAsync(s, 0.33m); // nghiệm thu 0,32 kg → 144.000 đ
        var accepted = await Br15Fixture.Body(await s.Buyer.PostAsync($"/api/shipments/{no}/acceptance/confirm", null));
        Assert.Equal(144_000, accepted.GetProperty("acceptance").GetProperty("goodsValue").GetInt64());
        Assert.Equal(0, accepted.GetProperty("acceptance").GetProperty("balanceDue").GetInt64());

        // Đợt duy nhất đã xong: phần cọc chưa trừ vào hàng 261.000 đ được hoàn (BR-160, BR-167).
        long orderId;
        await using (var db = f.OpenDb())
        {
            orderId = await db.SalesOrders.Where(o => o.OrderNo == s.OrderNo).Select(o => o.OrderId).SingleAsync();
            Assert.Equal(new[] { 261_000m }, await db.PaymentInstructions.Where(p => p.OrderId == orderId && p.InstructionType == "Refund").Select(p => p.Amount).ToListAsync());
        }

        // Khiếu nại phải có ảnh chụp trong app, trong hạn đổi trả (BR-172).
        MultipartFormDataContent ClaimForm(bool withPhoto)
        {
            var form = new MultipartFormDataContent
            {
                { new StringContent(no), "ShipmentNo" }, { new StringContent("FAT-L-SPECIAL"), "SpecCode" }, { new StringContent("Return"), "ClaimType" },
                { new StringContent("Dead"), "IssueType" }, { new StringContent("1"), "AffectedCrabs" }, { new StringContent("Cua chết khi mở thùng"), "Description" },
            };
            if (withPhoto)
            {
                var photo = new ByteArrayContent(Br15Scenario.Jpeg("dead"));
                photo.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
                form.Add(photo, "Photo", "dead.jpg");
            }
            return form;
        }
        var noPhoto = await s.Buyer.PostAsync($"/api/preorders/{s.OrderNo}/claims", ClaimForm(false));
        Assert.Equal(HttpStatusCode.BadRequest, noPhoto.StatusCode);
        var claim = await Br15Fixture.Body(await s.Buyer.PostAsync($"/api/preorders/{s.OrderNo}/claims", ClaimForm(true)));
        var claimNo = claim.GetProperty("claimNo").GetString()!;
        Assert.Equal("Open", claim.GetProperty("status").GetString());
        await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/claims/{claimNo}/respond", new { accept = true, response = "Đồng ý hoàn tiền con chết" }));
        var done = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Buyer, $"/api/claims/{claimNo}/customer-reply", new { agree = true }));
        Assert.Equal("Accepted", done.GetProperty("status").GetString());
        Assert.Equal(144_000, done.GetProperty("refundAmount").GetInt64()); // 1 con = 0,32 kg × 450.000

        await using (var db = f.OpenDb())
            Assert.Contains(144_000m, await db.PaymentInstructions.Where(p => p.OrderId == orderId && p.InstructionType == "Refund").Select(p => p.Amount).ToListAsync());
        using var admin = f.Admin();
        var qc = await QcAsync(s.Batch.BatchId);
        var pool = await Br15Fixture.Body(await admin.GetAsync("/api/admin/qc-inspectors"));
        Assert.Equal(1, pool.EnumerateArray().Single(q => q.GetProperty("userId").GetInt64() == qc).GetProperty("acceptedClaimCount").GetInt32());
    }

    [Fact]
    public async Task Refusal_forfeits_the_deposit_once_and_crabs_are_resold_on_an_invoiced_sale_but_rejected_crabs_never()
    {
        var s = await OrderAsync(("FAT-L-SPECIAL", 10));
        var codes = await ReceiveAsync(s.Batch, 4);
        await GradeAsync(s, codes[0], LSpecial);
        await GradeAsync(s, codes[1], LSpecial);
        await GradeAsync(s, codes[2], Below);
        var tranche = await TrancheAsync(s);
        var shipment = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/delivery-tranches/{tranche.GetProperty("trancheId").GetInt64()}/shipments",
            new { scheduledAt = DateTimeOffset.UtcNow }));
        var no = shipment.GetProperty("shipmentNo").GetString()!;
        await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/shipments/{no}/dispatch", new { lines = Lines(await TrancheAsync(s), (0.65m, null)) }));
        var refused = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Buyer, $"/api/shipments/{no}/acceptance/refuse", new { reason = "Nhà hàng đóng cửa đột xuất" }));
        Assert.Equal("Refused", refused.GetProperty("status").GetString());

        await using (var db = f.OpenDb())
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == s.OrderNo);
            Assert.Equal("Forfeited", order.Status);
            Assert.Equal(405_000, await db.RevenueLines.Where(r => r.OrderId == order.OrderId && r.SourceType == "ForfeitedDeposit").Select(r => r.Amount).SingleAsync());
            Assert.Equal(2, await db.CrabUnits.CountAsync(c => c.BatchId == s.Batch.BatchId && c.InventoryStatus == "Graded" && !c.CrabCode.Equals(codes[2])));
        }

        // Cua đạt chuẩn không bán dưới chuẩn; cua dưới chuẩn thì được.
        var notLow = await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/invoiced-sales",
            new { saleReason = "LowGrade", buyerName = "Vựa Bà Tư", crabCodes = new[] { codes[0] }, kg = 0.32m, pricePerKg = 200_000 });
        Assert.Equal("sale.not_substandard", await Br15Fixture.ErrorCode(notLow));
        var low = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/invoiced-sales",
            new { saleReason = "LowGrade", buyerName = "Vựa Bà Tư", crabCodes = new[] { codes[2] }, kg = 0.32m, pricePerKg = 200_000 }));
        Assert.Equal(64_000, low.GetProperty("totalAmount").GetInt64());

        // Bán lại do mất cọc: chỉ cua của đơn mất cọc.
        var resale = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/invoiced-sales", new
        {
            saleReason = "ForfeitResale", buyerName = "Nhà hàng Biển Xanh", crabCodes = new[] { codes[0], codes[1] }, kg = 0.64m, pricePerKg = 300_000, sourceOrderNo = s.OrderNo,
        }));
        Assert.Equal("PendingPayment", resale.GetProperty("status").GetString());
        Assert.Equal(192_000, resale.GetProperty("totalAmount").GetInt64());
        Assert.NotNull(resale.GetProperty("invoiceNo").GetString());
        await Br15Scenario.PayAsync(f, resale.GetProperty("payment").GetProperty("referenceCode").GetString()!);
        var paid = await Br15Fixture.Body(await s.Farmer.GetAsync($"/api/direct-sales/{resale.GetProperty("orderNo").GetString()}"));
        Assert.Equal("Completed", paid.GetProperty("status").GetString());

        // Cua bị loại bỏ không bán ở bất kỳ giá nào (BR-156).
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, "/api/measurement-sessions", new { crabCode = codes[3], procedure = "Manual" }));
        var measured = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/measurement-sessions/{session.GetProperty("sessionNo").GetString()}/values",
            new { weightG = 320m, carapaceLengthCm = 7.5m }));
        using (var qc = f.Client(await QcAsync(s.Batch.BatchId), Roles.QcInspector))
        {
            var reject = new MultipartFormDataContent { { new StringContent("Dead"), "LiveStatus" }, { new StringContent("Fail"), "FoodSafety" }, { new StringContent("Chết khi cân"), "Reason" } };
            var photo = new ByteArrayContent(Br15Scenario.Jpeg("x"));
            photo.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            reject.Add(photo, "Photo", "x.jpg");
            await Br15Fixture.Body(await qc.PostAsync($"/api/grade-decisions/{measured.GetProperty("decision").GetProperty("decisionNo").GetString()}/reject", reject));
        }
        var rejectedSale = await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/invoiced-sales",
            new { saleReason = "LowGrade", buyerName = "Ai đó", crabCodes = new[] { codes[3] }, kg = 0.3m, pricePerKg = 10_000 });
        Assert.Equal("sale.rejected_crab", await Br15Fixture.ErrorCode(rejectedSale));

        await using (var db = f.OpenDb())
        {
            var lines = await db.RevenueLines.Where(r => r.BatchId == s.Batch.BatchId).GroupBy(r => r.SourceType).ToDictionaryAsync(g => g.Key, g => g.Sum(r => r.Amount));
            Assert.Equal(405_000, lines["ForfeitedDeposit"]);
            Assert.Equal(192_000, lines["InvoicedSale"]);
            Assert.Equal(2, await db.CrabUnits.CountAsync(c => c.BatchId == s.Batch.BatchId && c.InventoryStatus == "Sold"));
            await Assert.ThrowsAnyAsync<Exception>(() => db.RevenueLines.Where(r => r.BatchId == s.Batch.BatchId).ExecuteDeleteAsync());
        }
    }

    [Fact]
    public async Task Final_order_waits_for_the_sale_window_respects_the_floor_and_a_declined_one_opens_surplus_sale()
    {
        var s = await OrderAsync(("FAT-L-SPECIAL", 10));
        var codes = await ReceiveAsync(s.Batch, 3);
        foreach (var c in codes) await GradeAsync(s, c, LGrade1); // không có dòng L Cấp 1: cả 3 con còn lại chưa bán
        var early = await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/final-order", new { kg = 0.96m, pricePerKg = 320_000 });
        Assert.Equal("sale.window_open", await Br15Fixture.ErrorCode(early));
        await using (var db = f.OpenDb())
            await db.Batches.Where(b => b.BatchId == s.Batch.BatchId).ExecuteUpdateAsync(u => u.SetProperty(b => b.SellingStartedAt, DateTimeOffset.UtcNow.AddDays(-20)));
        var low = await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/final-order", new { kg = 0.96m, pricePerKg = 250_000 });
        Assert.Equal("sale.below_floor", await Br15Fixture.ErrorCode(low));
        var surplusEarly = await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/invoiced-sales",
            new { saleReason = "Surplus", buyerName = "Vựa", crabCodes = new[] { codes[0] }, kg = 0.32m, pricePerKg = 300_000 });
        Assert.Equal("sale.surplus_not_allowed", await Br15Fixture.ErrorCode(surplusEarly));

        var final = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/final-order", new { kg = 0.96m, pricePerKg = 320_000 }));
        Assert.Equal("FinalOrder", final.GetProperty("orderType").GetString());
        Assert.Equal(3, final.GetProperty("crabs").GetInt32());
        Assert.Equal(307_200, final.GetProperty("totalAmount").GetInt64());
        Assert.Equal(HttpStatusCode.Conflict, (await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/final-order", new { kg = 1m, pricePerKg = 320_000 })).StatusCode);

        // Bên cam kết không mua: huỷ đơn hàng cuối, cua quay về tồn và được bán phần dư (BR-182).
        await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/direct-sales/{final.GetProperty("orderNo").GetString()}/cancel", new { reason = "Bên cam kết không mua" }));
        var surplus = await Br15Fixture.Body(await Br15Fixture.PostJson(s.Farmer, $"/api/batches/{s.Batch.Code}/invoiced-sales",
            new { saleReason = "Surplus", buyerName = "Vựa Năm Căn", crabCodes = codes.ToArray(), kg = 0.96m, pricePerKg = 280_000 }));
        Assert.Equal(268_800, surplus.GetProperty("totalAmount").GetInt64());
    }

    [Fact]
    public async Task Revising_an_allocated_crab_releases_it_and_refills_the_line_from_stock()
    {
        var s = await OrderAsync(("FAT-L-SPECIAL", 10));
        var codes = await ReceiveAsync(s.Batch, 12);
        for (var i = 0; i < 12; i++) await GradeAsync(s, codes[i], LSpecial); // 10 con phân bổ, 2 con dư trong tồn
        await using (var db = f.OpenDb())
            Assert.Equal(2, await db.CrabUnits.CountAsync(c => c.BatchId == s.Batch.BatchId && c.InventoryStatus == "Graded"));
        var decision = (await Br15Fixture.Body(await s.Farmer.GetAsync($"/api/crab-units/{codes[0]}/grade-decisions")))[0].GetProperty("decisionNo").GetString()!;
        var reviser = await f.CreateUserAsync("Kiểm phẩm sửa hạng", Roles.QcInspector);
        using var qc = f.Client(reviser, Roles.QcInspector);
        var form = new MultipartFormDataContent { { new StringContent("L"), "FinalSize" }, { new StringContent("G1"), "FinalGrade" }, { new StringContent("Mai có vết nứt nhỏ"), "Reason" } };
        var photo = new ByteArrayContent(Br15Scenario.Jpeg("crack"));
        photo.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(photo, "Photo", "crack.jpg");
        await Br15Fixture.Body(await qc.PostAsync($"/api/grade-decisions/{decision}/revise", form));

        await using (var db = f.OpenDb())
        {
            var revised = await db.CrabUnits.SingleAsync(c => c.CrabCode == codes[0]);
            Assert.Equal("Graded", revised.InventoryStatus); // không còn hợp dòng Đặc cấp, không có dòng Cấp 1
            var released = await db.InventoryAllocations.SingleAsync(a => a.CrabUnitId == revised.CrabUnitId);
            Assert.Equal("Released", released.Status);
            Assert.StartsWith("Đổi hạng", released.ReleaseReason);
            Assert.Equal(10, await db.InventoryAllocations.CountAsync(a => a.BatchId == s.Batch.BatchId && a.ReleasedAt == null));
            Assert.Equal(1, await db.CrabUnits.CountAsync(c => c.BatchId == s.Batch.BatchId && c.InventoryStatus == "Graded" && c.CrabCode != codes[0]));
        }
    }
}
