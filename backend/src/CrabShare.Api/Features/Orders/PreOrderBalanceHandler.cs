using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>Phần còn lại đặt trước về: đơn DepositPaid → Paid + paid_at. Không trừ tồn listing.</summary>
public sealed class PreOrderBalanceHandler(AppDbContext db, IAuditLog audit, ILogger<PreOrderBalanceHandler> log)
    : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.PreOrderBalance;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } orderId
            ? await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderId == orderId, ct)
            : null;
        if (order is null)
        {
            log.LogError("Khoản thu {PaymentRequestId} (PreOrderBalance) đã Paid nhưng không có đơn #{OrderId}",
                request.PaymentRequestId, request.OrderId);
            return;
        }

        var received = new { request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount, paidAt };
        if (order.OrderType != "PreOrder" || order.Status != "DepositPaid")
        {
            await audit.WriteAsync("sales_order", order.OrderId, "payment_after_close", new { order.Status, order.OrderType },
                received, paidAt, ct);
            return;
        }

        order.Status = "Paid";
        order.PaidAt = paidAt;
        order.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, "paid", new { status = "DepositPaid" },
            new { status = "Paid", received.PaymentRequestId, received.ReferenceCode, received.amount, paidAt }, paidAt, ct);
    }
}
