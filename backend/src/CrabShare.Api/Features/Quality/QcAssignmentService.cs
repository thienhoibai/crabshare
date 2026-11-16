using System.Security.Cryptography;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Quality;

public static class QcAssignmentKinds
{
    public const string IncomingInspection = "IncomingInspection";
    public const string GradingSession = "GradingSession";
    public const string SecondReview = "SecondReview";
    public const string SiteVisit = "SiteVisit";
    public const string Dispatch = "Dispatch";
    public const string Dispute = "Dispute";
}

/// <summary>
/// Phân ngẫu nhiên Nhân viên kiểm phẩm từ pool của nền tảng (BR-017): người nuôi, nhà đầu tư và khách không chọn được người kiểm;
/// người kiểm không kiểm Lô mà mình hoặc đối tác của mình là người nuôi, nhà cung cấp hay nhà đầu tư, kể cả bên liên quan của người nuôi.
/// </summary>
public sealed class QcAssignmentService(AppDbContext db, PartyDirectory parties, TimeProvider clock)
{
    /// <summary>Những người trong pool được kiểm Lô này.</summary>
    public async Task<IReadOnlyList<long>> EligibleAsync(long batchId, IReadOnlyCollection<long>? exclude, CancellationToken ct)
    {
        var pool = await db.AppUserRoles.AsNoTracking()
            .Where(r => r.RoleCode == Roles.QcInspector && r.User.Status == "Active" && !db.OperatorMembers.Any(m => m.UserId == r.UserId))
            .Select(r => new { r.UserId, r.User.PartyId }).ToListAsync(ct);
        var executor = await db.Batches.Where(b => b.BatchId == batchId).Select(b => b.ExecutorPartyId).SingleOrDefaultAsync(ct);
        var related = executor is null ? [] : await db.RelatedParties.Where(r => r.PartyId == executor && r.LinkedPartyId != null)
            .Select(r => r.LinkedPartyId!.Value).ToListAsync(ct);
        var eligible = new List<long>();
        foreach (var qc in pool)
        {
            if (exclude?.Contains(qc.UserId) == true) continue;
            if (qc.PartyId is { } partyId && (await parties.HasStakeInBatchAsync(batchId, partyId, ct) || related.Contains(partyId))) continue;
            eligible.Add(qc.UserId);
        }
        return eligible;
    }

    /// <summary>Phân một người kiểm cho một việc (buổi kiểm đầu vào, buổi đo, xác nhận lần hai, thăm trại). Gọi trong transaction của bên gọi.</summary>
    public async Task<QcAssignment> AssignAsync(string kind, long batchId, string targetType, long targetId, IReadOnlyCollection<long>? exclude,
        CancellationToken ct)
    {
        var existing = await db.QcAssignments.SingleOrDefaultAsync(a => a.AssignmentKind == kind && a.TargetType == targetType &&
            a.TargetId == targetId && a.Status == "Assigned", ct);
        if (existing is not null) return existing;
        var eligible = await EligibleAsync(batchId, exclude, ct);
        if (eligible.Count == 0)
            throw new BusinessRuleException("qc.pool_empty", "Không còn Nhân viên kiểm phẩm nào không có quan hệ với Lô này; Admin cần bổ sung pool (BR-017).");
        var assignment = new QcAssignment
        {
            AssignmentKind = kind, BatchId = batchId, TargetType = targetType, TargetId = targetId,
            QcUserId = eligible[RandomNumberGenerator.GetInt32(eligible.Count)], AssignedAt = clock.GetUtcNow(), Status = "Assigned",
        };
        db.QcAssignments.Add(assignment);
        await db.SaveChangesAsync(ct);
        return assignment;
    }

    /// <summary>Chỉ người được phân mới làm việc đó.</summary>
    public async Task<QcAssignment> RequireAssignedAsync(long userId, string kind, string targetType, long targetId, CancellationToken ct)
        => await db.QcAssignments.SingleOrDefaultAsync(a => a.AssignmentKind == kind && a.TargetType == targetType && a.TargetId == targetId &&
               a.Status == "Assigned" && a.QcUserId == userId, ct)
           ?? throw new ForbiddenException("qc.not_assigned", "Bạn không được phân công kiểm việc này (BR-017).");

    public async Task CompleteAsync(string kind, string targetType, long targetId, CancellationToken ct)
    {
        var assignment = await db.QcAssignments.SingleOrDefaultAsync(a => a.AssignmentKind == kind && a.TargetType == targetType &&
            a.TargetId == targetId && a.Status == "Assigned", ct);
        if (assignment is null) return;
        assignment.Status = "Completed";
        assignment.CompletedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Việc đang chờ của một Nhân viên kiểm phẩm.</summary>
    public async Task<IReadOnlyList<QcTaskResponse>> MyTasksAsync(long userId, CancellationToken ct)
        => await db.QcAssignments.AsNoTracking().Where(a => a.QcUserId == userId && a.Status == "Assigned").OrderBy(a => a.AssignedAt)
            .Select(a => new QcTaskResponse(a.QcAssignmentId, a.AssignmentKind, db.Batches.Where(b => b.BatchId == a.BatchId).Select(b => b.BatchCode).First(),
                a.TargetType, a.TargetId, a.AssignedAt)).ToListAsync(ct);
}

public sealed record QcTaskResponse(long AssignmentId, string Kind, string BatchCode, string TargetType, long TargetId, DateTimeOffset AssignedAt);
