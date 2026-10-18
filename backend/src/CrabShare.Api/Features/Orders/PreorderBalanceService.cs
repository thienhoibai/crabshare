using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Khi lô Harvesting: phát PreOrderBalance = total − deposit cho mọi đơn DepositPaid chưa có khoản balance.
/// Idempotent. Không phân bổ FIFO, không hoàn cọc, không đổi status đơn.
/// </summary>
public sealed class PreorderBalanceService(
    AppDbContext db, PaymentRequestService payments, IAuditLog audit, TimeProvider clock,
    ILogger<PreorderBalanceService> log)
{
    public const int BalanceDueHours = 48;

    public async Task<IssueBalancesResponse> IssueForBatchCodeAsync(string batchCode, CancellationToken ct)
    {
        var code = batchCode.Trim();
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        return await IssueForBatchAsync(batch.BatchId, ct);
    }

    public Task<IssueBalancesResponse> IssueForBatchAsync(long batchId, CancellationToken ct)
        => db.InTransactionAsync(() => IssueInsideAsync(batchId, ct), ct);

    public async Task<int> IssueForHarvestingBatchesAsync(CancellationToken ct)
    {
        var batchIds = await db.SalesOrders.AsNoTracking()
            .Where(o => o.OrderType == "PreOrder" && o.Status == "DepositPaid" && o.Batch.Status == "Harvesting")
            .Select(o => o.BatchId)
            .Distinct()
            .ToListAsync(ct);
        var issued = 0;
        foreach (var batchId in batchIds)
        {
            try
            {
                issued += (await IssueForBatchAsync(batchId, ct)).IssuedCount;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Không phát PreOrderBalance cho lô #{BatchId}; thử lại chu kỳ sau", batchId);
            }
        }
        return issued;
    }

    private async Task<IssueBalancesResponse> IssueInsideAsync(long batchId, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);

        var batch = await db.Batches.AsNoTracking()
                        .Include(b => b.BatchAccount)
                        .SingleOrDefaultAsync(b => b.BatchId == batchId, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.Status != "Harvesting")
            throw new BusinessRuleException("preorder.batch_not_harvesting",
                $"Lô {batch.BatchCode} chưa thu hoạch, chưa thu phần còn lại của đơn đặt trước.");
        if (batch.BatchAccount is null || batch.BatchAccount.Status != "Open")
            throw new BusinessRuleException("order.batch_account_unavailable",
                $"Lô {batch.BatchCode} chưa có tài khoản chuyên dùng để nhận tiền.");

        var orders = await db.SalesOrders
            .Include(o => o.PaymentRequests)
            .Where(o => o.BatchId == batchId && o.OrderType == "PreOrder" && o.Status == "DepositPaid")
            .OrderBy(o => o.OrderId)
            .ToListAsync(ct);

        var expiresAt = now.AddHours(BalanceDueHours);
        var issued = new List<string>();
        foreach (var order in orders)
        {
            if (order.PaymentRequests.Any(r => r.Purpose == PaymentPurposes.PreOrderBalance))
                continue;
            var deposit = (long)(order.DepositAmount ?? 0);
            var balance = (long)order.TotalAmount - deposit;
            if (balance <= 0)
            {
                log.LogWarning("Đơn {OrderNo} DepositPaid nhưng phần còn lại {Balance} ≤ 0; bỏ qua", order.OrderNo, balance);
                continue;
            }

            order.BalanceDueAt = expiresAt;
            order.UpdatedAt = now;
            await payments.CreateAsync(
                PaymentPurposes.PreOrderBalance, balance, batch.BatchAccount.BatchAccountId,
                batch.BatchAccount.ProviderAccountNo, expiresAt, PaymentTarget.ForOrder(order), null, ct);
            issued.Add(order.OrderNo);
        }

        await db.SaveChangesAsync(ct);
        if (issued.Count > 0)
            log.LogInformation("Đã phát {Count} PreOrderBalance cho lô {BatchCode}", issued.Count, batch.BatchCode);
        return new IssueBalancesResponse(batch.BatchCode, issued.Count, issued);
    }
}
