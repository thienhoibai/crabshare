using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Harvest;

public sealed class TraceService(AppDbContext db)
{
    public async Task<TraceResponse> GetAsync(string code, CancellationToken ct)
    {
        var tag = await db.CrabTags.AsNoTracking().Where(t => t.TagCode == code)
            .Select(t => new { t.Status, t.CrabItemId }).SingleOrDefaultAsync(ct);
        if (tag is null) throw new NotFoundException("tag.not_found", "Không tìm thấy tem.");
        if (tag.Status == "Void") throw new BusinessRuleException("tag.void", "Tem đã bị hủy.");
        if (tag.Status != "Active") throw new BusinessRuleException("tag.not_active", "Tem chưa được kích hoạt.");
        var item = await db.VTraceabilities.AsNoTracking().Where(v => v.TagCode == code && v.TagStatus == "Active")
            .Select(v => new { v.TagCode, v.BatchCode, v.CrabType, v.ItemUuid, v.ItemStatus, v.WeightG, v.GradeCode,
                v.GradeName, v.StockedAt, v.HarvestedAt, v.OperatorName, v.FarmAddress, v.SlotCode }).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("tag.not_found", "Không tìm thấy thông tin truy xuất.");
        var events = await db.CrabItemEvents.AsNoTracking().Where(e => e.CrabItemId == tag.CrabItemId)
            .OrderBy(e => e.OccurredAt).ThenBy(e => e.CrabItemEventId)
            .Select(e => new TraceEventResponse(e.EventType, e.OccurredAt, e.Note)).ToListAsync(ct);
        return new(item.TagCode, item.BatchCode, item.CrabType, item.ItemUuid, item.ItemStatus, item.WeightG, item.GradeCode,
            item.GradeName, item.StockedAt, item.HarvestedAt, item.OperatorName, item.FarmAddress, item.SlotCode, events);
    }
}
