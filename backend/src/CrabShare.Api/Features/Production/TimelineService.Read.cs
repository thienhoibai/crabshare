using System.Globalization;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed partial class TimelineService
{
    private async Task<List<TimelineItem>> ReadItemsAsync(long batchId, string code, DateOnly first, DateOnly last, CancellationToken ct)
    {
        var fromAt = Midnight(first);
        var to = last == DateOnly.MaxValue ? DateTimeOffset.MaxValue : Midnight(last.AddDays(1));
        var items = new List<TimelineItem>();
        static string Id(long id) => id.ToString(CultureInfo.InvariantCulture);
        var logs = await db.ProductionLogs.AsNoTracking().Where(l => l.BatchId == batchId && l.LogDate >= first && l.LogDate <= last)
            .Select(l => new { l.ProductionLogId, l.LogDate, l.Ph, l.WaterTempC, l.SalinityPpt, l.FeedKg, l.Source, l.PlausibilityFlag, l.Note }).ToListAsync(ct);
        items.AddRange(logs.Select(l => new TimelineItem($"ProductionLog:{l.ProductionLogId}", "ProductionLog", Id(l.ProductionLogId), l.LogDate, null, "Date",
            ProductionLog: new(l.Ph, l.WaterTempC, l.SalinityPpt, l.FeedKg, l.Source, l.PlausibilityFlag, l.Note))));

        var slots = await (from e in db.SlotEvents.AsNoTracking()
            where e.BatchId == batchId && e.OccurredAt >= fromAt && e.OccurredAt < to
            join detail in db.SlotEventDetails on e.SlotEventId equals detail.SlotEventId into details
            from detail in details.DefaultIfEmpty()
            select new { e.SlotEventId, e.OccurredAt, e.EventType, e.Quantity, e.Note, e.SlotAllocation.Slot.SlotCode,
                Destination = detail == null ? null : db.SlotAllocations.Where(a => a.SlotAllocationId == detail.DestinationSlotAllocationId && a.BatchId == batchId).Select(a => a.Slot.SlotCode).FirstOrDefault() }).ToListAsync(ct);
        items.AddRange(slots.Select(e => new TimelineItem($"SlotEvent:{e.SlotEventId}", "SlotEvent", Id(e.SlotEventId), BusinessDate(e.OccurredAt), e.OccurredAt, "Occurred",
            SlotEvent: new(e.EventType, e.SlotCode, e.Destination, e.Quantity, e.Note))));

        var evidence = await db.Evidences.AsNoTracking().Where(e => e.BatchId == batchId && e.ReviewStatus == "Accepted"
            && ((e.CapturedAt >= fromAt && e.CapturedAt < to) || (e.CapturedAt == null && e.ReceivedAt >= fromAt && e.ReceivedAt < to)))
            .Select(e => new { e.EvidenceId, e.MediaType, e.Source, e.CapturedAt, e.ReceivedAt, SlotCode = e.Slot == null ? null : e.Slot.SlotCode }).ToListAsync(ct);
        items.AddRange(evidence.Select(e => new TimelineItem($"Evidence:{e.EvidenceId}", "Evidence", Id(e.EvidenceId), BusinessDate(e.CapturedAt ?? e.ReceivedAt),
            e.CapturedAt ?? e.ReceivedAt, e.CapturedAt is null ? "Received" : "Capture",
            Evidence: new(e.MediaType, e.Source, e.SlotCode, "Accepted", $"/api/batches/{Uri.EscapeDataString(code)}/timeline/evidence/{e.EvidenceId}/file"))));

        // Same batch scope as AlertService.ListInvestorAsync; admin/audit notes are deliberately absent.
        var alerts = await db.Alerts.AsNoTracking().Where(a => a.BatchId == batchId && a.RaisedAt >= fromAt && a.RaisedAt < to)
            .Select(a => new { a.AlertId, a.RaisedAt, a.AlertType, a.Severity, a.Message, a.Status, a.AcknowledgedAt, a.EscalatedAt }).ToListAsync(ct);
        items.AddRange(alerts.Select(a => new TimelineItem($"Alert:{a.AlertId}", "Alert", Id(a.AlertId), BusinessDate(a.RaisedAt), a.RaisedAt, "Raised",
            Alert: new(a.AlertType, a.Severity, a.Message, a.Status, a.AcknowledgedAt, a.EscalatedAt))));
        return items;
    }
}
