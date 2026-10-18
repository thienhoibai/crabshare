using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Offtake;

/// <summary>
/// UC13 Đăng ký cam kết bao tiêu: gắn contribution Confirmed, thu cọc OfftakeDeposit (BT), chiếm trần v_batch_commitment_cap.
/// Không tạo đơn Offtake / không mở cửa sổ (NH-15).
/// </summary>
public sealed class OfftakeService(
    AppDbContext db, ICurrentUser me, PaymentRequestService payments, IAuditLog audit,
    IOptions<FundingOptions> fundingOptions, TimeProvider clock)
{
    public const string CreateAction = "create";
    public const string DepositHeldAction = "deposit_held";
    private const int MaxAttempts = 3;

    public static long ComputeDeposit(long commitmentValue, decimal depositPct) =>
        (long)Math.Round(commitmentValue * depositPct / 100m, 0, MidpointRounding.AwayFromZero);

    public async Task<OfftakeCapResponse> GetCapAsync(string code, CancellationToken ct)
    {
        await RequireInvestorAsync(ct);
        var batch = await db.Batches.AsNoTracking()
                        .Where(b => b.BatchCode == code)
                        .Select(b => new { b.BatchId, b.BatchCode, b.ExpectedOutputKg, b.OfftakePreorderCapPct, b.OfftakeDepositPct })
                        .FirstOrDefaultAsync(ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        var cap = await db.VBatchCommitmentCaps.AsNoTracking().SingleAsync(v => v.BatchId == batch.BatchId, ct);
        return new OfftakeCapResponse(
            batch.BatchCode,
            batch.ExpectedOutputKg,
            batch.OfftakePreorderCapPct,
            cap.CapKg ?? 0,
            cap.OfftakeKg,
            cap.PreorderKg,
            cap.RemainingKg ?? 0,
            batch.OfftakeDepositPct);
    }

    public async Task<IReadOnlyList<OfftakeCommitmentResponse>> ListMineAsync(CancellationToken ct)
    {
        var investorId = await RequireInvestorAsync(ct);
        var now = clock.GetUtcNow();
        var rows = await db.OfftakeCommitments.AsNoTracking()
            .Where(o => o.Contribution.InvestorId == investorId)
            .OrderByDescending(o => o.OfftakeId)
            .Select(o => new
            {
                o.OfftakeId,
                o.ContributionId,
                o.Batch.BatchCode,
                o.Grade.GradeCode,
                o.Grade.GradeName,
                o.CommittedQtyKg,
                o.FixedUnitPrice,
                o.DepositAmount,
                DepositPct = o.Batch.OfftakeDepositPct,
                o.DepositStatus,
                o.Status,
                o.CreatedAt,
                AccountNo = o.Batch.BatchAccount != null ? o.Batch.BatchAccount.ProviderAccountNo : null,
                Payment = o.PaymentRequests
                    .Where(p => p.Purpose == PaymentPurposes.OfftakeDeposit)
                    .OrderByDescending(p => p.PaymentRequestId)
                    .Select(p => new { p.PaymentRequestId, p.ReferenceCode, p.Amount, p.ExpiresAt, p.Status })
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        // Entity PaymentRequest không có QrContent — QR lấy lại qua GET /api/payment-requests/{id} trên web.
        return rows.Select(r =>
        {
            var value = OrderService.LineAmount(r.CommittedQtyKg, (long)r.FixedUnitPrice);
            OfftakePaymentResponse? pay = null;
            if (r.Payment is { } p && r.AccountNo is { } acc)
            {
                pay = new OfftakePaymentResponse(
                    p.ReferenceCode, acc, (long)p.Amount,
                    null,
                    p.ExpiresAt, p.PaymentRequestId);
            }
            return new OfftakeCommitmentResponse(
                r.OfftakeId, r.BatchCode, r.ContributionId, r.GradeCode, r.GradeName,
                r.CommittedQtyKg, (long)r.FixedUnitPrice, value, (long)r.DepositAmount, r.DepositPct,
                r.DepositStatus, r.Status, r.CreatedAt, pay);
        }).ToList();
    }

    public Task<OfftakeCommitmentResponse> CreateAsync(string code, CreateOfftakeCommitmentRequest req, CancellationToken ct)
    {
        var qty = NormalizeQty(req.QtyKg);
        if (req.FixedUnitPrice <= 0)
            throw new BusinessRuleException("offtake.invalid_price", "Giá chốt phải là số nguyên đồng lớn hơn 0.");

        return db.InTransactionAsync(async () =>
        {
            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    return await CreateInsideAsync(code, req.ContributionId, req.GradeCode.Trim(), qty, req.FixedUnitPrice, ct);
                }
                catch (DbUpdateException ex) when (attempt < MaxAttempts && IsDuplicateReference(ex))
                {
                }
            }
        }, ct);
    }

    private async Task<OfftakeCommitmentResponse> CreateInsideAsync(
        string code, long contributionId, string gradeCode, decimal qtyKg, long unitPrice, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);
        var investorId = await RequireInvestorAsync(ct);

        var batch = await db.Batches
                        .Where(b => b.BatchCode == code)
                        .Select(b => new
                        {
                            b.BatchId, b.BatchCode, b.Status, b.OperatorId,
                            b.FundingOpenAt, b.FundingDeadline,
                            b.OfftakeDepositPct,
                            AccountId = (long?)b.BatchAccount!.BatchAccountId,
                            AccountNo = b.BatchAccount!.ProviderAccountNo,
                            AccountStatus = b.BatchAccount!.Status,
                        })
                        .FirstOrDefaultAsync(ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");

        if (batch.Status != "Funding"
            || batch.FundingOpenAt is null || batch.FundingDeadline is null
            || batch.FundingOpenAt > now || batch.FundingDeadline <= now)
            throw new BusinessRuleException("offtake.funding_closed",
                "Chỉ đăng ký bao tiêu khi lô đang mở gọi vốn (TL-30).");

        var contribution = await db.Contributions.FirstOrDefaultAsync(c => c.ContributionId == contributionId, ct)
                           ?? throw new NotFoundException("contribution.not_found", "Không tìm thấy khoản góp.");
        if (contribution.InvestorId != investorId)
            throw new ForbiddenException("offtake.contribution_not_owner", "Khoản góp này không phải của bạn.");
        if (contribution.BatchId != batch.BatchId)
            throw new BusinessRuleException("offtake.contribution_wrong_batch",
                "Khoản góp không thuộc lô trên đường dẫn.");
        if (contribution.Status != "Confirmed")
            throw new BusinessRuleException("offtake.contribution_not_confirmed",
                "Chỉ đăng ký bao tiêu trên khoản góp đã xác nhận tiền về.");

        var grade = await db.ProductGrades.AsNoTracking()
                        .FirstOrDefaultAsync(g => g.GradeCode == gradeCode, ct)
                    ?? throw new NotFoundException("offtake.grade_not_found", $"Không tìm thấy hạng {gradeCode}.");

        if (await db.OperatorMembers.AsNoTracking()
                .AnyAsync(m => m.UserId == investorId && m.OperatorId == batch.OperatorId, ct))
            throw new BusinessRuleException("offtake.related_party",
                "Hộ nuôi và người liên quan không được bao tiêu lô của chính mình.");

        if (batch.AccountId is not { } accountId || batch.AccountStatus != "Open" || batch.AccountNo is null)
            throw new BusinessRuleException("offtake.batch_account_unavailable",
                $"Lô {batch.BatchCode} chưa có tài khoản chuyên dùng để nhận cọc.");

        if (await db.OfftakeCommitments.AnyAsync(o => o.ContributionId == contributionId, ct))
            throw new BusinessRuleException("offtake.already_exists",
                "Khoản góp này đã có cam kết bao tiêu (kể cả đã huỷ — schema UNIQUE).");

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT batch_id FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_id = {batch.BatchId}", ct);

        var cap = await db.VBatchCommitmentCaps.AsNoTracking().SingleAsync(v => v.BatchId == batch.BatchId, ct);
        var remainingBefore = cap.RemainingKg ?? 0;
        if (remainingBefore < qtyKg)
            throw CapExceeded(remainingBefore, qtyKg, cap.CapKg ?? 0);

        var commitmentValue = OrderService.LineAmount(qtyKg, unitPrice);
        if (commitmentValue <= 0)
            throw new BusinessRuleException("offtake.deposit_invalid", "Giá trị cam kết phải lớn hơn 0 đồng.");
        var deposit = ComputeDeposit(commitmentValue, batch.OfftakeDepositPct);
        if (deposit < 1 || deposit >= commitmentValue)
            throw new BusinessRuleException("offtake.deposit_invalid",
                "Số cọc tính từ tỷ lệ lô không hợp lệ (phải nhỏ hơn giá trị cam kết và ít nhất 1 đồng).");

        var expiresAt = now.AddMinutes(fundingOptions.Value.ReservationMinutes);
        if (batch.FundingDeadline < expiresAt) expiresAt = batch.FundingDeadline.Value;

        var offtake = new OfftakeCommitment
        {
            ContributionId = contributionId,
            BatchId = batch.BatchId,
            GradeId = grade.GradeId,
            CommittedQtyKg = qtyKg,
            FixedUnitPrice = unitPrice,
            DepositAmount = deposit,
            DepositStatus = "Pending",
            Status = "PendingHarvest",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.OfftakeCommitments.Add(offtake);
        await db.SaveChangesAsync(ct); // cần offtake_id trước khi gắn payment

        var payment = await payments.CreateAsync(
            PaymentPurposes.OfftakeDeposit, deposit, accountId, batch.AccountNo, expiresAt,
            PaymentTarget.ForOfftake(offtake.OfftakeId), null, ct);
        await db.SaveChangesAsync(ct);

        var remainingAfter = await db.VBatchCommitmentCaps.AsNoTracking()
            .Where(v => v.BatchId == batch.BatchId)
            .Select(v => v.RemainingKg ?? 0)
            .SingleAsync(ct);
        if (remainingAfter < 0)
            throw CapExceeded(remainingBefore, qtyKg, cap.CapKg ?? 0);

        await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, CreateAction, null,
            new
            {
                offtake.OfftakeId, batch.BatchCode, contributionId, gradeCode, qtyKg,
                fixedUnitPrice = unitPrice, depositAmount = deposit,
                status = offtake.Status, depositStatus = offtake.DepositStatus,
            }, now, ct);

        return new OfftakeCommitmentResponse(
            offtake.OfftakeId, batch.BatchCode, contributionId, grade.GradeCode, grade.GradeName,
            qtyKg, unitPrice, commitmentValue, deposit, batch.OfftakeDepositPct,
            offtake.DepositStatus, offtake.Status, offtake.CreatedAt,
            new OfftakePaymentResponse(
                payment.Qr.ReferenceCode, batch.AccountNo, (long)payment.Qr.Amount,
                payment.Qr.QrContent, payment.Qr.ExpiresAt, payment.Request.PaymentRequestId));
    }

    private async Task<long> RequireInvestorAsync(CancellationToken ct)
    {
        var id = me.UserId;
        var ok = await db.Investors.AsNoTracking().AnyAsync(i => i.UserId == id && i.User.Status != "Locked", ct);
        if (!ok) throw new NotFoundException("funding.investor_not_found", "Không tìm thấy hồ sơ nhà đầu tư.");
        return id;
    }

    private static decimal NormalizeQty(decimal qty)
    {
        if (qty <= 0) throw new BusinessRuleException("offtake.invalid_quantity", "Khối lượng phải lớn hơn 0.");
        var scaled = decimal.Round(qty, 3, MidpointRounding.AwayFromZero);
        if (scaled != qty)
            throw new BusinessRuleException("offtake.invalid_quantity", "Khối lượng tối đa 3 chữ số thập phân.");
        return scaled;
    }

    private static BusinessRuleException CapExceeded(decimal remainingKg, decimal requestedKg, decimal capKg) =>
        new("offtake.cap_exceeded",
            $"Bao tiêu vượt trần cam kết của lô (còn {remainingKg:0.###} kg, yêu cầu {requestedKg:0.###} kg).")
        {
            Details = new { remainingKg, requestedKg, capKg },
        };

    private static bool IsDuplicateReference(DbUpdateException ex) =>
        ex.InnerException is SqlException { Number: 2627 or 2601 } sql
        && sql.Message.Contains("uq_payment_request_reference_code");
}
