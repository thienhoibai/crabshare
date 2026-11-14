using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V023 — BR v1.5 nhóm G5: chuẩn phân hạng, bộ quy tắc, số đo, suy luận AI, quyết định phân hạng.

public partial class Batch
{
    /// <summary>Bộ quy tắc phân hạng khoá lúc Lô được duyệt, dùng tới khi Lô đóng (BR-038).</summary>
    [Column("grade_rule_set_id")] public long? GradeRuleSetId { get; set; }
}

[Table("grading_standard")]
public sealed class GradingStandard
{
    [Key, Column("standard_id")] public long StandardId { get; set; }
    [Column("standard_code"), MaxLength(40)] public string StandardCode { get; set; } = "";
    [Column("revision"), MaxLength(60)] public string Revision { get; set; } = "";
    [Column("issuer"), MaxLength(200)] public string Issuer { get; set; } = "";
    [Column("scope"), MaxLength(300)] public string Scope { get; set; } = "";
    [Column("effective_from")] public DateOnly EffectiveFrom { get; set; }
    [Column("note"), MaxLength(500)] public string? Note { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("grade_rule_set")]
public sealed class GradeRuleSet
{
    [Key, Column("rule_set_id")] public long RuleSetId { get; set; }
    [Column("standard_id")] public long StandardId { get; set; }
    [Column("crab_type"), MaxLength(20), Unicode(false)] public string CrabType { get; set; } = "";
    [Column("version_no")] public int VersionNo { get; set; }
    [Column("effective_from"), Precision(3)] public DateTimeOffset EffectiveFrom { get; set; }
    [Column("near_threshold_pct"), Precision(5, 2)] public decimal NearThresholdPct { get; set; } = 2m;
    /// <summary>Draft, Active, Retired.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Draft";
    [Column("note"), MaxLength(500)] public string? Note { get; set; }
    [Column("created_by")] public long? CreatedBy { get; set; }
    [Column("approved_by")] public long? ApprovedBy { get; set; }
    [Column("approved_at"), Precision(3)] public DateTimeOffset? ApprovedAt { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    public List<GradeRule> Rules { get; set; } = [];
}

[Table("grade_rule")]
public sealed class GradeRule
{
    [Key, Column("rule_id")] public long RuleId { get; set; }
    [Column("rule_set_id")] public long RuleSetId { get; set; }
    /// <summary>Size, PhysicalFactor, Sensory, Exclusion.</summary>
    [Column("rule_kind"), MaxLength(20), Unicode(false)] public string RuleKind { get; set; } = "";
    /// <summary>WeightG, CIndex, EdgeBandMm, Alive, FoodSafe.</summary>
    [Column("metric"), MaxLength(30), Unicode(false)] public string Metric { get; set; } = "";
    [Column("lower_bound"), Precision(10, 4)] public decimal? LowerBound { get; set; }
    [Column("upper_bound"), Precision(10, 4)] public decimal? UpperBound { get; set; }
    [Column("unit"), MaxLength(20), Unicode(false)] public string Unit { get; set; } = "";
    /// <summary>M, L, XL, OUT, SPECIAL, G1, BELOW, REJECT.</summary>
    [Column("result_label"), MaxLength(20), Unicode(false)] public string ResultLabel { get; set; } = "";
    /// <summary>LowerInclusive [a, b), UpperInclusive (a, b], BothInclusive [a, b].</summary>
    [Column("boundary"), MaxLength(20), Unicode(false)] public string Boundary { get; set; } = "LowerInclusive";
    [Column("sort_order")] public int SortOrder { get; set; }
    [Column("note"), MaxLength(300)] public string? Note { get; set; }
}

[Table("ai_inference")]
public sealed class AiInference
{
    [Key, Column("ai_inference_id")] public long AiInferenceId { get; set; }
    [Column("measurement_session_id")] public long MeasurementSessionId { get; set; }
    /// <summary>White (ảnh đèn trắng) hoặc Red (ảnh soi đỏ).</summary>
    [Column("image_kind"), MaxLength(10), Unicode(false)] public string ImageKind { get; set; } = "";
    [Column("model_name"), MaxLength(50), Unicode(false)] public string ModelName { get; set; } = "";
    [Column("model_version"), MaxLength(30), Unicode(false)] public string ModelVersion { get; set; } = "";
    [Column("is_simulated")] public bool IsSimulated { get; set; }
    /// <summary>Succeeded, LowConfidence, Failed.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "";
    /// <summary>Good, Poor, Unusable.</summary>
    [Column("image_quality"), MaxLength(20), Unicode(false)] public string? ImageQuality { get; set; }
    [Column("landmarks_json"), MaxLength(2000)] public string? LandmarksJson { get; set; }
    [Column("carapace_length_cm"), Precision(6, 2)] public decimal? CarapaceLengthCm { get; set; }
    [Column("carapace_width_cm"), Precision(6, 2)] public decimal? CarapaceWidthCm { get; set; }
    [Column("carapace_area_cm2"), Precision(8, 2)] public decimal? CarapaceAreaCm2 { get; set; }
    [Column("edge_band_mm"), Precision(6, 2)] public decimal? EdgeBandMm { get; set; }
    [Column("confidence"), Precision(5, 4)] public decimal? Confidence { get; set; }
    [Column("error_reason"), MaxLength(300)] public string? ErrorReason { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("measurement_value")]
public sealed class MeasurementValue
{
    [Key, Column("measurement_value_id")] public long MeasurementValueId { get; set; }
    [Column("measurement_session_id")] public long MeasurementSessionId { get; set; }
    /// <summary>WeightG, CarapaceLengthCm, CarapaceWidthCm, CarapaceAreaCm2, EdgeBandMm, CIndex.</summary>
    [Column("metric"), MaxLength(30), Unicode(false)] public string Metric { get; set; } = "";
    [Column("value"), Precision(10, 4)] public decimal Value { get; set; }
    [Column("unit"), MaxLength(10), Unicode(false)] public string Unit { get; set; } = "";
    /// <summary>Scale, AI, Caliper, ManualScale, Computed.</summary>
    [Column("method"), MaxLength(20), Unicode(false)] public string Method { get; set; } = "";
    [Column("confidence"), Precision(5, 4)] public decimal? Confidence { get; set; }
    /// <summary>Unverified, Verified, Disputed.</summary>
    [Column("verification_status"), MaxLength(20), Unicode(false)] public string VerificationStatus { get; set; } = "Unverified";
    [Column("ai_inference_id")] public long? AiInferenceId { get; set; }
    [Column("recorded_by")] public long? RecordedBy { get; set; }
    [Column("recorded_at"), Precision(3)] public DateTimeOffset RecordedAt { get; set; }
}

[Table("grade_decision")]
public sealed class GradeDecision
{
    [Key, Column("grade_decision_id")] public long GradeDecisionId { get; set; }
    [Column("decision_no"), MaxLength(20), Unicode(false)] public string DecisionNo { get; set; } = "";
    [Column("crab_unit_id")] public long CrabUnitId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("measurement_session_id")] public long MeasurementSessionId { get; set; }
    [Column("rule_set_id")] public long RuleSetId { get; set; }
    [Column("version_no")] public int VersionNo { get; set; }
    /// <summary>Draft, Hold, Approved, Rejected, Superseded.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Draft";
    [Column("weight_g"), Precision(7, 1)] public decimal? WeightG { get; set; }
    [Column("carapace_length_cm"), Precision(6, 2)] public decimal? CarapaceLengthCm { get; set; }
    [Column("c_index"), Precision(6, 4)] public decimal? CIndex { get; set; }
    [Column("edge_band_mm"), Precision(6, 2)] public decimal? EdgeBandMm { get; set; }
    [Column("proposed_size"), MaxLength(10), Unicode(false)] public string? ProposedSize { get; set; }
    [Column("proposed_c_level"), MaxLength(10), Unicode(false)] public string? ProposedCLevel { get; set; }
    [Column("proposed_sensory"), MaxLength(10), Unicode(false)] public string? ProposedSensory { get; set; }
    [Column("proposed_grade"), MaxLength(10), Unicode(false)] public string? ProposedGrade { get; set; }
    /// <summary>Danh sách lý do giữ lại, cách nhau bằng dấu phẩy: NearThreshold, ImageQuality, LowConfidence, CaliperRequired, SensoryPending, QcHold.</summary>
    [Column("hold_reasons"), MaxLength(200), Unicode(false)] public string? HoldReasons { get; set; }
    [Column("final_size"), MaxLength(10), Unicode(false)] public string? FinalSize { get; set; }
    [Column("final_grade"), MaxLength(10), Unicode(false)] public string? FinalGrade { get; set; }
    [Column("spec_id")] public long? SpecId { get; set; }
    [Column("is_substandard")] public bool IsSubstandard { get; set; }
    /// <summary>Alive, Weak, Dead.</summary>
    [Column("live_status"), MaxLength(10), Unicode(false)] public string? LiveStatus { get; set; }
    /// <summary>Pass, Fail.</summary>
    [Column("food_safety"), MaxLength(10), Unicode(false)] public string? FoodSafety { get; set; }
    [Column("sensory_note"), MaxLength(300)] public string? SensoryNote { get; set; }
    [Column("reason"), MaxLength(300)] public string? Reason { get; set; }
    [Column("photo_uri"), MaxLength(500)] public string? PhotoUri { get; set; }
    [Column("photo_sha256"), MaxLength(64), Unicode(false)] public string? PhotoSha256 { get; set; }
    [Column("decided_by")] public long? DecidedBy { get; set; }
    [Column("decided_at"), Precision(3)] public DateTimeOffset? DecidedAt { get; set; }
    [Column("held_by")] public long? HeldBy { get; set; }
    [Column("held_at"), Precision(3)] public DateTimeOffset? HeldAt { get; set; }
    [Column("second_qc_id")] public long? SecondQcId { get; set; }
    [Column("second_confirmed_at"), Precision(3)] public DateTimeOffset? SecondConfirmedAt { get; set; }
    [Column("qc_inspection_id")] public long? QcInspectionId { get; set; }
    [Column("supersedes_decision_id")] public long? SupersedesDecisionId { get; set; }
    [Column("is_current")] public bool IsCurrent { get; set; } = true;
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}
