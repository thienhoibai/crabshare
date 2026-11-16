using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Grading;
using CrabShare.Api.Features.Sales;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

public static class OrderStatus
{
    public const string Delivering = "Delivering";
    public const string Delivered = "Delivered";
    public const string Completed = "Completed";
    public const string PendingPayment = "PendingPayment";
    /// <summary>Đơn đặt trước nhận phân bổ: đã xác nhận (Lô đã mở) hoặc đang giao.</summary>
    public static readonly string[] Allocatable = [PreorderStatus.Confirmed, Delivering];
}

/// <summary>
/// Phân bổ hàng (BR-160, BR-234): con cua vừa duyệt hạng được phân ngay cho đợt giao đến hạn sớm nhất có dòng đơn cùng quy cách,
/// ưu tiên đơn cọc trước; mỗi con tối đa một phân bổ còn hiệu lực. Đổi cua (chết, đổi hạng) thì nhả phân bổ cũ và phân bổ lại.
/// Cài đặt điểm nối <see cref="IGradingHooks"/> của nhóm phân hạng.
/// </summary>
public sealed class AllocationService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit) : IGradingHooks
{
    public async Task OnApprovedAsync(GradeDecision decision, CancellationToken ct)
    {
        if (decision.IsSubstandard || decision.SpecId is not { } specId) return; // BR-159: cua dưới chuẩn bán qua đơn có hoá đơn
        var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == decision.CrabUnitId, ct);
        await AllocateExactAsync(crab, decision, specId, ct);
    }

    public async Task OnRejectedAsync(GradeDecision decision, CancellationToken ct)
    {
        var allocation = await ActiveAsync(decision.CrabUnitId, ct);
        if (allocation is null) return;
        await ReleaseAsync(allocation, "Cua bị loại bỏ khi kiểm phẩm (BR-156)", ct);
        if (allocation is { TrancheId: { } trancheId, LineId: { } lineId })
            await FillLineAsync(trancheId, lineId, allowSubstitution: false, ct);
    }

    public async Task OnRevisedAsync(GradeDecision previous, GradeDecision current, CancellationToken ct)
    {
        if (current.Status != "Approved") return; // loại bỏ do OnRejectedAsync xử lý
        var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == current.CrabUnitId, ct);
        var allocation = await ActiveAsync(current.CrabUnitId, ct);
        if (allocation is null)
        {
            if (!current.IsSubstandard && current.SpecId is { } spec) await AllocateExactAsync(crab, current, spec, ct);
            return;
        }
        if (allocation.LineId is { } lineId && await FitsLineAsync(current, lineId, ct))
        {
            allocation.GradeDecisionId = current.GradeDecisionId;
            allocation.CrabSpecId = current.SpecId;
            await db.SaveChangesAsync(ct);
            return;
        }
        // Đổi hạng làm con cua không còn hợp dòng đơn: nhả, bù con khác cho dòng đó, rồi phân bổ lại con này (BR-160).
        await ReleaseAsync(allocation, $"Đổi hạng {previous.FinalSize} {previous.FinalGrade} → {current.FinalSize} {current.FinalGrade}", ct);
        if (allocation is { TrancheId: { } t, LineId: { } l }) await FillLineAsync(t, l, allowSubstitution: false, ct);
        if (!current.IsSubstandard && current.SpecId is { } newSpec) await AllocateExactAsync(crab, current, newSpec, ct);
    }

    public Task<bool> HasOpenClaimAsync(long crabUnitId, CancellationToken ct)
        => db.CustomerClaims.AnyAsync(c => (c.Status == "Open" || c.Status == "OperatorAccepted" || c.Status == "OperatorRejected" || c.Status == "Escalated")
                                           && db.InventoryAllocations.Any(a => a.CrabUnitId == crabUnitId && a.OrderId == c.OrderId), ct);

    /// <summary>Phân con cua cho đợt giao đến hạn sớm nhất còn thiếu đúng quy cách; không có thì để con cua trong tồn đã phân hạng.</summary>
    private async Task AllocateExactAsync(CrabUnit crab, GradeDecision decision, long specId, CancellationToken ct)
    {
        var target = await (from tl in db.DeliveryTrancheLines
                            join t in db.DeliveryTranches on tl.TrancheId equals t.TrancheId
                            join l in db.SalesOrderLines on tl.LineId equals l.LineId
                            join o in db.SalesOrders on t.OrderId equals o.OrderId
                            where o.BatchId == crab.BatchId && o.OrderType == "PreOrder" && OrderStatus.Allocatable.Contains(o.Status)
                                  && (t.Status == "Planned" || t.Status == "Allocated") && l.SpecId == specId
                                  && db.InventoryAllocations.Count(a => a.TrancheId == t.TrancheId && a.LineId == l.LineId && a.ReleasedAt == null) < tl.ConvertedCrabs
                            orderby t.DueDate, o.DepositedAt, o.OrderId, t.Seq
                            select new { t.TrancheId, l.LineId, o.OrderId }).FirstOrDefaultAsync(ct);
        if (target is null) return;
        await AddAsync(crab, decision, target.OrderId, target.LineId, target.TrancheId, substitution: false, ct);
    }

    /// <summary>
    /// Bù cho một dòng của đợt giao từ cua đã duyệt chưa phân bổ: đúng quy cách trước; cho phép thì thêm cua cùng size, hạng cao hơn,
    /// giao với giá của dòng đơn (BR-160). Trả số con còn thiếu.
    /// </summary>
    public async Task<int> FillLineAsync(long trancheId, long lineId, bool allowSubstitution, CancellationToken ct)
    {
        var tl = await db.DeliveryTrancheLines.SingleAsync(x => x.TrancheId == trancheId && x.LineId == lineId, ct);
        var line = await db.SalesOrderLines.Include(l => l.Spec).SingleAsync(l => l.LineId == lineId, ct);
        var missing = tl.ConvertedCrabs - await db.InventoryAllocations.CountAsync(a => a.TrancheId == trancheId && a.LineId == lineId && a.ReleasedAt == null, ct);
        if (missing <= 0) return 0;
        var candidates = await (from c in db.CrabUnits
                                join d in db.GradeDecisions on c.CrabUnitId equals d.CrabUnitId
                                join s in db.ProductSpecifications on d.SpecId equals s.SpecId
                                where c.BatchId == line.BatchId && c.InventoryStatus == "Graded" && d.IsCurrent && d.Status == "Approved" && !d.IsSubstandard
                                      && !db.InventoryAllocations.Any(a => a.CrabUnitId == c.CrabUnitId && a.ReleasedAt == null)
                                      && (s.SpecId == line.SpecId || (allowSubstitution && s.CrabType == line.Spec.CrabType
                                          && s.SizeCode == line.Spec.SizeCode && s.GradeRank > line.Spec.GradeRank))
                                orderby s.SpecId == line.SpecId ? 0 : 1, s.GradeRank, d.DecidedAt
                                select new { Crab = c, Decision = d, Exact = s.SpecId == line.SpecId }).Take(missing).ToListAsync(ct);
        foreach (var c in candidates)
            await AddAsync(c.Crab, c.Decision, line.OrderId, lineId, trancheId, substitution: !c.Exact, ct);
        return missing - candidates.Count;
    }

    private async Task<bool> FitsLineAsync(GradeDecision decision, long lineId, CancellationToken ct)
    {
        if (decision.IsSubstandard || decision.SpecId is not { } specId) return false;
        var line = await db.SalesOrderLines.Include(l => l.Spec).SingleAsync(l => l.LineId == lineId, ct);
        if (line.SpecId == specId) return true;
        var spec = await db.ProductSpecifications.SingleAsync(s => s.SpecId == specId, ct);
        return spec.CrabType == line.Spec.CrabType && spec.SizeCode == line.Spec.SizeCode && spec.GradeRank > line.Spec.GradeRank;
    }

    private async Task AddAsync(CrabUnit crab, GradeDecision decision, long orderId, long lineId, long trancheId, bool substitution, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        long? actor = me.IsAuthenticated ? me.UserId : null;
        db.InventoryAllocations.Add(new InventoryAllocation
        {
            CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, OrderId = orderId, LineId = lineId, TrancheId = trancheId,
            GradeDecisionId = decision.GradeDecisionId, CrabSpecId = decision.SpecId, IsSubstitution = substitution, Status = "Active",
            AllocatedAt = now, ActorId = actor, CreatedAt = now,
        });
        crab.InventoryStatus = "Allocated";
        crab.UpdatedAt = now;
        db.InventoryEvents.Add(new InventoryEvent
        {
            CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = "Allocated", OccurredAt = now, Source = "System", ActorId = actor,
            Reason = substitution ? "Thay cua cùng size, hạng cao hơn (BR-160)" : null, CreatedAt = now,
        });
        await db.SaveChangesAsync(ct);
        await RefreshTrancheAsync(trancheId, ct);
    }

    /// <summary>Nhả một phân bổ: con cua quay về tồn đã phân hạng (trừ khi đã bị huỷ hoặc chết).</summary>
    public async Task ReleaseAsync(InventoryAllocation allocation, string reason, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        allocation.Status = "Released";
        allocation.ReleasedAt = now;
        allocation.ReleaseReason = reason.Length > 300 ? reason[..300] : reason;
        var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == allocation.CrabUnitId, ct);
        if (crab.InventoryStatus is "Allocated" or "Shipped" or "Delivered")
        {
            crab.InventoryStatus = "Graded";
            crab.UpdatedAt = now;
        }
        db.InventoryEvents.Add(new InventoryEvent
        {
            CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = "Released", OccurredAt = now, Source = "System",
            ActorId = me.IsAuthenticated ? me.UserId : null, Reason = allocation.ReleaseReason, CreatedAt = now,
        });
        await db.SaveChangesAsync(ct);
        if (allocation.TrancheId is { } trancheId) await RefreshTrancheAsync(trancheId, ct);
        await audit.WriteAsync("inventory_allocation", allocation.AllocationId, "release", null, new { allocation.CrabUnitId, allocation.OrderId, reason }, ct);
    }

    /// <summary>Đợt giao chưa xuất: Allocated khi mọi dòng đủ số con, ngược lại Planned.</summary>
    public async Task RefreshTrancheAsync(long trancheId, CancellationToken ct)
    {
        var tranche = await db.DeliveryTranches.Include(t => t.Lines).SingleAsync(t => t.TrancheId == trancheId, ct);
        if (tranche.Status is not ("Planned" or "Allocated")) return;
        var counts = await db.InventoryAllocations.Where(a => a.TrancheId == trancheId && a.ReleasedAt == null)
            .GroupBy(a => a.LineId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key!.Value, x => x.Count, ct);
        var full = tranche.Lines.All(l => counts.GetValueOrDefault(l.LineId) >= l.ConvertedCrabs);
        var status = full ? "Allocated" : "Planned";
        if (tranche.Status == status) return;
        tranche.Status = status;
        tranche.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    private Task<InventoryAllocation?> ActiveAsync(long crabUnitId, CancellationToken ct)
        => db.InventoryAllocations.SingleOrDefaultAsync(a => a.CrabUnitId == crabUnitId && a.ReleasedAt == null && a.Status == "Active", ct);
}
