using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Grading;

/// <summary>
/// Số đo nhập tay (BR-151, BR-153, BR-226): lượt đo Manual nhập khối lượng cân tay và chiều dài mai thước kẹp;
/// lượt đo Station chỉ bổ sung số thước kẹp khi ảnh lỗi hoặc AI không chắc (khối lượng luôn lấy từ cân của trạm).
/// </summary>
public sealed class MeasurementValuesRequest
{
    [Range(typeof(decimal), "1", "5000")] public decimal? WeightG { get; set; }
    [Range(typeof(decimal), "1", "30")] public decimal? CarapaceLengthCm { get; set; }
    [Range(typeof(decimal), "1", "40")] public decimal? CarapaceWidthCm { get; set; }
    [Range(typeof(decimal), "0", "50")] public decimal? EdgeBandMm { get; set; }
}

public sealed class ApproveDecisionRequest
{
    /// <summary>Hạng cuối; bỏ trống thì lấy hạng đề xuất. Chỉ được bằng hoặc thấp hơn hạng đề xuất từ số đo.</summary>
    [RegularExpression("^(SPECIAL|G1|BELOW)$")] public string? FinalGrade { get; set; }
    [StringLength(300)] public string? SensoryNote { get; set; }
    /// <summary>Bắt buộc khi hạng cuối thấp hơn hạng đề xuất.</summary>
    [StringLength(300)] public string? Reason { get; set; }
}

public sealed class HoldDecisionRequest
{
    [Required, StringLength(300, MinimumLength = 3)] public string Reason { get; set; } = "";
}

public sealed class RejectDecisionRequest
{
    [Required, RegularExpression("^(Alive|Weak|Dead)$")] public string LiveStatus { get; set; } = "";
    [Required, RegularExpression("^(Pass|Fail)$")] public string FoodSafety { get; set; } = "";
    [Required, StringLength(300, MinimumLength = 3)] public string Reason { get; set; } = "";
    /// <summary>Ảnh chụp trong app (BR-156).</summary>
    [Required] public IFormFile? Photo { get; set; }
}

public sealed class ReviseDecisionRequest
{
    [Required, RegularExpression("^(M|L|XL|OUT)$")] public string FinalSize { get; set; } = "";
    [Required, RegularExpression("^(SPECIAL|G1|BELOW)$")] public string FinalGrade { get; set; } = "";
    [Required, StringLength(300, MinimumLength = 3)] public string Reason { get; set; } = "";
    /// <summary>Ảnh chụp trong app (BR-157).</summary>
    [Required] public IFormFile? Photo { get; set; }
}

public sealed record MeasurementValueResponse(string Metric, decimal Value, string Unit, string Method, decimal? Confidence, string VerificationStatus,
    DateTimeOffset RecordedAt);

public sealed record AiInferenceResponse(string ImageKind, string ModelName, string ModelVersion, bool IsSimulated, string Status, string? ImageQuality,
    decimal? CarapaceLengthCm, decimal? CarapaceWidthCm, decimal? CarapaceAreaCm2, decimal? EdgeBandMm, decimal? Confidence, string? ErrorReason,
    DateTimeOffset CreatedAt);

public sealed record GradeDecisionResponse(string DecisionNo, string BatchCode, string CrabCode, string SessionNo, int RuleSetVersion, int VersionNo,
    string Status, bool IsCurrent, decimal? WeightG, decimal? CarapaceLengthCm, decimal? CIndex, decimal? EdgeBandMm, string? ProposedSize,
    string? ProposedCLevel, string? ProposedSensory, string? ProposedGrade, IReadOnlyList<string> HoldReasons, string? FinalSize, string? FinalGrade,
    string? SpecCode, bool IsSubstandard, string? LiveStatus, string? FoodSafety, string? SensoryNote, string? Reason, bool HasPhoto,
    long? DecidedBy, DateTimeOffset? DecidedAt, long? HeldBy, long? SecondQcId, DateTimeOffset? SecondConfirmedAt, DateTimeOffset CreatedAt);

public sealed record SessionMeasurementsResponse(SessionResponse Session, IReadOnlyList<MeasurementValueResponse> Values,
    IReadOnlyList<AiInferenceResponse> Inferences, GradeDecisionResponse? Decision);

public sealed record SpecCount(string SpecCode, string Size, string Grade, int Count);

/// <summary>Tổng hợp phân hạng của Lô: số con đã nhận, chờ đo, chờ duyệt, đã duyệt theo quy cách, loại bỏ, dưới chuẩn.</summary>
public sealed record BatchGradingSummary(string BatchCode, string BatchStatus, string CrabType, int? RuleSetVersion, int Received, int NotMeasured,
    int Draft, int Hold, int Approved, int Rejected, int Substandard, IReadOnlyList<SpecCount> BySpec, long? AssignedQcUserId);

public sealed class GradeRuleRequest
{
    [Required, RegularExpression("^(Size|PhysicalFactor|Sensory|Exclusion)$")] public string RuleKind { get; set; } = "";
    [Required, RegularExpression("^(WeightG|CIndex|EdgeBandMm|Alive|FoodSafe)$")] public string Metric { get; set; } = "";
    public decimal? LowerBound { get; set; }
    public decimal? UpperBound { get; set; }
    [Required, StringLength(20)] public string Unit { get; set; } = "";
    [Required, RegularExpression("^(M|L|XL|OUT|SPECIAL|G1|BELOW|REJECT)$")] public string ResultLabel { get; set; } = "";
    [RegularExpression("^(LowerInclusive|UpperInclusive|BothInclusive)$")] public string Boundary { get; set; } = "LowerInclusive";
    [Range(0, 100)] public int SortOrder { get; set; }
    [StringLength(300)] public string? Note { get; set; }
}

public sealed class CreateRuleSetRequest
{
    [Required, RegularExpression("^(FatteningMudCrab|RoeCrab|YoungFemaleCrab|OilRoeCrab)$")] public string CrabType { get; set; } = "";
    [Range(typeof(decimal), "0", "20")] public decimal? NearThresholdPct { get; set; }
    public DateTimeOffset? EffectiveFrom { get; set; }
    [StringLength(500)] public string? Note { get; set; }
    /// <summary>Bỏ trống thì chép quy tắc của bộ đang áp dụng.</summary>
    public List<GradeRuleRequest>? Rules { get; set; }
}

public sealed class ReplaceRulesRequest
{
    [Required, MinLength(1)] public List<GradeRuleRequest> Rules { get; set; } = [];
    [Range(typeof(decimal), "0", "20")] public decimal? NearThresholdPct { get; set; }
    [StringLength(500)] public string? Note { get; set; }
}

public sealed record GradeRuleResponse(long Id, string RuleKind, string Metric, decimal? LowerBound, decimal? UpperBound, string Unit, string ResultLabel,
    string Boundary, int SortOrder, string? Note);

public sealed record GradeRuleSetResponse(long Id, string CrabType, int VersionNo, string Status, DateTimeOffset EffectiveFrom, decimal NearThresholdPct,
    string? Note, DateTimeOffset? ApprovedAt, IReadOnlyList<GradeRuleResponse> Rules);

public sealed record GradingStandardResponse(string StandardCode, string Revision, string Issuer, string Scope, DateOnly EffectiveFrom, string? Note,
    IReadOnlyList<GradeRuleSetResponse> RuleSets);
