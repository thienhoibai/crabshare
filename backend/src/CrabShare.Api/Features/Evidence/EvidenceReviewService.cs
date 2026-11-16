using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Evidence;

public sealed class EvidenceReviewService(AppDbContext db, ICurrentUser me, EvidenceImageReader images, TimeProvider clock)
{
    public async Task<PagedResult<ReviewEvidenceSummary>> ListAsync(EvidenceReviewQuery filter, PageQuery paging, CancellationToken ct)
    {
        await RequireReviewerAsync(ct);
        var query = db.Evidences.AsNoTracking().Where(e => !db.CapitalShares.Any(s => s.BatchId == e.BatchId && s.InvestorId == me.UserId)
            && !db.Contributions.Any(c => c.BatchId == e.BatchId && c.InvestorId == me.UserId && (c.Status == "Confirmed" || c.ConfirmedAt != null)));
        if (filter.Status is not null) query = query.Where(e => e.ReviewStatus == filter.Status);
        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var text = filter.Q.Trim(); var id = long.TryParse(text, out var parsed) ? parsed : -1;
            query = query.Where(e => e.EvidenceId == id || e.Batch.BatchCode.Contains(text) || e.Batch.Operator.LegalName.Contains(text)
                || (e.Slot != null && e.Slot.SlotCode.Contains(text)));
        }
        return await query.OrderBy(e => e.ReceivedAt).ThenBy(e => e.EvidenceId)
            .Select(e => new ReviewEvidenceSummary(e.EvidenceId, e.Batch.BatchCode, e.Batch.Title, e.Batch.Operator.LegalName,
                e.Slot == null ? null : e.Slot.SlotCode, e.MediaType, e.ReviewStatus, e.RiskScore, e.ReceivedAt)).ToPagedAsync(paging, ct);
    }
    public async Task<ReviewEvidenceDetail> GetAsync(long id, CancellationToken ct)
    {
        await RequireAccessAsync(id, ct);
        return Detail(await Load(id, ct));
    }
    public async Task<EvidenceImageContent> OpenImageAsync(long id, CancellationToken ct)
    {
        await RequireAccessAsync(id, ct);
        var row = await db.Evidences.AsNoTracking().SingleAsync(e => e.EvidenceId == id, ct);
        return await images.OpenAsync(row.FileUri, row.MediaType, ct);
    }
    public Task<ReviewEvidenceDetail> DecideAsync(long id, EvidenceVerdictRequest request, CancellationToken ct)
    {
        if (request.Verdict is not ("Pass" or "Fail" or "NeedMoreEvidence") || string.IsNullOrWhiteSpace(request.Note) || request.Note.Length > 500)
            throw new AppException(400, "evidence.invalid_verdict", "Cần chọn phán quyết và nhập ghi chú từ 1 đến 500 ký tự.");
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var note = request.Note.Trim();
        long? writtenReviewId = null;
        return db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var previous = await AuditChain.LockAndReadTailAsync(db, ct);
            await RequireAccessAsync(id, ct);
            var evidence = await Load(id, ct);
            var mine = evidence.EvidenceReviews.SingleOrDefault(r => r.ReviewerId == me.UserId);
            if (writtenReviewId is not null && mine?.EvidenceReviewId == writtenReviewId && mine.Verdict == request.Verdict && mine.Note == note && mine.ReviewedAt == now)
            {
                var persisted = Detail(evidence); await tx.CommitAsync(ct); return persisted;
            }
            if (!CanReview(evidence, mine))
                throw new ConflictException("evidence.review_changed", "Bằng chứng đã được xử lý hoặc đang chờ giải trình mới. Vui lòng tải lại.");
            var old = AuditChain.Snapshot(new { evidence.ReviewStatus, Review = mine == null ? null : Decision(mine) });
            if (mine == null)
            {
                mine = new EvidenceReview { EvidenceId = id, ReviewerId = me.UserId };
                evidence.EvidenceReviews.Add(mine);
            }
            mine.Verdict = request.Verdict; mine.Note = note; mine.ReviewedAt = now;
            evidence.ReviewStatus = request.Verdict switch { "Pass" => "Accepted", "Fail" => "Rejected", _ => "Flagged" };
            await db.SaveChangesAsync(ct);
            writtenReviewId = mine.EvidenceReviewId;
            var audit = new AuditLog { EntityType = "Evidence", EntityId = id, ActionType = "ReviewEvidence", OldValue = old,
                NewValue = AuditChain.Snapshot(new { evidence.ReviewStatus, mine.EvidenceReviewId, mine.ReviewerId, mine.Verdict, mine.Note, mine.ReviewedAt }),
                ActorUserId = me.UserId, OccurredAt = now, PrevHash = previous };
            audit.RowHash = AuditChain.Hash(audit); db.AuditLogs.Add(audit); await db.SaveChangesAsync(ct);
            var result = Detail(await Load(id, ct));
            await tx.CommitAsync(ct);
            return result;
        });
    }
    private Task<Infrastructure.Persistence.Entities.Evidence> Load(long id, CancellationToken ct) => db.Evidences
        .AsSplitQuery()
        .Include(e => e.Batch).ThenInclude(b => b.Operator).Include(e => e.Slot)
        .Include(e => e.EvidenceDetections).Include(e => e.EvidenceReviews).ThenInclude(r => r.Reviewer)
        .SingleAsync(e => e.EvidenceId == id, ct);
    private async Task RequireAccessAsync(long id, CancellationToken ct)
    {
        await RequireReviewerAsync(ct);
        var batchId = await db.Evidences.AsNoTracking().Where(e => e.EvidenceId == id).Select(e => (long?)e.BatchId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("evidence.not_found", "Không tìm thấy bằng chứng.");
        if (await db.CapitalShares.AnyAsync(s => s.BatchId == batchId && s.InvestorId == me.UserId, ct)
            || await db.Contributions.AnyAsync(c => c.BatchId == batchId && c.InvestorId == me.UserId && (c.Status == "Confirmed" || c.ConfirmedAt != null), ct))
            throw new ForbiddenException("evidence.reviewer_conflict", "Không được thẩm định bằng chứng của lô mà bạn đã góp vốn.");
    }
    private async Task RequireReviewerAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.EvidenceReviewer) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active"
            && u.AppUserRoles.Any(r => r.RoleCode == Roles.EvidenceReviewer), ct))
            throw new ForbiddenException("evidence.reviewer_required", "Chỉ kiểm định viên đang có quyền mới được thẩm định bằng chứng.");
    }
    private bool CanReview(Infrastructure.Persistence.Entities.Evidence e, EvidenceReview? mine) => e.ReviewStatus == "Watch"
        ? mine == null
        : e.ReviewStatus == "Flagged" && (mine == null || (mine.Verdict == "NeedMoreEvidence" && e.ExplainedAt > mine.ReviewedAt));
    private ReviewEvidenceDetail Detail(Infrastructure.Persistence.Entities.Evidence e) => new(
        new(e.EvidenceId, e.Batch.BatchCode, e.Batch.Title, e.Batch.Operator.LegalName, e.Slot?.SlotCode, e.MediaType, e.ReviewStatus, e.RiskScore, e.ReceivedAt),
        e.Source, e.CapturedAt, e.Latitude, e.Longitude, e.Sha256, e.PerceptualHash, e.Explanation, e.ExplainedAt,
        e.EvidenceDetections.OrderByDescending(d => d.DetectedAt).Select(d => new ReviewDetection(d.ModelVersion, d.CrabDetected, d.Confidence, d.BboxJson, d.DetectedAt)).ToList(),
        e.EvidenceReviews.OrderByDescending(r => r.ReviewedAt).Select(Decision).ToList(),
        CanReview(e, e.EvidenceReviews.SingleOrDefault(r => r.ReviewerId == me.UserId)));
    private static ReviewDecision Decision(EvidenceReview r) => new(r.EvidenceReviewId, r.ReviewerId, r.Reviewer.FullName, r.Verdict, r.Note, r.ReviewedAt);
}
