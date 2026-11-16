using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Sourcing;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Holding;

public sealed class BoxRequest
{
    [Required, StringLength(12)] public string CrabCode { get; set; } = "";
    [Required, StringLength(30)] public string SlotCode { get; set; } = "";
    /// <summary>Ảnh hộp đã có cua, chụp trong ứng dụng (BR-108, BR-127).</summary>
    [Range(1, long.MaxValue)] public long EvidenceId { get; set; }
    /// <summary>Thả bù: mã con đã chết trong hộp này (BR-107).</summary>
    [StringLength(12)] public string? ReplacesCrabCode { get; set; }
}

public sealed class MoveRequest
{
    [Required, StringLength(30)] public string SlotCode { get; set; } = "";
    public long? EvidenceId { get; set; }
    [StringLength(300)] public string? Reason { get; set; }
}

public sealed class CrabEventRequest
{
    /// <summary>Died, Molted, AbnormalFeeding, Inspected.</summary>
    [Required, RegularExpression("^(Died|Molted|AbnormalFeeding|Inspected)$")] public string EventType { get; set; } = "";
    /// <summary>Bắt buộc với sự kiện chết (BR-127).</summary>
    public long? EvidenceId { get; set; }
    [StringLength(300)] public string? Note { get; set; }
    public DateTimeOffset? OccurredAt { get; set; }
}

public sealed record InventoryEventResponse(string EventType, DateTimeOffset OccurredAt, string? SlotCode, decimal? WeightG, string? Reason, string Source, long? EvidenceId);
public sealed record BoxHistoryResponse(string SlotCode, DateTimeOffset AssignedAt, DateTimeOffset? LeftAt, string Reason, string? LeaveReason, long? EvidenceId);
public sealed record CrabUnitResponse(string CrabCode, string BatchCode, string LotCode, string OriginRegion, DateOnly HarvestedOn, string Species, string Sex,
    string Maturity, decimal ReceivedWeightG, string Condition, string InventoryStatus, string? CurrentSlotCode, string? ReplacesCrabCode,
    DateTimeOffset ReceivedAt, IReadOnlyList<BoxHistoryResponse> Boxes, IReadOnlyList<InventoryEventResponse> Events);
public sealed record BoxStateResponse(string SlotCode, string SlotStatus, short? RackNo, short? TierNo, short? ColumnNo, string? CrabCode, string? CrabCondition,
    DateTimeOffset? AssignedAt);
public sealed record HoldingResponse(string HoldingCode, string BatchCode, string Method, DateTimeOffset StockedAt, DateOnly ExpectedEndDate,
    DateTimeOffset? ActualEndAt, string Status, int Boxed, int Dead, int Restocked, int MaxRestock, int Received);

/// <summary>
/// WF-05 lưu nuôi (BR-104…111, 120–122, 127–128): đợt lưu nuôi, xếp hộp kèm ảnh thả cua, thả bù trong dự phòng hao hụt,
/// chuyển hộp giữ nguyên con cua, sự kiện tồn không sửa được, cảnh báo chết hàng loạt.
/// </summary>
public sealed class HoldingService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    SourcingService sourcing, PlatformParameters parameters, IAlertRaiser alerts)
{
    private static readonly TimeSpan PhotoFreshness = TimeSpan.FromHours(6);

    public async Task<CrabUnitResponse> BoxAsync(string code, BoxRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(code, ct, lockRow: true);
            if (!batch.HasHolding)
                throw new BusinessRuleException("holding.not_holding_batch", "Lô không lưu nuôi thì không xếp hộp (BR-105).");
            if (batch.Status is not ("Sourcing" or "InProduction"))
                throw new BusinessRuleException("holding.batch_status", "Chỉ xếp hộp khi Lô đang nhận cua hoặc đang nuôi.");
            var crab = await UnitAsync(req.CrabCode, batch.BatchId, ct);
            if (crab.InventoryStatus != "Received")
                throw new BusinessRuleException("holding.crab_not_received", "Chỉ xếp hộp con cua vừa nhận, chưa ở hộp nào (BR-106).");
            var slot = await SlotAsync(batch, req.SlotCode, ct);
            await RequireBoxPhotoAsync(req.EvidenceId, batch.BatchId, slot.SlotId, ct);
            var now = clock.GetUtcNow();
            string reason;
            CrabUnit? replaced = null;
            if (req.ReplacesCrabCode is { } dead)
            {
                // BR-107, BR-120, BR-121: thả bù vào hộp có cua chết, trong số con thả bù tối đa và trước hạn thả bù.
                replaced = await UnitAsync(dead, batch.BatchId, ct);
                var lastBox = await db.BoxAssignments.Where(a => a.CrabUnitId == replaced.CrabUnitId).OrderByDescending(a => a.AssignedAt).FirstOrDefaultAsync(ct);
                if (replaced.InventoryStatus != "Dead" || lastBox?.SlotId != slot.SlotId)
                    throw new BusinessRuleException("holding.restock_invalid", "Thả bù phải thay đúng con đã chết trong hộp này (BR-107).");
                if (await db.CrabUnits.AnyAsync(c => c.ReplacesCrabUnitId == replaced.CrabUnitId, ct))
                    throw new ConflictException("holding.already_restocked", "Con cua chết này đã được thả bù.");
                if (batch.StockedAt is { } stocked && now > stocked.AddDays(batch.RestockCutoffDays))
                    throw new BusinessRuleException("holding.restock_cutoff", $"Đã quá hạn thả bù {batch.RestockCutoffDays} ngày kể từ ngày thả.");
                var restocked = await db.BoxAssignments.CountAsync(a => a.BatchId == batch.BatchId && a.Reason == "Restock", ct);
                if (restocked >= await sourcing.MaxRestockAsync(batch, ct))
                    throw new BusinessRuleException("holding.restock_reserve_exhausted", "Đã dùng hết dự phòng hao hụt, không thả bù nữa (BR-120, BR-121).");
                crab.ReplacesCrabUnitId = replaced.CrabUnitId;
                reason = "Restock";
            }
            else
            {
                var stockedCount = await db.BoxAssignments.CountAsync(a => a.BatchId == batch.BatchId && a.Reason == "Stock", ct);
                if (stockedCount >= (batch.FundedQuantity ?? batch.SeedQuantity))
                    throw new BusinessRuleException("holding.exceeds_funded", "Tổng số con thả ban đầu không vượt số con được cấp vốn (BR-106).");
                reason = "Stock";
            }
            await AllocateSlotAsync(batch, slot, now, ct);
            db.BoxAssignments.Add(new BoxAssignment
            {
                CrabUnitId = crab.CrabUnitId, BatchId = batch.BatchId, SlotId = slot.SlotId, AssignedAt = now, Reason = reason,
                EvidenceId = req.EvidenceId, ActorId = me.UserId, CreatedAt = now,
            });
            crab.InventoryStatus = "Holding";
            crab.UpdatedAt = now;
            await db.Evidences.Where(e => e.EvidenceId == req.EvidenceId)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.CrabUnitId, crab.CrabUnitId).SetProperty(e => e.EvidenceKind, reason == "Stock" ? "Stocking" : "Restock"), ct);
            db.InventoryEvents.Add(Event(crab, "Boxed", now, slot.SlotId, req.EvidenceId,
                replaced is null ? $"Thả vào hộp {slot.SlotCode}" : $"Thả bù thay {replaced.CrabCode} ở hộp {slot.SlotCode}"));
            // BR-104, BR-105, BR-109: thả con đầu tiên mở đợt lưu nuôi, Lô chuyển InProduction, ngày thả là ngày đó.
            if (!await db.HoldingOperations.AnyAsync(h => h.BatchId == batch.BatchId, ct))
            {
                db.HoldingOperations.Add(new HoldingOperation
                {
                    HoldingCode = Codes.New("HO", 10), BatchId = batch.BatchId, Method = "Nuôi từng con trong hộp RAS", StockedAt = now,
                    ExpectedEndDate = DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(batch.CycleDays),
                    ResponsibleUserId = me.UserId, Status = "Active", CreatedAt = now,
                });
                batch.Status = "InProduction";
                batch.StockedAt = now;
                batch.UpdatedAt = now;
                await audit.WriteAsync("batch", batch.BatchId, "start_holding", new { status = "Sourcing" }, new { batch.Status, stockedAt = now }, ct);
            }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("box_assignment", crab.CrabUnitId, reason.ToLowerInvariant(), null,
                new { crab.CrabCode, slot.SlotCode, req.EvidenceId, replaces = replaced?.CrabCode }, ct);
        }, ct, IsolationLevel.Serializable);
        return await CrabAsync(req.CrabCode, ct);
    }

    public async Task<CrabUnitResponse> MoveAsync(string crabCode, MoveRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var crab = await db.CrabUnits.SingleOrDefaultAsync(c => c.CrabCode == crabCode, ct)
                       ?? throw new NotFoundException("holding.crab_not_found", "Không tìm thấy con cua.");
            var batch = await db.Batches.SingleAsync(b => b.BatchId == crab.BatchId, ct);
            await access.RequireOperatorAsync(batch, ct);
            if (crab.InventoryStatus != "Holding")
                throw new BusinessRuleException("holding.crab_not_in_box", "Con cua không ở hộp nào.");
            var current = await db.BoxAssignments.SingleAsync(a => a.CrabUnitId == crab.CrabUnitId && a.LeftAt == null, ct);
            var slot = await SlotAsync(batch, req.SlotCode, ct);
            if (slot.SlotId == current.SlotId) throw new BusinessRuleException("holding.same_box", "Con cua đã ở hộp này.");
            var now = clock.GetUtcNow();
            current.LeftAt = now;
            current.LeaveReason = "Moved";
            await db.SaveChangesAsync(ct);
            await AllocateSlotAsync(batch, slot, now, ct);
            // BR-128: chuyển hộp giữ nguyên con cua; không chuyển cua giữa các Lô (hộp phải thuộc cùng hộ nuôi và Lô).
            db.BoxAssignments.Add(new BoxAssignment
            {
                CrabUnitId = crab.CrabUnitId, BatchId = batch.BatchId, SlotId = slot.SlotId, AssignedAt = now, Reason = "Move",
                EvidenceId = req.EvidenceId, ActorId = me.UserId, CreatedAt = now,
            });
            db.InventoryEvents.Add(Event(crab, "Moved", now, slot.SlotId, req.EvidenceId, req.Reason ?? $"Chuyển sang hộp {slot.SlotCode}"));
            await db.SaveChangesAsync(ct);
        }, ct, IsolationLevel.Serializable);
        return await CrabAsync(crabCode, ct);
    }

    /// <summary>Sự kiện của một con: chết (kèm ảnh hộp, BR-120, BR-127), lột xác, ăn khác thường, kiểm tra.</summary>
    public async Task<CrabUnitResponse> RecordAsync(string crabCode, CrabEventRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        long batchId = 0;
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var crab = await db.CrabUnits.SingleOrDefaultAsync(c => c.CrabCode == crabCode, ct)
                       ?? throw new NotFoundException("holding.crab_not_found", "Không tìm thấy con cua.");
            var batch = await db.Batches.SingleAsync(b => b.BatchId == crab.BatchId, ct);
            batchId = batch.BatchId;
            await access.RequireOperatorAsync(batch, ct);
            if (crab.InventoryStatus is "Dead" or "Destroyed" or "Shipped" or "Delivered" or "Sold")
                throw new BusinessRuleException("holding.crab_closed", "Con cua đã ra khỏi tồn.");
            var now = clock.GetUtcNow();
            var at = req.OccurredAt is { } t && t <= now ? t : now;
            var box = await db.BoxAssignments.SingleOrDefaultAsync(a => a.CrabUnitId == crab.CrabUnitId && a.LeftAt == null, ct);
            if (req.EventType == "Died")
            {
                if (req.EvidenceId is not { } evidenceId)
                    throw new BusinessRuleException("holding.photo_required", "Sự kiện chết phải kèm ảnh chụp trực tiếp của hộp (BR-127).");
                if (box is not null) await RequireBoxPhotoAsync(evidenceId, batch.BatchId, box.SlotId, ct);
                else await RequireBatchPhotoAsync(evidenceId, batch.BatchId, ct);
                crab.InventoryStatus = "Dead";
                crab.Condition = "Dead";
                if (box is not null)
                {
                    box.LeftAt = at;
                    box.LeaveReason = "Died";
                }
                await db.Evidences.Where(e => e.EvidenceId == evidenceId)
                    .ExecuteUpdateAsync(s => s.SetProperty(e => e.CrabUnitId, crab.CrabUnitId).SetProperty(e => e.EvidenceKind, "Mortality"), ct);
            }
            else if (req.EventType == "Molted")
            {
                crab.Condition = "Molting";
            }
            crab.UpdatedAt = now;
            db.InventoryEvents.Add(Event(crab, req.EventType, at, box?.SlotId, req.EvidenceId, req.Note));
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("crab_unit", crab.CrabUnitId, req.EventType.ToLowerInvariant(), null, new { crab.CrabCode, req.EvidenceId, req.Note }, ct);
        }, ct, IsolationLevel.Serializable);
        if (req.EventType == "Died") await CheckMassMortalityAsync(batchId, ct);
        return await CrabAsync(crabCode, ct);
    }

    /// <summary>BR-122: chết vượt số con còn thả bù được, hoặc vượt ngưỡng chết hàng loạt trong khung giờ, thì phát cảnh báo khẩn.</summary>
    private async Task CheckMassMortalityAsync(long batchId, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == batchId, ct);
        var now = clock.GetUtcNow();
        var hours = await parameters.GetIntAsync(ParamKeys.MassMortalityWindowHours, null, ct);
        var pct = await parameters.GetAsync(ParamKeys.MassMortalityPct, null, ct);
        var recent = await db.InventoryEvents.CountAsync(e => e.BatchId == batchId && e.EventType == "Died" && e.OccurredAt >= now.AddHours(-hours), ct);
        var boxes = await db.BoxAssignments.Where(a => a.BatchId == batchId).Select(a => a.SlotId).Distinct().CountAsync(ct);
        var deadTotal = await db.CrabUnits.CountAsync(c => c.BatchId == batchId && c.InventoryStatus == "Dead", ct);
        var restocked = await db.BoxAssignments.CountAsync(a => a.BatchId == batchId && a.Reason == "Restock", ct);
        var restockLeft = Math.Max(0, await sourcing.MaxRestockAsync(batch, ct) - restocked);
        var unreplaced = deadTotal - restocked;
        if ((boxes > 0 && recent * 100m / boxes >= pct) || unreplaced > restockLeft)
            await alerts.RaiseAsync(batchId, AlertType.Mortality, AlertSeverity.Critical,
                $"Chết hàng loạt: {recent} con trong {hours} giờ, {unreplaced} con chưa thả bù, còn thả bù được {restockLeft} con (BR-122).",
                TimeSpan.FromMinutes(30), ct);
    }

    // ---------- đọc ----------
    public async Task<CrabUnitResponse> CrabAsync(string crabCode, CancellationToken ct)
    {
        var crab = await db.CrabUnits.AsNoTracking().SingleOrDefaultAsync(c => c.CrabCode == crabCode, ct)
                   ?? throw new NotFoundException("holding.crab_not_found", "Không tìm thấy con cua.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == crab.BatchId, ct);
        await RequireCrabViewerAsync(batch, crab, ct);
        var lot = await db.SupplyLots.AsNoTracking().SingleAsync(l => l.SupplyLotId == crab.SupplyLotId, ct);
        var slots = await db.PhysicalSlots.AsNoTracking().Where(s => s.OperatorId == batch.OperatorId).ToDictionaryAsync(s => s.SlotId, s => s.SlotCode, ct);
        var boxes = await db.BoxAssignments.AsNoTracking().Where(a => a.CrabUnitId == crab.CrabUnitId).OrderBy(a => a.AssignedAt)
            .Select(a => new { a.SlotId, a.AssignedAt, a.LeftAt, a.Reason, a.LeaveReason, a.EvidenceId }).ToListAsync(ct);
        var events = await db.InventoryEvents.AsNoTracking().Where(e => e.CrabUnitId == crab.CrabUnitId).OrderBy(e => e.OccurredAt).ThenBy(e => e.InventoryEventId)
            .ToListAsync(ct);
        var replaces = crab.ReplacesCrabUnitId is { } r ? await db.CrabUnits.Where(c => c.CrabUnitId == r).Select(c => c.CrabCode).SingleAsync(ct) : null;
        return new CrabUnitResponse(crab.CrabCode, batch.BatchCode, lot.LotCode, lot.OriginRegion, lot.HarvestedOn, crab.Species, crab.Sex, crab.Maturity,
            crab.ReceivedWeightG, crab.Condition, crab.InventoryStatus,
            boxes.Where(b => b.LeftAt == null).Select(b => slots.GetValueOrDefault(b.SlotId)).FirstOrDefault(), replaces, crab.ReceivedAt,
            boxes.Select(b => new BoxHistoryResponse(slots.GetValueOrDefault(b.SlotId, ""), b.AssignedAt, b.LeftAt, b.Reason, b.LeaveReason, b.EvidenceId)).ToList(),
            events.Select(e => new InventoryEventResponse(e.EventType, e.OccurredAt, e.SlotId is { } s ? slots.GetValueOrDefault(s) : null, e.WeightG,
                e.Reason, e.Source, e.EvidenceId)).ToList());
    }

    public async Task<IReadOnlyList<CrabUnitResponse>> CrabsAsync(string code, string? status, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var codes = await db.CrabUnits.AsNoTracking().Where(c => c.BatchId == batch.BatchId && (status == null || c.InventoryStatus == status))
            .OrderBy(c => c.CrabUnitId).Select(c => c.CrabCode).Take(2000).ToListAsync(ct);
        var result = new List<CrabUnitResponse>();
        foreach (var c in codes) result.Add(await CrabAsync(c, ct));
        return result;
    }

    public async Task<IReadOnlyList<BoxStateResponse>> BoxesAsync(string code, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var slotIds = await db.SlotAllocations.Where(a => a.BatchId == batch.BatchId && a.ReleasedAt == null).Select(a => a.SlotId).ToListAsync(ct);
        var open = await db.BoxAssignments.AsNoTracking().Where(a => a.BatchId == batch.BatchId && a.LeftAt == null)
            .Join(db.CrabUnits, a => a.CrabUnitId, c => c.CrabUnitId, (a, c) => new { a.SlotId, c.CrabCode, c.Condition, a.AssignedAt })
            .ToDictionaryAsync(x => x.SlotId, ct);
        var slots = await db.PhysicalSlots.AsNoTracking().Where(s => slotIds.Contains(s.SlotId)).OrderBy(s => s.SlotCode)
            .Select(s => new { s.SlotId, s.SlotCode, s.Status, s.RackNo, s.TierNo, s.ColumnNo }).ToListAsync(ct);
        return slots.Select(s =>
        {
            var crab = open.GetValueOrDefault(s.SlotId);
            return new BoxStateResponse(s.SlotCode, s.Status, s.RackNo, s.TierNo, s.ColumnNo, crab?.CrabCode, crab?.Condition, crab?.AssignedAt);
        }).ToList();
    }

    public async Task<HoldingResponse> HoldingAsync(string code, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var h = await db.HoldingOperations.AsNoTracking().SingleOrDefaultAsync(x => x.BatchId == batch.BatchId, ct)
                ?? throw new NotFoundException("holding.not_found", "Lô chưa có đợt lưu nuôi.");
        var restocked = await db.BoxAssignments.CountAsync(a => a.BatchId == batch.BatchId && a.Reason == "Restock", ct);
        return new HoldingResponse(h.HoldingCode, batch.BatchCode, h.Method, h.StockedAt, h.ExpectedEndDate, h.ActualEndAt, h.Status,
            await db.BoxAssignments.CountAsync(a => a.BatchId == batch.BatchId && a.LeftAt == null, ct),
            await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId && c.InventoryStatus == "Dead", ct), restocked,
            await sourcing.MaxRestockAsync(batch, ct), await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId, ct));
    }

    // ---------- tiện ích ----------
    private async Task<CrabUnit> UnitAsync(string crabCode, long batchId, CancellationToken ct)
    {
        var crab = await db.CrabUnits.SingleOrDefaultAsync(c => c.CrabCode == crabCode.Trim().ToUpperInvariant(), ct)
                   ?? throw new NotFoundException("holding.crab_not_found", "Không tìm thấy con cua.");
        if (crab.BatchId != batchId) throw new BusinessRuleException("holding.crab_other_batch", "Con cua thuộc Lô khác (BR-128).");
        return crab;
    }

    private async Task<PhysicalSlot> SlotAsync(Batch batch, string slotCode, CancellationToken ct)
    {
        var slot = await db.PhysicalSlots.FromSqlInterpolated(
                       $"SELECT * FROM dbo.physical_slot WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {batch.OperatorId} AND slot_code = {slotCode.Trim()}")
                       .SingleOrDefaultAsync(ct)
                   ?? throw new NotFoundException("holding.slot_not_found", "Không tìm thấy hộp của hộ nuôi.");
        if (slot.Status == "Maintenance")
            throw new BusinessRuleException("holding.slot_maintenance", "Hộp đang bảo trì (BR-023).");
        var allocation = await db.SlotAllocations.SingleOrDefaultAsync(a => a.SlotId == slot.SlotId && a.ReleasedAt == null, ct);
        if (allocation is not null && allocation.BatchId != batch.BatchId)
            throw new BusinessRuleException("holding.slot_other_batch", "Hộp đang thuộc một Lô chưa đóng khác (BR-023).");
        if (await db.BoxAssignments.AnyAsync(a => a.SlotId == slot.SlotId && a.LeftAt == null, ct))
            throw new BusinessRuleException("holding.slot_occupied", "Hộp đang có cua sống (BR-024).");
        return slot;
    }

    private async Task AllocateSlotAsync(Batch batch, PhysicalSlot slot, DateTimeOffset now, CancellationToken ct)
    {
        if (!await db.SlotAllocations.AnyAsync(a => a.SlotId == slot.SlotId && a.ReleasedAt == null, ct))
            db.SlotAllocations.Add(new SlotAllocation { BatchId = batch.BatchId, SlotId = slot.SlotId, AllocatedAt = now, CreatedAt = now });
        slot.Status = "Occupied";
        slot.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Ảnh bằng chứng của đúng hộp và Lô, chụp trong ứng dụng, mới chụp (BR-108, BR-127, BR-130, BR-132).</summary>
    private async Task RequireBoxPhotoAsync(long evidenceId, long batchId, long slotId, CancellationToken ct)
    {
        var e = await db.Evidences.AsNoTracking().SingleOrDefaultAsync(x => x.EvidenceId == evidenceId, ct)
                ?? throw new NotFoundException("holding.photo_not_found", "Không tìm thấy ảnh bằng chứng.");
        if (e.BatchId != batchId || e.SlotId != slotId)
            throw new BusinessRuleException("holding.photo_wrong_box", "Ảnh phải chụp đúng hộp của Lô (BR-132).");
        RequireFreshInApp(e);
    }

    private async Task RequireBatchPhotoAsync(long evidenceId, long batchId, CancellationToken ct)
    {
        var e = await db.Evidences.AsNoTracking().SingleOrDefaultAsync(x => x.EvidenceId == evidenceId, ct)
                ?? throw new NotFoundException("holding.photo_not_found", "Không tìm thấy ảnh bằng chứng.");
        if (e.BatchId != batchId) throw new BusinessRuleException("holding.photo_wrong_box", "Ảnh phải thuộc Lô này.");
        RequireFreshInApp(e);
    }

    private void RequireFreshInApp(Infrastructure.Persistence.Entities.Evidence e)
    {
        if (e.Source != "InAppCapture")
            throw new BusinessRuleException("holding.photo_not_in_app", "Chỉ nhận ảnh chụp bằng camera trong ứng dụng (BR-130).");
        if (e.ReviewStatus == "Rejected")
            throw new BusinessRuleException("holding.photo_rejected", "Ảnh đã bị Người thẩm định loại.");
        if (clock.GetUtcNow() - e.ReceivedAt > PhotoFreshness)
            throw new BusinessRuleException("holding.photo_stale", "Ảnh chụp đã quá cũ; hãy chụp lại.");
    }

    private InventoryEvent Event(CrabUnit crab, string type, DateTimeOffset at, long? slotId, long? evidenceId, string? reason) => new()
    {
        CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = type, OccurredAt = at, Source = "App", SlotId = slotId,
        EvidenceId = evidenceId, Reason = reason, ActorId = me.UserId, CreatedAt = clock.GetUtcNow(),
    };

    /// <summary>BR-142: nhà đầu tư của Lô xem mọi con cua; người nuôi, Admin, QC xem mọi con. Khách xem cua phân bổ cho mình ở nhóm G6.</summary>
    private async Task RequireCrabViewerAsync(Batch batch, CrabUnit crab, CancellationToken ct)
    {
        if (me.IsInRole(Roles.PlatformAdmin) || me.IsInRole(Roles.QcInspector) || me.OperatorId == batch.OperatorId) return;
        if (await db.OperatorMembers.AnyAsync(m => m.UserId == me.UserId && m.OperatorId == batch.OperatorId, ct)) return;
        if (await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId, ct)) return;
        if (await CrabVisibility.CustomerSeesAsync(db, me.UserId, crab.CrabUnitId, ct)) return;
        throw new ForbiddenException("holding.crab_hidden", "Bạn không xem được con cua này (BR-142, BR-143).");
    }
}

/// <summary>Khách xem các con cua đã phân bổ cho đơn của mình tới khi giao xong (BR-142).</summary>
public static class CrabVisibility
{
    public static Task<bool> CustomerSeesAsync(AppDbContext db, long userId, long crabUnitId, CancellationToken ct)
        => db.InventoryAllocations.AnyAsync(a => a.CrabUnitId == crabUnitId && (a.Status == "Active" || a.Status == "Shipped") &&
                                                 db.SalesOrders.Any(o => o.OrderId == a.OrderId && o.CustomerId == userId && o.OrderType == "PreOrder"), ct);
}
