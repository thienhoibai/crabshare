using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed partial class TimelineService(AppDbContext db, ICurrentUser me, EvidenceImageReader images, IFileStorage storage)
{
    private static readonly TimeSpan Vietnam = TimeSpan.FromHours(7);
    private static ForbiddenException Denied() => new("timeline.access_denied", "Bạn chưa có quyền xem nhật trình sản xuất của lô này.");
    private static DateOnly BusinessDate(DateTimeOffset at) => DateOnly.FromDateTime(at.ToOffset(Vietnam).DateTime);
    private static DateTimeOffset Midnight(DateOnly date) => new(date.ToDateTime(TimeOnly.MinValue), Vietnam);

    private async Task<long> RequireBatchAsync(string code, CancellationToken ct)
    {
        if (!await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active", ct))
            throw Denied();
        var batch = await db.Batches.AsNoTracking().Where(b => b.BatchCode == code)
            .Select(b => new { b.BatchId, b.OperatorId }).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        var roles = await db.AppUserRoles.Where(r => r.UserId == me.UserId).Select(r => r.RoleCode).ToListAsync(ct);
        bool Has(string role) => me.IsInRole(role) && roles.Contains(role);
        if (Has(Roles.PlatformAdmin))
            return batch.BatchId;
        if (Has(Roles.OperatorMember))
        {
            var member = await db.OperatorMembers.AsNoTracking().Where(m => m.UserId == me.UserId)
                .Select(m => new { m.OperatorId, m.MemberRole }).SingleOrDefaultAsync(ct);
            if (member is not null && member.MemberRole is "Owner" or "Staff" && member.OperatorId == batch.OperatorId
                && (me.OperatorId is null || me.OperatorId == member.OperatorId))
                return batch.BatchId;
        }
        if (Has(Roles.Investor) &&
            (await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId, ct)
             || await db.Contributions.AnyAsync(c => c.BatchId == batch.BatchId && c.InvestorId == me.UserId && c.Status == "Confirmed", ct)))
            return batch.BatchId;
        throw Denied();
    }

    public async Task<TimelinePage> ReadAsync(string code, TimelineQuery query, CancellationToken ct)
    {
        BatchService.Validate(query);
        var batchId = await RequireBatchAsync(code, ct);
        // Lấy thêm một ngày để biết còn trang sau; các nguồn cùng ngày được gộp một lần.
        var beforeDate = query.Before ?? DateOnly.MaxValue;
        // Ngày nhỏ nhất không thể lùi thêm sang UTC; trả trang rỗng trước khi truy vấn SQL.
        if (beforeDate == DateOnly.MinValue)
            return new(code, "Asia/Ho_Chi_Minh", [], null, false);
        var beforeAt = query.Before is null ? DateTimeOffset.MaxValue : Midnight(beforeDate);
        var dates = await db.Database.SqlQuery<DateOnly>($"""
            SELECT TOP ({query.Days + 1}) d.[Value]
            FROM (
                SELECT log_date AS [Value] FROM dbo.production_log
                    WHERE batch_id = {batchId} AND log_date < {beforeDate}
                UNION
                SELECT CONVERT(date, SWITCHOFFSET(occurred_at, '+07:00')) FROM dbo.slot_event
                    WHERE batch_id = {batchId} AND occurred_at < {beforeAt}
                UNION
                SELECT CONVERT(date, SWITCHOFFSET(COALESCE(captured_at, received_at), '+07:00')) FROM dbo.evidence
                    WHERE batch_id = {batchId} AND review_status = 'Accepted'
                    AND (captured_at < {beforeAt} OR (captured_at IS NULL AND received_at < {beforeAt}))
                UNION
                SELECT CONVERT(date, SWITCHOFFSET(raised_at, '+07:00')) FROM dbo.alert
                    WHERE batch_id = {batchId} AND raised_at < {beforeAt}
            ) d ORDER BY d.[Value] DESC
            """).ToListAsync(ct);
        var hasMore = dates.Count > query.Days;
        var selected = dates.Take(query.Days).ToArray();
        if (selected.Length == 0)
            return new(code, "Asia/Ho_Chi_Minh", [], null, false);
        var items = await ReadItemsAsync(batchId, code, selected[^1], selected[0], ct);
        var groups = selected.Select(date => new TimelineDay(date, items.Where(i => i.BusinessDate == date)
            .OrderByDescending(i => i.OccurredAt).ThenBy(i => i.Type, StringComparer.Ordinal)
            .ThenByDescending(i => long.Parse(i.SourceId, System.Globalization.CultureInfo.InvariantCulture)).ToArray())).ToArray();
        return new(code, "Asia/Ho_Chi_Minh", groups, hasMore ? selected[^1] : null, hasMore);
    }

    public async Task<TimelineFile> OpenFileAsync(string code, long id, CancellationToken ct)
    {
        var batchId = await RequireBatchAsync(code, ct);
        var evidence = await db.Evidences.AsNoTracking()
            .Where(e => e.EvidenceId == id && e.BatchId == batchId && e.ReviewStatus == "Accepted")
            .Select(e => new { e.FileUri, e.MediaType }).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("timeline.evidence_not_found", "Bằng chứng không tồn tại hoặc chưa được phép xem.");
        if (evidence.MediaType == "Photo")
        {
            var image = await images.OpenAsync(evidence.FileUri, evidence.MediaType, ct);
            return new(image.Stream, image.ContentType, null);
        }
        try
        {
            var extension = Path.GetExtension(evidence.FileUri).ToLowerInvariant();
            var safeExtension = extension is ".pdf" or ".mp4" or ".webm" or ".jpg" or ".png" ? extension : ".bin";
            return new(await storage.OpenReadAsync(evidence.FileUri, ct), "application/octet-stream", $"evidence-{id}{safeExtension}");
        }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException or UnauthorizedAccessException)
        {
            throw new NotFoundException("evidence.file_not_found", "Không tìm thấy file bằng chứng.");
        }
    }
}
