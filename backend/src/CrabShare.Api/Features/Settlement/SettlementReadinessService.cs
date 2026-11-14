using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Jobs;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Settlement;

public sealed record ReadinessCondition(int No, string Code, string Description, bool Met, int Pending);

public sealed record SettlementReadinessResponse(string BatchCode, string BatchStatus, bool Ready, IReadOnlyList<ReadinessCondition> Conditions);

/// <summary>
/// BR-183: Lô chuyển sang chờ quyết toán khi đủ sáu điều kiện; hệ thống tự kiểm và hiện điều kiện nào còn thiếu.
/// (1) mọi con cua đã nhận đã giao, bán, chết hoặc huỷ; (2) mọi đơn đặt trước ở trạng thái cuối; (3) đơn có hoá đơn và đơn hàng cuối đã thu đủ;
/// (4) mọi lệnh hoàn tiền cho khách đã thành công; (5) hết mọi hạn đổi trả và không còn khiếu nại mở; (6) không còn giao dịch tiền chưa khớp.
/// </summary>
public sealed class SettlementReadinessService(AppDbContext db, TimeProvider clock, IAuditLog audit, BatchAccess access)
{
    private static readonly string[] Watching = ["Selling", "Liquidating"];

    /// <param name="investorId">Người đang xem, nếu là nhà đầu tư: nhà đầu tư có vốn đã chốt ở Lô được xem sáu điều kiện (BR-183, BR-232).</param>
    public async Task<SettlementReadinessResponse> CheckAsync(string batchCode, CancellationToken ct, long? investorId = null)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        var isInvestorOfBatch = investorId is { } uid && await db.CapitalShares.AnyAsync(c => c.BatchId == batch.BatchId && c.InvestorId == uid, ct);
        if (!isInvestorOfBatch) await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var conditions = await ConditionsAsync(batch, ct);
        return new SettlementReadinessResponse(batch.BatchCode, batch.Status, conditions.All(c => c.Met), conditions);
    }

    public async Task<IReadOnlyList<ReadinessCondition>> ConditionsAsync(Batch batch, CancellationToken ct)
    {
        var id = batch.BatchId;
        var now = clock.GetUtcNow();
        var crabs = await db.CrabUnits.CountAsync(c => c.BatchId == id && !(c.InventoryStatus == "Delivered" || c.InventoryStatus == "Sold"
            || c.InventoryStatus == "Dead" || c.InventoryStatus == "Destroyed"), ct);
        var preorders = await db.SalesOrders.CountAsync(o => o.BatchId == id && o.OrderType == "PreOrder"
            && !(o.Status == "Completed" || o.Status == "Forfeited" || o.Status == "Refunded" || o.Status == "Cancelled" || o.Status == "Returned"), ct);
        var unpaid = await db.SalesOrders.CountAsync(o => o.BatchId == id && (o.OrderType == "InvoicedSale" || o.OrderType == "FinalOrder") && o.Status == "PendingPayment", ct);
        var account = await db.BatchAccounts.AsNoTracking().Where(a => a.BatchId == id).Select(a => (long?)a.BatchAccountId).SingleOrDefaultAsync(ct) ?? 0;
        var refunds = await db.PaymentInstructions.CountAsync(i => i.BatchAccountId == account && i.InstructionType == "Refund" && i.OrderId != null && i.Status != "Succeeded", ct);
        var windows = await db.Shipments.CountAsync(s => s.BatchId == id && s.Status == "Accepted" && s.ReturnWindowEndsAt > now, ct)
            + await db.CustomerClaims.CountAsync(c => db.SalesOrders.Any(o => o.OrderId == c.OrderId && o.BatchId == id)
                && (c.Status == "Open" || c.Status == "OperatorAccepted" || c.Status == "OperatorRejected" || c.Status == "Escalated"), ct);
        var unmatched = await db.ProviderTransactions.CountAsync(t => t.BatchAccountId == account && t.Direction == "In" && t.MatchStatus == "Unmatched", ct);
        return
        [
            new(1, "crabs_closed", "Mọi con cua đã nhận đã được giao, bán, ghi chết hoặc huỷ", crabs == 0, crabs),
            new(2, "preorders_final", "Mọi đơn đặt trước ở trạng thái cuối: hoàn tất, mất cọc, đã hoàn hoặc đã trả hàng", preorders == 0, preorders),
            new(3, "direct_sales_paid", "Đơn có hoá đơn và đơn hàng cuối đã thu đủ tiền", unpaid == 0, unpaid),
            new(4, "refunds_done", "Mọi lệnh hoàn tiền cho khách đã thành công", refunds == 0, refunds),
            new(5, "returns_closed", "Mọi hạn đổi trả đã qua và không còn khiếu nại đang mở", windows == 0, windows),
            new(6, "money_matched", "Không còn giao dịch tiền chưa khớp của Lô chờ đối soát", unmatched == 0, unmatched),
        ];
    }

    /// <summary>Lô đang bán hoặc đang thanh lý đủ sáu điều kiện thì chuyển AwaitingSettlement.</summary>
    public async Task<int> AdvanceAsync(CancellationToken ct)
    {
        var candidates = await db.Batches.AsNoTracking().Where(b => Watching.Contains(b.Status)).Select(b => b.BatchId).ToListAsync(ct);
        var moved = 0;
        foreach (var id in candidates)
        {
            var done = await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var batch = await db.Batches.SingleAsync(b => b.BatchId == id, ct);
                if (!Watching.Contains(batch.Status)) return false;
                // Lô chưa có giao dịch nào (không nhận cua) không tự chuyển.
                if (!await db.CrabUnits.AnyAsync(c => c.BatchId == id, ct)) return false;
                if (!(await ConditionsAsync(batch, ct)).All(c => c.Met)) return false;
                var now = clock.GetUtcNow();
                var before = batch.Status;
                batch.Status = "AwaitingSettlement";
                batch.AwaitingSettlementAt = batch.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
                await audit.WriteAsync("batch", id, "await_settlement", new { status = before }, new { batch.Status }, now, ct);
                return true;
            }, ct);
            if (done) moved++;
        }
        return moved;
    }
}

public sealed class SettlementReadinessJob(IServiceScopeFactory scopes, ILogger<SettlementReadinessJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Settlement:Jobs:Enabled";
    private readonly bool enabled = config.GetValue(EnabledKey, true);
    protected override TimeSpan Interval => TimeSpan.FromMinutes(10);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
        => enabled ? base.ExecuteAsync(stoppingToken) : Task.CompletedTask;

    protected override async Task RunAsync(IServiceProvider services, CancellationToken ct)
    {
        await services.GetRequiredService<CollectiveDecisionService>().CloseExpiredAsync(ct);
        await services.GetRequiredService<SettlementReadinessService>().AdvanceAsync(ct);
    }
}
