using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

public sealed record TrancheResponse(byte No, string? Kind, string? Name, decimal? Pct, long PlannedAmount, string Status, string UnlockCondition,
    DateTimeOffset? ReleasedAt);
public sealed record AdminBatchResponse(BatchResponse Batch, string OperatorName, string OperatorStatus, DateTimeOffset? ApprovedAt, long? ApprovedBy,
    IReadOnlyList<TrancheResponse> Tranches);

/// <summary>
/// Admin duyệt Lô (BR-051…053, BR-104): duyệt chế độ lô, kế hoạch chi phí, chào giá, giá sàn, bậc thù lao, mốc giải ngân.
/// Lô P mở gọi vốn; lô T, A chuyển Sourcing và nhận đặt trước tới hạn đặt trước. Khi duyệt: khoá kế hoạch chi phí, sản lượng,
/// chào giá và giá sàn; chốt tỷ lệ phí nền tảng; mở tài khoản của Lô tại tổ chức trung gian.
/// </summary>
public sealed class BatchReviewService(AppDbContext db, BatchService batches, ICurrentUser me, TimeProvider clock, IAuditLog audit,
    IPaymentGateway gateway, PlatformParameters parameters, PartyDirectory parties)
{
    private async Task RequireAdminAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.PlatformAdmin) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active" &&
                u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct))
            throw new ForbiddenException("batch.admin_required", "Chỉ quản trị viên đang có quyền được xét duyệt lô.");
    }

    public async Task<PagedResult<AdminBatchResponse>> ListAsync(BatchListQuery filter, PageQuery paging, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var page = await db.Batches.AsNoTracking().Include(b => b.Operator)
            .Where(b => (filter.Status == null || b.Status == filter.Status) && (filter.BatchMode == null || b.BatchMode == filter.BatchMode))
            .OrderByDescending(b => b.BatchId).ToPagedAsync(paging, ct);
        var items = new List<AdminBatchResponse>();
        foreach (var b in page.Items) items.Add(await DetailAsync(b, ct, includeCost: false));
        return new(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<AdminBatchResponse> GetAsync(string code, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var b = await db.Batches.AsNoTracking().Include(b => b.Operator).SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        return await DetailAsync(b, ct);
    }

    private Task<T> WriteAsync<T>(string code, Func<Batch, Task<T>> work, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        await RequireAdminAsync(ct);
        var operatorId = await db.Batches.Where(b => b.BatchCode == code).Select(b => (long?)b.OperatorId).SingleOrDefaultAsync(ct)
                         ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        var farm = await db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH(UPDLOCK,HOLDLOCK) WHERE operator_id={operatorId}").SingleAsync(ct);
        var batch = await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH(UPDLOCK,HOLDLOCK) WHERE batch_code={code}").SingleAsync(ct);
        batch.Operator = farm;
        if (batch.Status != "PendingApproval")
            throw new BusinessRuleException("batch.invalid_transition", "Chỉ Lô đang chờ duyệt (PendingApproval) được xét duyệt; vui lòng tải lại.");
        return await work(batch);
    }, ct, IsolationLevel.Serializable);

    public Task<AdminBatchResponse> ApproveAsync(string code, ApproveBatchRequest req, CancellationToken ct) => WriteAsync(code, async b =>
    {
        var now = clock.GetUtcNow();
        if (b.Operator.Status != "Approved")
            throw new BusinessRuleException("batch.operator_not_approved", "Hộ nuôi phải đang ở trạng thái Approved.");
        var cost = await batches.CostAsync(b.BatchId, ct);
        if (cost is null || cost.Status != "Submitted" ||
            await db.StandardCostVersions.AnyAsync(v => v.BatchId == b.BatchId && v.Status == "Locked", ct))
            throw new BusinessRuleException("batch.invalid_cost_version", "Cần đúng một phiên bản kế hoạch chi phí đã gửi, chưa có phiên bản khoá.");
        await batches.ValidateForReviewAsync(b, cost, ct);
        var receipt = b.ExpectedReceiptDate is { } date ? new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)) : (DateTimeOffset?)null;
        var before = await DetailAsync(b, ct);

        if (b.BatchMode == "P")
        {
            if (req.FundingOpenAt is not { } open || req.FundingDeadline is not { } deadline)
                throw new BusinessRuleException("batch.funding_time_required", "Lô P cần thời điểm mở và hạn gọi vốn.");
            if (open >= deadline || deadline <= now)
                throw new BusinessRuleException("batch.invalid_funding_time", "Thời điểm mở phải trước hạn gọi vốn và hạn gọi vốn phải ở tương lai.");
            if (receipt is not null && deadline >= receipt)
                throw new BusinessRuleException("batch.deadline_after_receipt", "Hạn gọi vốn phải trước ngày nhận hàng dự kiến (BR-050).");
            b.FundingOpenAt = open.ToUniversalTime();
            b.FundingDeadline = deadline.ToUniversalTime();
            // BR-188, BR-218: tỷ lệ phí và mức góp tối thiểu cố định theo Lô từ lúc Lô mở gọi vốn.
            b.PlatformFeeRatePct = await parameters.GetAsync(ParamKeys.PlatformFeeRatePct, b.FundingOpenAt, ct);
            b.MinContribution = await parameters.GetVndAsync(ParamKeys.MinContributionVnd, b.FundingOpenAt, ct);
            b.Status = "Funding";
        }
        else
        {
            if (req.PreorderDeadline is not { } preorder || preorder <= now)
                throw new BusinessRuleException("batch.preorder_deadline_required", "Lô T, A cần hạn đặt trước ở tương lai (BR-085).");
            if (receipt is not null && preorder >= receipt)
                throw new BusinessRuleException("batch.deadline_after_receipt", "Hạn đặt trước phải trước ngày nhận hàng dự kiến.");
            b.PreorderDeadline = preorder.ToUniversalTime();
            // Lô T, A: số con đặt trước được bằng sản lượng kế hoạch (BR-055); chuyển Sourcing khi được duyệt (BR-104).
            b.FundedQuantity = b.SeedQuantity;
            b.Status = "Sourcing";
            b.SourcingStartedAt = now;
        }

        // BR-053: khoá kế hoạch chi phí cùng Chi phí chuẩn mỗi con, sản lượng, chào giá và giá sàn.
        var perCrab = BatchService.CostPerCrab(BatchService.CostTotal(cost.StandardCostItems), b.SeedQuantity);
        b.StandardCostPerCrab = perCrab;
        b.TargetCapital = b.MaxCapital = perCrab * b.SeedQuantity;
        b.ApprovedAt = b.UpdatedAt = now;
        b.ApprovedBy = me.UserId;
        b.RejectionReason = null;
        // BR-038: Lô dùng bộ quy tắc phân hạng có hiệu lực lúc được duyệt cho tới khi Lô đóng.
        b.GradeRuleSetId = await db.GradeRuleSets.Where(s => s.CrabType == b.CrabType && s.Status == "Active")
            .Select(s => (long?)s.RuleSetId).SingleOrDefaultAsync(ct);
        cost.Status = "Locked";
        cost.LockedAt = cost.ApprovedAt = cost.UpdatedAt = now;
        cost.ApprovedBy = me.UserId;

        var account = await db.BatchAccounts.SingleOrDefaultAsync(a => a.BatchId == b.BatchId, ct);
        var accountCreated = account is null;
        if (account is null)
        {
            if (gateway is not IBatchAccountProvisioner provisioner)
                throw new BusinessRuleException("batch.account_provider_unavailable", "Cổng thanh toán chưa hỗ trợ mở tài khoản Lô.");
            var opened = await provisioner.OpenBatchAccountAsync(b.BatchCode, ct);
            account = new BatchAccount
            {
                BatchId = b.BatchId, ProviderName = opened.ProviderName, ProviderAccountNo = opened.AccountNo, Status = "Open",
                OpenedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.BatchAccounts.Add(account);
        }
        else if (account.Status != "Open")
            throw new BusinessRuleException("batch.account_not_open", "Tài khoản của Lô chưa mở.");
        await db.SaveChangesAsync(ct);
        // Bên cam kết thu mua tham gia Lô với vai trò này (BR-044).
        await parties.AddParticipantAsync(b.BatchId, b.OfftakeBuyerPartyId!.Value, ParticipantRoles.OfftakeBuyer, ct);

        var after = await DetailAsync(b, ct);
        await audit.WriteAsync("batch", b.BatchId, "approve", before, after, now, ct);
        if (accountCreated)
            await audit.WriteAsync("batch_account", account.BatchAccountId, "create", null,
                new { account.BatchAccountId, account.BatchId, account.ProviderName, account.ProviderAccountNo, account.Status, account.OpenedAt }, now, ct);
        return after;
    }, ct);

    /// <summary>BR-052: Lô bị từ chối không mở lại được; người nuôi tạo Lô mới.</summary>
    public Task<AdminBatchResponse> RejectAsync(string code, RejectBatchRequest req, CancellationToken ct) => WriteAsync(code, async b =>
    {
        BatchService.Validate(req);
        var before = await DetailAsync(b, ct);
        b.Status = "Rejected";
        b.RejectionReason = req.Reason.Trim();
        b.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        var after = await DetailAsync(b, ct);
        await audit.WriteAsync("batch", b.BatchId, "reject", before, after, ct);
        return after;
    }, ct);

    /// <summary>BR-052: yêu cầu sửa → NeedsRevision; người nuôi sửa rồi gửi lại. Bản chi phí đã gửi giữ nguyên; lần lưu sau tạo phiên bản mới (BR-036).</summary>
    public Task<AdminBatchResponse> RequestRevisionAsync(string code, RejectBatchRequest req, CancellationToken ct) => WriteAsync(code, async b =>
    {
        BatchService.Validate(req);
        var before = await DetailAsync(b, ct);
        b.Status = "NeedsRevision";
        b.RejectionReason = req.Reason.Trim();
        b.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        var after = await DetailAsync(b, ct);
        await audit.WriteAsync("batch", b.BatchId, "request_revision", before, after, ct);
        return after;
    }, ct);

    private async Task<AdminBatchResponse> DetailAsync(Batch b, CancellationToken ct, bool includeCost = true)
    {
        var tranches = await db.DisbursementTranches.AsNoTracking().Where(t => t.BatchId == b.BatchId).OrderBy(t => t.TrancheNo)
            .Select(t => new TrancheResponse(t.TrancheNo, t.MilestoneKind, t.MilestoneName, t.Pct, (long)t.PlannedAmount, t.Status,
                t.UnlockCondition, t.ReleasedAt)).ToListAsync(ct);
        var farm = b.Operator ?? await db.Operators.AsNoTracking().SingleAsync(o => o.OperatorId == b.OperatorId, ct);
        return new AdminBatchResponse(await batches.ResponseAsync(b, ct, b.BatchMode != "P", includeCost), farm.LegalName, farm.Status,
            b.ApprovedAt, b.ApprovedBy, tranches);
    }
}
