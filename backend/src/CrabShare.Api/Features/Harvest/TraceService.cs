using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CrabShare.Api.Features.Harvest;

public sealed class TraceService(AppDbContext db, ILogger<TraceService> logger)
{
    public async Task<TraceResponse> GetAsync(string code, CancellationToken ct)
    {
        if (code.Length != HarvestTagCodeGenerator.Length
            || code.Any(ch => !HarvestTagCodeGenerator.Alphabet.Contains(ch)))
            throw new AppException(400, "tag.invalid_code", "Mã tem không đúng định dạng.");

        var tag = await db.CrabTags.AsNoTracking().Where(t => t.TagCode == code)
            .Select(t => new { t.TagId, t.Status, t.CrabItemId }).SingleOrDefaultAsync(ct);
        if (tag is null) throw new NotFoundException("tag.not_found", "Không tìm thấy tem.");
        if (tag.Status == "Void") throw new BusinessRuleException("tag.void", "Tem đã bị hủy.");
        if (tag.Status != "Active") throw new BusinessRuleException("tag.not_active", "Tem chưa được kích hoạt.");
        var item = await db.VTraceabilities.AsNoTracking().Where(v => v.TagCode == code && v.TagStatus == "Active")
            .Select(v => new { v.TagCode, v.BatchCode, v.CrabType, v.ItemStatus, v.WeightG, v.GradeCode,
                v.GradeName, v.StockedAt, v.HarvestedAt, v.SlotCode }).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("tag.not_found", "Không tìm thấy thông tin truy xuất.");
        var events = await db.CrabItemEvents.AsNoTracking().Where(e => e.CrabItemId == tag.CrabItemId)
            .OrderBy(e => e.OccurredAt).ThenBy(e => e.CrabItemEventId)
            .Select(e => new TraceEventResponse(e.EventType, e.OccurredAt)).ToListAsync(ct);

        db.TagScans.Add(new TagScan { TagId = tag.TagId, ScannedBy = null, IsOrderOwner = false });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning("Trace scan logging failed; trace response remains available.");
        }

        return new(item.TagCode, item.BatchCode, item.CrabType, item.ItemStatus, item.WeightG, item.GradeCode,
            item.GradeName, item.StockedAt, item.HarvestedAt, item.SlotCode, events);
    }
}
