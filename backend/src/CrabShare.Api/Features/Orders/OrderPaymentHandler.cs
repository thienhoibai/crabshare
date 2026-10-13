using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Tiền đơn hàng về tài khoản lô (webhook TH-06, NH-06): đơn <c>PendingPayment</c> → <c>Paid</c>, giữ chỗ <c>Active</c> →
/// <c>Committed</c>, và lúc này mới trừ tồn gốc: một câu UPDATE có điều kiện cho từng dòng
/// (<c>stock_qty_kg -= q, reserved_qty_kg -= q</c>), không bao giờ để âm (TL-28 §3.3, §8). Chạy BÊN TRONG transaction của
/// webhook, sau khi <c>payment_request</c> đã Paid: không mở transaction riêng. Đơn không còn chờ thanh toán (đã huỷ, hoặc
/// đã Paid bằng khoản thu khác) thì chỉ ghi audit để admin đối soát, không sửa gì — ném lỗi sẽ rollback cả webhook và trung
/// gian thanh toán gửi lại mãi (cùng cách với <c>ContributionPaymentHandler</c>).
/// </summary>
public sealed class OrderPaymentHandler(AppDbContext db, IAuditLog audit, ILogger<OrderPaymentHandler> log) : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.OrderPayment;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } orderId
            ? await db.SalesOrders
                .Include(o => o.OrderLines).ThenInclude(l => l.StockReservation)
                .SingleOrDefaultAsync(o => o.OrderId == orderId, ct)
            : null;
        if (order is null)
        {
            log.LogError("Khoản thu {PaymentRequestId} (OrderPayment) đã Paid nhưng không có đơn #{OrderId}",
                request.PaymentRequestId, request.OrderId);
            return;
        }

        var received = new { request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount, paidAt };
        if (order.Status != "PendingPayment")
        {
            await audit.WriteAsync("sales_order", order.OrderId, "payment_after_close", new { order.Status }, received, paidAt, ct);
            return;
        }

        // Trừ tồn gốc và trả phần đã giữ trong cùng một câu UPDATE, có điều kiện để không âm. Giữ chỗ Active bảo đảm
        // reserved ≥ q và CHECK ck_listing_reserved bảo đảm stock ≥ reserved, nên 0 dòng bị ảnh hưởng là dữ liệu đã hỏng.
        // Không đổi updated_at của niêm yết: đó là concurrency token của việc đổi giá (như checkout).
        var committed = new List<object>();
        foreach (var line in order.OrderLines.OrderBy(l => l.ListingId))
        {
            var reservation = line.StockReservation;
            if (reservation is null || reservation.Status != "Active")
            {
                log.LogWarning("Dòng {OrderLineId} của đơn {OrderNo} không còn giữ chỗ Active ({Status}); bỏ qua trừ tồn",
                    line.OrderLineId, order.OrderNo, reservation?.Status ?? "none");
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
                    $"Niêm yết {line.ListingId} không đủ tồn/giữ chỗ để trừ {quantityKg:0.###} kg cho đơn {order.OrderNo}.");
            reservation.Status = "Committed";
            reservation.UpdatedAt = paidAt;
            committed.Add(new { line.ListingId, reservation.StockReservationId, quantityKg });
        }

        order.Status = "Paid";
        order.PaidAt = paidAt;
        order.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, "paid", new { status = "PendingPayment" },
            new { status = "Paid", received.PaymentRequestId, received.ReferenceCode, received.amount, paidAt, committed }, paidAt, ct);
    }
}
