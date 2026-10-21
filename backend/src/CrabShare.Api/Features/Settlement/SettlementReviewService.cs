using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Settlement;

/// <summary>
/// UC37 công bố, UC35 sao kê, UC36 góp ý trong hạn (TH-13, TL-14 Bước 3–4): admin công bố bảng nháp → Proposed, mở cửa sổ góp ý.
/// Nhà đầu tư của lô xem tổng và đúng dòng của mình; người nuôi và admin xem mọi dòng. Bản nháp chỉ admin thấy.
/// Có góp ý đang mở → Disputed; trả lời hết → về Proposed. Góp ý sau hạn → 422 settlement.feedback_closed.
/// </summary>
public sealed class SettlementReviewService(AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock, SettlementService settlements)
{
    // ---------- Admin ----------

    public Task<SettlementResponse> ProposeAsync(long settlementId, ProposeSettlementRequest req, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var s = await db.Settlements.SingleOrDefaultAsync(x => x.SettlementId == settlementId, ct) ?? throw NotFound();
        if (s.Status != "Draft")
            throw new BusinessRuleException("settlement.not_draft", "Chỉ công bố được bảng nháp. Muốn đổi số liệu thì tính lại rồi công bố lại.");
        var now = Now();
        s.Status = "Proposed";
        s.ProposedAt = now;
        s.FeedbackDeadline = now.AddDays(req.FeedbackDays);
        s.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("settlement", s.SettlementId, "propose", new { status = "Draft" },
            new { s.Status, s.RevisionNo, proposedAt = now, s.FeedbackDeadline, req.FeedbackDays }, now, ct);
        return await settlements.DescribeAsync(s.SettlementId, SettlementService.Viewer.Admin, ct);
    }, ct);

    public Task<SettlementResponse> AnswerAsync(long feedbackId, AnswerFeedbackRequest req, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var feedback = await db.SettlementFeedbacks.Include(f => f.Settlement).ThenInclude(s => s.SettlementFeedbacks)
            .SingleOrDefaultAsync(f => f.FeedbackId == feedbackId, ct)
            ?? throw new NotFoundException("settlement.feedback_not_found", "Không tìm thấy góp ý.");
        if (feedback.Status != "Open")
            throw new ConflictException("settlement.feedback_answered", "Góp ý này đã được trả lời.");
        var now = Now();
        feedback.Status = req.Unresolved ? "Unresolved" : "Answered";
        feedback.Response = req.Response.Trim();
        feedback.RespondedAt = now;
        feedback.UpdatedAt = now;
        var settlement = feedback.Settlement;
        var before = settlement.Status;
        if (settlement.Status == "Disputed" && settlement.SettlementFeedbacks.All(f => f.FeedbackId == feedbackId || f.Status != "Open"))
        {
            settlement.Status = "Proposed";
            settlement.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("settlement_feedback", feedback.FeedbackId, "answer", new { status = "Open" },
            new { feedback.Status, feedback.Response, feedback.SettlementId, settlementStatus = settlement.Status, settlementStatusBefore = before }, now, ct);
        return await settlements.DescribeAsync(settlement.SettlementId, SettlementService.Viewer.Admin, ct);
    }, ct);

    // ---------- Các bên của lô ----------

    /// <summary>UC35 sao kê: nhà đầu tư thấy tổng + dòng của mình; người nuôi, admin thấy đủ. Bảng nháp hoặc người ngoài → 404.</summary>
    public async Task<SettlementResponse> GetForPartyAsync(long settlementId, CancellationToken ct)
        => await settlements.DescribeAsync(settlementId, await RequireViewerAsync(settlementId, ct), ct);

    /// <summary>UC36: góp ý trong hạn, kèm căn cứ. Proposed → Disputed.</summary>
    public Task<SettlementResponse> FeedbackAsync(long settlementId, SettlementFeedbackRequest req, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        if (await RequireViewerAsync(settlementId, ct) != SettlementService.Viewer.Investor)
            throw new ForbiddenException("settlement.investor_only", "Chỉ nhà đầu tư của lô mới góp ý bảng quyết toán.");
        var s = await db.Settlements.SingleAsync(x => x.SettlementId == settlementId, ct);
        var now = Now();
        if (s.Status is not ("Proposed" or "Disputed") || s.FeedbackDeadline is not { } deadline || now > deadline)
            throw new BusinessRuleException("settlement.feedback_closed", "Đã hết hạn góp ý bảng quyết toán này.");
        var feedback = new SettlementFeedback
        {
            SettlementId = s.SettlementId, UserId = me.UserId, Content = req.Content.Trim(), Status = "Open", CreatedAt = now, UpdatedAt = now,
        };
        db.SettlementFeedbacks.Add(feedback);
        var before = s.Status;
        s.Status = "Disputed";
        s.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("settlement_feedback", feedback.FeedbackId, "create", null,
            new { feedback.SettlementId, feedback.Content, settlementStatus = s.Status, settlementStatusBefore = before }, now, ct);
        return await settlements.DescribeAsync(s.SettlementId, SettlementService.Viewer.Investor, ct);
    }, ct);

    /// <summary>Bảng quyết toán đã công bố của các lô tôi góp vốn.</summary>
    public async Task<IReadOnlyList<SettlementSummary>> ListMineAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.Investor)) throw new ForbiddenException("auth.investor_only", "Chỉ nhà đầu tư mới có sao kê quyết toán.");
        var userId = me.UserId;
        var now = clock.GetUtcNow();
        return await db.Settlements.AsNoTracking()
            .Where(s => s.Status != "Draft" && s.Batch.CapitalShares.Any(c => c.InvestorId == userId))
            .OrderByDescending(s => s.ProposedAt)
            .Select(s => new SettlementSummary(
                s.SettlementId, s.Batch.BatchCode, s.Batch.Title, s.Status, s.RevisionNo, (long)s.RevenuePool,
                s.SettlementLines.Where(l => l.InvestorId == userId).Select(l => (long?)l.NetPayout).FirstOrDefault(),
                s.FeedbackDeadline, (s.Status == "Proposed" || s.Status == "Disputed") && s.FeedbackDeadline >= now,
                s.SettlementFeedbacks.Count(f => f.UserId == userId && f.Status == "Open")))
            .ToListAsync(ct);
    }

    /// <summary>Bảng quyết toán đã công bố của các lô thuộc hộ nuôi của tôi.</summary>
    public async Task<IReadOnlyList<SettlementSummary>> ListForOperatorAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var now = clock.GetUtcNow();
        return await db.Settlements.AsNoTracking()
            .Where(s => s.Status != "Draft" && s.Batch.OperatorId == operatorId)
            .OrderByDescending(s => s.ProposedAt)
            .Select(s => new SettlementSummary(
                s.SettlementId, s.Batch.BatchCode, s.Batch.Title, s.Status, s.RevisionNo, (long)s.RevenuePool, null,
                s.FeedbackDeadline, (s.Status == "Proposed" || s.Status == "Disputed") && s.FeedbackDeadline >= now,
                s.SettlementFeedbacks.Count(f => f.Status == "Open")))
            .ToListAsync(ct);
    }

    /// <summary>Người đang xem là ai với bảng này; bản nháp chỉ admin thấy. Không có quyền → 404 (không lộ là có bảng).</summary>
    private async Task<SettlementService.Viewer> RequireViewerAsync(long settlementId, CancellationToken ct)
    {
        var s = await db.Settlements.AsNoTracking().Where(x => x.SettlementId == settlementId)
            .Select(x => new { x.Status, x.BatchId, x.Batch.OperatorId })
            .SingleOrDefaultAsync(ct) ?? throw NotFound();
        if (me.IsInRole(Roles.PlatformAdmin)) return SettlementService.Viewer.Admin;
        if (s.Status == "Draft") throw NotFound();
        if (me.IsInRole(Roles.Investor) && await db.CapitalShares.AnyAsync(c => c.BatchId == s.BatchId && c.InvestorId == me.UserId, ct))
            return SettlementService.Viewer.Investor;
        if (me.OperatorId == s.OperatorId) return SettlementService.Viewer.Operator;
        throw NotFound();
    }

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());

    private static NotFoundException NotFound() => new("settlement.not_found", "Không tìm thấy bảng quyết toán.");
}
