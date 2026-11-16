using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Payments;

// Tiền là số nguyên đồng (long).

/// <param name="Status">Planned, Requested, NeedsExplanation, Released, Blocked.</param>
/// <param name="BlockedReason">Vì sao chưa xin được (điều kiện mốc TL-03 chưa đạt); null khi xin được.</param>
/// <param name="CanRequest">Người nuôi bấm "Xin giải ngân" được ngay bây giờ.</param>
/// <param name="InstructionStatus">Trạng thái lệnh chi giải ngân (sau khi admin duyệt).</param>
public sealed record TrancheResponse(
    long TrancheId, string BatchCode, string BatchTitle, string OperatorName, byte TrancheNo, long PlannedAmount, DateOnly? PlannedDate,
    string UnlockCondition, string Status, DateTimeOffset? RequestedAt, DateTimeOffset? ExplanationDeadline, DateTimeOffset? ReleasedAt,
    bool CanRequest, string? BlockedReason, long? InstructionId, string? InstructionStatus);

/// <summary>Lý do khi admin yêu cầu giải trình hoặc dừng chi.</summary>
public sealed class TrancheDecisionRequest
{
    [Required, StringLength(300, MinimumLength = 5, ErrorMessage = "Lý do cần từ 5 đến 300 ký tự.")]
    public string Reason { get; set; } = "";
}

/// <summary>Giao dịch tiền vào chưa khớp hoặc đến trễ, chờ admin đối soát (UC40, TL-10 §5).</summary>
public sealed record UnmatchedTransactionResponse(
    long TransactionId, string ProviderTxnId, string BatchCode, long Amount, string? Content, string MatchStatus,
    DateTimeOffset OccurredAt, DateTimeOffset ReceivedAt, string? PaymentRequestReference, string? PaymentRequestStatus, long? PaymentRequestAmount);
