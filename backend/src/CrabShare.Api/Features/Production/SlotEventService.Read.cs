using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed partial class SlotEventService
{
    public async Task<SlotEventContext> ContextAsync(string code, string slotCode, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var batch = await BatchAsync(code, member.OperatorId, false, ct);
        var slot = await db.PhysicalSlots.AsNoTracking().SingleOrDefaultAsync(s => s.OperatorId == member.OperatorId && s.SlotCode == slotCode.Trim(), ct)
            ?? throw new NotFoundException("slot_events.slot_not_found", "Không tìm thấy hộp trong hộ nuôi của bạn.");
        var allocation = await db.SlotAllocations.AsNoTracking().Where(a => a.SlotId == slot.SlotId)
            .OrderByDescending(a => a.AllocatedAt).ThenByDescending(a => a.SlotAllocationId).FirstOrDefaultAsync(ct);
        var active = allocation is { ReleasedAt: null } && allocation.BatchId == batch.BatchId ? allocation : null;
        var crab = active is null ? null : await db.CrabItems.AsNoTracking().SingleOrDefaultAsync(c => c.SlotAllocationId == active.SlotAllocationId && c.BatchId == batch.BatchId && c.Status == "Growing", ct);
        var candidates = new List<ReplacementCrabResponse>();
        if (slot.Status == "Available" && allocation is { ReleasedAt: not null } && allocation.BatchId == batch.BatchId)
        {
            candidates = await db.CrabItems.AsNoTracking().Where(c => c.BatchId == batch.BatchId && c.SlotAllocationId == allocation.SlotAllocationId
                && c.Status == "Dead" && !db.CrabItems.Any(n => n.ReplacesCrabItemId == c.CrabItemId))
                .Select(c => new ReplacementCrabResponse(c.CrabItemId, c.ItemUuid,
                    c.CrabItemEvents.Where(e => e.EventType == "Died").Max(e => (DateTimeOffset?)e.OccurredAt) ?? allocation.ReleasedAt.Value)).ToListAsync(ct);
        }
        var earliest = crab is not null && active is not null ? active.AllocatedAt : candidates.Count > 0 ? candidates.Max(c => c.DiedAt) : (DateTimeOffset?)null;
        var now = clock.GetUtcNow();
        var evidence = earliest is null ? [] : await db.Evidences.AsNoTracking().Where(e => e.BatchId == batch.BatchId && e.SlotId == slot.SlotId
            && e.Source == "InAppCapture" && e.MediaType == "Photo" && e.SlotEventId == null && e.CapturedAt >= earliest && e.CapturedAt <= now
            && e.Latitude != null && e.Longitude != null && e.ReviewStatus != "Rejected")
            .OrderByDescending(e => e.ReceivedAt).Take(100).Select(e => new SlotEvidenceResponse(e.EvidenceId, e.CapturedAt!.Value, e.ReviewStatus)).ToListAsync(ct);
        var policy = await CurrentPolicyAsync(batch.BatchId, ct);
        var approved = await db.Operators.AnyAsync(o => o.OperatorId == member.OperatorId && o.Status == "Approved", ct);
        return new(batch.BatchCode, slot.SlotCode, slot.Status, crab is null ? null : new(crab.CrabItemId, crab.ItemUuid, crab.Status),
            candidates, evidence, Deadline(batch, policy), approved && RecordingState(batch.Status),
            await db.CrabItems.CountAsync(c => c.BatchId == batch.BatchId && c.Status == "Growing", ct));
    }

    public async Task<PagedResult<SlotEventResponse>> ListAsync(string code, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var batch = await BatchAsync(code, member.OperatorId, false, ct);
        var query = db.SlotEvents.AsNoTracking().Where(e => e.BatchId == batch.BatchId).OrderByDescending(e => e.OccurredAt).ThenByDescending(e => e.SlotEventId);
        var page = await query.ToPagedAsync(paging, ct);
        var items = new List<SlotEventResponse>();
        foreach (var entry in page.Items) items.Add(await ResponseAsync(entry.SlotEventId, ct));
        return new(items, page.Page, page.PageSize, page.Total);
    }

    private async Task<SlotEventResponse> ResponseAsync(long id, CancellationToken ct)
    {
        var e = await db.SlotEvents.AsNoTracking().Include(e => e.Batch).Include(e => e.SlotAllocation).ThenInclude(a => a.Slot).SingleAsync(e => e.SlotEventId == id, ct);
        var detail = await db.SlotEventDetails.AsNoTracking().SingleOrDefaultAsync(d => d.SlotEventId == id, ct);
        var crab = detail is null
            ? await db.CrabItems.AsNoTracking().Where(c => c.SlotAllocationId == e.SlotAllocationId && c.BatchId == e.BatchId).OrderBy(c => c.CrabItemId).FirstOrDefaultAsync(ct)
            : await db.CrabItems.AsNoTracking().SingleAsync(c => c.CrabItemId == detail.CrabItemId, ct);
        // Older seed/history rows have no individual link. Do not guess a crab from a reused allocation.
        if (detail is null && await db.CrabItems.CountAsync(c => c.SlotAllocationId == e.SlotAllocationId, ct) != 1) crab = null;
        string? destination = detail?.DestinationSlotAllocationId is { } destinationId
            ? await db.SlotAllocations.Where(a => a.SlotAllocationId == destinationId).Select(a => a.Slot.SlotCode).SingleAsync(ct) : null;
        var evidenceId = await db.Evidences.Where(p => p.SlotEventId == id).OrderBy(p => p.EvidenceId).Select(p => (long?)p.EvidenceId).FirstOrDefaultAsync(ct);
        return new(e.SlotEventId, e.Batch.BatchCode, e.SlotAllocation.Slot.SlotCode, e.EventType, e.OccurredAt, e.Quantity, e.Note,
            crab?.CrabItemId, crab?.ItemUuid, destination, e.EventType == "Restocked" ? crab?.ReplacesCrabItemId : null,
            evidenceId, detail?.ActorId, detail?.AliveCount);
    }
}
