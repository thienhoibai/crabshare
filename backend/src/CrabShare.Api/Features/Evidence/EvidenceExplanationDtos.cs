using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Evidence;

public sealed class OperatorEvidenceQuery
{
    [RegularExpression("^(Accepted|Watch|Flagged|Rejected)$")] public string? Status { get; set; } = "Flagged";
    [StringLength(100)] public string? Q { get; set; }
}
public sealed class EvidenceExplanationRequest
{
    [Required, StringLength(1000), RegularExpression(@"[\s\S]*\S[\s\S]*")]
    public string Text { get; set; } = "";
}
public sealed record OperatorEvidenceReview(string Verdict, string? Note, DateTimeOffset ReviewedAt);
public sealed record OperatorEvidenceItem(long Id, string BatchCode, string? SlotCode, string MediaType,
    string ReviewStatus, decimal? RiskScore, DateTimeOffset? CapturedAt, DateTimeOffset ReceivedAt,
    decimal? Latitude, decimal? Longitude, string? Explanation, DateTimeOffset? ExplainedAt,
    OperatorEvidenceReview? LatestReview, bool CanExplain);
