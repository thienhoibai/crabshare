using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Jobs;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

/// <summary>
/// Việc định kỳ sau giao hàng: quá hạn trả phần còn lại thì mất cọc (BR-168, BR-169); khiếu nại quá hạn phản hồi chuyển Admin (BR-172);
/// hết hạn đổi trả không còn khiếu nại mở thì đơn hoàn tất và ghi dòng doanh thu (BR-175, BR-184).
/// </summary>
public sealed class DeliveryJobService(AppDbContext db, TimeProvider clock, IAuditLog audit, SalesLedger ledger, ClaimService claims)
{
    public async Task<(int Forfeited, int Escalated, int Completed)> RunAsync(CancellationToken ct)
    {
        var forfeited = await ForfeitOverdueBalancesAsync(ct);
        var escalated = await claims.EscalateOverdueAsync(ct);
        var completed = await CompleteOrdersAsync(ct);
        return (forfeited, escalated, completed);
    }

    public async Task<int> ForfeitOverdueBalancesAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var orderIds = await db.DeliveryAcceptances.Where(a => a.Status == "Confirmed" && a.BalanceDue > 0 && a.BalancePaidAt == null && a.BalanceDueAt < now)
            .Select(a => a.OrderId).Distinct().ToListAsync(ct);
        var count = 0;
        foreach (var id in orderIds)
        {
            var done = await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var order = await db.SalesOrders.SingleAsync(o => o.OrderId == id, ct);
                if (order.Status is not (OrderStatus.Delivering or Sales.PreorderStatus.Confirmed)) return false;
                await ledger.ForfeitAsync(order, "Quá hạn trả phần còn lại (BR-168)", clock.GetUtcNow(), ct);
                return true;
            }, ct);
            if (done) count++;
        }
        return count;
    }

    /// <summary>BR-175: chỉ khi hết hạn đổi trả và không còn khiếu nại mở thì tiền hàng mới vào doanh thu (đã trừ tiền hoàn khiếu nại).</summary>
    public async Task<int> CompleteOrdersAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var due = await db.SalesOrders.Where(o => o.OrderType == "PreOrder" && o.Status == OrderStatus.Delivered && o.ReturnWindowEndsAt <= now
                && !db.CustomerClaims.Any(c => c.OrderId == o.OrderId && (c.Status == "Open" || c.Status == "OperatorAccepted" || c.Status == "OperatorRejected" || c.Status == "Escalated")))
            .Select(o => o.OrderId).ToListAsync(ct);
        foreach (var id in due)
        {
            await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var order = await db.SalesOrders.SingleAsync(o => o.OrderId == id, ct);
                if (order.Status != OrderStatus.Delivered) return;
                var at = clock.GetUtcNow();
                var invoiced = await db.Invoices.Where(i => i.OrderId == id && i.Status == "Active").SumAsync(i => (decimal?)i.Amount, ct) ?? 0;
                var refunded = await db.CustomerClaims.Where(c => c.OrderId == id && c.Status == "Accepted").SumAsync(c => (decimal?)c.RefundAmount, ct) ?? 0;
                order.Status = OrderStatus.Completed;
                order.CompletedAt = order.UpdatedAt = at;
                await db.SaveChangesAsync(ct);
                await ledger.RecognizeAsync(order.BatchId, "PreOrderDelivered", id, Math.Max(0, invoiced - refunded), $"Đơn đặt trước {order.OrderNo}", at, ct);
                await audit.WriteAsync("sales_order", id, "complete", new { status = OrderStatus.Delivered }, new { order.Status, invoiced = (long)invoiced, refunded = (long)refunded }, at, ct);
            }, ct);
        }
        return due.Count;
    }
}

public sealed class DeliveryJob(IServiceScopeFactory scopes, ILogger<DeliveryJob> logger, IConfiguration config) : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Delivery:Jobs:Enabled";
    private readonly bool enabled = config.GetValue(EnabledKey, true);
    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
        => enabled ? base.ExecuteAsync(stoppingToken) : Task.CompletedTask;

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<DeliveryJobService>().RunAsync(ct);
}
