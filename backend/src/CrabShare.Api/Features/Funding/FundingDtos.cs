using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Funding;

// Tiền là số nguyên đồng (long). Không có trường lợi suất kỳ vọng (TL-05 §8, BR-49).

public sealed record RiskDisclosureResponse(
    long RiskDisclosureId, string VersionCode, DateTimeOffset EffectiveFrom, string ContentHash, string Content,
    DateTimeOffset? AcknowledgedAt);

public sealed class AcknowledgeRiskRequest
{
    [Range(1, long.MaxValue)]
    public long RiskDisclosureId { get; set; }

    /// <summary>Phải là true: web chỉ bật nút xác nhận khi người dùng đã cuộn tới cuối bản công bố.</summary>
    public bool ScrolledToEnd { get; set; }
}

public sealed record RiskAcknowledgementResponse(long RiskDisclosureId, string VersionCode, DateTimeOffset AcknowledgedAt);

/// <summary>BR-057: nhà đầu tư góp theo tỷ lệ % của vốn mục tiêu hoặc nhập số tiền; hệ thống quy đổi qua lại. Gửi đúng một trong hai.</summary>
public sealed class ReserveContributionRequest : IValidatableObject
{
    /// <summary>Số tiền góp, số nguyên đồng.</summary>
    [Range(0, long.MaxValue)]
    public long Amount { get; set; }

    /// <summary>Tỷ lệ % của vốn mục tiêu, tối đa 2 chữ số thập phân; số tiền = tỷ lệ × vốn mục tiêu, làm tròn tới đồng.</summary>
    [Range(typeof(decimal), "0", "100")]
    public decimal? Pct { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if ((Amount > 0) == (Pct is > 0))
            yield return new("Nhập số tiền góp hoặc tỷ lệ % của vốn mục tiêu, không nhập cả hai.", [nameof(Amount), nameof(Pct)]);
        if (Pct is { } pct && decimal.Round(pct, 2) != pct)
            yield return new("Tỷ lệ có tối đa 2 chữ số thập phân.", [nameof(Pct)]);
    }
}

public sealed record ContributionResponse(
    long ContributionId, string BatchCode, string BatchTitle, long Amount, string Status,
    DateTimeOffset ReservedAt, DateTimeOffset ExpiresAt, DateTimeOffset? ConfirmedAt);

/// <summary>Người đang đăng nhập đã đủ điều kiện góp vốn chưa (TL-09).</summary>
public sealed record FundingEligibility(bool KycVerified, bool RiskAcknowledged);

/// <summary>Số liệu cho màn "Số tiền & giữ chỗ": tối thiểu, còn lại trước trần, hạn gọi vốn.</summary>
public sealed record FundingBatchResponse(
    string BatchCode, string Title, string CrabType, string Status, string OperatorName,
    long MinContribution, long MinViableCapital, long TargetCapital, long MaxCapital,
    long ConfirmedCapital, long ReservedCapital, long RemainingCapacity, int InvestorCount,
    DateTimeOffset? FundingOpenAt, DateTimeOffset? FundingDeadline, bool IsOpen, int ReservationMinutes,
    FundingEligibility Me, ContributionResponse? MyActiveReservation);

/// <summary>Một dòng trong danh sách lô đang mở gọi vốn.</summary>
public sealed record FundingBatchSummary(
    string BatchCode, string Title, string CrabType, string OperatorName, long MinContribution,
    long TargetCapital, long MaxCapital, long ConfirmedCapital, long RemainingCapacity, DateTimeOffset? FundingDeadline);
