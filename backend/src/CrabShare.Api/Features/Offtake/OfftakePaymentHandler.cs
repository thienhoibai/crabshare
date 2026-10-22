using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Offtake;

/// <summary>
/// Phần còn lại của đơn bao tiêu về: đơn PendingPayment → Paid, cọc Held → Applied, cam kết → Fulfilled,
/// giữ chỗ Active → Committed và trừ tồn (cùng cách NH-06). Chạy trong transaction của webhook.
/// </summary>
public sealed class OfftakePaymentHandler(AppDbContext db, IAuditLog audit, ILogger<OfftakePaymentHandler> log)
    : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.OfftakePayment;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } orderId
            ? await db.SalesOrders
                .Include(o => o.OrderLines).ThenInclude(l => l.StockReservation)
                .Include(o => o.Offtake)
                .SingleOrDefaultAsync(o => o.OrderId == orderId, ct)
            : null;
        if (order is null)
        {
            log.LogError("Khoản thu {PaymentRequestId} (OfftakePayment) đã Paid nhưng không có đơn #{OrderId}",
                request.PaymentRequestId, request.OrderId);
            return;
        }

        var received = new { request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount, paidAt };
        if (order.OrderType != "Offtake" || order.Status != "PendingPayment")
        {
            await audit.WriteAsync("sales_order", order.OrderId, "payment_after_close",
                new { order.Status, order.OrderType }, received, paidAt, ct);
            return;
        }

        foreach (var line in order.OrderLines.OrderBy(l => l.ListingId))
        {
            var reservation = line.StockReservation;
            if (reservation is null || reservation.Status != "Active")
            {
                log.LogWarning("Dòng {OrderLineId} của đơn bao tiêu {OrderNo} không còn giữ chỗ Active",
                    line.OrderLineId, order.OrderNo);
                continue;
            }

            var quantityKg = reservation.QuantityKg;
            var affected = await db.ProductListings
                .Where(l => l.ListingId == line.ListingId && l.StockQtyKg >= quantityKg && l.ReservedQtyKg >= quantityKg)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(l => l.StockQtyKg, l => l.StockQtyKg - quantityKg)
                    .SetProperty(l => l.ReservedQtyKg, l => l.ReservedQtyKg - quantityKg), ct);
            if (affected == 0)
                throw new InvalidOperationException(
                    $"Niêm yết {line.ListingId} không đủ tồn để trừ {quantityKg:0.###} kg cho đơn bao tiêu {order.OrderNo}.");
            reservation.Status = "Committed";
            reservation.UpdatedAt = paidAt;
        }

        order.Status = "Paid";
        order.PaidAt = paidAt;
        order.UpdatedAt = paidAt;
        if (order.Offtake is { } offtake && offtake.DepositStatus == "Held")
        {
            offtake.DepositStatus = "Applied";
            offtake.Status = "Fulfilled";
            offtake.UpdatedAt = paidAt;
        }

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, "paid", new { status = "PendingPayment" },
            new { status = "Paid", received.PaymentRequestId, received.ReferenceCode, received.amount, paidAt }, paidAt, ct);
        if (order.Offtake is not null)
            await audit.WriteAsync("offtake_commitment", order.Offtake.OfftakeId, "fulfill",
                new { status = "WindowOpen", depositStatus = "Held" },
                new { status = "Fulfilled", depositStatus = "Applied", order.OrderNo }, paidAt, ct);
    }
}
