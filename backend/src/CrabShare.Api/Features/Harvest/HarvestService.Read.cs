using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using HarvestSession = CrabShare.Api.Infrastructure.Persistence.Entities.Harvest;

namespace CrabShare.Api.Features.Harvest;

public sealed partial class HarvestService
{
    private static HarvestResponse Response(HarvestSession h, Batch batch, OperatorMember member, bool approved)
    {
        var open = approved && h.LifecycleStatus == "Open" && RecordingState(batch.Status);
        return new(h.HarvestId, batch.BatchCode, h.Name, h.Note, h.LifecycleStatus ?? "Legacy", h.HarvestedAt, h.CompletedAt,
            h.DeclaredBy, h.CompletedBy, h.HarvestedCount, h.TotalWeightKg, h.RevisionNo, open, open && member.MemberRole == "Owner", []);
    }

    private async Task<Dictionary<long, IReadOnlyList<HarvestGradeSummary>>> GradeSummariesAsync(IReadOnlyCollection<long> harvestIds, CancellationToken ct)
    {
        var rows = await db.HarvestRecords.AsNoTracking().Where(r => harvestIds.Contains(r.HarvestId))
            .GroupBy(r => new { r.HarvestId, r.GradeCode, r.GradeName })
            .Select(g => new { g.Key.HarvestId, g.Key.GradeCode, g.Key.GradeName, CrabCount = g.Count(), WeightG = g.Sum(r => (long?)r.WeightG) ?? 0L })
            .ToListAsync(ct);
        return harvestIds.Distinct().ToDictionary(id => id, id => (IReadOnlyList<HarvestGradeSummary>)rows
            .Where(r => r.HarvestId == id)
            .OrderBy(r => r.GradeCode)
            .Select(r => new HarvestGradeSummary(r.GradeCode, r.GradeName, r.CrabCount, r.WeightG / 1000m))
            .ToArray());
    }
    private Task<bool> ApprovedAsync(long operatorId, CancellationToken ct) => db.Operators.AnyAsync(o => o.OperatorId == operatorId && o.Status == "Approved", ct);

    public async Task<HarvestResponse> GetAsync(long id, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var (session, batch) = await SessionAsync(id, member.OperatorId, false, ct);
        var response = Response(session, batch, member, await ApprovedAsync(member.OperatorId, ct));
        return response with
        {
            GradeSummaries = (await GradeSummariesAsync([id], ct))[id]
        };
    }
    public async Task<PagedResult<HarvestResponse>> ListAsync(string code, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var batch = await BatchAsync(code, member.OperatorId, false, ct);
        var approved = await ApprovedAsync(member.OperatorId, ct);
        var page = await db.Harvests.AsNoTracking().Where(h => h.BatchId == batch.BatchId).OrderByDescending(h => h.HarvestId).ToPagedAsync(paging, ct);
        var summaries = await GradeSummariesAsync(page.Items.Select(h => h.HarvestId).ToArray(), ct);
        return new(page.Items.Select(h => Response(h, batch, member, approved) with { GradeSummaries = summaries[h.HarvestId] }).ToArray(), page.Page, page.PageSize, page.Total);
    }
    public async Task<HarvestContextResponse> ContextAsync(string code, string? slotCode, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var batch = await BatchAsync(code, member.OperatorId, false, ct);
        var approved = await ApprovedAsync(member.OperatorId, ct);
        var active = await db.Harvests.AsNoTracking().SingleOrDefaultAsync(h => h.BatchId == batch.BatchId && h.LifecycleStatus == "Open", ct);
        HarvestCrabContext? current = null;
        string? status = null;
        DateTimeOffset? molted = null;
        if (!string.IsNullOrWhiteSpace(slotCode))
        {
            var normalized = slotCode.Trim();
            var slot = await db.PhysicalSlots.AsNoTracking().SingleOrDefaultAsync(s => s.OperatorId == member.OperatorId && s.SlotCode == normalized, ct)
                ?? throw new NotFoundException("harvest.slot_not_found", "Không tìm thấy hộp trong hộ nuôi của bạn.");
            status = slot.Status;
            var allocation = await db.SlotAllocations.AsNoTracking().SingleOrDefaultAsync(a => a.SlotId == slot.SlotId && a.BatchId == batch.BatchId && a.ReleasedAt == null, ct);
            if (allocation is not null)
            {
                var crab = await db.CrabItems.AsNoTracking().SingleOrDefaultAsync(c => c.SlotAllocationId == allocation.SlotAllocationId && c.BatchId == batch.BatchId && c.Status == "Growing", ct);
                if (crab is not null)
                {
                    current = new(crab.CrabItemId, crab.ItemUuid, allocation.SlotAllocationId);
                    molted = await db.CrabItemEvents.Where(e => e.CrabItemId == crab.CrabItemId && e.EventType == "Molted").MaxAsync(e => (DateTimeOffset?)e.OccurredAt, ct);
                }
            }
        }
        var remaining = await db.CrabItems.CountAsync(c => c.BatchId == batch.BatchId && c.Status == "Growing", ct);
        var harvested = await db.CrabItems.CountAsync(c => c.BatchId == batch.BatchId && c.HarvestId != null, ct);
        var grams = await db.CrabItems.Where(c => c.BatchId == batch.BatchId && c.HarvestId != null).SumAsync(c => (long?)c.WeightG, ct) ?? 0;
        var response = active is null ? null : Response(active, batch, member, approved);
        return new(batch.BatchCode, batch.Status, response,
            approved && member.MemberRole == "Owner" && active is null && batch.Status is "InProduction" or "Harvesting",
            response?.CanRecord ?? false, response?.CanComplete ?? false, remaining, harvested, grams / 1000m, status, current, molted);
    }

    private async Task<HarvestCrabResponse> RecordResponseAsync(HarvestRecord record, CancellationToken ct)
    {
        var individual = await db.CrabItems.AsNoTracking().Where(c => c.CrabItemId == record.CrabItemId)
            .Select(c => new { c.ItemUuid, c.Batch.BatchCode }).SingleAsync(ct);
        var alive = await db.SlotEventDetails.Where(d => d.SlotEventId == record.SlotEventId).Select(d => d.AliveCount).SingleAsync(ct);
        return new(record.CrabItemId, individual.ItemUuid, record.HarvestId, individual.BatchCode, record.SlotCode, record.WeightG,
            record.ShellCondition, record.GradeCode, record.GradeName, record.TagCode.Trim(), record.TagStatus,
            "/truy-xuat/" + record.TagCode.Trim(), record.RecordedAt, record.HarvestedCount, record.TotalWeightKg, alive);
    }

    public async Task<PagedResult<HarvestCrabResponse>> CrabsAsync(long id, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var (session, batch) = await SessionAsync(id, member.OperatorId, false, ct);
        var page = await db.CrabItems.AsNoTracking().Where(c => c.HarvestId == id).OrderByDescending(c => c.CrabItemId).ToPagedAsync(paging, ct);
        var result = new List<HarvestCrabResponse>();
        foreach (var crab in page.Items)
        {
            var record = await db.HarvestRecords.AsNoTracking().SingleOrDefaultAsync(r => r.CrabItemId == crab.CrabItemId, ct);
            if (record is not null)
            {
                result.Add(await RecordResponseAsync(record, ct));
                continue;
            }
            var grade = await db.ProductGrades.AsNoTracking().SingleAsync(g => g.GradeId == crab.GradeId, ct);
            var slot = await db.SlotAllocations.Where(a => a.SlotAllocationId == crab.SlotAllocationId).Select(a => a.Slot.SlotCode).SingleAsync(ct);
            var tag = await db.CrabTags.AsNoTracking().Where(t => t.CrabItemId == crab.CrabItemId).OrderBy(t => t.Status == "Void" ? 1 : 0).ThenByDescending(t => t.TagId).FirstOrDefaultAsync(ct);
            result.Add(new(crab.CrabItemId, crab.ItemUuid, id, batch.BatchCode, slot, crab.WeightG!.Value, null, grade.GradeCode, grade.GradeName,
                tag?.TagCode.Trim(), tag?.Status, tag is null ? null : "/truy-xuat/" + tag.TagCode.Trim(), session.HarvestedAt, null, null, null));
        }
        return new(result, page.Page, page.PageSize, page.Total);
    }
}
