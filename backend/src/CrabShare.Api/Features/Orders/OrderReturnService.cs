using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

public sealed class OrderReturnService(
    AppDbContext db, ICurrentUser me, IAuditLog audit, RefundService refunds, TimeProvider clock)
{
    public const string ReturnAction = "return";
    private static readonly string[] SettledStatuses = ["Approved", "PaidOut", "Closed"];

    public async Task<bool> CanReturnAsync(string orderNo, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct);
        if (order is null || order.CustomerId != me.UserId) return false;
        return await BlockAsync(order, now, ct) is null;
    }

    public Task<ReturnOrderResponse> ReturnAsync(string orderNo, ReturnOrderRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => ReturnInsideAsync(orderNo, req.Reason, ct), ct);

    private async Task<ReturnOrderResponse> ReturnInsideAsync(string orderNo, string rawReason, CancellationToken ct)
    {
        var reason = (rawReason ?? "").Trim();
        if (reason.Length is < 10 or > 300)
            throw new BusinessRuleException("order.return_reason_required",
                "Lý do trả hàng cần từ 10 đến 300 ký tự.");

        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);

        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.PaymentRequests)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
        if (order.CustomerId != me.UserId)
            throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");

        var block = await BlockAsync(order, now, ct);
        if (block is not null)
            throw new BusinessRuleException(block.Value.Code, block.Value.Message) { Details = block.Value.Details };

        var paid = order.PaymentRequests.Where(r => r.Status == "Paid").ToList();
        var refundAmount = paid.Sum(r => r.Amount);
        var accountId = paid[0].BatchAccountId;

        var changed = await db.SalesOrders
            .Where(o => o.OrderId == order.OrderId && o.Status == "Delivered"
                        && o.ReturnWindowEndsAt != null && o.ReturnWindowEndsAt > now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, "Returned")
                .SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0)
            throw new ConflictException("order.status_changed",
                "Trạng thái đơn vừa thay đổi, hãy tải lại rồi thử lại.");

        var note = $"Hoàn tiền trả hàng đơn {order.OrderNo}: {reason}";
        var instruction = await refunds.CreateRefundAsync(accountId, refundAmount, null, order.OrderId, note, now, ct);

        await audit.WriteAsync("sales_order", order.OrderId, ReturnAction,
            new { status = "Delivered" },
            new
            {
                status = "Returned",
                reason,
                refundAmount = (long)refundAmount,
                refundInstructionId = instruction.InstructionId,
            }, now, ct);

        return new ReturnOrderResponse(order.OrderNo, "Returned", (long)refundAmount, instruction.InstructionId);
    }

    private async Task<(string Code, string Message, object? Details)?> BlockAsync(
        SalesOrder order, DateTimeOffset now, CancellationToken ct)
    {
        if (order.Status == "Returned")
            return ("order.already_returned", "Đơn này đã được trả trước đó.", new { order.OrderNo, order.Status });
        if (order.Status != "Delivered")
            return ("order.return_not_delivered",
                "Chỉ trả được đơn đang ở trạng thái đã giao, trong hạn đổi trả.",
                new { order.OrderNo, order.Status });
        if (order.ReturnWindowEndsAt is null || now >= order.ReturnWindowEndsAt)
            return ("order.return_window_closed", "Đã hết hạn trả hàng của đơn này.",
                new { order.OrderNo, order.ReturnWindowEndsAt });

        var blockingComplaint = await db.Complaints.AsNoTracking()
            .AnyAsync(c => c.OrderId == order.OrderId && c.Status != "Rejected", ct);
        if (blockingComplaint)
            return ("order.return_blocked_by_complaint",
                "Đơn đang có khiếu nại chưa kết thúc bằng bác bỏ, không trả hàng chồng lên khiếu nại.",
                new { order.OrderNo });

        if (order.PaymentRequests.Count == 0)
        {
            order = await db.SalesOrders.AsNoTracking().Include(o => o.PaymentRequests)
                .SingleAsync(o => o.OrderId == order.OrderId, ct);
        }
        var paid = order.PaymentRequests.Where(r => r.Status == "Paid").ToList();
        if (paid.Count == 0)
            return ("order.return_nothing_paid", "Đơn chưa có khoản thu nào đã thanh toán nên không hoàn được.",
                new { order.OrderNo });

        var accountId = paid[0].BatchAccountId;
        var accountOpen = await db.BatchAccounts.AsNoTracking()
            .AnyAsync(a => a.BatchAccountId == accountId && a.Status == "Open", ct);
        if (!accountOpen)
            return ("order.return_batch_account_closed",
                "Tài khoản lô không còn mở nên không lập được lệnh hoàn.",
                new { order.OrderNo, order.BatchId });

        var settled = await db.Settlements.AsNoTracking()
            .AnyAsync(s => s.BatchId == order.BatchId && SettledStatuses.Contains(s.Status), ct);
        if (settled)
            return ("order.return_batch_settled",
                "Lô đã quyết toán nên không trả hàng và hoàn tiền từ đơn này.",
                new { order.OrderNo, order.BatchId });

        return null;
    }
}
