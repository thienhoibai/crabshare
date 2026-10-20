using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

public sealed class BatchService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit)
{
    private async Task<OperatorMember> MemberAsync(bool write, CancellationToken ct)
    {
        var userId = me.UserId;
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User)
            .SingleOrDefaultAsync(m => m.UserId == userId, ct);
        if (member is null || member.User.Status != "Active" || member.MemberRole is not ("Owner" or "Staff") ||
            !await db.AppUserRoles.AnyAsync(r => r.UserId == userId && r.RoleCode == Roles.OperatorMember, ct) ||
            (me.OperatorId is { } claimed && claimed != member.OperatorId))
            throw new ForbiddenException("batch.access_denied", "Bạn không có quyền truy cập hộ nuôi này.");
        if (write && member.MemberRole != "Owner")
            throw new ForbiddenException("batch.owner_required", "Chỉ chủ hộ nuôi được tạo, sửa hoặc gửi duyệt lô.");
        return member;
    }

    private Task<T> WriteAsync<T>(Func<long, Task<T>> work, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            // Cùng thứ tự khoá với VI-02: audit trước, sau đó hộ nuôi/lô.
            await audit.LockAsync(ct);
            var member = await MemberAsync(true, ct);
            var farm = await db.Operators.FromSqlInterpolated(
                $"SELECT * FROM dbo.operator WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {member.OperatorId}")
                .AsNoTracking().SingleAsync(ct);
            if (farm.Status != "Approved")
                throw new BusinessRuleException("batch.operator_not_approved", "Hộ nuôi phải được duyệt (Approved) để tạo, sửa hoặc gửi duyệt lô.");
            return await work(member.OperatorId);
        }, ct, IsolationLevel.Serializable);

    public Task<BatchResponse> CreateAsync(BatchRequest req, CancellationToken ct)
        => WriteAsync(async operatorId =>
        {
            Validate(req);
            var batch = new Batch
            {
                BatchCode = "B-" + Guid.NewGuid().ToString("N")[..18],
                OperatorId = operatorId,
                Status = "Draft",
                FrozenStockCapMonths = 4,
                OfftakePreorderCapPct = 60,
                OfftakeDepositPct = 15,
                CreatedAt = clock.GetUtcNow(),
            };
            Apply(batch, req);
            db.Batches.Add(batch);
            await db.SaveChangesAsync(ct);
            await SyncOfftakePricesAsync(batch, req.OfftakePrices, ct);
            var response = ToResponse(batch, null, true, await OfftakePricesAsync(batch.BatchId, ct));
            await audit.WriteAsync("batch", batch.BatchId, "create", null, response, ct);
            return response;
        }, ct);

    public Task<BatchResponse> UpdateAsync(string code, BatchRequest req, CancellationToken ct)
        => WriteAsync(async operatorId =>
        {
            var batch = await OwnedAsync(code, operatorId, ct);
            await RequireUnlockedAsync(batch.BatchId, ct);
            RequireEditable(batch);
            Validate(req);
            var cost = await CostAsync(batch.BatchId, ct);
            var before = ToResponse(batch, cost, true, await OfftakePricesAsync(batch.BatchId, ct));
            Apply(batch, req);
            await SyncOfftakePricesAsync(batch, req.OfftakePrices, ct);
            var response = ToResponse(batch, cost, true, await OfftakePricesAsync(batch.BatchId, ct));
            await audit.WriteAsync("batch", batch.BatchId, "update", before, response, ct);
            return response;
        }, ct);

    public Task<BatchResponse> SaveCostAsync(string code, StandardCostRequest req, CancellationToken ct)
        => WriteAsync(async operatorId =>
        {
            var batch = await OwnedAsync(code, operatorId, ct);
            await RequireUnlockedAsync(batch.BatchId, ct);
            RequireEditable(batch);
            ValidateCosts(req.Items);
            ValidateSchedule(req.Items, req.Tranches, false);
            var cost = await CostAsync(batch.BatchId, ct);
            var prices = await OfftakePricesAsync(batch.BatchId, ct);
            var before = ToResponse(batch, cost, true, prices);
            if (cost?.Status is "Locked" or "Approved")
                throw new BusinessRuleException("batch.cost_locked", "Chi phí đã được duyệt hoặc khóa, không thể sửa.");
            if (cost is null || cost.Status != "Draft")
            {
                var versionNo = (cost?.VersionNo ?? 0) + 1;
                if (versionNo > short.MaxValue)
                    throw new BusinessRuleException("batch.version_limit", "Đã đạt giới hạn phiên bản chi phí.");
                if (cost is not null)
                {
                    cost.Status = "Superseded";
                    cost.UpdatedAt = clock.GetUtcNow();
                }
                cost = new StandardCostVersion
                {
                    BatchId = batch.BatchId,
                    VersionNo = (short)versionNo,
                    Status = "Draft",
                    CreatedAt = clock.GetUtcNow()
                };
                db.StandardCostVersions.Add(cost);
            }
            else
            {
                db.StandardCostItems.RemoveRange(cost.StandardCostItems);
                cost.StandardCostItems.Clear();
            }
            var now = clock.GetUtcNow();
            cost.UpdatedAt = now;
            batch.UpdatedAt = now;
            foreach (var item in req.Items)
                cost.StandardCostItems.Add(new StandardCostItem
                {
                    Category = item.Category,
                    Description = item.Description.Trim(),
                    Quantity = item.Quantity,
                    Unit = item.Unit.Trim(),
                    UnitPrice = item.UnitPrice,
                    TrancheNo = item.TrancheNo,
                    CreatedAt = now
                });
            foreach (var removed in cost.TranchePlans.Where(p => !req.Tranches.Any(t => t.TrancheNo == p.TrancheNo)).ToList())
            {
                db.StandardCostTranchePlans.Remove(removed);
                cost.TranchePlans.Remove(removed);
            }
            foreach (var tranche in req.Tranches)
            {
                var plan = cost.TranchePlans.SingleOrDefault(p => p.TrancheNo == tranche.TrancheNo);
                if (plan is null) { plan = new StandardCostTranchePlan { TrancheNo = tranche.TrancheNo }; cost.TranchePlans.Add(plan); }
                plan.PlannedDate = tranche.PlannedDate;
                plan.AnchorCode = tranche.AnchorCode;
                plan.OffsetDays = tranche.OffsetDays;
                plan.UnlockCondition = tranche.UnlockCondition.Trim();
            }
            var response = ToResponse(batch, cost, true, prices);
            await audit.WriteAsync("batch", batch.BatchId, "standard_cost", before, response, ct);
            return response;
        }, ct);

    public Task<BatchResponse> SubmitAsync(string code, CancellationToken ct)
        => WriteAsync(async operatorId =>
        {
            var batch = await OwnedAsync(code, operatorId, ct);
            await RequireUnlockedAsync(batch.BatchId, ct);
            if (batch.Status != "Draft")
                throw new BusinessRuleException("batch.invalid_transition", "Chỉ lô Draft được gửi duyệt.");
            Validate(new BatchRequest
            {
                Title = batch.Title,
                CrabType = batch.CrabType,
                SeedQuantity = batch.SeedQuantity,
                ExpectedOutputKg = batch.ExpectedOutputKg,
                CycleDays = batch.CycleDays,
                RestockCutoffDays = batch.RestockCutoffDays,
                MinViableCapital = (long)batch.MinViableCapital,
                TargetCapital = (long)batch.TargetCapital,
                MaxCapital = (long)batch.MaxCapital,
                MinContribution = (long)batch.MinContribution,
                OperatorSharePct = batch.OperatorSharePct
            });
            var cost = await CostAsync(batch.BatchId, ct);
            var prices = await OfftakePricesAsync(batch.BatchId, ct);
            if (prices.Count == 0)
                throw new BusinessRuleException("batch.offtake_price_required",
                    "Cần khai ít nhất một giá chốt bao tiêu theo hạng trước khi gửi duyệt (TL-30).");
            if (cost is null)
                throw new BusinessRuleException("batch.mortality_reserve_required", "Cần lưu chi phí chuẩn có khoản dự phòng hao hụt (MortalityReserve) trước khi gửi duyệt.");
            if (cost.Status != "Draft")
                throw new BusinessRuleException("batch.invalid_transition", "Chi phí chuẩn phải ở trạng thái Draft.");
            ValidateCosts(cost.StandardCostItems.Select(i => new StandardCostItemRequest
            {
                Category = i.Category,
                Description = i.Description,
                Quantity = i.Quantity,
                Unit = i.Unit,
                UnitPrice = (long)i.UnitPrice,
                TrancheNo = i.TrancheNo
            }).ToList());
            ValidateSchedule(CostItems(cost), Plans(cost), true);
            var before = ToResponse(batch, cost, true, prices);
            batch.Status = "PendingApproval";
            batch.UpdatedAt = clock.GetUtcNow();
            cost.Status = "Submitted";
            cost.SubmittedAt = cost.UpdatedAt = batch.UpdatedAt;
            batch.RejectionReason = null;
            var response = ToResponse(batch, cost, true, prices);
            await audit.WriteAsync("batch", batch.BatchId, "submit", before, response, ct);
            return response;
        }, ct);

    public async Task<BatchResponse> GetAsync(string code, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var batch = await OwnedAsync(code, member.OperatorId, ct);
        await db.Entry(batch).Collection(b => b.Contributions).Query().Include(c => c.InvestmentContract).LoadAsync(ct);
        var hasRegistry = await db.CrabItems.AnyAsync(c => c.BatchId == batch.BatchId, ct) ||
            await db.SlotAllocations.AnyAsync(a => a.BatchId == batch.BatchId, ct) ||
            await db.SlotEvents.AnyAsync(e => e.BatchId == batch.BatchId && e.EventType == "Stocked", ct);
        var reason = member.MemberRole != "Owner" ? "Chỉ chủ hộ nuôi được ghi nhận thả giống." :
            !await db.Operators.AnyAsync(o => o.OperatorId == member.OperatorId && o.Status == "Approved", ct) ? "Hộ nuôi cần được duyệt để thả giống." :
            FundingReadiness.StockingBlockedReason(batch, clock.GetUtcNow(), hasRegistry);
        return ToResponse(batch, await CostAsync(batch.BatchId, ct), member.MemberRole == "Owner",
            await OfftakePricesAsync(batch.BatchId, ct)) with { CanStock = reason is null, StockingBlockedReason = reason, StockedAt = batch.StockedAt };
    }

    public async Task<PagedResult<BatchResponse>> ListMineAsync(BatchListQuery filter, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var query = db.Batches.AsNoTracking().Where(b => b.OperatorId == member.OperatorId);
        if (filter.Status is not null) query = query.Where(b => b.Status == filter.Status);
        var page = await query.OrderByDescending(b => b.BatchId).ToPagedAsync(paging, ct);
        var priceMap = await OfftakePricesByBatchAsync(page.Items.Select(b => b.BatchId).ToList(), ct);
        // List does not load line items; the editor retrieves the full standard cost by code.
        return new(page.Items.Select(b => ToResponse(b, null, member.MemberRole == "Owner",
            priceMap.GetValueOrDefault(b.BatchId, []))).ToList(), page.Page, page.PageSize, page.Total);
    }

    private async Task<Batch> OwnedAsync(string code, long operatorId, CancellationToken ct)
    {
        var batch = await db.Batches.SingleOrDefaultAsync(b => b.BatchCode == code, ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.OperatorId != operatorId)
            throw new ForbiddenException("batch.not_owner", "Lô này không thuộc hộ nuôi của bạn.");
        return batch;
    }

    internal Task<StandardCostVersion?> CostAsync(long batchId, CancellationToken ct)
        => db.StandardCostVersions.Include(v => v.StandardCostItems).Include(v => v.TranchePlans).AsSplitQuery().Where(v => v.BatchId == batchId)
            .OrderByDescending(v => v.VersionNo).FirstOrDefaultAsync(ct);

    private async Task RequireUnlockedAsync(long batchId, CancellationToken ct)
    {
        if (await db.StandardCostVersions.AnyAsync(v => v.BatchId == batchId && (v.Status == "Locked" || v.Status == "Approved"), ct))
            throw new BusinessRuleException("batch.cost_locked", "Lô đã có chi phí được duyệt hoặc khóa, không thể sửa hoặc thay thế phiên bản.");
    }

    internal static List<StandardCostItemRequest> CostItems(StandardCostVersion cost) => cost.StandardCostItems.Select(i =>
        new StandardCostItemRequest
        {
            Category = i.Category,
            Description = i.Description,
            Quantity = i.Quantity,
            Unit = i.Unit,
            UnitPrice = checked((long)i.UnitPrice),
            TrancheNo = i.TrancheNo
        }).ToList();
    internal static List<CostTrancheRequest> Plans(StandardCostVersion cost) => cost.TranchePlans.Select(p =>
        new CostTrancheRequest { TrancheNo = p.TrancheNo, PlannedDate = p.PlannedDate, UnlockCondition = p.UnlockCondition, AnchorCode = p.AnchorCode, OffsetDays = p.OffsetDays }).ToList();
    internal static bool Scheduled(string category) => category is not ("Depreciation" or "MortalityReserve");
    internal static long Amount(decimal quantity, decimal unitPrice) => checked((long)decimal.Round(quantity * unitPrice, 0, MidpointRounding.AwayFromZero));

    internal static void ValidateSchedule(List<StandardCostItemRequest> items, List<CostTrancheRequest> plans, bool complete)
    {
        if (complete && items.Sum(i => (decimal)Amount(i.Quantity, i.UnitPrice)) <= 0)
            throw new BusinessRuleException("batch.invalid_cost", "Tổng chi phí chuẩn phải lớn hơn 0 trước khi gửi duyệt hoặc mở gọi vốn.");
        if (plans is null || plans.Any(p => p is null))
            throw new BusinessRuleException("batch.invalid_schedule", "Lịch giải ngân không hợp lệ.");
        foreach (var plan in plans)
        {
            Validate(plan);
        }
        var groups = items.Where(i => Scheduled(i.Category)).GroupBy(i => i.TrancheNo).ToList();
        if (plans.Select(p => p.TrancheNo).Distinct().Count() != plans.Count ||
            plans.Any(p => !groups.Any(g => g.Key == p.TrancheNo)) ||
            (complete && (groups.Any(g => g.Key is null or 0 || g.Sum(i => (decimal)Amount(i.Quantity, i.UnitPrice)) is <= 0 or > 999999999999999999m) ||
                groups.Any(g => !plans.Any(p => p.TrancheNo == g.Key)))))
            throw new BusinessRuleException("batch.invalid_schedule", "Mỗi đợt chi phải có số từ 1–255, tổng tiền dương trong giới hạn, ngày và điều kiện; lịch không được thiếu, thừa hoặc trùng đợt.");
    }

    private static void RequireEditable(Batch batch)
    {
        if (batch.Status != "Draft")
            throw new BusinessRuleException("batch.invalid_transition", "Chỉ được sửa lô Draft. Lô Rejected đã bị từ chối dứt điểm.");
    }

    private void Apply(Batch batch, BatchRequest req)
    {
        batch.Title = req.Title.Trim(); batch.CrabType = req.CrabType; batch.SeedQuantity = req.SeedQuantity;
        batch.ExpectedOutputKg = req.ExpectedOutputKg; batch.CycleDays = req.CycleDays; batch.RestockCutoffDays = req.RestockCutoffDays;
        batch.MinViableCapital = req.MinViableCapital; batch.TargetCapital = req.TargetCapital; batch.MaxCapital = req.MaxCapital;
        batch.MinContribution = req.MinContribution; batch.OperatorSharePct = req.OperatorSharePct; batch.UpdatedAt = clock.GetUtcNow();
    }

    internal static void Validate(object request)
    {
        var errors = new List<ValidationResult>();
        if (!Validator.TryValidateObject(request, new ValidationContext(request), errors, true))
            throw new BusinessRuleException("batch.invalid_data", string.Join(" ", errors.Select(e => e.ErrorMessage)));
    }

    internal static void ValidateCosts(List<StandardCostItemRequest> items)
    {
        if (items is null || items.Any(i => i is null))
            throw new BusinessRuleException("batch.invalid_cost", "Danh sách khoản chi không hợp lệ.");
        foreach (var item in items) Validate(item);
        if (!items.Any(i => i.Category == "MortalityReserve"))
            throw new BusinessRuleException("batch.mortality_reserve_required", "Chi phí chuẩn bắt buộc có khoản dự phòng hao hụt (MortalityReserve).");
        decimal total = 0;
        foreach (var item in items)
        {
            total += decimal.Round(item.Quantity * item.UnitPrice, 0, MidpointRounding.AwayFromZero);
            // Stop before accumulating more rows: even many individually valid DECIMAL values must not overflow.
            if (total > 999999999999999999m)
                throw new BusinessRuleException("batch.cost_overflow", "Tổng chi phí vượt giới hạn DECIMAL(18,0) của quyết toán.");
        }
    }

    internal static BatchResponse ToResponse(Batch b, StandardCostVersion? cost, bool owner,
        IReadOnlyList<OfftakePriceResponse>? offtakePrices = null)
    {
        var items = cost?.StandardCostItems.OrderBy(i => i.CostItemId).Select(i => new StandardCostItemResponse(i.Category,
            i.Description, i.Quantity, i.Unit, (long)i.UnitPrice, i.TrancheNo,
            checked((long)decimal.Round(i.Quantity * i.UnitPrice, 0, MidpointRounding.AwayFromZero)))).ToList();
        return new(b.BatchCode, b.OperatorId, b.Title, b.CrabType, b.SeedQuantity, b.ExpectedOutputKg, b.CycleDays,
            b.RestockCutoffDays, (long)b.MinViableCapital, (long)b.TargetCapital, (long)b.MaxCapital, (long)b.MinContribution,
            b.OperatorSharePct, b.Status, cost is null ? null : new(cost.VersionNo, cost.Status, items!.Sum(i => i.Amount), items!,
                cost.TranchePlans.OrderBy(p => p.TrancheNo).Select(p => new CostTrancheResponse(p.TrancheNo, p.PlannedDate, p.UnlockCondition,
                    items!.Where(i => Scheduled(i.Category) && i.TrancheNo == p.TrancheNo).Sum(i => i.Amount), p.AnchorCode, p.OffsetDays)).ToList(), cost.LockedAt),
            owner && b.Status == "Draft", owner && b.Status == "Draft", b.RejectionReason,
            b.OfftakePreorderCapPct, b.OfftakeDepositPct, offtakePrices ?? []);
    }

    internal async Task<IReadOnlyList<OfftakePriceResponse>> OfftakePricesAsync(long batchId, CancellationToken ct)
    {
        var map = await OfftakePricesByBatchAsync([batchId], ct);
        return map.GetValueOrDefault(batchId, []);
    }

    private async Task<Dictionary<long, IReadOnlyList<OfftakePriceResponse>>> OfftakePricesByBatchAsync(
        IReadOnlyList<long> batchIds, CancellationToken ct)
    {
        if (batchIds.Count == 0) return new();
        var rows = await db.BatchOfftakePrices.AsNoTracking()
            .Where(p => batchIds.Contains(p.BatchId))
            .Select(p => new { p.BatchId, p.Grade.GradeCode, p.Grade.GradeName, p.UnitPrice })
            .OrderBy(p => p.GradeCode)
            .ToListAsync(ct);
        return rows.GroupBy(r => r.BatchId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<OfftakePriceResponse>)g
                .Select(r => new OfftakePriceResponse(r.GradeCode, r.GradeName, (long)r.UnitPrice)).ToList());
    }

    /// <summary>Thay toàn bộ giá bao tiêu của lô Draft. Chỉ gọi khi RequireEditable đã qua.</summary>
    private async Task SyncOfftakePricesAsync(Batch batch, List<OfftakePriceRequest>? prices, CancellationToken ct)
    {
        if (batch.Status is not ("Draft"))
            throw new BusinessRuleException("batch.offtake_price_locked",
                "Giá bao tiêu đã khóa sau khi lô rời Draft (BR-33).");

        var incoming = (prices ?? [])
            .Where(p => !string.IsNullOrWhiteSpace(p.GradeCode) && p.UnitPrice > 0)
            .Select(p => new { Code = p.GradeCode.Trim(), p.UnitPrice })
            .ToList();
        if (incoming.Select(p => p.Code).Distinct(StringComparer.OrdinalIgnoreCase).Count() != incoming.Count)
            throw new BusinessRuleException("batch.invalid_data", "Mỗi hạng chỉ được khai một giá bao tiêu.");

        var codes = incoming.Select(p => p.Code).ToList();
        var grades = await db.ProductGrades.AsNoTracking()
            .Where(g => codes.Contains(g.GradeCode))
            .ToDictionaryAsync(g => g.GradeCode, StringComparer.OrdinalIgnoreCase, ct);
        foreach (var row in incoming)
        {
            if (!grades.ContainsKey(row.Code))
                throw new NotFoundException("offtake.grade_not_found", $"Không tìm thấy hạng {row.Code}.");
        }

        var existing = await db.BatchOfftakePrices.Where(p => p.BatchId == batch.BatchId).ToListAsync(ct);
        db.BatchOfftakePrices.RemoveRange(existing);
        var now = clock.GetUtcNow();
        foreach (var row in incoming)
        {
            db.BatchOfftakePrices.Add(new BatchOfftakePrice
            {
                BatchId = batch.BatchId,
                GradeId = grades[row.Code].GradeId,
                UnitPrice = row.UnitPrice,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }
        await db.SaveChangesAsync(ct);
    }
}
