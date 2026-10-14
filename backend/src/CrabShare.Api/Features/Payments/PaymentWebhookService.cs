using System.Text.RegularExpressions;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Xử lý một giao dịch tiền VÀO do trung gian thanh toán báo về (TH-06, TL-10 §5): ghi <c>provider_transaction</c> đúng một
/// dòng cho mỗi <c>provider_txn_id</c>, khớp mã đối chiếu trong nội dung chuyển khoản với <c>payment_request</c>, rồi báo
/// module chủ của khoản thu qua <see cref="IPaymentPurposeHandler"/>. Toàn bộ chạy trong một transaction có khoá chuỗi audit,
/// nên hai webhook cùng lúc chạy lần lượt; webhook gửi lặp lại trả <see cref="WebhookResult.Duplicate"/> và không ghi gì.
/// </summary>
public sealed partial class PaymentWebhookService(
    AppDbContext db, IAuditLog audit, TimeProvider clock, RefundService refunds,
    IEnumerable<IPaymentPurposeHandler> handlers, ILogger<PaymentWebhookService> log)
{
    private const int ReferenceCodeMaxLength = 60;

    public async Task<WebhookResult> ProcessAsync(ProviderPaymentNotification txn, CancellationToken ct)
    {
        try
        {
            return await db.InTransactionAsync(() => ProcessInsideTransactionAsync(txn, ct), ct);
        }
        catch (DbUpdateException ex) when (IsDuplicateProviderTxn(ex))
        {
            // Hai webhook cùng provider_txn_id chạy sát nhau: dòng kia đã commit trước, coi lần này là gửi lại
            db.ChangeTracker.Clear();
            var existing = await db.ProviderTransactions.AsNoTracking()
                .Include(t => t.PaymentRequest)
                .SingleAsync(t => t.ProviderTxnId == txn.ProviderTxnId, ct);
            return Duplicate(existing);
        }
    }

    private async Task<WebhookResult> ProcessInsideTransactionAsync(ProviderPaymentNotification txn, CancellationToken ct)
    {
        await audit.LockAsync(ct);
        var existing = await db.ProviderTransactions.AsNoTracking().Include(t => t.PaymentRequest)
            .SingleOrDefaultAsync(t => t.ProviderTxnId == txn.ProviderTxnId, ct);
        if (existing is not null)
        {
            log.LogInformation("Webhook gửi lại giao dịch {ProviderTxnId}, đã ghi ở transaction_id {TransactionId}", txn.ProviderTxnId, existing.TransactionId);
            return Duplicate(existing);
        }

        var account = await db.BatchAccounts.AsNoTracking().SingleOrDefaultAsync(a => a.ProviderAccountNo == txn.AccountNo, ct)
                      ?? throw new BusinessRuleException("payment.unknown_account", $"Không có tài khoản lô nào mang số {txn.AccountNo}.");
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var content = txn.Content?.Trim() ?? "";
        var transaction = new ProviderTransaction
        {
            ProviderTxnId = txn.ProviderTxnId,
            BatchAccountId = account.BatchAccountId,
            Direction = "In",
            Amount = txn.Amount,
            ReferenceCode = content.Length > ReferenceCodeMaxLength ? content[..ReferenceCodeMaxLength] : (content.Length == 0 ? null : content),
            MatchStatus = WebhookResult.Unmatched,
            OccurredAt = txn.OccurredAt,
            ReceivedAt = now,
        };
        db.ProviderTransactions.Add(transaction);

        var request = await FindRequestAsync(content, ct);
        string reason;
        long? refundInstructionId = null;
        if (request is null)
        {
            reason = "Không tìm thấy mã đối chiếu trong nội dung chuyển khoản.";
        }
        else if (request.BatchAccountId != account.BatchAccountId)
        {
            reason = $"Mã {request.ReferenceCode} thuộc tài khoản lô khác (chuyển nhầm tài khoản).";
            request = null;
        }
        else if (request.Status != "Pending" || request.ExpiresAt <= now || request.ExpiresAt <= txn.OccurredAt)
        {
            // Tiền đến khi khoản thu đã hết hạn / huỷ / đã trả: ghi nhận trả trễ và lập lệnh hoàn (TL-10 §5.3)
            transaction.PaymentRequestId = request.PaymentRequestId;
            transaction.MatchStatus = WebhookResult.LatePayment;
            var before = request.Status;
            if (request.Status == "Pending")
            {
                request.Status = "Expired";
                request.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
                await audit.WriteAsync("payment_request", request.PaymentRequestId, "expire", new { status = before },
                    new { status = request.Status, reason = "Tiền đến sau hạn" }, now, ct);
            }
            var refund = await refunds.CreateRefundAsync(account.BatchAccountId, txn.Amount, request.ContributionId, request.OrderId,
                $"Hoàn tiền trả trễ: {request.ReferenceCode} (giao dịch {txn.ProviderTxnId})", now, ct);
            refundInstructionId = refund.InstructionId;
            reason = $"Khoản thu {request.ReferenceCode} đã {before} khi tiền đến; lập lệnh hoàn #{refund.InstructionId}.";
        }
        else if (request.Amount != txn.Amount)
        {
            transaction.PaymentRequestId = request.PaymentRequestId;
            reason = $"Số tiền {txn.Amount:N0} khác số tiền yêu cầu {request.Amount:N0} của mã {request.ReferenceCode}; chờ đối soát tay.";
        }
        else
        {
            transaction.PaymentRequestId = request.PaymentRequestId;
            transaction.MatchStatus = WebhookResult.Matched;
            request.Status = "Paid";
            request.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("payment_request", request.PaymentRequestId, "paid", new { status = "Pending" },
                new { status = "Paid", txn.ProviderTxnId, amount = txn.Amount, txn.OccurredAt }, now, ct);

            var handler = handlers.FirstOrDefault(h => h.Purpose == request.Purpose);
            if (handler is null)
                log.LogWarning("Chưa có IPaymentPurposeHandler cho mục đích {Purpose}; khoản thu {PaymentRequestId} đã Paid nhưng module chủ chưa được báo",
                    request.Purpose, request.PaymentRequestId);
            else
                await handler.OnPaidAsync(request, now, ct);
            reason = $"Khớp mã {request.ReferenceCode}, khoản thu chuyển sang Paid.";
        }

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("provider_transaction", transaction.TransactionId, "receive", null, new
        {
            txn.ProviderTxnId, txn.AccountNo, amount = txn.Amount, content, txn.OccurredAt,
            transaction.MatchStatus, transaction.PaymentRequestId, refundInstructionId, reason,
        }, now, ct);
        return new WebhookResult(transaction.MatchStatus, transaction.TransactionId, request?.ReferenceCode,
            transaction.PaymentRequestId, request?.Purpose, refundInstructionId);
    }

    /// <summary>
    /// Nội dung chuyển khoản do người chuyển gõ, có thể kèm chữ khác ("GV1234567890A gop von lo 2"), nên tách thành các
    /// cụm chữ-số in hoa ≤ 13 ký tự rồi tìm payment_request có mã trùng một cụm. Nhiều cụm trùng (hiếm) thì ưu tiên mã còn Pending.
    /// </summary>
    private async Task<PaymentRequest?> FindRequestAsync(string content, CancellationToken ct)
    {
        var tokens = TokenPattern().Matches(content.ToUpperInvariant())
            .Select(m => m.Value)
            .Where(t => t.Length <= PaymentRequestService.ReferenceCodeLength)
            .Distinct()
            .ToList();
        if (tokens.Count == 0) return null;
        var candidates = await db.PaymentRequests.Where(r => tokens.Contains(r.ReferenceCode)).ToListAsync(ct);
        return candidates.OrderBy(r => r.Status == "Pending" ? 0 : 1).ThenByDescending(r => r.PaymentRequestId).FirstOrDefault();
    }

    private static WebhookResult Duplicate(ProviderTransaction existing)
        => new(WebhookResult.Duplicate, existing.TransactionId, existing.PaymentRequest?.ReferenceCode,
            existing.PaymentRequestId, existing.PaymentRequest?.Purpose, null);

    private static bool IsDuplicateProviderTxn(DbUpdateException ex)
        => ex.InnerException is SqlException { Number: 2627 or 2601 } sql && sql.Message.Contains("uq_provider_transaction_provider_txn_id");

    [GeneratedRegex("[A-Z0-9]+")]
    private static partial Regex TokenPattern();
}
