using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Việc của <see cref="ReservationExpiryJob"/>, tách ra để test gọi thẳng: đơn <c>PendingPayment</c> có giữ chỗ
/// <c>Active</c> đã quá <c>expires_at</c> → giữ chỗ Released + trả <c>reserved_qty_kg</c>, đơn Cancelled
/// (<c>cancel_reason = payment_timeout</c>), khoản thu Pending → Expired (BR-13, TL-28 §5).
/// Mỗi đơn một transaction có khoá chuỗi audit: webhook báo tiền về cùng lúc sẽ chạy lần lượt, và câu UPDATE đơn có
/// điều kiện <c>status = PendingPayment</c> nên đơn vừa được trả tiền không bị huỷ đè. Một đơn lỗi không chặn các đơn còn lại.
/// </summary>
public sealed class ReservationExpiryService(AppDbContext db, IAuditLog audit, TimeProvider clock, ILogger<ReservationExpiryService> log)
{
    public const string TimeoutReason = "payment_timeout";

    /// <summary>Số đơn tối đa mỗi lượt chạy; chu kỳ 1 phút nên phần dư sẽ được dọn ở lượt sau.</summary>
    public const int BatchSize = 200;

    /// <summary>Trả về số đơn đã huỷ vì quá hạn thanh toán trong lượt này.</summary>
    public async Task<int> ReleaseExpiredAsync(CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var reservedIds = await db.StockReservations.AsNoTracking()
            .Where(r => r.Status == "Active" && r.ExpiresAt < now && r.OrderLine.SalesOrder.Status == "PendingPayment")
            .Select(r => r.OrderLine.OrderId)
            .Distinct()
            .ToListAsync(ct);
        var preorderIds = await db.PaymentRequests.AsNoTracking()
            .Where(r => r.Purpose == PaymentPurposes.PreOrderDeposit
                        && r.Status == "Pending"
                        && r.ExpiresAt < now
                        && r.OrderId != null
                        && r.Order!.OrderType == "PreOrder"
                        && r.Order.Status == "PendingPayment")
            .Select(r => r.OrderId!.Value)
            .Distinct()
            .ToListAsync(ct);
        var orderIds = reservedIds.Union(preorderIds).OrderBy(id => id).Take(BatchSize).ToList();

        var cancelled = 0;
        foreach (var orderId in orderIds)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                if (await db.InTransactionAsync(() => ExpireOrderAsync(orderId, now, ct), ct)) cancelled++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Không huỷ được đơn {OrderId} quá hạn thanh toán; sẽ thử lại ở lượt sau", orderId);
            }
        }
        if (cancelled > 0) log.LogInformation("Đã huỷ {Count} đơn quá hạn thanh toán và trả tồn", cancelled);
        return cancelled;
    }

    private async Task<bool> ExpireOrderAsync(long orderId, DateTimeOffset now, CancellationToken ct)
    {
        await audit.LockAsync(ct);
        var order = await db.SalesOrders.AsNoTracking()
            .Include(o => o.OrderLines).ThenInclude(l => l.StockReservation)
            .Include(o => o.PaymentRequests)
            .SingleOrDefaultAsync(o => o.OrderId == orderId, ct);
        if (order is null || order.Status != "PendingPayment") return false; // webhook đã đổi trước khi job tới

        var changed = await db.SalesOrders
            .Where(o => o.OrderId == orderId && o.Status == "PendingPayment")
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, "Cancelled")
                .SetProperty(o => o.CancelledAt, now)
                .SetProperty(o => o.CancelReason, TimeoutReason)
                .SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0) return false;

        var released = new List<StockRelease.Released>();
        foreach (var line in order.OrderLines)
        {
            if (line.StockReservation is null) continue;
            var result = await StockRelease.ReleaseAsync(db, line.StockReservation, now, ct);
            if (result is not null) released.Add(result);
        }

        var expiredRequests = new List<long>();
        foreach (var request in order.PaymentRequests.Where(r => r.Status == "Pending"))
        {
            var n = await db.PaymentRequests
                .Where(r => r.PaymentRequestId == request.PaymentRequestId && r.Status == "Pending")
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "Expired").SetProperty(r => r.UpdatedAt, now), ct);
            if (n == 0) continue;
            expiredRequests.Add(request.PaymentRequestId);
            await audit.WriteAsync("payment_request", request.PaymentRequestId, "expire", new { status = "Pending" },
                new { status = "Expired", reason = "Quá hạn giữ chỗ, chưa nhận được tiền", order.OrderNo }, now, ct);
        }

        await audit.WriteAsync("sales_order", orderId, OrderCancellationService.CustomerCancelAction,
            new { status = "PendingPayment" },
            new
            {
                status = "Cancelled", reason = TimeoutReason, cancelledAt = now, releasedKg = released.Sum(r => r.QuantityKg),
                released = released.Select(r => new { r.StockReservationId, r.ListingId, r.QuantityKg, r.From }),
                expiredPaymentRequests = expiredRequests,
            }, now, ct);
        return true;
    }
}
