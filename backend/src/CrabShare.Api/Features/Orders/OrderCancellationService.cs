using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Khách tự huỷ đơn khi chưa đóng gói (NH-07, TL-31). Một transaction có khoá chuỗi audit, nên không chen ngang được
/// với webhook thanh toán (cũng khoá chuỗi audit trước khi đọc đơn):
/// - <c>PendingPayment</c>: trả <c>reserved_qty_kg</c>, khoản thu Pending → Cancelled (quét mã cũ sẽ thành trả trễ và được hoàn).
/// - <c>Paid</c>: giữ chỗ Committed → Released và cộng lại <c>stock_qty_kg</c>; lập lệnh hoàn qua <see cref="RefundService"/>.
/// - Từ <c>Packed</c> trở đi: 422 <c>order.cannot_cancel</c>; đã huỷ: 422 <c>order.already_cancelled</c>.
/// </summary>
public sealed class OrderCancellationService(AppDbContext db, ICurrentUser me, IAuditLog audit, RefundService refunds, TimeProvider clock)
{
    public const string CustomerCancelAction = "cancel";

    public Task<CancelOrderResponse> CancelAsync(string orderNo, CancelOrderRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => CancelInsideTransactionAsync(orderNo, req.Reason.Trim(), ct), ct);

    private async Task<CancelOrderResponse> CancelInsideTransactionAsync(string orderNo, string reason, CancellationToken ct)
    {
        if (reason.Length == 0)
            throw new BusinessRuleException("order.reason_required", "Vui lòng cho biết lý do huỷ đơn.");
        var customerId = me.UserId;
        await audit.LockAsync(ct);

        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.OrderLines).ThenInclude(l => l.StockReservation)
                        .Include(o => o.PaymentRequests)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
        if (order.CustomerId != customerId)
            throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");
        if (order.Status == "Cancelled")
            throw new BusinessRuleException("order.already_cancelled", "Đơn hàng này đã được huỷ trước đó.");
        if (!OrderQueryService.IsCancellable(order.Status))
            throw new BusinessRuleException("order.cannot_cancel",
                "Đơn đã được đóng gói hoặc đang giao nên không tự huỷ được. Hãy gửi khiếu nại sau khi nhận hàng.");

        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var before = order.Status;

        // Đổi trạng thái có điều kiện: nếu đơn vừa bị bên khác đổi (lý thuyết, vì đã khoá audit) thì không huỷ đè.
        var changed = await db.SalesOrders
            .Where(o => o.OrderId == order.OrderId && o.Status == before)
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, "Cancelled")
                .SetProperty(o => o.CancelledAt, now)
                .SetProperty(o => o.CancelReason, reason)
                .SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0)
            throw new ConflictException("order.status_changed", "Trạng thái đơn vừa thay đổi, hãy tải lại rồi thử lại.");

        var released = new List<StockRelease.Released>();
        foreach (var line in order.OrderLines)
        {
            if (line.StockReservation is null) continue;
            var result = await StockRelease.ReleaseAsync(db, line.StockReservation, now, ct);
            if (result is not null) released.Add(result);
        }

        // Khoản thu còn chờ: huỷ để không ai chuyển tiền theo mã cũ nữa (tiền đến sau sẽ thành LatePayment và được hoàn).
        var cancelledRequests = new List<long>();
        foreach (var request in order.PaymentRequests.Where(r => r.Status == "Pending"))
        {
            var n = await db.PaymentRequests
                .Where(r => r.PaymentRequestId == request.PaymentRequestId && r.Status == "Pending")
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "Cancelled").SetProperty(r => r.UpdatedAt, now), ct);
            if (n == 0) continue;
            cancelledRequests.Add(request.PaymentRequestId);
            await audit.WriteAsync("payment_request", request.PaymentRequestId, "cancel", new { status = "Pending" },
                new { status = "Cancelled", reason = "Khách huỷ đơn", order.OrderNo }, now, ct);
        }

        long? refundInstructionId = null;
        if (before == "Paid")
        {
            var paid = order.PaymentRequests.Where(r => r.Status == "Paid").OrderByDescending(r => r.PaymentRequestId).FirstOrDefault()
                       ?? throw new InvalidOperationException($"Đơn {order.OrderNo} ở trạng thái Paid nhưng không có khoản thu nào đã Paid.");
            var refund = await refunds.CreateRefundAsync(paid.BatchAccountId, paid.Amount, null, order.OrderId,
                $"Hoàn tiền huỷ đơn {order.OrderNo}: {reason}", now, ct);
            refundInstructionId = refund.InstructionId;
        }

        await audit.WriteAsync("sales_order", order.OrderId, CustomerCancelAction,
            new { status = before },
            new
            {
                status = "Cancelled", reason, cancelledAt = now, releasedKg = released.Sum(r => r.QuantityKg),
                released = released.Select(r => new { r.StockReservationId, r.ListingId, r.QuantityKg, r.From }),
                cancelledPaymentRequests = cancelledRequests, refundInstructionId,
            }, now, ct);

        return new CancelOrderResponse(order.OrderNo, "Cancelled", now, reason, released.Sum(r => r.QuantityKg), refundInstructionId);
    }
}
