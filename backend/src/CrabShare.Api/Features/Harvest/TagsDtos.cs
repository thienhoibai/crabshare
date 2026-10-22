using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Paging;

namespace CrabShare.Api.Features.Harvest;

public sealed class TagListQuery
{
    [RegularExpression("^(Printed|Active|Void)$")] public string? Status { get; set; }
}

public sealed record TagListItem(long TagId, string TagCode, string Status, string BatchCode, Guid ItemUuid, DateTimeOffset PrintedAt);
public sealed record TagLabelResponse(string TagCode, string TraceUrl);
public sealed class ActivateTagRequest { [Range(1, long.MaxValue)] public long EvidenceId { get; set; } }
public sealed class VoidTagRequest { [Required, StringLength(300, MinimumLength = 1)] public string Reason { get; set; } = ""; }
public sealed record TagLifecycleResponse(long TagId, string TagCode, string Status, long? ActivationEvidenceId, DateTimeOffset? ActivatedAt);
public sealed record TagVoidResponse(TagLifecycleResponse VoidedTag, TagListItem ReplacementTag);
public sealed record TraceEventResponse(string EventType, DateTimeOffset OccurredAt);
public sealed record TraceResponse(string TagCode, string BatchCode, string CrabType, string ItemStatus,
    short? WeightG, string? GradeCode, string? GradeName, DateTimeOffset StockedAt, DateTimeOffset? HarvestedAt,
    string SlotCode, IReadOnlyList<TraceEventResponse> Events);
public sealed class TraceOptions { public string PublicBaseUrl { get; set; } = ""; }
