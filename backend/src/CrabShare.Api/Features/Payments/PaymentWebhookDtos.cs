using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Một giao dịch tiền VÀO tài khoản lô do trung gian thanh toán báo về (TL-10 §5). Bản giả lập; khi nối sandbox thật thì
/// viết lớp chuyển đổi từ định dạng của họ sang record này, phần xử lý phía sau giữ nguyên.
/// </summary>
/// <param name="ProviderTxnId">Mã giao dịch phía ngân hàng — duy nhất, dùng chống trùng (gửi lại không ghi hai lần).</param>
/// <param name="AccountNo">Số tài khoản chuyên dùng của lô nhận tiền (batch_account.provider_account_no).</param>
/// <param name="Amount">Số tiền, nguyên đồng.</param>
/// <param name="Content">Nội dung chuyển khoản người chuyển ghi; mã đối chiếu ≤ 13 ký tự nằm trong đó.</param>
/// <param name="OccurredAt">Thời điểm ngân hàng ghi nhận giao dịch.</param>
public sealed record ProviderPaymentNotification(
    [Required, MaxLength(60)] string ProviderTxnId,
    [Required, MaxLength(40)] string AccountNo,
    [Range(1, long.MaxValue)] long Amount,
    [MaxLength(200)] string? Content,
    DateTimeOffset OccurredAt);

/// <summary>
/// Kết quả xử lý một giao dịch. <paramref name="Outcome"/>:
/// Matched (khoản thu Paid) · LatePayment (tiền đến khi khoản thu đã hết hạn / huỷ / đã trả — tạo lệnh hoàn) ·
/// Unmatched (không tìm được khoản thu, sai tài khoản hoặc sai số tiền — chờ đối soát tay) · Duplicate (đã xử lý trước đó).
/// </summary>
public sealed record WebhookResult(string Outcome, long? TransactionId, string? ReferenceCode, long? PaymentRequestId, string? Purpose, long? RefundInstructionId)
{
    public const string Matched = "Matched";
    public const string LatePayment = "LatePayment";
    public const string Unmatched = "Unmatched";
    public const string Duplicate = "Duplicate";
}

/// <summary>
/// Giả lập "khách đã chuyển khoản" (chỉ Development): tìm yêu cầu thu tiền theo mã đối chiếu rồi đi đúng luồng webhook.
/// Để trống amount thì chuyển đúng số tiền yêu cầu.
/// </summary>
public sealed class SimulatePaymentRequest
{
    [Required, MaxLength(13)]
    public string ReferenceCode { get; set; } = "";

    [Range(1, long.MaxValue)]
    public long? Amount { get; set; }
}
