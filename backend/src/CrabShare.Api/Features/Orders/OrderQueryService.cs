using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// UC28 Theo dõi đơn (NH-07): lịch sử và chi tiết đơn của chính khách đang đăng nhập. Chỉ đọc; không mở transaction.
/// Dòng thời gian dựng từ các mốc đã lưu trên sales_order (placed_at, paid_at, shipped_at, delivered_at, completed_at,
/// cancelled_at); CSDL không lưu giờ đóng gói nên mốc packed chỉ có cờ done suy từ trạng thái.
/// </summary>
public sealed class OrderQueryService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    /// <summary>Thứ tự trạng thái trên luồng chính; dùng để biết một mốc đã qua hay chưa.</summary>
    private static readonly string[] Flow = ["PendingPayment", "Paid", "Packed", "Shipping", "Delivered", "Completed"];
    private static readonly string[] PreOrderFlow = ["PendingPayment", "DepositPaid", "Paid", "Packed", "Shipping", "Delivered", "Completed"];

    /// <summary>Khách tự huỷ được khi chưa đóng gói (TL-31); Packed trở đi phải qua khiếu nại/trả hàng.</summary>
    public static bool IsCancellable(string status) => status is "PendingPayment" or "Paid";

    public Task<PagedResult<OrderSummaryResponse>> ListMineAsync(OrderListQuery filter, PageQuery paging, CancellationToken ct)
    {
        var customerId = me.UserId;
        var query = db.SalesOrders.AsNoTracking().Where(o => o.CustomerId == customerId);
        var statuses = filter.Statuses;
        if (statuses.Count > 0)
            query = query.Where(o => statuses.Contains(o.Status));
        return query
            .OrderByDescending(o => o.PlacedAt).ThenByDescending(o => o.OrderId)
            .Select(o => new OrderSummaryResponse(
                o.OrderNo, o.Batch.BatchCode, o.Batch.Operator.LegalName, o.Status, (long)o.TotalAmount,
                o.OrderLines.Count, o.OrderLines.Sum(l => l.QuantityKg), o.PlacedAt, o.CancelledAt, o.CancelReason))
            .ToPagedAsync(paging, ct);
    }

    public async Task<OrderTrackingResponse> GetMineAsync(string orderNo, CancellationToken ct)
    {
        var customerId = me.UserId;
        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.Batch).ThenInclude(b => b.Operator)
                        .Include(o => o.OrderLines).ThenInclude(l => l.ProductListing).ThenInclude(p => p.Grade)
                        .Include(o => o.PaymentRequests)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
        if (order.CustomerId != customerId)
            throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");
        return ToResponse(order, clock.GetUtcNow());
    }

    public static OrderTrackingResponse ToResponse(SalesOrder order, DateTimeOffset now)
    {
        var lines = order.OrderLines.OrderBy(l => l.OrderLineId).Select(l => new OrderTrackingLineResponse(
            l.ListingId, l.ProductListing.Title, l.ProductListing.Grade.GradeCode, l.ProductListing.Grade.GradeName,
            l.QuantityKg, (long)l.UnitPrice, OrderService.LineAmount(l.QuantityKg, (long)l.UnitPrice))).ToList();

        var paymentViews = order.PaymentRequests
            .OrderBy(r => r.PaymentRequestId)
            .Select(r => new OrderTrackingPaymentResponse(
                r.PaymentRequestId, r.ReferenceCode, PaymentRequestService.EffectiveStatus(r, now),
                (long)r.Amount, r.ExpiresAt, r.Status == "Paid" ? r.UpdatedAt : null))
            .ToList();
        var payment = paymentViews.FirstOrDefault(p => p.Status == "Pending")
                      ?? paymentViews.LastOrDefault(p => p.Status == "Paid")
                      ?? paymentViews.LastOrDefault();

        return new OrderTrackingResponse(order.OrderNo, order.Batch.BatchCode, order.Batch.Operator.LegalName, order.Status,
            (long)order.TotalAmount, order.PlacedAt, order.RecipientName, order.RecipientPhone, order.ShippingAddress,
            order.CancelledAt, order.CancelReason, IsCancellable(order.Status), lines, payment, Timeline(order),
            OrderFulfilmentService.CanConfirmReceipt(order.Status, order.ReceivedAt), OrderFulfilmentService.ToShipment(order),
            OrderType: order.OrderType,
            DepositAmount: order.DepositAmount is { } d ? (long)d : null,
            BalanceDueAt: order.BalanceDueAt,
            Payments: paymentViews);
    }

    /// <summary>
    /// Mốc nào có giờ thì done theo giờ; mốc không có giờ (packed) done khi trạng thái đã đi qua nó. Đơn huỷ: giữ các
    /// mốc đã xong rồi thêm cancelled, để web vẽ "đặt → (đã trả) → huỷ" thay vì một thanh tiến độ dở dang.
    /// </summary>
    public static IReadOnlyList<OrderTimelineStep> Timeline(SalesOrder order)
    {
        if (order.OrderType == "PreOrder")
        {
            var rank = Array.IndexOf(PreOrderFlow, order.Status);
            var depositPaidAt = order.PaymentRequests
                .Where(r => r.Purpose == PaymentPurposes.PreOrderDeposit && r.Status == "Paid")
                .Select(r => (DateTimeOffset?)r.UpdatedAt)
                .FirstOrDefault();
            var steps = new List<OrderTimelineStep>
            {
                new("placed", order.PlacedAt, true),
                new("deposit_paid", depositPaidAt, depositPaidAt is not null || rank >= 1),
                new("paid", order.PaidAt, order.PaidAt is not null || rank >= 2),
                new("packed", null, rank >= 3),
                new("shipped", order.ShippedAt, order.ShippedAt is not null || rank >= 4),
                new("delivered", order.DeliveredAt, order.DeliveredAt is not null || rank >= 5),
                new("completed", order.CompletedAt, order.CompletedAt is not null || rank >= 6),
            };
            if (order.Status is "Cancelled" or "Returned")
            {
                steps = steps.Where(s => s.Done).ToList();
                steps.Add(new(order.Status == "Cancelled" ? "cancelled" : "returned", order.CancelledAt, true));
            }
            return steps;
        }

        var retailRank = Array.IndexOf(Flow, order.Status);
        var retail = new List<OrderTimelineStep>
        {
            new("placed", order.PlacedAt, true),
            new("paid", order.PaidAt, order.PaidAt is not null || retailRank >= 1),
            new("packed", null, retailRank >= 2),
            new("shipped", order.ShippedAt, order.ShippedAt is not null || retailRank >= 3),
            new("delivered", order.DeliveredAt, order.DeliveredAt is not null || retailRank >= 4),
            new("completed", order.CompletedAt, order.CompletedAt is not null || retailRank >= 5),
        };
        if (order.Status is "Cancelled" or "Returned")
        {
            retail = retail.Where(s => s.Done).ToList();
            retail.Add(new(order.Status == "Cancelled" ? "cancelled" : "returned", order.CancelledAt, true));
        }
        return retail;
    }
}
