using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Features.Quality;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Sourcing;

/// <summary>
/// WF-05 nguồn hàng và kiểm đầu vào (BR-098…103): đơn mua nguồn, lô nguồn và phiếu nhận hàng, Nhân viên kiểm phẩm được phân ngẫu nhiên
/// kiểm từng con, con đạt được ghi là CrabUnit có mã cua nội bộ và sự kiện tồn Received.
/// </summary>
public sealed class SourcingService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    PartyDirectory parties, QcAssignmentService qc)
{
    private static readonly string[] SourcingStatuses = ["Sourcing", "InProduction", "Harvesting", "Selling"];

    // ---------- đơn mua nguồn ----------
    public async Task<ProcurementOrderResponse> CreateOrderAsync(string code, ProcurementOrderRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var poNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(code, ct, lockRow: true);
            // BR-098: lô P chỉ mua sau khi Lô mở; lô T, A sau khi được duyệt.
            if (!SourcingStatuses.Contains(batch.Status))
                throw new BusinessRuleException("sourcing.batch_not_open", "Chỉ mua nguồn khi Lô đã mở (lô P) hoặc đã được duyệt (lô T, A).");
            if (!await db.Parties.AnyAsync(p => p.PartyId == req.SupplierPartyId && p.VerificationStatus == "Verified", ct) ||
                !await parties.HasActiveRoleAsync(req.SupplierPartyId, PartnerRoleTypes.Supplier, ct))
                throw new BusinessRuleException("sourcing.supplier_invalid", "Nhà cung cấp phải đã xác minh và có vai trò nhà cung cấp đang hoạt động (BR-016).");
            var ordered = await db.ProcurementOrders.Where(p => p.BatchId == batch.BatchId && p.Status != "Cancelled").SumAsync(p => (int?)p.Quantity, ct) ?? 0;
            var cap = (batch.FundedQuantity ?? batch.SeedQuantity) + await MaxRestockAsync(batch, ct);
            if (ordered + req.Quantity > cap)
                throw new BusinessRuleException("sourcing.exceeds_funded",
                    $"Tổng số con mua không vượt số con được cấp vốn cộng số con thả bù tối đa ({cap} con) (BR-098, BR-121).");
            var now = clock.GetUtcNow();
            var po = new ProcurementOrder
            {
                PoNo = Codes.New("PO", 10), BatchId = batch.BatchId, SupplierPartyId = req.SupplierPartyId, OrderedOn = req.OrderedOn,
                AgreedSpec = req.AgreedSpec.Trim(), Quantity = req.Quantity, UnitPrice = req.UnitPrice, Status = "Ordered",
                CreatedBy = me.UserId, CreatedAt = now, UpdatedAt = now,
            };
            db.ProcurementOrders.Add(po);
            await db.SaveChangesAsync(ct);
            await parties.AddParticipantAsync(batch.BatchId, req.SupplierPartyId, ParticipantRoles.Supplier, ct);
            await audit.WriteAsync("procurement_order", po.ProcurementOrderId, "create", null,
                new { po.PoNo, batch.BatchCode, po.SupplierPartyId, po.Quantity, unitPrice = req.UnitPrice }, ct);
            return po.PoNo;
        }, ct, IsolationLevel.Serializable);
        return await OrderAsync(poNo, ct);
    }

    /// <summary>BR-121: số con thả bù tối đa = dự phòng hao hụt ÷ đơn giá cua đầu vào trong Chi phí chuẩn.</summary>
    public async Task<int> MaxRestockAsync(Batch batch, CancellationToken ct)
    {
        var items = await db.StandardCostItems.Where(i => i.CostVersion.BatchId == batch.BatchId && i.CostVersion.Status == "Locked")
            .Select(i => new { i.Category, i.Quantity, i.UnitPrice, i.CostBearer }).ToListAsync(ct);
        var reserve = items.Where(i => i.Category == "MortalityReserve" && i.CostBearer is null or "Batch").Sum(i => BatchService.Amount(i.Quantity, i.UnitPrice));
        var seed = items.Where(i => i.Category == "Seed").Sum(i => BatchService.Amount(i.Quantity, i.UnitPrice));
        var seedPerCrab = batch.SeedQuantity > 0 ? seed / batch.SeedQuantity : 0;
        return seedPerCrab > 0 ? (int)(reserve / seedPerCrab) : 0;
    }

    // ---------- phiếu nhận hàng ----------
    public async Task<GoodsReceiptResponse> CreateReceiptAsync(string poNo, GoodsReceiptRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var receiptNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var po = await db.ProcurementOrders.SingleOrDefaultAsync(p => p.PoNo == poNo, ct)
                     ?? throw new NotFoundException("sourcing.po_not_found", "Không tìm thấy đơn mua nguồn.");
            var batch = await db.Batches.SingleAsync(b => b.BatchId == po.BatchId, ct);
            await access.RequireOperatorAsync(batch, ct);
            if (po.Status is "Cancelled" or "Received")
                throw new BusinessRuleException("sourcing.po_closed", "Đơn mua nguồn đã đóng.");
            if (req.SiteId is { } siteId)
            {
                var ownParty = await parties.PartyIdOfOperatorAsync(batch.OperatorId, ct);
                if (!await db.PartySites.AnyAsync(s => s.SiteId == siteId && (s.PartyId == ownParty || s.PartyId == batch.ExecutorPartyId) &&
                        (s.SiteType == "Farm" || s.SiteType == "QcStation" || s.SiteType == "Warehouse"), ct))
                    throw new NotFoundException("sourcing.site_not_found", "Địa điểm nhận không thuộc đơn vị thực hiện.");
            }
            var now = clock.GetUtcNow();
            var lotCode = string.IsNullOrWhiteSpace(req.LotCode) ? Codes.New("LN", 10) : req.LotCode.Trim().ToUpperInvariant();
            if (await db.SupplyLots.AnyAsync(l => l.LotCode == lotCode, ct))
                throw new ConflictException("sourcing.lot_code_taken", "Mã lô nguồn đã dùng.");
            var lot = new SupplyLot
            {
                LotCode = lotCode, ProcurementOrderId = po.ProcurementOrderId, BatchId = batch.BatchId, OriginRegion = req.OriginRegion.Trim(),
                HarvestedOn = req.HarvestedOn, DeclaredSpecies = req.DeclaredSpecies.Trim(), DeclaredCount = req.DeclaredCount,
                DeclaredWeightKg = req.DeclaredWeightKg, TraceStatus = "Declared", CreatedAt = now,
            };
            db.SupplyLots.Add(lot);
            await db.SaveChangesAsync(ct);
            var receipt = new GoodsReceipt
            {
                ReceiptNo = Codes.New("GR", 10), SupplyLotId = lot.SupplyLotId, BatchId = batch.BatchId, SiteId = req.SiteId,
                ReceivedAt = req.ReceivedAt ?? now, ReceivedBy = me.UserId, Status = "Inspecting", Note = req.Note?.Trim(), CreatedAt = now,
            };
            db.GoodsReceipts.Add(receipt);
            await db.SaveChangesAsync(ct);
            // BR-017: phân ngẫu nhiên Nhân viên kiểm phẩm cho buổi kiểm đầu vào.
            var assignment = await qc.AssignAsync(QcAssignmentKinds.IncomingInspection, batch.BatchId, "GoodsReceipt", receipt.GoodsReceiptId, null, ct);
            receipt.QcUserId = assignment.QcUserId;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("goods_receipt", receipt.GoodsReceiptId, "create", null,
                new { receipt.ReceiptNo, po.PoNo, lot.LotCode, lot.DeclaredCount, lot.DeclaredWeightKg, receipt.QcUserId }, ct);
            return receipt.ReceiptNo;
        }, ct);
        return await ReceiptAsync(receiptNo, ct);
    }

    /// <summary>BR-101: Nhân viên kiểm phẩm được phân kiểm từng con; con không đạt không vào tồn và ghi vào phiếu nhận.</summary>
    public async Task<InspectionResponse> InspectAsync(string receiptNo, IncomingInspectionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        return await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var receipt = await db.GoodsReceipts.FromSqlInterpolated($"SELECT * FROM dbo.goods_receipt WITH (UPDLOCK, HOLDLOCK) WHERE receipt_no = {receiptNo}")
                              .SingleOrDefaultAsync(ct)
                          ?? throw new NotFoundException("sourcing.receipt_not_found", "Không tìm thấy phiếu nhận hàng.");
            await qc.RequireAssignedAsync(me.UserId, QcAssignmentKinds.IncomingInspection, "GoodsReceipt", receipt.GoodsReceiptId, ct);
            if (receipt.Status != "Inspecting")
                throw new BusinessRuleException("sourcing.receipt_closed", "Phiếu nhận hàng đã đóng.");
            var lot = await db.SupplyLots.SingleAsync(l => l.SupplyLotId == receipt.SupplyLotId, ct);
            var batch = await db.Batches.SingleAsync(b => b.BatchId == receipt.BatchId, ct);
            if (receipt.AcceptedCount + receipt.RejectedCount >= lot.DeclaredCount)
                throw new BusinessRuleException("sourcing.receipt_full", "Đã kiểm đủ số con khai báo của lô nguồn.");
            var reasons = new List<string>();
            if (!req.SpeciesOk) reasons.Add("sai loài");
            if (!MatchesCrabType(batch.CrabType, req.Sex, req.Maturity)) reasons.Add("giới tính hoặc độ trưởng thành không đúng loại cua của Lô");
            if (!req.Alive) reasons.Add("chết");
            if (!req.Healthy) reasons.Add("yếu");
            if (!req.TwoClaws) reasons.Add("thiếu càng");
            if (!req.FoodSafe) reasons.Add("dấu hiệu mất an toàn thực phẩm");
            var accepted = reasons.Count == 0;
            var now = clock.GetUtcNow();
            CrabUnit? unit = null;
            if (accepted)
            {
                unit = new CrabUnit
                {
                    CrabCode = Codes.New("CU", 8), BatchId = batch.BatchId, SupplyLotId = lot.SupplyLotId, GoodsReceiptId = receipt.GoodsReceiptId,
                    Species = req.Species.Trim(), Sex = req.Sex, Maturity = req.Maturity, ReceivedWeightG = req.WeightG, Condition = "Healthy",
                    InventoryStatus = "Received", ReceivedAt = now, CreatedAt = now, UpdatedAt = now,
                };
                db.CrabUnits.Add(unit);
                await db.SaveChangesAsync(ct);
                db.InventoryEvents.Add(new InventoryEvent
                {
                    CrabUnitId = unit.CrabUnitId, BatchId = batch.BatchId, EventType = "Received", OccurredAt = now, WeightG = req.WeightG,
                    Reason = $"Phiếu nhận {receipt.ReceiptNo}", Source = "Qc", SiteId = receipt.SiteId, ActorId = me.UserId, CreatedAt = now,
                });
                receipt.AcceptedCount++;
                receipt.AcceptedWeightG += (long)decimal.Round(req.WeightG);
            }
            else
            {
                receipt.RejectedCount++;
            }
            var inspection = new QcInspection
            {
                InspectionNo = Codes.New("QC", 10), InspectionKind = "Incoming", BatchId = batch.BatchId, GoodsReceiptId = receipt.GoodsReceiptId,
                CrabUnitId = unit?.CrabUnitId, InspectorId = me.UserId, InspectedAt = now, Species = req.Species.Trim(), Sex = req.Sex,
                Maturity = req.Maturity, SpeciesOk = req.SpeciesOk, Alive = req.Alive, Healthy = req.Healthy, TwoClaws = req.TwoClaws,
                FoodSafe = req.FoodSafe, WeightG = req.WeightG, SensoryResult = req.Note?.Trim(),
                Conclusion = accepted ? "Accepted" : "Rejected", RejectReason = accepted ? null : "Không đạt: " + string.Join(", ", reasons),
                CreatedAt = now,
            };
            db.QcInspections.Add(inspection);
            await db.SaveChangesAsync(ct);
            return new InspectionResponse(inspection.InspectionNo, inspection.Conclusion, inspection.RejectReason, unit?.CrabCode, req.WeightG);
        }, ct, IsolationLevel.Serializable);
    }

    /// <summary>BR-028: giới tính và độ trưởng thành khớp loại cua của Lô (cua gạch, cua gạch dầu, cua cái non là cua cái).</summary>
    internal static bool MatchesCrabType(string crabType, string sex, string maturity) => crabType switch
    {
        "RoeCrab" or "OilRoeCrab" => sex == "Female" && maturity == "Mature",
        "YoungFemaleCrab" => sex == "Female" && maturity == "Immature",
        _ => true,
    };

    public async Task<GoodsReceiptResponse> CompleteReceiptAsync(string receiptNo, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var receipt = await db.GoodsReceipts.SingleOrDefaultAsync(r => r.ReceiptNo == receiptNo, ct)
                          ?? throw new NotFoundException("sourcing.receipt_not_found", "Không tìm thấy phiếu nhận hàng.");
            await qc.RequireAssignedAsync(me.UserId, QcAssignmentKinds.IncomingInspection, "GoodsReceipt", receipt.GoodsReceiptId, ct);
            if (receipt.Status != "Inspecting")
                throw new BusinessRuleException("sourcing.receipt_closed", "Phiếu nhận hàng đã đóng.");
            if (receipt.AcceptedCount + receipt.RejectedCount == 0)
                throw new BusinessRuleException("sourcing.receipt_empty", "Chưa kiểm con nào.");
            var now = clock.GetUtcNow();
            receipt.Status = "Completed";
            receipt.CompletedAt = now;
            var lot = await db.SupplyLots.SingleAsync(l => l.SupplyLotId == receipt.SupplyLotId, ct);
            var po = await db.ProcurementOrders.SingleAsync(p => p.ProcurementOrderId == lot.ProcurementOrderId, ct);
            await db.SaveChangesAsync(ct);
            var accepted = await db.GoodsReceipts.Where(r => r.Status == "Completed" &&
                db.SupplyLots.Any(l => l.SupplyLotId == r.SupplyLotId && l.ProcurementOrderId == po.ProcurementOrderId)).SumAsync(r => r.AcceptedCount, ct);
            po.Status = accepted >= po.Quantity ? "Received" : "PartiallyReceived";
            po.UpdatedAt = now;
            await qc.CompleteAsync(QcAssignmentKinds.IncomingInspection, "GoodsReceipt", receipt.GoodsReceiptId, ct);
            await audit.WriteAsync("goods_receipt", receipt.GoodsReceiptId, "complete", new { status = "Inspecting" },
                new { receipt.Status, receipt.AcceptedCount, receipt.RejectedCount, receipt.AcceptedWeightG, poStatus = po.Status }, ct);
        }, ct);
        return await ReceiptAsync(receiptNo, ct);
    }

    // ---------- đọc ----------
    public async Task<ProcurementOrderResponse> OrderAsync(string poNo, CancellationToken ct)
    {
        var po = await db.ProcurementOrders.AsNoTracking().SingleOrDefaultAsync(p => p.PoNo == poNo, ct)
                 ?? throw new NotFoundException("sourcing.po_not_found", "Không tìm thấy đơn mua nguồn.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == po.BatchId, ct);
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        return await OrderResponseAsync(po, batch.BatchCode, ct);
    }

    public async Task<IReadOnlyList<ProcurementOrderResponse>> OrdersAsync(string code, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var result = new List<ProcurementOrderResponse>();
        foreach (var po in await db.ProcurementOrders.AsNoTracking().Where(p => p.BatchId == batch.BatchId).OrderBy(p => p.ProcurementOrderId).ToListAsync(ct))
            result.Add(await OrderResponseAsync(po, code, ct));
        return result;
    }

    public async Task<IReadOnlyList<GoodsReceiptResponse>> ReceiptsAsync(string code, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var nos = await db.GoodsReceipts.AsNoTracking().Where(r => r.BatchId == batch.BatchId).OrderBy(r => r.GoodsReceiptId).Select(r => r.ReceiptNo).ToListAsync(ct);
        var result = new List<GoodsReceiptResponse>();
        foreach (var no in nos) result.Add(await ReceiptAsync(no, ct));
        return result;
    }

    public async Task<GoodsReceiptResponse> ReceiptAsync(string receiptNo, CancellationToken ct)
    {
        var r = await db.GoodsReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.ReceiptNo == receiptNo, ct)
                ?? throw new NotFoundException("sourcing.receipt_not_found", "Không tìm thấy phiếu nhận hàng.");
        var lot = await db.SupplyLots.AsNoTracking().SingleAsync(l => l.SupplyLotId == r.SupplyLotId, ct);
        var poNo = await db.ProcurementOrders.Where(p => p.ProcurementOrderId == lot.ProcurementOrderId).Select(p => p.PoNo).SingleAsync(ct);
        return new GoodsReceiptResponse(r.ReceiptNo, poNo, lot.LotCode, lot.OriginRegion, lot.HarvestedOn, lot.DeclaredCount, lot.DeclaredWeightKg,
            r.ReceivedAt, r.Status, r.AcceptedCount, r.RejectedCount, r.AcceptedWeightG, r.QcUserId, r.CompletedAt);
    }

    private async Task<ProcurementOrderResponse> OrderResponseAsync(ProcurementOrder po, string batchCode, CancellationToken ct)
    {
        var supplier = await db.Parties.AsNoTracking().Where(p => p.PartyId == po.SupplierPartyId).Select(p => p.LegalName).SingleAsync(ct);
        var received = await db.GoodsReceipts.Where(r => db.SupplyLots.Any(l => l.SupplyLotId == r.SupplyLotId && l.ProcurementOrderId == po.ProcurementOrderId))
            .SumAsync(r => (int?)r.AcceptedCount, ct) ?? 0;
        return new ProcurementOrderResponse(po.PoNo, batchCode, po.SupplierPartyId, supplier, po.OrderedOn, po.AgreedSpec, po.Quantity, (long)po.UnitPrice,
            po.Status, received);
    }
}
