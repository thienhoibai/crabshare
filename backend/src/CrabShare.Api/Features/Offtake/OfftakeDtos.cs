using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Offtake;

public sealed class CreateOfftakeCommitmentRequest
{
    [Range(1, long.MaxValue)]
    public long ContributionId { get; set; }

    [Required, MaxLength(20)]
    public string GradeCode { get; set; } = "";

    /// <summary>Kg cam kết, tối đa 3 chữ thập phân.</summary>
    [Range(typeof(decimal), "0.001", "100000")]
    public decimal QtyKg { get; set; }

    /// <summary>Bỏ qua nếu gửi — giá lấy từ batch_offtake_price theo hạng (TL-30).</summary>
    public long? FixedUnitPrice { get; set; }
}

/// <summary>Khoản thu cọc — cùng shape field với OrderPaymentResponse / Preorder để web tái dùng VietQrBox.</summary>
public sealed record OfftakePaymentResponse(
    string ReferenceCode,
    string AccountNo,
    long Amount,
    string? QrContent,
    DateTimeOffset ExpiresAt,
    long PaymentRequestId);

public sealed record OfftakeCommitmentResponse(
    long OfftakeId,
    string BatchCode,
    long ContributionId,
    string GradeCode,
    string GradeName,
    decimal CommittedQtyKg,
    long FixedUnitPrice,
    long CommitmentValue,
    long DepositAmount,
    decimal DepositPct,
    string DepositStatus,
    string Status,
    DateTimeOffset CreatedAt,
    OfftakePaymentResponse? Payment);

public sealed record OfftakeGradePriceResponse(string GradeCode, string GradeName, long UnitPrice);

public sealed record OfftakeCapResponse(
    string BatchCode,
    decimal ExpectedOutputKg,
    decimal CapPct,
    decimal CapKg,
    decimal OfftakeKg,
    decimal PreorderKg,
    decimal RemainingKg,
    decimal DepositPct,
    IReadOnlyList<OfftakeGradePriceResponse> Prices);
