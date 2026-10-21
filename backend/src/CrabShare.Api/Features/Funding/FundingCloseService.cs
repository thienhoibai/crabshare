using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Funding;

/// <summary>
/// Việc nền của gọi vốn (TH-07, TL-17 §6 bước 6–8, BR-06):
/// 1. Khoản giữ chỗ quá <c>expires_at</c> → <c>Expired</c>; mã VietQR góp vốn còn <c>Pending</c> của nó → <c>Expired</c>.
/// 2. Lô <c>Funding</c> tới <c>funding_deadline</c> (hoặc đã nhận đủ <c>max_capital</c>, TL-17 bước 7): ép hết hạn mọi giữ chỗ còn lại, rồi
///    - vốn đã xác nhận ≥ <c>min_viable_capital</c> → chụp <c>capital_share</c> từng nhà đầu tư, ghi <c>total_confirmed_capital</c> + <c>capital_closed_at</c>
///      (lô vẫn ở <c>Funding</c> tới khi thả giống, xem <c>Batches/FundingReadiness</c>);
///    - thiếu → lô <c>Cancelled</c>, lập lệnh hoàn 100% từng khoản <c>Confirmed</c> qua <see cref="RefundService"/>, huỷ cam kết bao tiêu và hoàn cọc đã giữ.
/// Mỗi bước chạy trong transaction có khoá chuỗi audit. Webhook tiền về cũng khoá chuỗi audit trước, nên job và webhook chạy lần lượt:
/// một khoản giữ chỗ chỉ đi tới đúng một trạng thái cuối (TL-17 §7).
/// </summary>
public sealed class FundingCloseService(AppDbContext db, IAuditLog audit, TimeProvider clock, RefundService refunds)
{
    public const string OutcomeCapitalClosed = "CapitalClosed";
    public const string OutcomeCancelled = "Cancelled";

    /// <summary>Một lượt của job: hết hạn giữ chỗ rồi chốt các lô tới hạn. Mỗi lô một transaction riêng, lô lỗi không chặn lô khác.</summary>
    public async Task<FundingCloseResult> RunAsync(CancellationToken ct)
    {
        var expired = await ExpireReservationsAsync(ct);
        var batches = new List<BatchCloseOutcome>();
        foreach (var batchId in await DueBatchIdsAsync(ct))
            if (await CloseBatchAsync(batchId, ct) is { } outcome)
                batches.Add(outcome);
        return new FundingCloseResult(expired, batches);
    }

    /// <summary>Khoản giữ chỗ quá hạn → Expired. Trả về số khoản vừa đổi.</summary>
    public Task<int> ExpireReservationsAsync(CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var now = Now();
        var due = await db.Contributions.Where(c => c.Status == "Reserved" && c.ExpiresAt <= now).ToListAsync(ct);
        foreach (var contribution in due)
            await ExpireAsync(contribution, "Hết thời gian giữ chỗ", now, ct);

        // Mã góp vốn còn Pending mà đã quá hạn (khoản góp đã hết hạn hoặc huỷ từ trước): đổi hẳn sang Expired
        var stale = await db.PaymentRequests
            .Where(r => r.Purpose == PaymentPurposes.Contribution && r.Status == "Pending" && r.ExpiresAt <= now)
            .ToListAsync(ct);
        foreach (var request in stale)
        {
            request.Status = "Expired";
            request.UpdatedAt = now;
            await audit.WriteAsync("payment_request", request.PaymentRequestId, "expire", new { status = "Pending" },
                new { status = "Expired", reason = "Quá hạn thanh toán", request.ReferenceCode }, now, ct);
        }
        return due.Count;
    }, ct);

    /// <summary>Lô đang gọi vốn, chưa chốt, đã tới hạn hoặc đã đủ max_capital.</summary>
    public async Task<IReadOnlyList<long>> DueBatchIdsAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return await db.Batches.AsNoTracking()
            .Where(b => b.Status == "Funding" && b.CapitalClosedAt == null && b.FundingDeadline != null
                        && (b.FundingDeadline <= now
                            || (b.Contributions.Where(c => c.Status == "Confirmed").Sum(c => (decimal?)c.Amount) ?? 0) >= b.MaxCapital))
            .OrderBy(b => b.FundingDeadline)
            .Select(b => b.BatchId)
            .ToListAsync(ct);
    }

    /// <summary>Chốt vốn hoặc huỷ một lô. Trả null khi lô không còn cần xử lý (lượt khác đã làm, hoặc chưa tới hạn).</summary>
    public Task<BatchCloseOutcome?> CloseBatchAsync(long batchId, CancellationToken ct) => db.InTransactionAsync<BatchCloseOutcome?>(async () =>
    {
        // Giao thức chung: khoá chuỗi audit trước, rồi khoá dòng lô (giống FundingService.ReserveAsync)
        await audit.LockAsync(ct);
        var batch = await db.Batches
            .FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_id = {batchId}")
            .Include(b => b.BatchAccount)
            .SingleOrDefaultAsync(ct);
        var now = Now();
        if (batch is not { Status: "Funding", CapitalClosedAt: null, FundingDeadline: { } deadline }) return null;

        var contributions = await db.Contributions.Where(c => c.BatchId == batchId).ToListAsync(ct);
        var confirmed = contributions.Where(c => c.Status == "Confirmed").ToList();
        var confirmedTotal = confirmed.Sum(c => c.Amount);
        var deadlinePassed = deadline <= now;
        if (!deadlinePassed && confirmedTotal < batch.MaxCapital) return null;
        var reason = deadlinePassed ? "funding_deadline" : "max_capital_reached";

        // Còn giữ chỗ lúc chốt thì ép hết hạn trước khi so min/max (TL-17 §8: không kéo dài cửa sổ đã công bố)
        foreach (var reserved in contributions.Where(c => c.Status == "Reserved"))
            await ExpireAsync(reserved, deadlinePassed ? "Hết hạn gọi vốn" : "Lô đã nhận đủ vốn tối đa", now, ct);

        return confirmedTotal >= batch.MinViableCapital
            ? await CloseCapitalAsync(batch, confirmed, confirmedTotal, reason, now, ct)
            : await CancelUnderfundedAsync(batch, confirmed, confirmedTotal, now, ct);
    }, ct);

    private async Task<BatchCloseOutcome> CloseCapitalAsync(Batch batch, List<Contribution> confirmed, decimal total, string reason,
        DateTimeOffset now, CancellationToken ct)
    {
        // Một nhà đầu tư có thể góp nhiều lần (lần lượt từng khoản giữ chỗ): gộp theo người, khoá PK (batch_id, investor_id)
        var shares = confirmed.GroupBy(c => c.InvestorId)
            .Select(g => new CapitalShare
            {
                BatchId = batch.BatchId, InvestorId = g.Key, ConfirmedAmount = g.Sum(c => c.Amount), SnapshottedAt = now, CreatedAt = now,
            })
            .OrderBy(s => s.InvestorId)
            .ToList();
        db.CapitalShares.AddRange(shares);
        batch.TotalConfirmedCapital = total;
        batch.CapitalClosedAt = now;
        batch.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("batch", batch.BatchId, "close_capital",
            new { status = batch.Status, capitalClosedAt = (DateTimeOffset?)null, totalConfirmedCapital = (long?)null },
            new
            {
                batch.BatchCode, status = batch.Status, capitalClosedAt = now, totalConfirmedCapital = (long)total, reason,
                minViableCapital = (long)batch.MinViableCapital, maxCapital = (long)batch.MaxCapital,
                shares = shares.Select(s => new { s.InvestorId, confirmedAmount = (long)s.ConfirmedAmount }),
            }, now, ct);
        return new BatchCloseOutcome(batch.BatchCode, OutcomeCapitalClosed, (long)total, shares.Count, 0);
    }

    private async Task<BatchCloseOutcome> CancelUnderfundedAsync(Batch batch, List<Contribution> confirmed, decimal total,
        DateTimeOffset now, CancellationToken ct)
    {
        batch.Status = "Cancelled";
        batch.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("batch", batch.BatchId, "cancel_underfunded", new { status = "Funding" }, new
        {
            batch.BatchCode, status = batch.Status, confirmedCapital = (long)total, minViableCapital = (long)batch.MinViableCapital,
            refundCount = confirmed.Count,
        }, now, ct);

        var account = batch.BatchAccount;
        if (account is null)
        {
            // Tiền chỉ về được tài khoản lô, nên không có tài khoản thì cũng không có khoản Confirmed nào để hoàn
            if (confirmed.Count > 0)
                throw new InvalidOperationException($"Lô {batch.BatchCode} có khoản góp đã xác nhận nhưng không có tài khoản chuyên dùng để hoàn tiền.");
            return new BatchCloseOutcome(batch.BatchCode, OutcomeCancelled, 0, 0, 0);
        }

        // BR-06: hoàn 100% vốn đã xác nhận của từng khoản. Khoản góp chuyển Refunded khi trung gian báo lệnh hoàn thành công (TH-10)
        var refundCount = 0;
        foreach (var contribution in confirmed.OrderBy(c => c.ContributionId))
        {
            await refunds.CreateRefundAsync(account.BatchAccountId, contribution.Amount, contribution.ContributionId, null,
                $"Hoàn 100% vốn góp: lô {batch.BatchCode} huỷ vì không đạt vốn tối thiểu", now, ct);
            refundCount++;
        }

        // Cam kết bao tiêu gắn với lô huỷ: huỷ cam kết, hoàn cọc đã giữ (TL-30)
        var offtakes = await db.OfftakeCommitments
            .Where(o => o.BatchId == batch.BatchId && (o.Status == "PendingHarvest" || o.Status == "WindowOpen"))
            .ToListAsync(ct);
        foreach (var offtake in offtakes)
        {
            var before = new { offtake.Status, offtake.DepositStatus };
            long? refundInstructionId = null;
            if (offtake.DepositStatus == "Held")
            {
                var refund = await refunds.CreateRefundAsync(account.BatchAccountId, offtake.DepositAmount, offtake.ContributionId, null,
                    $"Hoàn cọc bao tiêu #{offtake.OfftakeId}: lô {batch.BatchCode} huỷ", now, ct);
                refundInstructionId = refund.InstructionId;
                offtake.DepositStatus = "Refunded";
                refundCount++;
            }
            offtake.Status = "Cancelled";
            offtake.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, "cancel", before,
                new { offtake.Status, offtake.DepositStatus, reason = "batch_cancelled", refundInstructionId }, now, ct);
        }

        // Mã VietQR còn chờ của lô (góp vốn, cọc bao tiêu) không còn hiệu lực
        foreach (var request in await db.PaymentRequests.Where(r => r.BatchAccountId == account.BatchAccountId && r.Status == "Pending").ToListAsync(ct))
        {
            request.Status = "Cancelled";
            request.UpdatedAt = now;
            await audit.WriteAsync("payment_request", request.PaymentRequestId, "cancel", new { status = "Pending" },
                new { status = "Cancelled", reason = "Lô huỷ", request.ReferenceCode }, now, ct);
        }
        return new BatchCloseOutcome(batch.BatchCode, OutcomeCancelled, (long)total, confirmed.Select(c => c.InvestorId).Distinct().Count(), refundCount);
    }

    /// <summary>Giữ chỗ → Expired, kèm các mã VietQR còn chờ của nó. Chỉ gọi khi khoản đang Reserved (đã khoá chuỗi audit).</summary>
    private async Task ExpireAsync(Contribution contribution, string reason, DateTimeOffset now, CancellationToken ct)
    {
        contribution.Status = "Expired";
        contribution.UpdatedAt = now;
        var requests = await db.PaymentRequests
            .Where(r => r.ContributionId == contribution.ContributionId && r.Status == "Pending")
            .ToListAsync(ct);
        foreach (var request in requests)
        {
            request.Status = "Expired";
            request.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("contribution", contribution.ContributionId, "expire", new { status = "Reserved" }, new
        {
            status = "Expired", reason, contribution.ExpiresAt, expiredPaymentRequests = requests.Select(r => r.ReferenceCode),
        }, now, ct);
    }

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}

/// <param name="Outcome"><see cref="FundingCloseService.OutcomeCapitalClosed"/> hoặc <see cref="FundingCloseService.OutcomeCancelled"/>.</param>
/// <param name="RefundCount">Số lệnh hoàn vừa lập (vốn góp + cọc bao tiêu).</param>
public sealed record BatchCloseOutcome(string BatchCode, string Outcome, long ConfirmedCapital, int InvestorCount, int RefundCount);

public sealed record FundingCloseResult(int ExpiredReservations, IReadOnlyList<BatchCloseOutcome> Batches);
