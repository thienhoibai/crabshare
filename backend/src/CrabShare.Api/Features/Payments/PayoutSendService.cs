using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// UC40 gửi lệnh chi và đối soát (TH-10, TL-10): admin gửi một lệnh chi (giải ngân, hoàn tiền, chi trả) qua
/// <see cref="IPaymentGateway.SendPayoutAsync"/>. Bản sandbox xác nhận ngay nên lệnh đi thẳng Created → Succeeded và ghi một dòng
/// <c>provider_transaction</c> chiều Out (khớp lệnh); bị từ chối → Failed, gửi lại được. Hoàn vốn góp của lô huỷ thành công thì
/// khoản góp chuyển Refunded (TL-17: chỉ đánh dấu hoàn khi trung gian xác nhận). Hoàn tiền đơn hàng chỉ đổi lệnh chi, không sửa đơn.
/// </summary>
public sealed class PayoutSendService(AppDbContext db, IAuditLog audit, TimeProvider clock, IPaymentGateway gateway)
{
    /// <summary>Đích "trả về đúng tài khoản đã chuyển" khi người nhận chưa khai tài khoản nhận tiền (chỉ dùng với hoàn tiền, bản sandbox).</summary>
    private static readonly (string Bank, string Account, string Name) OriginalSender = ("SOURCE", "ORIGINAL-SENDER", "Tài khoản đã chuyển tiền");

    public Task<PaymentInstructionResponse> SendAsync(long instructionId, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var instruction = await db.PaymentInstructions
            .Include(i => i.BatchAccount).ThenInclude(a => a.Batch)
            .Include(i => i.PayoutAccount)
            .Include(i => i.Contribution)
            .SingleOrDefaultAsync(i => i.InstructionId == instructionId, ct)
            ?? throw new NotFoundException("payment.instruction_not_found", "Không tìm thấy lệnh chi.");
        if (instruction.Status is not ("Created" or "Failed"))
            throw new ConflictException("payment.instruction_already_sent", $"Lệnh chi đang ở trạng thái {instruction.Status}, không gửi lại được.");
        if (instruction.BatchAccount.Status != "Open")
            throw new BusinessRuleException("payment.batch_account_unavailable", "Tài khoản chuyên dùng của lô không ở trạng thái mở.");

        var payout = instruction.PayoutAccount;
        if (payout is null && instruction.InstructionType == "Refund" && instruction.Contribution is { } refunded)
            payout = await db.PayoutAccounts.AsNoTracking()
                .Where(p => p.OwnerUserId == refunded.InvestorId && p.Status == "Active")
                .OrderByDescending(p => p.PayoutAccountId).FirstOrDefaultAsync(ct);
        if (payout is null && instruction.InstructionType != "Refund")
            throw new BusinessRuleException("payment.no_payout_account", "Lệnh chi chưa có tài khoản nhận tiền.");
        var (bank, accountNo, name) = payout is null ? OriginalSender : (payout.BankCode, payout.AccountNo, payout.AccountHolderName);

        var reference = $"CHI{instruction.InstructionId:D8}";
        var now = Now();
        var before = new { instruction.Status };
        var result = await gateway.SendPayoutAsync(new PayoutRequest(instruction.BatchAccount.ProviderAccountNo, bank, accountNo, name,
            instruction.Amount, reference), ct);
        instruction.SentAt = now;
        instruction.UpdatedAt = now;
        if (result.Accepted)
        {
            instruction.Status = "Succeeded";
            instruction.CompletedAt = now;
            db.ProviderTransactions.Add(new ProviderTransaction
            {
                ProviderTxnId = result.ProviderTransactionId, BatchAccountId = instruction.BatchAccountId, Direction = "Out",
                Amount = instruction.Amount, ReferenceCode = reference, InstructionId = instruction.InstructionId,
                MatchStatus = "Matched", OccurredAt = now, ReceivedAt = now,
            });
        }
        else
            instruction.Status = "Failed";
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("payment_instruction", instruction.InstructionId, "send", before, new
        {
            instruction.Status, type = instruction.InstructionType, amount = (long)instruction.Amount, reference,
            providerTransactionId = result.Accepted ? result.ProviderTransactionId : null, error = result.Error,
            toOriginalSender = payout is null,
        }, now, ct);

        // Hoàn 100% vốn của lô huỷ (TH-07) đã được trung gian xác nhận → khoản góp Refunded
        if (result.Accepted && instruction is { InstructionType: "Refund", Contribution: { Status: "Confirmed" } contribution }
            && instruction.BatchAccount.Batch.Status == "Cancelled" && instruction.Amount == contribution.Amount)
        {
            contribution.Status = "Refunded";
            contribution.RefundedAt = now;
            contribution.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("contribution", contribution.ContributionId, "refund", new { status = "Confirmed" },
                new { status = contribution.Status, refundedAt = now, instruction.InstructionId }, now, ct);
        }

        return await db.PaymentInstructions.AsNoTracking().Where(i => i.InstructionId == instructionId)
            .Select(PaymentInstructionQueryService.Projection).SingleAsync(ct);
    }, ct);

    /// <summary>Giao dịch tiền vào chưa khớp được khoản thu, hoặc đến trễ (đã lập lệnh hoàn), để admin đối soát tay.</summary>
    public async Task<IReadOnlyList<UnmatchedTransactionResponse>> ListUnmatchedAsync(CancellationToken ct)
        => await db.ProviderTransactions.AsNoTracking()
            .Where(t => t.Direction == "In" && t.MatchStatus != "Matched")
            .OrderByDescending(t => t.TransactionId)
            .Take(200)
            .Select(t => new UnmatchedTransactionResponse(
                t.TransactionId, t.ProviderTxnId, t.BatchAccount.Batch.BatchCode, (long)t.Amount, t.ReferenceCode, t.MatchStatus,
                t.OccurredAt, t.ReceivedAt,
                t.PaymentRequest != null ? t.PaymentRequest.ReferenceCode : null,
                t.PaymentRequest != null ? t.PaymentRequest.Status : null,
                t.PaymentRequest != null ? (long?)t.PaymentRequest.Amount : null))
            .ToListAsync(ct);

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}
