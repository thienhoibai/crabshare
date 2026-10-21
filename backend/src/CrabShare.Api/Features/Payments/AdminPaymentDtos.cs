namespace CrabShare.Api.Features.Payments;

// Tiền là số nguyên đồng (long).

/// <summary>Bộ lọc danh sách lệnh chi; để trống là không lọc.</summary>
public sealed class PaymentInstructionQuery
{
    /// <summary>Disbursement, Payout, Refund, TaxPayment.</summary>
    public string? Type { get; set; }

    /// <summary>Created, Sent, Succeeded, Failed, Disputed.</summary>
    public string? Status { get; set; }

    public string? BatchCode { get; set; }
}

/// <param name="Beneficiary">Người nhận: nhà đầu tư (hoàn vốn, chi trả), người nhận đơn (hoàn tiền hàng), hộ nuôi (giải ngân).</param>
/// <param name="TrancheNo">Số đợt giải ngân, khi là lệnh Disbursement.</param>
public sealed record PaymentInstructionResponse(
    long InstructionId, string Type, long Amount, string Status, string BatchCode, string? Beneficiary,
    long? ContributionId, long? OrderId, long? TrancheId, byte? TrancheNo, long? SettlementLineId,
    string? Note, DateTimeOffset CreatedAt, DateTimeOffset? SentAt, DateTimeOffset? CompletedAt);
