using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Features.Sales;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

/// <summary>
/// Ghi sổ bán hàng dùng chung cho giao hàng, khiếu nại và đơn có hoá đơn: hoá đơn (BR-170, BR-171), dòng doanh thu (BR-184, BR-185),
/// mất cọc (BR-169), chốt đơn đặt trước sau đợt giao cuối (BR-160, BR-167). Gọi bên trong transaction của bên gọi.
/// </summary>
public sealed class SalesLedger(AppDbContext db, TimeProvider clock, IAuditLog audit, RefundService refunds, PartyDirectory parties,
    AllocationService allocations, PlatformParameters parameters)
{
    public static long Money(decimal value) => (long)decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    /// <summary>BR-170: bên bán pháp lý theo chế độ lô là đơn vị thực hiện của Lô (người nuôi ở lô P, CrabShare ở lô T, nhà cung cấp ở lô A).</summary>
    public async Task<long> SellerPartyAsync(Batch batch, CancellationToken ct)
        => batch.ExecutorPartyId ?? await parties.PartyIdOfOperatorAsync(batch.OperatorId, ct);

    public async Task<Invoice> IssueInvoiceAsync(SalesOrder order, Batch batch, long? trancheId, decimal amount, long? buyerPartyId, string buyerName,
        DateTimeOffset now, CancellationToken ct)
    {
        var invoice = new Invoice
        {
            InvoiceNo = Codes.New("HD", 12), OrderId = order.OrderId, TrancheId = trancheId, BatchId = batch.BatchId,
            SellerPartyId = await SellerPartyAsync(batch, ct), BuyerPartyId = buyerPartyId, BuyerName = buyerName.Length > 200 ? buyerName[..200] : buyerName,
            Amount = Money(amount), Status = "Active", IssuedAt = now,
        };
        db.Invoices.Add(invoice);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("invoice", invoice.InvoiceId, "issue", null, new { invoice.InvoiceNo, order.OrderNo, trancheId, amount = (long)invoice.Amount }, now, ct);
        return invoice;
    }

    public async Task CancelInvoicesAsync(long orderId, long? trancheId, string reason, DateTimeOffset now, CancellationToken ct)
    {
        var active = await db.Invoices.Where(i => i.OrderId == orderId && i.Status == "Active" && (trancheId == null || i.TrancheId == trancheId)).ToListAsync(ct);
        foreach (var i in active)
        {
            i.Status = "Cancelled";
            i.CancelledAt = now;
            i.CancelReason = reason.Length > 300 ? reason[..300] : reason;
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>BR-185: mỗi khoản tính đúng một lần (khoá duy nhất theo loại dòng và đơn).</summary>
    public async Task RecognizeAsync(long batchId, string sourceType, long orderId, decimal amount, string? note, DateTimeOffset now, CancellationToken ct)
    {
        if (amount <= 0 || await db.RevenueLines.AnyAsync(r => r.SourceType == sourceType && r.OrderId == orderId, ct)) return;
        db.RevenueLines.Add(new RevenueLine
        {
            BatchId = batchId, SourceType = sourceType, OrderId = orderId, Amount = Money(amount), RecognizedAt = now,
            Note = note is { Length: > 300 } ? note[..300] : note,
        });
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("revenue_line", orderId, "recognize", null, new { batchId, sourceType, orderId, amount = Money(amount) }, now, ct);
    }

    /// <summary>Tiền cọc còn chưa trừ vào tiền hàng của các đợt đã nghiệm thu (BR-164: cọc tính trên cả đơn).</summary>
    public async Task<decimal> DepositCreditAsync(SalesOrder order, CancellationToken ct)
        => (order.DepositAmount ?? 0) - (await db.DeliveryAcceptances.Where(a => a.OrderId == order.OrderId && a.Status == "Confirmed")
            .SumAsync(a => (decimal?)a.DepositApplied, ct) ?? 0);

    /// <summary>
    /// BR-169: khách từ chối nhận hoặc không trả phần còn lại thì mất cọc; phần cọc chưa trừ vào hàng thành doanh thu đúng một lần;
    /// cua chưa giao xong được nhả về tồn để bán lại qua đơn có hoá đơn (ForfeitResale). Các đợt chưa giao bị huỷ.
    /// </summary>
    public async Task ForfeitAsync(SalesOrder order, string reason, DateTimeOffset now, CancellationToken ct)
    {
        var credit = await DepositCreditAsync(order, ct);
        // Đợt đã nghiệm thu nhưng chưa trả phần còn lại: coi như chưa giao (BR-168).
        var unpaid = await db.DeliveryAcceptances.Where(a => a.OrderId == order.OrderId && a.Status == "Confirmed" && a.BalanceDue > 0 && a.BalancePaidAt == null)
            .ToListAsync(ct);
        foreach (var a in unpaid)
        {
            credit += a.DepositApplied ?? 0;
            a.Status = "Refused";
            a.UpdatedAt = now;
            await CancelInvoicesAsync(order.OrderId, a.TrancheId, "Khách không trả phần còn lại (BR-168)", now, ct);
            var tranche = await db.DeliveryTranches.SingleAsync(t => t.TrancheId == a.TrancheId, ct);
            tranche.Status = "Cancelled";
            tranche.UpdatedAt = now;
        }
        var unpaidTranches = unpaid.Select(u => (long?)u.TrancheId).ToList();
        var open = await db.InventoryAllocations.Where(a => a.OrderId == order.OrderId && a.ReleasedAt == null &&
            (a.Status == "Active" || a.Status == "Shipped" || unpaidTranches.Contains(a.TrancheId))).ToListAsync(ct);
        foreach (var allocation in open) await allocations.ReleaseAsync(allocation, $"Mất cọc: {reason}", ct);
        var tranches = await db.DeliveryTranches.Where(t => t.OrderId == order.OrderId && (t.Status == "Planned" || t.Status == "Allocated" || t.Status == "Dispatched"))
            .ToListAsync(ct);
        foreach (var t in tranches) { t.Status = "Cancelled"; t.UpdatedAt = now; }
        var shipments = await db.Shipments.Where(s => s.OrderId == order.OrderId && (s.Status == "Scheduled" || s.Status == "Dispatched")).ToListAsync(ct);
        foreach (var s in shipments) { s.Status = s.Status == "Dispatched" ? "Refused" : "Cancelled"; s.UpdatedAt = now; }
        await db.PaymentRequests.Where(r => r.OrderId == order.OrderId && r.Status == "Pending")
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.Status, "Cancelled").SetProperty(r => r.UpdatedAt, now), ct);
        var previous = order.Status;
        order.Status = PreorderStatus.Forfeited;
        order.ForfeitedAt = order.UpdatedAt = now;
        order.CancelReason = reason.Length > 300 ? reason[..300] : reason;
        await db.SaveChangesAsync(ct);
        await RecognizeAsync(order.BatchId, "ForfeitedDeposit", order.OrderId, credit, $"Mất cọc đơn {order.OrderNo}", now, ct);
        // Đợt đã giao và đã trả đủ vẫn là doanh thu của đơn đã giao.
        var delivered = await db.Invoices.Where(i => i.OrderId == order.OrderId && i.Status == "Active").SumAsync(i => (decimal?)i.Amount, ct) ?? 0;
        await RecognizeAsync(order.BatchId, "PreOrderDelivered", order.OrderId, delivered, $"Đợt đã giao của đơn {order.OrderNo} trước khi mất cọc", now, ct);
        await audit.WriteAsync("sales_order", order.OrderId, "forfeit", new { status = previous }, new { order.Status, forfeited = Money(credit), reason }, now, ct);
    }

    /// <summary>
    /// Sau mỗi thay đổi đợt giao: mọi đợt đã xong (nghiệm thu và trả đủ, hoặc huỷ) thì chốt đơn. Cọc chưa trừ hết vào tiền hàng được hoàn
    /// (phần còn lại âm, BR-167; thiếu cua, BR-160). Có đợt đã giao thì đơn Delivered và chờ hết hạn đổi trả; không đợt nào giao thì đơn Refunded.
    /// </summary>
    public async Task FinalizeIfDoneAsync(SalesOrder order, DateTimeOffset now, CancellationToken ct)
    {
        if (order.Status is not (PreorderStatus.Confirmed or OrderStatus.Delivering)) return;
        var tranches = await db.DeliveryTranches.Where(t => t.OrderId == order.OrderId).ToListAsync(ct);
        if (tranches.Any(t => t.Status is "Planned" or "Allocated" or "Dispatched" or "Accepted")) return;
        var account = await db.BatchAccounts.SingleAsync(a => a.BatchId == order.BatchId, ct);
        var credit = await DepositCreditAsync(order, ct);
        if (credit > 0)
            await refunds.CreateRefundAsync(account.BatchAccountId, Money(credit), null, order.OrderId,
                $"Hoàn phần cọc chưa trừ vào tiền hàng của đơn {order.OrderNo} (BR-160, BR-167)", now, ct);
        var previous = order.Status;
        if (tranches.Any(t => t.Status == "Completed"))
        {
            order.Status = OrderStatus.Delivered;
            order.DeliveredAt = now;
            order.ReturnWindowEndsAt = await db.Shipments.Where(s => s.OrderId == order.OrderId && s.Status == "Accepted").MaxAsync(s => s.ReturnWindowEndsAt, ct);
        }
        else
        {
            order.Status = PreorderStatus.Refunded;
            order.RefundedAt = now;
        }
        order.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, "finalize_delivery", new { status = previous }, new { order.Status, refunded = Money(credit) }, now, ct);
    }

    /// <summary>Hạn đổi trả (BR-172).</summary>
    public async Task<DateTimeOffset> ReturnWindowEndAsync(DateTimeOffset deliveredAt, CancellationToken ct)
        => deliveredAt.AddHours(await parameters.GetIntAsync(ParamKeys.ReturnWindowHours, deliveredAt, ct));
}
