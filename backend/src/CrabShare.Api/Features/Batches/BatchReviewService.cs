using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Payments;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

public sealed class BatchReviewService(AppDbContext db, BatchService batches, ICurrentUser me, TimeProvider clock, IAuditLog audit, IPaymentGateway gateway)
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
        var query = db.Batches.AsNoTracking().Include(b => b.Operator).Include(b => b.FeeTier).AsQueryable();
        if (filter.Status is not null)
            query = query.Where(b => b.Status == filter.Status);
        var page = await query.OrderByDescending(b => b.BatchId).ToPagedAsync(paging, ct);
        var priceMap = new Dictionary<long, IReadOnlyList<OfftakePriceResponse>>();
        foreach (var id in page.Items.Select(b => b.BatchId).Distinct())
            priceMap[id] = await batches.OfftakePricesAsync(id, ct);
        return new(page.Items.Select(b => Response(b, null, [], priceMap.GetValueOrDefault(b.BatchId, []))).ToList(),
            page.Page, page.PageSize, page.Total);
    }
    public async Task<AdminBatchResponse> GetAsync(string code, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var b = await db.Batches.Include(b => b.Operator).Include(b => b.FeeTier).SingleOrDefaultAsync(b => b.BatchCode == code, ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        return await DetailAsync(b, ct);
    }
    private Task<T> WriteAsync<T>(string code, Func<Batch, Task<T>> work, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        await RequireAdminAsync(ct);
        var operatorId = await db.Batches.Where(b => b.BatchCode == code).Select(b => (long?)b.OperatorId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        // Khóa theo cùng thứ tự với tạo lô để các thao tác đồng thời không khóa chéo nhau.
        var farm = await db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH(UPDLOCK,HOLDLOCK) WHERE operator_id={operatorId}").SingleAsync(ct);
        var batch = await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH(UPDLOCK,HOLDLOCK) WHERE batch_code={code}").SingleAsync(ct);
        batch.Operator = farm;
        if (batch.Status != "PendingApproval")
            throw new BusinessRuleException("batch.invalid_transition", "Lô đã thay đổi trạng thái. Chỉ lô PendingApproval được xét duyệt; vui lòng tải lại.");
        return await work(batch);
    }, ct, IsolationLevel.Serializable);

    public Task<AdminBatchResponse> ApproveAsync(string code, ApproveBatchRequest req, CancellationToken ct) => WriteAsync(code, async b =>
    {
        BatchService.Validate(req);
        var now = clock.GetUtcNow();
        if (req.FundingOpenAt >= req.FundingDeadline || req.FundingDeadline <= now)
            throw new BusinessRuleException("batch.invalid_funding_time", "Thời gian mở phải trước hạn gọi vốn và hạn gọi vốn phải ở tương lai.");
        if (b.Operator.Status != "Approved")
            throw new BusinessRuleException("batch.operator_not_approved", "Hộ nuôi phải đang ở trạng thái Approved.");
        BatchService.ValidateBatchTerms(b);
        var cost = await batches.CostAsync(b.BatchId, ct);
        if (cost is null || cost.Status != "Submitted" ||
            await db.StandardCostVersions.CountAsync(v => v.BatchId == b.BatchId && v.Status == "Submitted", ct) != 1 ||
            await db.StandardCostVersions.AnyAsync(v => v.BatchId == b.BatchId && v.Status == "Locked", ct))
            throw new BusinessRuleException("batch.invalid_cost_version", "Cần đúng một phiên bản chi phí Submitted mới nhất, chưa có phiên bản Locked.");
        BatchService.ValidateCosts(BatchService.CostItems(cost));
        BatchService.ValidateSchedule(BatchService.CostItems(cost), BatchService.Plans(cost), true);
        if (!await db.BatchOfftakePrices.AnyAsync(p => p.BatchId == b.BatchId, ct))
            throw new BusinessRuleException("batch.offtake_price_required",
                "Lô phải có ít nhất một giá chốt bao tiêu theo hạng trước khi mở gọi vốn (TL-30).");
        var deadlineDate = DateOnly.FromDateTime(req.FundingDeadline!.Value.ToOffset(TimeSpan.FromHours(7)).DateTime);
        if (cost.TranchePlans.Any(p => p.PlannedDate < deadlineDate))
            throw new BusinessRuleException("batch.schedule_before_funding_close", "Lịch chi dự kiến không được trước ngày kết thúc gọi vốn (giờ Việt Nam).");
        if (await db.DisbursementTranches.AnyAsync(t => t.BatchId == b.BatchId, ct))
            throw new BusinessRuleException("batch.tranches_exist", "Lô đã có lịch giải ngân; không thể tạo trùng.");
        var today = DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).DateTime);
        var tiers = await db.FeeTiers.Where(t => t.EffectiveFrom <= today && (t.EffectiveTo == null || t.EffectiveTo >= today) &&
            (b.TargetCapital > t.MinCapital || (t.MinInclusive && b.TargetCapital == t.MinCapital)) &&
            (t.MaxCapital == null || b.TargetCapital < t.MaxCapital || (t.MaxInclusive && b.TargetCapital == t.MaxCapital))).ToListAsync(ct);
        if (tiers.Count != 1)
            throw new BusinessRuleException("batch.invalid_fee_tier", tiers.Count == 0 ? "Không có bậc phí có hiệu lực phù hợp với vốn mục tiêu." : "Có nhiều bậc phí có hiệu lực cùng khớp; cần sửa cấu hình trước khi duyệt.");
        var offtakePrices = await batches.OfftakePricesAsync(b.BatchId, ct);
        var before = Response(b, cost, [], offtakePrices);
        var account = await db.BatchAccounts.SingleOrDefaultAsync(a => a.BatchId == b.BatchId, ct);
        var accountCreated = account is null;
        if (account is null)
        {
            if (gateway is not IBatchAccountProvisioner provisioner)
                throw new BusinessRuleException("batch.account_provider_unavailable", "Cổng thanh toán chưa hỗ trợ mở tài khoản lô; cần cấu hình nhà cung cấp trước khi duyệt.");
            var opened = await provisioner.OpenBatchAccountAsync(b.BatchCode, ct);
            account = new BatchAccount
            {
                BatchId = b.BatchId,
                ProviderName = opened.ProviderName,
                ProviderAccountNo = opened.AccountNo,
                Status = "Open",
                OpenedAt = now,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.BatchAccounts.Add(account);
        }
        else if (account.Status != "Open")
            throw new BusinessRuleException("batch.account_not_open", "Tài khoản chuyên dùng của lô chưa mở; không thể mở gọi vốn.");
        b.Status = "Funding";
        b.FundingOpenAt = req.FundingOpenAt!.Value.ToUniversalTime();
        b.FundingDeadline = req.FundingDeadline.Value.ToUniversalTime();
        b.FeeTier = tiers[0];
        b.FeeTierId = tiers[0].FeeTierId;
        b.PlatformFeeAmount = tiers[0].FeeAmount;
        b.ApprovedAt = b.UpdatedAt = now;
        b.ApprovedBy = me.UserId;
        b.RejectionReason = null;
        cost.Status = "Locked";
        cost.LockedAt = cost.ApprovedAt = cost.UpdatedAt = now;
        cost.ApprovedBy = me.UserId;
        var tranches = cost.TranchePlans.OrderBy(p => p.TrancheNo).Select(p => new DisbursementTranche
        {
            BatchId = b.BatchId,
            TrancheNo = p.TrancheNo,
            PlannedDate = p.PlannedDate,
            AnchorCode = p.AnchorCode,
            OffsetDays = p.OffsetDays,
            UnlockCondition = p.UnlockCondition,
            PlannedAmount = cost.StandardCostItems.Where(i => BatchService.Scheduled(i.Category) && i.TrancheNo == p.TrancheNo).Sum(i => (decimal)BatchService.Amount(i.Quantity, i.UnitPrice)),
            Status = "Planned",
            CreatedAt = now,
            UpdatedAt = now
        }).ToList();
        db.DisbursementTranches.AddRange(tranches);
        var after = Response(b, cost, tranches, offtakePrices);
        await audit.WriteAsync("batch", b.BatchId, "approve", before, after, now, ct);
        if (accountCreated)
            await audit.WriteAsync("batch_account", account!.BatchAccountId, "create", null,
                new
                {
                    account.BatchAccountId,
                    account.BatchId,
                    account.ProviderName,
                    account.ProviderAccountNo,
                    account.Status,
                    account.OpenedAt
                }, now, ct);
        return after;
    }, ct);

    public Task<AdminBatchResponse> RejectAsync(string code, RejectBatchRequest req, CancellationToken ct) => WriteAsync(code, async b =>
    {
        BatchService.Validate(req);
        var before = await DetailAsync(b, ct);
        b.Status = "Rejected";
        b.RejectionReason = req.Reason.Trim();
        b.UpdatedAt = clock.GetUtcNow();
        var after = await DetailAsync(b, ct);
        await audit.WriteAsync("batch", b.BatchId, "reject", before, after, ct);
        return after;
    }, ct);

    public Task<AdminBatchResponse> RequestRevisionAsync(string code, RejectBatchRequest req, CancellationToken ct) => WriteAsync(code, async b =>
    {
        BatchService.Validate(req);
        var before = await DetailAsync(b, ct);
        // Giữ bản chi phí đã gửi; lần lưu nháp tiếp theo sẽ tạo phiên bản mới.
        b.Status = "Draft";
        b.RejectionReason = req.Reason.Trim();
        b.UpdatedAt = clock.GetUtcNow();
        var after = await DetailAsync(b, ct);
        await audit.WriteAsync("batch", b.BatchId, "request_revision", before, after, ct);
        return after;
    }, ct);

    private async Task<AdminBatchResponse> DetailAsync(Batch b, CancellationToken ct)
    {
        var cost = await batches.CostAsync(b.BatchId, ct);
        var prices = await batches.OfftakePricesAsync(b.BatchId, ct);
        var tranches = await db.DisbursementTranches.Where(t => t.BatchId == b.BatchId).OrderBy(t => t.TrancheNo).ToListAsync(ct);
        return Response(b, cost, tranches, prices);
    }

    private static AdminBatchResponse Response(Batch b, StandardCostVersion? cost, IReadOnlyList<DisbursementTranche> tranches,
        IReadOnlyList<OfftakePriceResponse> offtakePrices)
        => new(BatchService.ToResponse(b, cost, false, offtakePrices), new(b.OperatorId, b.Operator.LegalName, b.Operator.FarmAddress, b.Operator.Status),
            b.FundingOpenAt, b.FundingDeadline, b.FeeTierId, b.FeeTier?.TierCode, b.PlatformFeeAmount is null ? null : (long)b.PlatformFeeAmount,
            b.RejectionReason, b.ApprovedAt, b.ApprovedBy, tranches.Select(t => new DisbursementResponse(t.TrancheNo, (long)t.PlannedAmount, t.PlannedDate, t.UnlockCondition, t.Status, t.AnchorCode, t.OffsetDays)).ToList());
}
