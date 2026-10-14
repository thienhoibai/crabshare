using System.Data;
using System.Linq.Expressions;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using EvidenceEntity = CrabShare.Api.Infrastructure.Persistence.Entities.Evidence;

namespace CrabShare.Api.Features.Evidence;

public sealed class EvidenceExplanationService(AppDbContext db, EvidenceAccess access, ICurrentUser me,
    EvidenceImageReader images, TimeProvider clock)
{
    private static readonly Expression<Func<EvidenceEntity, OperatorEvidenceItem>> Projection = e => new(
        e.EvidenceId, e.Batch.BatchCode, e.Slot == null ? null : e.Slot.SlotCode, e.MediaType, e.ReviewStatus,
        e.RiskScore, e.CapturedAt, e.ReceivedAt, e.Latitude, e.Longitude, e.Explanation, e.ExplainedAt,
        e.EvidenceReviews.OrderByDescending(r => r.ReviewedAt).ThenByDescending(r => r.EvidenceReviewId)
            .Select(r => new OperatorEvidenceReview(r.Verdict, r.Note, r.ReviewedAt)).FirstOrDefault(),
        e.ReviewStatus == "Flagged");

    public async Task<PagedResult<OperatorEvidenceItem>> ListAsync(OperatorEvidenceQuery filter, PageQuery paging, CancellationToken ct)
    {
        var operatorId = await access.RequireOperatorAsync(ct);
        var rows = db.Evidences.AsNoTracking().Where(e => e.Batch.OperatorId == operatorId);
        if (filter.Status is not null) rows = rows.Where(e => e.ReviewStatus == filter.Status);
        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var text = filter.Q.Trim(); var id = long.TryParse(text, out var parsed) ? parsed : -1;
            rows = rows.Where(e => e.EvidenceId == id || e.Batch.BatchCode.Contains(text) || (e.Slot != null && e.Slot.SlotCode.Contains(text)));
        }
        return await rows.OrderByDescending(e => e.ReceivedAt).ThenByDescending(e => e.EvidenceId).Select(Projection).ToPagedAsync(paging, ct);
    }
    public async Task<OperatorEvidenceItem> GetAsync(long id, CancellationToken ct)
    {
        var operatorId = await access.RequireOperatorAsync(ct);
        return await ReadAsync(id, operatorId, ct);
    }
    public async Task<EvidenceImageContent> OpenImageAsync(long id, CancellationToken ct)
    {
        var operatorId = await access.RequireOperatorAsync(ct);
        var row = await db.Evidences.AsNoTracking().Where(e => e.EvidenceId == id && e.Batch.OperatorId == operatorId)
            .Select(e => new { e.FileUri, e.MediaType }).SingleOrDefaultAsync(ct) ?? throw Missing();
        return await images.OpenAsync(row.FileUri, row.MediaType, ct);
    }
    public Task<OperatorEvidenceItem> ExplainAsync(long id, EvidenceExplanationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Length > 1000)
            throw new AppException(400, "evidence.invalid_explanation", "Giải trình cần có từ 1 đến 1000 ký tự.");
        var text = request.Text.Trim();
        return db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var previous = await AuditChain.LockAndReadTailAsync(db, ct);
            var operatorId = await access.RequireOperatorAsync(ct);
            var row = await db.Evidences.Include(e => e.EvidenceReviews)
                .SingleOrDefaultAsync(e => e.EvidenceId == id && e.Batch.OperatorId == operatorId, ct) ?? throw Missing();
            if (row.ReviewStatus != "Flagged")
                throw new ConflictException("evidence.explanation_closed", "Bằng chứng không còn chờ thẩm định. Vui lòng tải lại.");
            // Retrying the same submission does not add audit rows or reopen review eligibility.
            if (row.Explanation != text)
            {
                var now = AuditChain.Timestamp(clock.GetUtcNow());
                var latest = row.EvidenceReviews.Select(r => (DateTimeOffset?)r.ReviewedAt).Append(row.ExplainedAt).Max();
                if (latest is { } at && now <= at) now = at.AddMilliseconds(1);
                var old = AuditChain.Snapshot(new { row.Explanation, row.ExplainedAt, row.ReviewStatus });
                row.Explanation = text; row.ExplainedAt = now;
                var audit = new AuditLog { EntityType = "Evidence", EntityId = id, ActionType = "ExplainEvidence", OldValue = old,
                    NewValue = AuditChain.Snapshot(new { row.Explanation, row.ExplainedAt, row.ReviewStatus }), ActorUserId = me.UserId,
                    OccurredAt = now, PrevHash = previous };
                audit.RowHash = AuditChain.Hash(audit); db.AuditLogs.Add(audit);
                await db.SaveChangesAsync(ct);
            }
            var result = await ReadAsync(id, operatorId, ct);
            await transaction.CommitAsync(ct);
            return result;
        });
    }
    private async Task<OperatorEvidenceItem> ReadAsync(long id, long operatorId, CancellationToken ct) =>
        await db.Evidences.AsNoTracking().Where(e => e.EvidenceId == id && e.Batch.OperatorId == operatorId).Select(Projection).SingleOrDefaultAsync(ct)
        ?? throw Missing();
    private static NotFoundException Missing() => new("evidence.not_found", "Không tìm thấy bằng chứng của hộ nuôi.");
}
