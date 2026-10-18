using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>Cọc đặt trước về (webhook TH-06): đơn PreOrder PendingPayment → DepositPaid. Không trừ tồn, không paid_at.</summary>
public sealed class PreOrderDepositHandler(AppDbContext db, IAuditLog audit, ILogger<PreOrderDepositHandler> log)
    : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.PreOrderDeposit;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } orderId
            ? await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderId == orderId, ct)
            : null;
        if (order is null)
        {
            log.LogError("Khoản thu {PaymentRequestId} (PreOrderDeposit) đã Paid nhưng không có đơn #{OrderId}",
                request.PaymentRequestId, request.OrderId);
            return;
        }

        var received = new { request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount, paidAt };
        if (order.OrderType != "PreOrder" || order.Status != "PendingPayment")
        {
            await audit.WriteAsync("sales_order", order.OrderId, "payment_after_close", new { order.Status, order.OrderType },
                received, paidAt, ct);
            return;
        }

        order.Status = "DepositPaid";
        order.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, "deposit_paid", new { status = "PendingPayment" },
            new { status = "DepositPaid", received.PaymentRequestId, received.ReferenceCode, received.amount }, paidAt, ct);
    }
}
