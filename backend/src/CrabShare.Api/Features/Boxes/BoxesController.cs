using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Boxes;

public sealed class BoxListQuery
{
    [RegularExpression("^(Available|Occupied|Maintenance)$")] public string? Status { get; set; }
    [StringLength(30)] public string? Search { get; set; }
}
public sealed record BoxEvidenceResponse(long Id, DateTimeOffset ReceivedAt, string ReviewStatus);
public sealed record BoxResponse(string SlotCode, string Status, string? BatchCode, BoxEvidenceResponse? LatestEvidence = null);

/// <summary>Phần đọc cần cho CS-44. CRUD/đánh số hộp của CS-29 bổ sung vào module Boxes.</summary>
[ApiController, Route("api/boxes"), Authorize(Policy = Policies.Operator)]
public sealed class BoxesController(BoxReadService boxes) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<BoxResponse>>> List([FromQuery] BoxListQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await boxes.ListAsync(filter, paging, ct));
}

public sealed class BoxReadService(AppDbContext db, EvidenceAccess access)
{
    public async Task<PagedResult<BoxResponse>> ListAsync(BoxListQuery filter, PageQuery paging, CancellationToken ct)
    {
        var operatorId = await access.RequireOperatorAsync(ct);
        var query = db.PhysicalSlots.AsNoTracking().Where(s => s.OperatorId == operatorId);
        if (filter.Status is not null) query = query.Where(s => s.Status == filter.Status);
        if (!string.IsNullOrWhiteSpace(filter.Search)) query = query.Where(s => s.SlotCode.Contains(filter.Search.Trim()));
        var assigned = query.Select(s => new
        {
            Slot = s,
            Allocation = db.SlotAllocations.Where(a => a.SlotId == s.SlotId && a.ReleasedAt == null
                && (a.Batch.Status == "InProduction" || a.Batch.Status == "Stocked"))
                .OrderByDescending(a => a.AllocatedAt)
                .Select(a => new { a.BatchId, a.Batch.BatchCode, a.AllocatedAt }).FirstOrDefault(),
        });
        return await assigned.OrderBy(s => s.Slot.SlotCode).Select(s => new BoxResponse(s.Slot.SlotCode, s.Slot.Status,
            s.Allocation == null ? null : s.Allocation.BatchCode,
            s.Allocation == null ? null : db.Evidences.Where(e => e.SlotId == s.Slot.SlotId
                && e.BatchId == s.Allocation.BatchId && e.ReceivedAt >= s.Allocation.AllocatedAt
                && e.MediaType == "Photo" && e.Source == "InAppCapture")
                .OrderByDescending(e => e.ReceivedAt).ThenByDescending(e => e.EvidenceId)
                .Select(e => new BoxEvidenceResponse(e.EvidenceId, e.ReceivedAt, e.ReviewStatus)).FirstOrDefault())).ToPagedAsync(paging, ct);
    }
}
