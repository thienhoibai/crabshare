using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Jobs;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Sales;

/// <summary>
/// Sổ đặt trước của Lô: tỷ lệ đặt trước (BR-077, BR-078), xử lý đơn khi Lô mở (BR-083) hoặc huỷ (BR-079, BR-096, BR-097).
/// Thay bản rỗng NoBatchLifecycleHooks của nhóm G1.
/// </summary>
public sealed class PreorderLedger(AppDbContext db, IAuditLog audit, TimeProvider clock, RefundService refunds) : IBatchLifecycleHooks
{
    public async Task<int> DepositedPreorderCrabsAsync(long batchId, CancellationToken ct)
        => await db.SalesOrderLines.Where(l => l.BatchId == batchId && db.SalesOrders.Any(o => o.OrderId == l.OrderId && o.OrderType == "PreOrder" &&
                (o.Status == PreorderStatus.Deposited || o.Status == PreorderStatus.Confirmed)))
            .SumAsync(l => (int?)l.ConvertedCrabs, ct) ?? 0;

    public async Task OnBatchOpenedAsync(Batch batch, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var orders = await db.SalesOrders.Where(o => o.BatchId == batch.BatchId && o.OrderType == "PreOrder" &&
            (o.Status == PreorderStatus.Deposited || o.Status == PreorderStatus.CancelRequested || o.Status == PreorderStatus.PendingDeposit)).ToListAsync(ct);
        foreach (var o in orders)
        {
            var before = o.Status;
            switch (o.Status)
            {
                case PreorderStatus.Deposited:
                    o.Status = PreorderStatus.Confirmed;
                    o.ConfirmedAt = now;
                    break;
                case PreorderStatus.CancelRequested:
                    // Huỷ sau khi cọc trong lúc gọi vốn, Lô mở: mất cọc (BR-096, BR-097).
                    o.Status = PreorderStatus.Forfeited;
                    o.ForfeitedAt = now;
                    break;
                default:
                    // Sau khi Lô mở không nhận cọc mới (BR-086).
                    o.Status = PreorderStatus.Cancelled;
                    o.CancelledAt = now;
                    o.CancelReason = "Lô đã mở trước khi đơn được cọc";
                    foreach (var r in await db.PaymentRequests.Where(r => r.OrderId == o.OrderId && r.Status == "Pending").ToListAsync(ct))
                    {
                        r.Status = "Cancelled";
                        r.UpdatedAt = now;
                    }
                    break;
            }
            o.UpdatedAt = now;
            await audit.WriteAsync("sales_order", o.OrderId, "batch_opened", new { status = before }, new { o.Status }, now, ct);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Lô huỷ hoặc không mở: hoàn mọi khoản cọc, kể cả đơn đã huỷ (BR-079, BR-096).</summary>
    public async Task OnBatchCancelledAsync(Batch batch, string reason, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var account = await db.BatchAccounts.SingleOrDefaultAsync(a => a.BatchId == batch.BatchId, ct);
        var orders = await db.SalesOrders.Where(o => o.BatchId == batch.BatchId && o.OrderType == "PreOrder" &&
            (o.Status == PreorderStatus.Deposited || o.Status == PreorderStatus.Confirmed || o.Status == PreorderStatus.CancelRequested ||
             o.Status == PreorderStatus.PendingDeposit)).ToListAsync(ct);
        foreach (var o in orders)
        {
            var before = o.Status;
            if (o.Status == PreorderStatus.PendingDeposit)
            {
                o.Status = PreorderStatus.Cancelled;
                o.CancelledAt = now;
                foreach (var r in await db.PaymentRequests.Where(r => r.OrderId == o.OrderId && r.Status == "Pending").ToListAsync(ct))
                {
                    r.Status = "Cancelled";
                    r.UpdatedAt = now;
                }
            }
            else
            {
                if (account is not null && o.DepositAmount is > 0)
                    await refunds.CreateRefundAsync(account.BatchAccountId, o.DepositAmount.Value, null, o.OrderId,
                        $"Hoàn cọc đặt trước {o.OrderNo}: {reason}", now, ct);
                o.Status = PreorderStatus.Refunded;
                o.RefundedAt = now;
            }
            o.CancelReason ??= reason;
            o.UpdatedAt = now;
            await audit.WriteAsync("sales_order", o.OrderId, "batch_cancelled", new { status = before }, new { o.Status, reason }, now, ct);
        }
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Cọc đặt trước về: đơn PendingDeposit → Deposited (lô P đang gọi vốn) hoặc Confirmed (lô T, A đã duyệt).</summary>
public sealed class PreorderDepositHandler(AppDbContext db, IAuditLog audit, PartyDirectory parties, RefundService refunds,
    ILogger<PreorderDepositHandler> log) : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.PreOrderDeposit;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } id ? await db.SalesOrders.Include(o => o.Batch).SingleOrDefaultAsync(o => o.OrderId == id, ct) : null;
        if (order is null)
        {
            log.LogError("Khoản cọc {PaymentRequestId} đã Paid nhưng không có đơn #{OrderId}", request.PaymentRequestId, request.OrderId);
            return;
        }
        if (order.Status != PreorderStatus.PendingDeposit)
        {
            // Đơn đã huỷ trước khi tiền tới: hoàn lại khoản cọc (BR-091).
            await refunds.CreateRefundAsync(request.BatchAccountId, request.Amount, null, order.OrderId,
                $"Hoàn cọc đến sau khi đơn {order.OrderNo} đã {order.Status}", paidAt, ct);
            await audit.WriteAsync("sales_order", order.OrderId, "deposit_after_close", new { order.Status }, new { request.ReferenceCode, amount = (long)request.Amount }, paidAt, ct);
            return;
        }
        var opened = order.Batch.BatchMode != "P" || order.Batch.Status != "Funding";
        order.Status = opened ? PreorderStatus.Confirmed : PreorderStatus.Deposited;
        order.DepositedAt = paidAt;
        if (opened) order.ConfirmedAt = paidAt;
        order.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        if (order.CustomerPartyId is { } partyId)
            await parties.AddParticipantAsync(order.BatchId, partyId, ParticipantRoles.Customer, ct);
        await audit.WriteAsync("sales_order", order.OrderId, "deposit_paid", new { status = PreorderStatus.PendingDeposit },
            new { order.Status, request.ReferenceCode, amount = (long)request.Amount }, paidAt, ct);
    }
}

/// <summary>Đơn giữ chỗ quá thời gian giữ đơn mà chưa cọc thì huỷ và nhả số lượng (BR-090).</summary>
public sealed class PreorderHoldExpiryService(AppDbContext db, IAuditLog audit, TimeProvider clock)
{
    public Task<int> ExpireAsync(CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var now = clock.GetUtcNow();
        var due = await db.SalesOrders.Where(o => o.OrderType == "PreOrder" && o.Status == PreorderStatus.PendingDeposit && o.HoldExpiresAt <= now)
            .ToListAsync(ct);
        foreach (var o in due)
        {
            o.Status = PreorderStatus.Cancelled;
            o.CancelledAt = now;
            o.CancelReason = "Hết thời gian giữ đơn mà chưa cọc";
            o.UpdatedAt = now;
            foreach (var r in await db.PaymentRequests.Where(r => r.OrderId == o.OrderId && r.Status == "Pending").ToListAsync(ct))
            {
                r.Status = "Expired";
                r.UpdatedAt = now;
            }
            await audit.WriteAsync("sales_order", o.OrderId, "hold_expired", new { status = PreorderStatus.PendingDeposit }, new { o.Status }, now, ct);
        }
        return due.Count;
    }, ct);
}

public sealed class PreorderHoldExpiryJob(IServiceScopeFactory scopes, ILogger<PreorderHoldExpiryJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Sales:HoldExpiryJob:Enabled";
    private readonly bool enabled = config.GetValue(EnabledKey, true);
    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
        => enabled ? base.ExecuteAsync(stoppingToken) : Task.CompletedTask;

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<PreorderHoldExpiryService>().ExpireAsync(ct);
}
