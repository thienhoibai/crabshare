using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Settlement;

/// <summary>
/// UC39 duyệt quyết toán + phát lệnh chi trả + đóng lô (TH-14, TL-14 Bước 5–6, §6.6).
/// Duyệt: chỉ khi đã công bố, hết hạn góp ý và không còn góp ý Open → Approved (trigger khoá số liệu, BR-30), lập lệnh chi theo thứ tự
/// TL-14 §6.6: nộp thuế người nuôi khai thay (TaxPayment), thù lao + khấu hao cho người nuôi (Payout), từng nhà đầu tư (Payout gắn dòng).
/// Gửi lệnh đi qua <see cref="PayoutSendService"/>; khi mọi khoản của nhà đầu tư đã Succeeded thì bảng PaidOut, lô Closed
/// (dòng thuế không chặn việc đóng lô, TL-14 §6.6).
/// </summary>
public sealed class SettlementPayoutService(
    AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock, SettlementService settlements, PayoutSendService payouts)
{
    public Task<SettlementResponse> ApproveAsync(long settlementId, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var s = await db.Settlements
            .Include(x => x.Batch).ThenInclude(b => b.BatchAccount)
            .Include(x => x.Batch).ThenInclude(b => b.Operator)
            .Include(x => x.SettlementLines)
            .Include(x => x.SettlementFeedbacks)
            .SingleOrDefaultAsync(x => x.SettlementId == settlementId, ct)
            ?? throw new NotFoundException("settlement.not_found", "Không tìm thấy bảng quyết toán.");
        var now = Now();
        if (SettlementService.LockedStatuses.Contains(s.Status))
            throw new ConflictException("settlement.already_approved", "Bảng quyết toán đã được duyệt.");
        var isP = s.SettlementMode == "P";
        if (isP)
        {
            // BR-202: lô P công bố cho nhà đầu tư phản hồi trong hạn; hết hạn và không còn phản hồi chưa xử lý thì Admin duyệt.
            if (s.Status == "Draft")
                throw new BusinessRuleException("settlement.not_proposed", "Cần công bố bảng và chờ hết hạn góp ý trước khi duyệt.");
            if (s.SettlementFeedbacks.Any(f => f.Status == "Open"))
                throw new BusinessRuleException("settlement.open_feedback", "Còn góp ý của nhà đầu tư chưa trả lời.");
            if (s.FeedbackDeadline is not { } deadline)
                throw new BusinessRuleException("settlement.not_proposed", "Bảng chưa công bố nên chưa có hạn góp ý.");
            if (now < deadline)
                throw new BusinessRuleException("settlement.window_open", $"Chưa hết hạn góp ý ({deadline.ToOffsetVietnam():dd/MM/yyyy HH:mm}).");
        }
        if (s.Batch.BatchAccount is not { Status: "Open" } account)
            throw new BusinessRuleException("payment.batch_account_unavailable", "Tài khoản chuyên dùng của lô không ở trạng thái mở.");

        // BR-196: lỗ vượt tổng vốn do người nuôi chịu, trừ vào phần Chi phí chuẩn chưa giải ngân.
        var operatorAmount = isP ? s.OperatorRemuneration + Math.Max(0, s.UndisbursedCost - s.UncoveredLoss) : 0;
        var required = isP ? s.SettlementLines.Sum(l => l.NetPayout) + operatorAmount + s.PlatformFee
            : s.SettlementMode == "A" ? s.CommissionAmount + s.SupplierPayout : 0;
        // BR-199, BR-205: chỉ duyệt khi số dư tài khoản của Lô theo đối soát (sau mọi lệnh chi khác) khớp tổng cần chi.
        var balance = await LedgerBalanceAsync(account.BatchAccountId, ct);
        if (s.SettlementMode != "T" && balance != required)
            throw new BusinessRuleException("settlement.balance_mismatch",
                $"Số dư tài khoản của Lô theo đối soát là {balance:N0} đ, khác tổng cần chi {required:N0} đ (BR-199, BR-205).");

        s.Status = "Approved";
        s.ApprovedBy = me.UserId;
        s.ApprovedAt = now;
        s.UpdatedAt = now;

        var instructions = new List<PaymentInstruction>();
        PaymentInstruction Add(string type, decimal amount, long? payoutAccountId, long? lineId, string note)
        {
            var i = new PaymentInstruction
            {
                BatchAccountId = account.BatchAccountId, InstructionType = type, Amount = amount, PayoutAccountId = payoutAccountId,
                SettlementLineId = lineId, BeneficiaryNote = note.Length > 200 ? note[..200] : note, Status = "Created", CreatedAt = now, UpdatedAt = now,
            };
            db.PaymentInstructions.Add(i);
            instructions.Add(i);
            return i;
        }

        async Task<long> OperatorAccountAsync() => await db.PayoutAccounts.AsNoTracking()
                .Where(p => p.OwnerOperatorId == s.Batch.OperatorId && p.Status == "Active")
                .OrderByDescending(p => p.PayoutAccountId).Select(p => (long?)p.PayoutAccountId).FirstOrDefaultAsync(ct)
            ?? throw new BusinessRuleException("payment.no_payout_account", "Đơn vị thực hiện chưa có tài khoản nhận tiền đang dùng.");
        // BR-207: phí nền tảng cho nền tảng; phần Chi phí chuẩn chưa giải ngân (mốc cuối) và thù lao cho người nuôi; từng nhà đầu tư.
        if (s.PlatformFee > 0 && isP)
            Add("PlatformFee", s.PlatformFee, null, null, $"Phí nền tảng {s.PlatformFeeRatePct}% doanh thu thực thu lô {s.Batch.BatchCode}");
        if (operatorAmount > 0)
            Add("Payout", operatorAmount, await OperatorAccountAsync(), null,
                $"Chi phí chuẩn chưa giải ngân {Math.Max(0, s.UndisbursedCost - s.UncoveredLoss):N0} đ + thù lao {s.OperatorRemuneration:N0} đ lô {s.Batch.BatchCode}");
        // Lô A (BR-201): hoa hồng cho nền tảng, phần còn lại cho nhà cung cấp.
        if (s.SettlementMode == "A")
        {
            if (s.CommissionAmount > 0) Add("Commission", s.CommissionAmount, null, null, $"Hoa hồng {s.CommissionPct}% lô {s.Batch.BatchCode}");
            if (s.SupplierPayout > 0) Add("SupplierPayout", s.SupplierPayout, await OperatorAccountAsync(), null, $"Tiền hàng trả nhà cung cấp lô {s.Batch.BatchCode}");
        }
        // Từng nhà đầu tư; tài khoản nhận tiền chọn lúc gửi nếu bây giờ chưa có
        var investorIds = s.SettlementLines.Select(l => l.InvestorId).ToList();
        var investorAccounts = await db.PayoutAccounts.AsNoTracking()
            .Where(p => p.OwnerUserId != null && investorIds.Contains(p.OwnerUserId.Value) && p.Status == "Active")
            .Select(p => new { p.OwnerUserId, p.PayoutAccountId }).ToListAsync(ct);
        foreach (var line in s.SettlementLines.Where(l => l.NetPayout > 0).OrderBy(l => l.InvestorId))
            Add("Payout", line.NetPayout, investorAccounts.Where(a => a.OwnerUserId == line.InvestorId).Select(a => (long?)a.PayoutAccountId).Max(),
                line.SettlementLineId, $"Chi trả quyết toán lô {s.Batch.BatchCode}");

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("settlement", s.SettlementId, "approve", new { status = "Proposed" }, new
        {
            s.Status, approvedBy = me.UserId, approvedAt = now, s.RevisionNo, revenuePool = (long)s.RevenuePool, taxTotal = (long)s.TaxTotal,
            instructions = instructions.Select(i => new { i.InstructionId, i.InstructionType, amount = (long)i.Amount, i.SettlementLineId }),
        }, now, ct);
        foreach (var i in instructions)
            await audit.WriteAsync("payment_instruction", i.InstructionId, "create", null,
                new { type = i.InstructionType, amount = (long)i.Amount, i.SettlementLineId, i.PayoutAccountId, settlementId = s.SettlementId }, now, ct);

        // Không còn khoản chi nào (lô T quyết toán nội bộ, hoặc không có gì để chi): đóng ngay (BR-209).
        if (instructions.Count == 0)
            await SettlementClosing.CloseIfPaidAsync(db, audit, s.BatchId, now, ct);
        return await settlements.DescribeAsync(s.SettlementId, SettlementService.Viewer.Admin, ct);
    }, ct);

    /// <summary>Số dư theo đối soát: tiền vào trừ tiền ra đã thực hiện, trừ các lệnh chi khác đã lập mà chưa thực hiện (hoàn tiền, giải ngân).</summary>
    internal async Task<long> LedgerBalanceAsync(long batchAccountId, CancellationToken ct)
    {
        var moves = await db.ProviderTransactions.AsNoTracking().Where(t => t.BatchAccountId == batchAccountId)
            .GroupBy(t => t.Direction).Select(g => new { g.Key, Amount = g.Sum(t => t.Amount) }).ToListAsync(ct);
        var pending = await db.PaymentInstructions.AsNoTracking()
            .Where(i => i.BatchAccountId == batchAccountId && (i.Status == "Created" || i.Status == "Sent"))
            .SumAsync(i => (decimal?)i.Amount, ct) ?? 0;
        return (long)(moves.Where(m => m.Key == "In").Sum(m => m.Amount) - moves.Where(m => m.Key == "Out").Sum(m => m.Amount) - pending);
    }

    /// <summary>Gửi mọi lệnh chi quyết toán còn Created/Failed của lô (thuế, người nuôi, nhà đầu tư), từng lệnh một transaction.</summary>
    public async Task<SettlementResponse> SendPayoutsAsync(long settlementId, CancellationToken ct)
    {
        var s = await db.Settlements.AsNoTracking().Where(x => x.SettlementId == settlementId)
            .Select(x => new { x.Status, x.Batch.BatchAccount!.BatchAccountId })
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("settlement.not_found", "Không tìm thấy bảng quyết toán.");
        if (s.Status != "Approved")
            throw new BusinessRuleException("settlement.not_approved", "Chỉ gửi lệnh chi của bảng đã duyệt và chưa chi xong.");
        var pending = await db.PaymentInstructions.AsNoTracking()
            .Where(i => i.BatchAccountId == s.BatchAccountId && (i.InstructionType == "Payout" || i.InstructionType == "PlatformFee"
                        || i.InstructionType == "Commission" || i.InstructionType == "SupplierPayout")
                        && (i.Status == "Created" || i.Status == "Failed"))
            .OrderBy(i => i.InstructionId).Select(i => i.InstructionId).ToListAsync(ct);
        foreach (var id in pending)
            await payouts.SendAsync(id, ct);
        return await settlements.DescribeAsync(settlementId, SettlementService.Viewer.Admin, ct);
    }

    /// <summary>
    /// Chỉ Development: dời mốc công bố về quá khứ để hết hạn góp ý ngay (giữ đúng CHECK cửa sổ ≥ 7 ngày), phục vụ demo đầu-cuối.
    /// </summary>
    public Task<SettlementResponse> EndFeedbackWindowForDemoAsync(long settlementId, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var s = await db.Settlements.SingleOrDefaultAsync(x => x.SettlementId == settlementId, ct)
                ?? throw new NotFoundException("settlement.not_found", "Không tìm thấy bảng quyết toán.");
        if (s.Status is not ("Proposed" or "Disputed") || s.ProposedAt is not { } proposedAt || s.FeedbackDeadline is not { } deadline)
            throw new BusinessRuleException("settlement.not_proposed", "Bảng chưa công bố.");
        var now = Now();
        var window = deadline - proposedAt;
        s.FeedbackDeadline = now.AddMinutes(-1);
        s.ProposedAt = s.FeedbackDeadline - window;
        s.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("settlement", s.SettlementId, "dev_end_feedback_window", new { proposedAt, feedbackDeadline = deadline },
            new { s.ProposedAt, s.FeedbackDeadline, reason = "Development: kết thúc hạn góp ý để demo" }, now, ct);
        return await settlements.DescribeAsync(s.SettlementId, SettlementService.Viewer.Admin, ct);
    }, ct);

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}

/// <summary>
/// Điều kiện đóng lô (TL-14 Bước 6, §6.6): bảng đã duyệt và mọi khoản chi của nhà đầu tư đã Succeeded → bảng PaidOut → lô Closed,
/// bảng Closed. Dòng thuế và khoản của người nuôi không chặn. Gọi BÊN TRONG transaction đã khoá chuỗi audit.
/// </summary>
public static class SettlementClosing
{
    public static async Task<bool> CloseIfPaidAsync(AppDbContext db, IAuditLog audit, long batchId, DateTimeOffset now, CancellationToken ct)
    {
        var settlement = await db.Settlements.Include(s => s.Batch).ThenInclude(b => b.BatchAccount).Include(s => s.SettlementLines)
            .SingleOrDefaultAsync(s => s.BatchId == batchId, ct);
        if (settlement is not { Status: "Approved", ApprovedAt: { } approvedAt }) return false;
        // BR-209: Lô đóng khi mọi lệnh chi của quyết toán đã thành công (nhà đầu tư, người nuôi, phí nền tảng, hoa hồng, nhà cung cấp).
        var accountId = settlement.Batch.BatchAccount?.BatchAccountId ?? 0;
        if (await db.PaymentInstructions.AnyAsync(i => i.BatchAccountId == accountId && i.CreatedAt >= approvedAt && i.Status != "Succeeded"
                && (i.InstructionType == "Payout" || i.InstructionType == "PlatformFee" || i.InstructionType == "Commission" || i.InstructionType == "SupplierPayout"), ct))
            return false;
        var lineIds = settlement.SettlementLines.Where(l => l.NetPayout > 0).Select(l => l.SettlementLineId).ToList();

        settlement.Status = "PaidOut";
        settlement.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("settlement", settlement.SettlementId, "paid_out", new { status = "Approved" },
            new { settlement.Status, paidLines = lineIds.Count }, now, ct);

        var batch = settlement.Batch;
        var before = batch.Status;
        batch.Status = "Closed";
        batch.ClosedAt = now;
        batch.UpdatedAt = now;
        settlement.Status = "Closed";
        settlement.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("batch", batch.BatchId, "close", new { status = before }, new { batch.Status, closedAt = now, batch.BatchCode }, now, ct);
        await audit.WriteAsync("settlement", settlement.SettlementId, "close", new { status = "PaidOut" }, new { settlement.Status }, now, ct);
        return true;
    }
}

internal static class VietnamTime
{
    public static DateTimeOffset ToOffsetVietnam(this DateTimeOffset value) => value.ToOffset(TimeSpan.FromHours(7));
}
