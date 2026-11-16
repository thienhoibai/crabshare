using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Quality;

public sealed class SiteVisitReportRequest
{
    [Required, Range(typeof(decimal), "-90", "90")] public decimal? Latitude { get; set; }
    [Required, Range(typeof(decimal), "-180", "180")] public decimal? Longitude { get; set; }
    /// <summary>Mã các hộp đã xem, cách nhau bằng dấu phẩy.</summary>
    [Required, StringLength(400, MinimumLength = 4)] public string BoxCodes { get; set; } = "";
    [Range(0, 100000)] public int CrabsSeen { get; set; }
    [Required, StringLength(1000, MinimumLength = 3)] public string Findings { get; set; } = "";
    /// <summary>Ảnh chụp tại trại trong ứng dụng.</summary>
    [Required] public IFormFile? Photo { get; set; }
}

public sealed record SiteVisitReportResponse(string ReportNo, string BatchCode, long QcUserId, DateTimeOffset VisitedAt, decimal Latitude, decimal Longitude,
    int? DistanceToFarmM, IReadOnlyList<string> BoxCodes, int CrabsSeen, string Findings);

/// <summary>
/// Biên bản thăm trại (BR-233): Nhân viên kiểm phẩm được phân ngẫu nhiên lập tại trại trong ứng dụng, kèm ảnh có vị trí, giờ máy chủ và số hộp;
/// là bằng chứng của mốc giải ngân giữa vụ. Vị trí phải ở trại (không quá 2 km từ địa điểm trại đã khai).
/// </summary>
public sealed class SiteVisitService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, QcAssignmentService qc, BatchAccess access,
    PartyDirectory parties, EvidenceImageProcessor images, IFileStorage files)
{
    public const int MaxDistanceM = 2000;

    public async Task<QcTaskResponse> AssignAsync(string batchCode, CancellationToken ct)
    {
        var assignmentId = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await db.Batches.SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                        ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
            if (batch.BatchMode != "P" || batch.Status is not ("InProduction" or "Harvesting"))
                throw new BusinessRuleException("sitevisit.not_applicable", "Thăm trại giữa vụ áp dụng cho lô P đang nuôi (BR-233).");
            var assignment = await qc.AssignAsync(QcAssignmentKinds.SiteVisit, batch.BatchId, "Batch", batch.BatchId, null, ct);
            await audit.WriteAsync("qc_assignment", assignment.QcAssignmentId, "assign_site_visit", null, new { batch.BatchCode, assignment.QcUserId }, ct);
            return assignment.QcAssignmentId;
        }, ct);
        return (await qc.MyTasksAsync(await db.QcAssignments.Where(a => a.QcAssignmentId == assignmentId).Select(a => a.QcUserId).SingleAsync(ct), ct))
            .Single(t => t.AssignmentId == assignmentId);
    }

    public async Task<SiteVisitReportResponse> SubmitAsync(long assignmentId, SiteVisitReportRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var image = await images.ReadAsync(req.Photo!, ct);
        StoredFile photo;
        await using (var stream = new MemoryStream(image.Bytes, writable: false))
            photo = await files.SaveAsync(stream, "visit" + image.Extension, image.ContentType, $"site-visits/{clock.GetUtcNow():yyyy/MM}", ct);
        var no = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var assignment = await db.QcAssignments.SingleOrDefaultAsync(a => a.QcAssignmentId == assignmentId, ct)
                             ?? throw new NotFoundException("sitevisit.assignment_not_found", "Không tìm thấy việc thăm trại.");
            if (assignment.AssignmentKind != QcAssignmentKinds.SiteVisit || assignment.QcUserId != me.UserId || assignment.Status != "Assigned")
                throw new ForbiddenException("qc.not_assigned", "Bạn không được phân công thăm trại này (BR-017, BR-233).");
            var batch = await db.Batches.SingleAsync(b => b.BatchId == assignment.BatchId, ct);
            var codes = req.BoxCodes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToList();
            var known = await db.PhysicalSlots.CountAsync(s => s.OperatorId == batch.OperatorId && codes.Contains(s.SlotCode), ct);
            if (codes.Count == 0 || known != codes.Count)
                throw new BusinessRuleException("sitevisit.unknown_box", "Có mã hộp không thuộc trại của Lô.");
            var farmParty = await parties.PartyIdOfOperatorAsync(batch.OperatorId, ct);
            var farm = await db.PartySites.AsNoTracking().Where(s => s.PartyId == farmParty && s.SiteType == "Farm" && s.Latitude != null && s.Longitude != null)
                .OrderByDescending(s => s.IsDefault).Select(s => new { s.Latitude, s.Longitude }).FirstOrDefaultAsync(ct);
            int? distance = farm is null ? null : (int)Math.Round(BatchExploreService.DistanceKm(farm.Latitude!.Value, farm.Longitude!.Value,
                req.Latitude!.Value, req.Longitude!.Value) * 1000);
            if (distance > MaxDistanceM)
                throw new BusinessRuleException("sitevisit.not_at_farm", $"Vị trí chụp cách trại {distance:N0} m; biên bản phải lập tại trại (BR-233).");
            var now = clock.GetUtcNow();
            var report = new SiteVisitReport
            {
                ReportNo = Codes.New("TT", 10), BatchId = batch.BatchId, QcAssignmentId = assignment.QcAssignmentId, QcUserId = me.UserId, VisitedAt = now,
                Latitude = decimal.Round(req.Latitude!.Value, 6), Longitude = decimal.Round(req.Longitude!.Value, 6), DistanceToFarmM = distance,
                BoxCodes = string.Join(',', codes), CrabsSeen = req.CrabsSeen, Findings = req.Findings.Trim(), PhotoUri = photo.Uri, PhotoSha256 = photo.Sha256,
                CreatedAt = now,
            };
            db.SiteVisitReports.Add(report);
            assignment.Status = "Completed";
            assignment.CompletedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("site_visit_report", report.ReportId, "submit", null,
                new { report.ReportNo, batch.BatchCode, report.BoxCodes, report.CrabsSeen, report.DistanceToFarmM, photo.Sha256 }, ct);
            return report.ReportNo;
        }, ct);
        return (await ListAsync(null, no, ct)).Single();
    }

    public async Task<IReadOnlyList<SiteVisitReportResponse>> ListAsync(string? batchCode, string? reportNo, CancellationToken ct)
    {
        var query = db.SiteVisitReports.AsNoTracking();
        if (batchCode is not null)
        {
            var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                        ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
            if (!me.IsInRole(Roles.PlatformAdmin) && !await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId, ct))
                await access.RequireOperatorOrAdminReadAsync(batch, ct);
            query = query.Where(r => r.BatchId == batch.BatchId);
        }
        if (reportNo is not null) query = query.Where(r => r.ReportNo == reportNo);
        var rows = await query.OrderBy(r => r.CreatedAt).ToListAsync(ct);
        var codes = await db.Batches.Where(b => rows.Select(r => r.BatchId).Contains(b.BatchId)).ToDictionaryAsync(b => b.BatchId, b => b.BatchCode, ct);
        return rows.Select(r => new SiteVisitReportResponse(r.ReportNo, codes[r.BatchId], r.QcUserId, r.VisitedAt, r.Latitude, r.Longitude, r.DistanceToFarmM,
            r.BoxCodes.Split(','), r.CrabsSeen, r.Findings)).ToList();
    }
}

[ApiController]
[Authorize]
public sealed class SiteVisitsController(SiteVisitService visits) : ControllerBase
{
    [HttpPost("api/admin/batches/{code}/site-visits"), Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Phân ngẫu nhiên Nhân viên kiểm phẩm thăm trại giữa vụ (BR-233)")]
    public async Task<ActionResult<QcTaskResponse>> Assign(string code, CancellationToken ct) => Ok(await visits.AssignAsync(code, ct));

    [HttpPost("api/qc/site-visits/{assignmentId:long}/report"), Authorize(Policy = Policies.Qc), Consumes("multipart/form-data")]
    [RequestSizeLimit(12 * 1024 * 1024)]
    [EndpointSummary("Nhân viên kiểm phẩm lập biên bản thăm trại tại trại, kèm ảnh có vị trí và số hộp (BR-233)")]
    public async Task<ActionResult<SiteVisitReportResponse>> Report(long assignmentId, [FromForm] SiteVisitReportRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await visits.SubmitAsync(assignmentId, req, ct));

    [HttpGet("api/batches/{code}/site-visits")]
    public async Task<ActionResult<IReadOnlyList<SiteVisitReportResponse>>> List(string code, CancellationToken ct) => Ok(await visits.ListAsync(code, null, ct));
}
