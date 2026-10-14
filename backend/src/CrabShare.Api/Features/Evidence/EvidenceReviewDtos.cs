using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Evidence;

public sealed class EvidenceReviewQuery
{
    [RegularExpression("^(Accepted|Watch|Flagged|Rejected)$")] public string? Status { get; set; } = "Flagged";
    [StringLength(100)] public string? Q { get; set; }
}
public sealed class EvidenceVerdictRequest
{
    [Required, RegularExpression("^(Pass|Fail|NeedMoreEvidence)$")] public string Verdict { get; set; } = "";
    [Required, StringLength(500), RegularExpression(@"[\s\S]*\S[\s\S]*")]
    public string Note { get; set; } = "";
}
public sealed record ReviewEvidenceSummary(long Id, string BatchCode, string BatchTitle, string FarmName,
    string? SlotCode, string MediaType, string ReviewStatus, decimal? RiskScore, DateTimeOffset ReceivedAt);
public sealed record ReviewDetection(string ModelVersion, bool? CrabDetected, decimal? Confidence, string? BboxJson, DateTimeOffset DetectedAt);
public sealed record ReviewDecision(long Id, long ReviewerId, string ReviewerName, string Verdict, string? Note, DateTimeOffset ReviewedAt);
public sealed record ReviewEvidenceDetail(ReviewEvidenceSummary Evidence, string Source, DateTimeOffset? CapturedAt,
    decimal? Latitude, decimal? Longitude, string Sha256, string? PerceptualHash, string? Explanation,
    DateTimeOffset? ExplainedAt, IReadOnlyList<ReviewDetection> Detections, IReadOnlyList<ReviewDecision> Reviews, bool CanReview);
