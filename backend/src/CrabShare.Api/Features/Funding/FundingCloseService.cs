using CrabShare.Api.Common.Auditing;
using CrabShare.SettlementEngine;
using CrabShare.Api.Features.Contracts;
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
///    - thiếu → lô <c>Cancelled</c>, lập lệnh hoàn 100% từng khoản <c>Confirmed</c> qua <see cref="RefundService"/>, huỷ mã VietQR góp vốn còn chờ.
/// Mỗi bước chạy trong transaction có khoá chuỗi audit. Webhook tiền về cũng khoá chuỗi audit trước, nên job và webhook chạy lần lượt:
/// một khoản giữ chỗ chỉ đi tới đúng một trạng thái cuối (TL-17 §7).
/// </summary>
public sealed class FundingCloseService(AppDbContext db, IAuditLog audit, TimeProvider clock, RefundService refunds,
    CrabShare.Api.Common.Parameters.PlatformParameters parameters, CrabShare.Api.Features.Batches.IBatchLifecycleHooks hooks,
    CrabShare.Api.Features.Parties.PartyDirectory parties)
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

    /// <summary>Lô đang gọi vốn, chưa chốt, đã tới hạn gọi vốn (BR-077: Lô mở hay không xét lúc hết hạn, vì đặt trước còn nhận tới hạn).</summary>
    public async Task<IReadOnlyList<long>> DueBatchIdsAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return await db.Batches.AsNoTracking()
            .Where(b => b.Status == "Funding" && b.CapitalClosedAt == null && b.FundingDeadline != null && b.FundingDeadline <= now)
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
        if (deadline > now) return null;

        // Còn giữ chỗ lúc chốt thì ép hết hạn trước khi xét (TL-17 §8: không kéo dài cửa sổ đã công bố)
        foreach (var reserved in contributions.Where(c => c.Status == "Reserved"))
            await ExpireAsync(reserved, "Hết hạn gọi vốn", now, ct);

        // BR-077, BR-080: Lô mở khi vốn đã xác nhận ≥ vốn tối thiểu khả thi và tỷ lệ đặt trước ≥ tỷ lệ tối thiểu.
        var perCrab = (long)(batch.StandardCostPerCrab ?? 0);
        var funded = perCrab > 0 ? (int)Math.Min(batch.SeedQuantity, (long)confirmedTotal / perCrab) : 0;
        var deposited = await hooks.DepositedPreorderCrabsAsync(batch.BatchId, ct);
        var ratio = funded > 0 ? deposited * 100m / funded : 0;
        var minRatio = await parameters.GetAsync(CrabShare.Api.Common.Parameters.ParamKeys.MinPreorderRatioPct, batch.FundingOpenAt, ct);
        if (confirmedTotal < batch.MinViableCapital || funded == 0)
            return await CancelUnderfundedAsync(batch, confirmed, confirmedTotal, "Vốn đã xác nhận thấp hơn vốn tối thiểu khả thi", now, ct);
        if (ratio < minRatio)
            return await CancelUnderfundedAsync(batch, confirmed, confirmedTotal,
                $"Tỷ lệ đặt trước {ratio:0.##}% thấp hơn mức tối thiểu {minRatio:0.##}%", now, ct);
        return await OpenBatchAsync(batch, confirmed, confirmedTotal, funded, perCrab, deposited, now, ct);
    }, ct);

    /// <summary>
    /// Lô mở (BR-080…083): chỉ mua và nuôi số con được cấp vốn; phần vốn lẻ không đủ một con hoàn cho nhà đầu tư theo tỷ lệ vốn,
    /// làm tròn phần dư lớn nhất; tỷ lệ vốn chốt trên phần vốn giữ lại; tạo các mốc giải ngân theo tỷ lệ (BR-146); Lô chuyển Sourcing.
    /// </summary>
    private async Task<BatchCloseOutcome> OpenBatchAsync(Batch batch, List<Contribution> confirmed, decimal total, int funded, long perCrab,
        int deposited, DateTimeOffset now, CancellationToken ct)
    {
        var retained = (long)funded * perCrab;
        var oddCapital = (long)total - retained;
        var byInvestor = confirmed.GroupBy(c => c.InvestorId).OrderBy(g => g.Key)
            .Select(g => (Key: g.Key, Weight: (long)g.Sum(c => c.Amount))).ToList();
        var refundShares = oddCapital > 0
            ? LargestRemainderAllocator.Allocate(oddCapital, byInvestor).ToDictionary(s => s.Key, s => s.Amount)
            : [];
        var shares = byInvestor.Select(g => new CapitalShare
        {
            BatchId = batch.BatchId, InvestorId = g.Key, ConfirmedAmount = g.Weight - refundShares.GetValueOrDefault(g.Key),
            SnapshottedAt = now, CreatedAt = now,
        }).Where(s => s.ConfirmedAmount > 0).ToList();
        db.CapitalShares.AddRange(shares);
        batch.TotalConfirmedCapital = retained;
        batch.CapitalClosedAt = now;
        batch.FundedQuantity = funded;
        batch.Status = "Sourcing";
        batch.SourcingStartedAt = now;
        batch.UpdatedAt = now;

        // BR-146: số tiền mốc = tỷ lệ của mốc × Chi phí chuẩn mỗi con × số con được cấp vốn; mốc cuối nhận phần làm tròn.
        var plan = await db.StandardCostTranchePlans.AsNoTracking()
            .Where(p => p.CostVersion.BatchId == batch.BatchId && p.CostVersion.Status == "Locked").OrderBy(p => p.TrancheNo).ToListAsync(ct);
        var allocated = 0L;
        for (var i = 0; i < plan.Count; i++)
        {
            var p = plan[i];
            var amount = i == plan.Count - 1 ? retained - allocated : CrabShare.Api.Features.Batches.BatchService.MilestoneAmount(p.Pct ?? 0, perCrab, funded);
            allocated += amount;
            if (amount <= 0) continue;
            db.DisbursementTranches.Add(new DisbursementTranche
            {
                BatchId = batch.BatchId, TrancheNo = p.TrancheNo, MilestoneKind = p.MilestoneKind ?? "Custom", MilestoneName = p.MilestoneName,
                Pct = p.Pct, PlannedAmount = amount, UnlockCondition = p.UnlockCondition, Status = "Planned", CreatedAt = now, UpdatedAt = now,
            });
        }
        await db.SaveChangesAsync(ct);

        // Phần vốn lẻ hoàn qua tổ chức trung gian, gắn vào khoản góp lớn nhất của từng nhà đầu tư.
        var refundCount = 0;
        if (batch.BatchAccount is { } account)
            foreach (var (investorId, amount) in refundShares.Where(r => r.Value > 0))
            {
                var contribution = confirmed.Where(c => c.InvestorId == investorId).OrderByDescending(c => c.Amount).First();
                await refunds.CreateRefundAsync(account.BatchAccountId, amount, contribution.ContributionId, null,
                    $"Hoàn phần vốn lẻ không đủ một con: Lô {batch.BatchCode}", now, ct);
                refundCount++;
            }

        foreach (var investorId in shares.Select(s => s.InvestorId))
            await parties.AddParticipantAsync(batch.BatchId, await parties.PartyIdOfUserAsync(investorId, ct),
                CrabShare.Api.Features.Parties.ParticipantRoles.Investor, ct);
        await hooks.OnBatchOpenedAsync(batch, ct);
        await audit.WriteAsync("batch", batch.BatchId, "open",
            new { status = "Funding", capitalClosedAt = (DateTimeOffset?)null },
            new
            {
                batch.BatchCode, status = batch.Status, capitalClosedAt = now, confirmedCapital = (long)total, retainedCapital = retained,
                oddCapitalRefunded = oddCapital, fundedQuantity = funded, costPerCrab = perCrab, depositedPreorderCrabs = deposited,
                shares = shares.Select(s => new { s.InvestorId, confirmedAmount = (long)s.ConfirmedAmount }),
            }, now, ct);
        return new BatchCloseOutcome(batch.BatchCode, OutcomeCapitalClosed, retained, shares.Count, refundCount);
    }

    private async Task<BatchCloseOutcome> CancelUnderfundedAsync(Batch batch, List<Contribution> confirmed, decimal total, string reason,
        DateTimeOffset now, CancellationToken ct)
    {
        batch.Status = "Cancelled";
        batch.CancelledAt = now;
        batch.CancelReason = reason;
        batch.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("batch", batch.BatchId, "cancel_underfunded", new { status = "Funding" }, new
        {
            batch.BatchCode, status = batch.Status, confirmedCapital = (long)total, minViableCapital = (long)batch.MinViableCapital,
            refundCount = confirmed.Count, reason,
        }, now, ct);
        // BR-079: hoàn mọi khoản cọc đặt trước, kể cả đơn đã huỷ.
        await hooks.OnBatchCancelledAsync(batch, reason, ct);

        // Hợp đồng chưa đủ chữ ký của lô huỷ không còn ký tiếp được; bản đã đủ chữ ký giữ làm hồ sơ
        await ContractVoiding.VoidUnsignedAsync(db, audit, confirmed.Select(c => c.ContributionId).ToList(), "Lô huỷ vì không đạt vốn tối thiểu", now, ct);

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

        // Cam kết bao tiêu và cọc của lô huỷ thuộc module Offtake (NH-14), không xử lý ở đây.

        // Mã VietQR góp vốn còn chờ của lô không còn hiệu lực
        foreach (var request in await db.PaymentRequests
                     .Where(r => r.BatchAccountId == account.BatchAccountId && r.Purpose == PaymentPurposes.Contribution && r.Status == "Pending")
                     .ToListAsync(ct))
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
        await ContractVoiding.VoidUnsignedAsync(db, audit, [contribution.ContributionId], reason, now, ct);
    }

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}

/// <param name="Outcome"><see cref="FundingCloseService.OutcomeCapitalClosed"/> hoặc <see cref="FundingCloseService.OutcomeCancelled"/>.</param>
/// <param name="RefundCount">Số lệnh hoàn vừa lập (vốn góp + cọc bao tiêu).</param>
public sealed record BatchCloseOutcome(string BatchCode, string Outcome, long ConfirmedCapital, int InvestorCount, int RefundCount);

public sealed record FundingCloseResult(int ExpiredReservations, IReadOnlyList<BatchCloseOutcome> Batches);
