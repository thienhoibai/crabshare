using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Production;

public sealed class TimelineQuery
{
    [Range(1, 30)] public int Days { get; init; } = 7;
    public DateOnly? Before { get; init; }
}

public sealed record TimelinePage(string BatchCode, string TimeZone, IReadOnlyList<TimelineDay> Groups, DateOnly? NextBefore, bool HasMore);
public sealed record TimelineDay(DateOnly Date, IReadOnlyList<TimelineItem> Items);
public sealed record TimelineItem(string Id, string Type, string SourceId, DateOnly BusinessDate,
    DateTimeOffset? OccurredAt, string TimeBasis,
    TimelineLog? ProductionLog = null, TimelineSlot? SlotEvent = null,
    TimelineEvidence? Evidence = null, TimelineAlert? Alert = null, TimelineCrabEvent? CrabEvent = null);
/// <summary>Sự kiện của một con cua theo BR v1.5 (nhận, xếp hộp, chuyển hộp, chết, lột, phân hạng, giao, bán, huỷ, trả về; BR-142).</summary>
public sealed record TimelineCrabEvent(string EventType, string CrabCode, string? SlotCode, string Source, string? Reason);
public sealed record TimelineLog(decimal? Ph, decimal? WaterTempC, decimal? SalinityPpt, decimal? FeedKg,
    string Source, string PlausibilityFlag, string? Note);
public sealed record TimelineSlot(string EventType, string SlotCode, string? DestinationSlotCode, short Quantity, string? Note);
public sealed record TimelineEvidence(string MediaType, string Source, string? SlotCode, string ReviewStatus, string FileUrl);
public sealed record TimelineAlert(string Type, string Severity, string Message, string Status,
    DateTimeOffset? AcknowledgedAt, DateTimeOffset? EscalatedAt);
public sealed record TimelineFile(Stream Stream, string ContentType, string? DownloadName);
