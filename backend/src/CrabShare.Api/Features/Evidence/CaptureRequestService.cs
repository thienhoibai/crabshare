using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Evidence;

public sealed class CaptureRequestService(AppDbContext db, EvidenceAccess access)
{
    public async Task<PagedResult<CaptureRequestResponse>> ListAsync(CaptureRequestQuery filter, PageQuery paging, CancellationToken ct)
    {
        var operatorId = await access.RequireOperatorAsync(ct);
        var query = db.CaptureRequests.AsNoTracking().Where(r => r.Batch.OperatorId == operatorId && r.Slot.OperatorId == operatorId);
        if (filter.Status is not null) query = query.Where(r => r.Status == filter.Status);
        return await query.OrderBy(r => r.DueAt).ThenBy(r => r.CaptureRequestId).Select(r => new CaptureRequestResponse(
            r.CaptureRequestId, r.Batch.BatchCode, r.Slot.SlotCode, r.RequestedAt, r.DueAt, r.Status, r.FulfilledAt)).ToPagedAsync(paging, ct);
    }
}
