using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Việc của <see cref="OrderCompletionJob"/>, tách ra để test gọi thẳng: đơn <c>Delivered</c> đã qua
/// <c>return_window_ends_at</c> và không có khiếu nại đang mở → <c>Completed</c>. Đơn Completed là doanh thu lô
/// (<c>v_batch_actual_revenue</c>, BR-19, Settlement đọc). Mỗi đơn một transaction có khoá chuỗi audit, UPDATE có điều kiện;
/// một đơn lỗi không chặn các đơn còn lại. Job không có người thao tác nên audit không có actor.
/// </summary>
public sealed class OrderCompletionService(AppDbContext db, IAuditLog audit, TimeProvider clock, ILogger<OrderCompletionService> log)
{
    public const string CompleteAction = "complete";

    /// <summary>Số đơn tối đa mỗi lượt; chu kỳ 1 phút nên phần dư được xử lý ở lượt sau.</summary>
    public const int BatchSize = 200;

    /// <summary>Trả về số đơn đã chuyển Completed trong lượt này.</summary>
    public async Task<int> CompleteDueAsync(CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var orderIds = await db.SalesOrders.AsNoTracking()
            .Where(o => o.Status == "Delivered" && o.ReturnWindowEndsAt != null && o.ReturnWindowEndsAt <= now
                        && !o.Complaints.Any(c => c.Status == "Open" || c.Status == "OperatorResponded" || c.Status == "Escalated"))
            .OrderBy(o => o.ReturnWindowEndsAt).ThenBy(o => o.OrderId)
            .Select(o => o.OrderId)
            .Take(BatchSize)
            .ToListAsync(ct);

        var completed = 0;
        foreach (var orderId in orderIds)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                if (await db.InTransactionAsync(() => CompleteOrderAsync(orderId, now, ct), ct)) completed++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Không hoàn tất được đơn {OrderId}; sẽ thử lại ở lượt sau", orderId);
            }
        }
        if (completed > 0) log.LogInformation("Đã hoàn tất {Count} đơn hết hạn đổi trả", completed);
        return completed;
    }

    private async Task<bool> CompleteOrderAsync(long orderId, DateTimeOffset now, CancellationToken ct)
    {
        await audit.LockAsync(ct);
        var order = await db.SalesOrders.AsNoTracking()
            .Where(o => o.OrderId == orderId)
            .Select(o => new { o.Status, o.ReturnWindowEndsAt, o.TotalAmount, o.BatchId })
            .SingleOrDefaultAsync(ct);
        if (order is null || order.Status != "Delivered") return false;

        var changed = await db.SalesOrders
            .Where(o => o.OrderId == orderId && o.Status == "Delivered"
                        && o.ReturnWindowEndsAt != null && o.ReturnWindowEndsAt <= now
                        && !o.Complaints.Any(c => c.Status == "Open" || c.Status == "OperatorResponded" || c.Status == "Escalated"))
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, "Completed")
                .SetProperty(o => o.CompletedAt, now)
                .SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0) return false;

        await audit.WriteAsync("sales_order", orderId, CompleteAction, new { status = "Delivered" },
            new { status = "Completed", completedAt = now, returnWindowEndsAt = order.ReturnWindowEndsAt, totalAmount = (long)order.TotalAmount, batchId = order.BatchId },
            now, ct);
        return true;
    }
}
