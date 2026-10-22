using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Offtake;

/// <summary>
/// UC23: lô Harvesting + cọc Held → WindowOpen 48 giờ. Hết hạn chưa nhận hàng thì mất cọc (Forfeited, vào
/// v_batch_actual_revenue) và kg trở lại gian hàng. Lô Cancelled, hoặc hết hạn mà không còn đủ hàng tươi để giao,
/// thì hoàn 100% cọc (TL-30).
/// </summary>
public sealed class OfftakeWindowService(AppDbContext db, IAuditLog audit, RefundService refunds, TimeProvider clock, ILogger<OfftakeWindowService> log)
{
    public const int BatchSize = 200;

    public async Task<int> RunAsync(CancellationToken ct)
    {
        var refunded = await RefundCancelledAsync(ct);
        var opened = await OpenWindowsAsync(ct);
        var closed = await CloseExpiredAsync(ct);
        return refunded + opened + closed;
    }

    public async Task<int> OpenWindowsAsync(CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var ids = await db.OfftakeCommitments.AsNoTracking()
            .Where(o => o.Status == "PendingHarvest" && o.DepositStatus == "Held" && o.Batch.Status == "Harvesting")
            .OrderBy(o => o.OfftakeId)
            .Select(o => o.OfftakeId)
            .Take(BatchSize)
            .ToListAsync(ct);
        return await EachAsync(ids, id => OpenOneAsync(id, now, ct), "mở cửa sổ", ct);
    }

    public async Task<int> CloseExpiredAsync(CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var ids = await db.OfftakeCommitments.AsNoTracking()
            .Where(o => o.Status == "WindowOpen" && o.DepositStatus == "Held" && o.WindowExpiresAt < now)
            .OrderBy(o => o.OfftakeId)
            .Select(o => o.OfftakeId)
            .Take(BatchSize)
            .ToListAsync(ct);
        return await EachAsync(ids, id => CloseOneAsync(id, now, ct), "đóng cửa sổ", ct);
    }

    public async Task<int> RefundCancelledAsync(CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var ids = await db.OfftakeCommitments.AsNoTracking()
            .Where(o => o.DepositStatus == "Held"
                        && (o.Status == "PendingHarvest" || o.Status == "WindowOpen")
                        && o.Batch.Status == "Cancelled")
            .OrderBy(o => o.OfftakeId)
            .Select(o => o.OfftakeId)
            .Take(BatchSize)
            .ToListAsync(ct);
        return await EachAsync(ids, id => RefundOneAsync(id, now, "Lô huỷ, hoàn 100% cọc bao tiêu", ct), "hoàn cọc lô huỷ", ct);
    }

    private async Task<int> EachAsync(IReadOnlyList<long> ids, Func<long, Task<bool>> action, string name, CancellationToken ct)
    {
        var n = 0;
        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                if (await db.InTransactionAsync(() => action(id), ct)) n++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                log.LogError(ex, "Không {Name} được offtake {OfftakeId}", name, id);
            }
        }
        if (n > 0) log.LogInformation("Bao tiêu: {Name} {Count} cam kết", name, n);
        return n;
    }

    private async Task<bool> OpenOneAsync(long offtakeId, DateTimeOffset now, CancellationToken ct)
    {
        await audit.LockAsync(ct);
        var offtake = await db.OfftakeCommitments.Include(o => o.Batch)
            .SingleOrDefaultAsync(o => o.OfftakeId == offtakeId, ct);
        if (offtake is null || offtake.Status != "PendingHarvest" || offtake.DepositStatus != "Held" || offtake.Batch.Status != "Harvesting")
            return false;

        var opens = now;
        var expires = now.AddHours(OfftakeStock.WindowHours);
        offtake.Status = "WindowOpen";
        offtake.WindowOpensAt = opens;
        offtake.WindowExpiresAt = expires;
        offtake.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("offtake_commitment", offtakeId, "open_window",
            new { status = "PendingHarvest" },
            new { status = "WindowOpen", windowOpensAt = opens, windowExpiresAt = expires }, now, ct);
        return true;
    }

    private async Task<bool> CloseOneAsync(long offtakeId, DateTimeOffset now, CancellationToken ct)
    {
        await audit.LockAsync(ct);
        var offtake = await db.OfftakeCommitments
            .Include(o => o.PaymentRequests)
            .Include(o => o.SalesOrders).ThenInclude(s => s.OrderLines).ThenInclude(l => l.StockReservation)
            .Include(o => o.SalesOrders).ThenInclude(s => s.PaymentRequests)
            .Include(o => o.Batch).ThenInclude(b => b.BatchAccount)
            .SingleOrDefaultAsync(o => o.OfftakeId == offtakeId, ct);
        if (offtake is null || offtake.Status != "WindowOpen" || offtake.DepositStatus != "Held" || offtake.WindowExpiresAt >= now)
            return false;

        var pending = offtake.SalesOrders.FirstOrDefault(s => s.Status == "PendingPayment");
        if (pending is null && !await CanDeliverAsync(offtake, ct))
            return await RefundInsideAsync(offtake, now, "Không đủ hàng tươi để giao, hoàn 100% cọc bao tiêu", ct);

        await CancelPendingOrderAsync(pending, now, "offtake_window_expired", ct);
        offtake.Status = "Expired";
        offtake.DepositStatus = "Forfeited";
        offtake.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, "forfeit_deposit",
            new { status = "WindowOpen", depositStatus = "Held" },
            new { status = "Expired", depositStatus = "Forfeited", depositAmount = (long)offtake.DepositAmount, pending?.OrderNo },
            now, ct);
        return true;
    }

    private async Task<bool> RefundOneAsync(long offtakeId, DateTimeOffset now, string reason, CancellationToken ct)
    {
        await audit.LockAsync(ct);
        var offtake = await db.OfftakeCommitments
            .Include(o => o.SalesOrders).ThenInclude(s => s.OrderLines).ThenInclude(l => l.StockReservation)
            .Include(o => o.SalesOrders).ThenInclude(s => s.PaymentRequests)
            .Include(o => o.Batch).ThenInclude(b => b.BatchAccount)
            .Include(o => o.PaymentRequests)
            .SingleOrDefaultAsync(o => o.OfftakeId == offtakeId, ct);
        if (offtake is null || offtake.DepositStatus != "Held") return false;
        if (offtake.Batch.Status != "Cancelled") return false;
        return await RefundInsideAsync(offtake, now, reason, ct);
    }

    private async Task<bool> RefundInsideAsync(OfftakeCommitment offtake, DateTimeOffset now, string reason, CancellationToken ct)
    {
        var account = offtake.Batch.BatchAccount;
        if (account is null)
            throw new BusinessRuleException("offtake.batch_account_unavailable",
                $"Lô {offtake.Batch.BatchCode} không có tài khoản để hoàn cọc bao tiêu.");

        await CancelPendingOrderAsync(offtake.SalesOrders.FirstOrDefault(s => s.Status == "PendingPayment"), now, "offtake_refund", ct);
        foreach (var request in offtake.PaymentRequests.Where(r => r.Status == "Pending"))
        {
            request.Status = "Cancelled";
            request.UpdatedAt = now;
        }

        var previousStatus = offtake.Status;
        offtake.Status = "Cancelled";
        offtake.DepositStatus = "Refunded";
        offtake.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await refunds.CreateRefundAsync(account.BatchAccountId, offtake.DepositAmount, offtake.ContributionId, null,
            reason, now, ct);
        await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, "refund_deposit",
            new { status = previousStatus, depositStatus = "Held" },
            new { status = "Cancelled", depositStatus = "Refunded", depositAmount = (long)offtake.DepositAmount, reason },
            now, ct);
        return true;
    }

    /// <summary>Hàng giao được khi niêm yết tươi còn đủ kg chưa giữ cho đơn khác. Không có niêm yết thì chưa giao được.</summary>
    private async Task<bool> CanDeliverAsync(OfftakeCommitment offtake, CancellationToken ct)
    {
        var listing = await db.ProductListings.AsNoTracking()
            .Where(l => l.BatchId == offtake.BatchId && l.GradeId == offtake.GradeId && l.StorageType == "Fresh" && l.Status != "Closed")
            .Select(l => new { l.StockQtyKg, l.ReservedQtyKg })
            .FirstOrDefaultAsync(ct);
        return listing is not null && listing.StockQtyKg - listing.ReservedQtyKg >= offtake.CommittedQtyKg;
    }

    private async Task CancelPendingOrderAsync(SalesOrder? order, DateTimeOffset now, string reason, CancellationToken ct)
    {
        if (order is null || order.Status != "PendingPayment") return;
        order.Status = "Cancelled";
        order.CancelledAt = now;
        order.CancelReason = reason;
        order.UpdatedAt = now;
        foreach (var line in order.OrderLines)
        {
            if (line.StockReservation is not null)
                await StockRelease.ReleaseAsync(db, line.StockReservation, now, ct);
        }
        foreach (var request in order.PaymentRequests.Where(r => r.Status == "Pending"))
        {
            request.Status = "Cancelled";
            request.UpdatedAt = now;
        }
        await audit.WriteAsync("sales_order", order.OrderId, "cancel", new { status = "PendingPayment" },
            new { status = "Cancelled", reason }, now, ct);
    }
}
