using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

/// <summary>
/// Thiết lập Lô theo Business Rule v1.5 (WF-02): chế độ lô, điều khoản, chào giá theo quy cách, kế hoạch chi phí, mốc giải ngân,
/// gửi duyệt, huỷ Lô, ghi chi phí thực tế. Người nuôi soạn lô P; Admin soạn thay lô T và A.
/// </summary>
public sealed class BatchService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, PartyDirectory parties,
    PlatformParameters parameters, IBatchLifecycleHooks hooks)
{
    private static readonly string[] Editable = ["Draft", "NeedsRevision"];
    private static readonly string[] Cancellable = ["Draft", "PendingApproval", "NeedsRevision", "Funding"];

    // ---------- quyền ----------
    private sealed record Actor(long UserId, long? OperatorId, bool IsOwner, bool IsAdmin);

    private async Task<Actor> ActorAsync(CancellationToken ct)
    {
        var userId = me.UserId;
        var isAdmin = me.IsInRole(Roles.PlatformAdmin) && await db.AppUserRoles.AnyAsync(r => r.UserId == userId && r.RoleCode == Roles.PlatformAdmin, ct);
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User).SingleOrDefaultAsync(m => m.UserId == userId, ct);
        if (member is not null && (member.User.Status != "Active" ||
                                   !await db.AppUserRoles.AnyAsync(r => r.UserId == userId && r.RoleCode == Roles.OperatorMember, ct) ||
                                   (me.OperatorId is { } claimed && claimed != member.OperatorId)))
            member = null;
        if (member is null && !isAdmin)
            throw new ForbiddenException("batch.access_denied", "Bạn không có quyền truy cập hộ nuôi này.");
        return new Actor(userId, member?.OperatorId, member?.MemberRole == "Owner", isAdmin);
    }

    /// <summary>Lô P do chủ hộ nuôi sửa; lô T, A do Admin sửa (BR-020, BR-025).</summary>
    private static void RequireWriter(Batch batch, Actor actor)
    {
        if (batch.BatchMode == "P" ? !(actor.IsOwner && actor.OperatorId == batch.OperatorId) : !actor.IsAdmin)
            throw new ForbiddenException("batch.not_owner", batch.BatchMode == "P"
                ? "Lô này không thuộc hộ nuôi của bạn, hoặc bạn không phải chủ hộ."
                : "Chỉ Admin được sửa lô T và lô A.");
    }

    private static void RequireReader(Batch batch, Actor actor)
    {
        if (!actor.IsAdmin && actor.OperatorId != batch.OperatorId)
            throw new ForbiddenException("batch.not_owner", "Lô này không thuộc hộ nuôi của bạn.");
    }

    private Task<T> WriteAsync<T>(string? code, Func<Actor, Batch?, Task<T>> work, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            // Cùng thứ tự khoá ở mọi nơi: chuỗi audit, hộ nuôi, rồi Lô.
            await audit.LockAsync(ct);
            var actor = await ActorAsync(ct);
            Batch? batch = null;
            if (code is not null)
            {
                var operatorId = await db.Batches.Where(b => b.BatchCode == code).Select(b => (long?)b.OperatorId).SingleOrDefaultAsync(ct)
                                 ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT operator_id FROM dbo.operator WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {operatorId}", ct);
                batch = await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {code}").SingleAsync(ct);
                RequireWriter(batch, actor);
            }
            return await work(actor, batch);
        }, ct, IsolationLevel.Serializable);

    // ---------- tạo và sửa ----------
    /// <summary>Người nuôi tạo lô P (BR-005, BR-018). Hồ sơ người nuôi phải đã được duyệt.</summary>
    public Task<BatchResponse> CreateAsync(BatchRequest req, CancellationToken ct)
        => WriteAsync(null, async (actor, _) =>
        {
            Validate(req);
            if (!actor.IsOwner || actor.OperatorId is not { } operatorId)
                throw new ForbiddenException("batch.owner_required", "Chỉ chủ hộ nuôi được tạo lô.");
            var farm = await db.Operators.SingleAsync(o => o.OperatorId == operatorId, ct);
            if (farm.Status != "Approved")
                throw new BusinessRuleException("batch.operator_not_approved", "Hồ sơ người nuôi phải được duyệt trước khi tạo Lô (BR-005).");
            var partyId = await parties.PartyIdOfOperatorAsync(operatorId, ct);
            if (!await parties.HasActiveRoleAsync(partyId, PartnerRoleTypes.Farmer, ct))
                throw new BusinessRuleException("batch.farmer_role_inactive", "Vai trò người nuôi đang tạm dừng hoặc chưa có hiệu lực (BR-006).");
            var batch = NewBatch("P", operatorId, partyId);
            await ApplyTermsAsync(batch, req, ct);
            return await FinishCreateAsync(batch, ct);
        }, ct);

    /// <summary>Admin tạo lô T hoặc A (BR-018…020). Lô T: CrabShare là đơn vị thực hiện; lô A: nhà cung cấp được kết nối.</summary>
    public Task<BatchResponse> CreateForAdminAsync(AdminBatchRequest req, CancellationToken ct)
        => WriteAsync(null, async (actor, _) =>
        {
            Validate(req);
            Validate(req.Terms);
            if (!actor.IsAdmin) throw new ForbiddenException("batch.admin_required", "Chỉ Admin tạo lô T và lô A.");
            var farm = await db.Operators.SingleOrDefaultAsync(o => o.OperatorId == req.OperatorId, ct)
                       ?? throw new NotFoundException("operator.not_found", "Không tìm thấy hộ nuôi vận hành Lô.");
            if (farm.Status != "Approved")
                throw new BusinessRuleException("batch.operator_not_approved", "Hộ nuôi vận hành Lô phải được duyệt.");
            long executor;
            if (req.BatchMode == "T")
            {
                executor = await parties.PlatformPartyIdAsync(ct);
            }
            else
            {
                if (req.SupplierPartyId is not { } supplier)
                    throw new BusinessRuleException("batch.supplier_required", "Lô A phải chọn nhà cung cấp được kết nối.");
                if (!await db.Parties.AnyAsync(p => p.PartyId == supplier && p.VerificationStatus == "Verified", ct) ||
                    !await parties.HasActiveRoleAsync(supplier, PartnerRoleTypes.Supplier, ct))
                    throw new BusinessRuleException("batch.supplier_invalid", "Nhà cung cấp phải đã xác minh và có vai trò nhà cung cấp đang hoạt động.");
                executor = supplier;
            }
            var batch = NewBatch(req.BatchMode, req.OperatorId, executor);
            // Lô T, A không gọi vốn và không có thù lao người nuôi (BR-020).
            req.Terms.MinViableCapital = null;
            req.Terms.RemunerationTiers = [];
            req.Terms.SurvivalThresholdPct = null;
            req.Terms.BaseRemunerationPct = null;
            await ApplyTermsAsync(batch, req.Terms, ct);
            batch.OperatorSharePct = 0;
            // BR-201: tỷ lệ hoa hồng của lô A theo hợp đồng đại lý.
            batch.CommissionPct = req.BatchMode == "A" ? req.CommissionPct ?? 0 : null;
            return await FinishCreateAsync(batch, ct);
        }, ct);

    private Batch NewBatch(string mode, long operatorId, long executorPartyId)
    {
        var now = clock.GetUtcNow();
        return new Batch
        {
            BatchCode = "B-" + Guid.NewGuid().ToString("N")[..18], BatchMode = mode, OperatorId = operatorId, ExecutorPartyId = executorPartyId,
            Status = "Draft", FrozenStockCapMonths = 4, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10,
            MinContribution = 1, MinViableCapital = 1, TargetCapital = 1, MaxCapital = 1, ExpectedOutputKg = 1,
            CreatedAt = now, UpdatedAt = now,
        };
    }

    private async Task<BatchResponse> FinishCreateAsync(Batch batch, CancellationToken ct)
    {
        db.Batches.Add(batch);
        await db.SaveChangesAsync(ct);
        await SaveOffersAndTiersAsync(batch, pendingOffers, pendingTiers, ct);
        await parties.AddParticipantAsync(batch.BatchId, batch.ExecutorPartyId!.Value, ParticipantRoles.Executor, ct);
        var response = await ResponseAsync(batch, ct);
        await audit.WriteAsync("batch", batch.BatchId, "create", null, response, ct);
        return response;
    }

    public Task<BatchResponse> UpdateAsync(string code, BatchRequest req, CancellationToken ct)
        => WriteAsync(code, async (_, batch) =>
        {
            Validate(req);
            RequireEditable(batch!);
            var before = await ResponseAsync(batch!, ct);
            if (batch!.BatchMode != "P")
            {
                req.MinViableCapital = null;
                req.RemunerationTiers = [];
                req.SurvivalThresholdPct = null;
                req.BaseRemunerationPct = null;
            }
            await ApplyTermsAsync(batch, req, ct);
            await SaveOffersAndTiersAsync(batch, pendingOffers, pendingTiers, ct);
            var after = await ResponseAsync(batch, ct);
            await audit.WriteAsync("batch", batch.BatchId, "update", before, after, ct);
            return after;
        }, ct);

    // Chào giá và bậc thù lao đã kiểm tra, chờ lưu cùng Lô.
    private List<Offer> pendingOffers = [];
    private List<RemunerationTier> pendingTiers = [];

    private async Task ApplyTermsAsync(Batch batch, BatchRequest req, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (req.ExpectedReceiptDate <= DateOnly.FromDateTime(now.ToOffset(VnOffset).DateTime))
            throw new BusinessRuleException("batch.receipt_date_past", "Ngày nhận hàng dự kiến phải ở tương lai.");

        // Địa điểm xuất hàng thuộc đơn vị thực hiện (lô P, A) hoặc hộ nuôi vận hành (lô T), có toạ độ (BR-084).
        var ownerParties = new List<long> { batch.ExecutorPartyId!.Value, await parties.PartyIdOfOperatorAsync(batch.OperatorId, ct) };
        PartySite site;
        if (req.DispatchSiteId is { } siteId)
            site = await db.PartySites.SingleOrDefaultAsync(s => s.SiteId == siteId && ownerParties.Contains(s.PartyId) && s.Status == "Active", ct)
                   ?? throw new NotFoundException("batch.site_not_found", "Không tìm thấy địa điểm xuất hàng của đơn vị thực hiện.");
        else
            site = await db.PartySites.Where(s => ownerParties.Contains(s.PartyId) && s.Status == "Active" && (s.SiteType == "Farm" || s.SiteType == "Warehouse"))
                       .OrderByDescending(s => s.IsDefault).ThenBy(s => s.SiteType == "Farm" ? 0 : 1).FirstOrDefaultAsync(ct)
                   ?? throw new BusinessRuleException("batch.site_required", "Đơn vị thực hiện chưa có trại hoặc kho; hãy khai địa điểm trước.");
        if (site.SiteType is not ("Farm" or "Warehouse"))
            throw new BusinessRuleException("batch.site_type", "Địa điểm xuất hàng phải là trại hoặc kho.");
        if (site.Latitude is null)
            throw new BusinessRuleException("batch.site_coordinates", "Địa điểm xuất hàng phải có vĩ độ, kinh độ để tính khoảng cách giao (BR-084).");

        var offers = await BuildOffersAsync(req, ct);
        var minOffer = offers.Min(o => o.PricePerKg);
        if (req.FloorPricePerKg > minOffer)
            throw new BusinessRuleException("batch.floor_above_offer", "Giá sàn không được cao hơn giá thấp nhất trong các chào giá (BR-045).");
        var tiers = batch.BatchMode == "P" ? BuildTiers(req) : [];
        if (batch.BatchMode == "P")
        {
            if (req.MinViableCapital is null || string.IsNullOrWhiteSpace(req.MinViableBasis))
                throw new BusinessRuleException("batch.min_viable_required", "Lô P phải khai vốn tối thiểu khả thi kèm căn cứ (BR-034).");
        }

        batch.Title = req.Title.Trim();
        batch.CrabType = req.CrabType;
        batch.SeedQuantity = req.PlannedQuantity;
        batch.HasHolding = req.HasHolding;
        batch.CycleDays = req.HasHolding ? req.HoldingDays!.Value : (short)1;
        batch.RestockCutoffDays = req.RestockCutoffDays ?? 15;
        batch.ExpectedAvgWeightG = req.ExpectedAvgWeightG;
        batch.ExpectedOutputKg = decimal.Round(req.PlannedQuantity * (decimal)req.ExpectedAvgWeightG / 1000m, 3);
        batch.ExpectedGrade = req.ExpectedGrade?.Trim();
        batch.SaleDays = req.SaleDays;
        batch.DeliveryRadiusKm = req.DeliveryRadiusKm;
        batch.DispatchSiteId = site.SiteId;
        batch.ExpectedReceiptDate = req.ExpectedReceiptDate;
        batch.MinViableBasis = req.MinViableBasis?.Trim();
        batch.SurvivalThresholdPct = req.SurvivalThresholdPct;
        batch.BaseRemunerationPct = req.BaseRemunerationPct;
        batch.OperatorSharePct = req.BaseRemunerationPct ?? 0;
        batch.FloorPricePerKg = req.FloorPricePerKg;
        batch.OfftakeBuyerPartyId = req.OfftakeBuyerPartyId;
        batch.SettlementBasis = req.SettlementBasis;
        // Vốn mục tiêu tính lại khi lưu chi phí; vốn tối thiểu khả thi không vượt mục tiêu (kiểm khi gửi duyệt).
        batch.MinViableCapital = req.MinViableCapital ?? Math.Max(1, (long)batch.TargetCapital);
        batch.UpdatedAt = now;
        pendingOffers = offers;
        pendingTiers = tiers;
    }

    private async Task<List<Offer>> BuildOffersAsync(BatchRequest req, CancellationToken ct)
    {
        var codes = req.Offers.Select(o => o.SpecCode.Trim().ToUpperInvariant()).ToList();
        var specs = await db.ProductSpecifications.AsNoTracking().Where(s => codes.Contains(s.SpecCode) && s.Status == "Active")
            .ToDictionaryAsync(s => s.SpecCode, ct);
        var now = clock.GetUtcNow();
        var offers = new List<Offer>();
        foreach (var o in req.Offers)
        {
            Validate(o);
            if (!specs.TryGetValue(o.SpecCode.Trim().ToUpperInvariant(), out var spec))
                throw new NotFoundException("batch.spec_not_found", $"Không có quy cách {o.SpecCode}.");
            if (spec.CrabType != req.CrabType)
                throw new BusinessRuleException("batch.spec_crab_type", $"Quy cách {spec.SpecCode} không cùng loại cua với Lô (BR-028).");
            offers.Add(new Offer
            {
                SpecId = spec.SpecId, Spec = spec, PricePerKg = o.PricePerKg, ConversionWeightG = o.ConversionWeightG,
                OfferedQuantity = o.OfferedQuantity, CreatedAt = now,
            });
        }
        // BR-043: trong cùng size, hạng cao hơn không rẻ hơn; trong cùng hạng, size lớn hơn không rẻ hơn.
        foreach (var a in offers)
        foreach (var b in offers)
        {
            var sameSizeHigherGrade = a.Spec.SizeRank == b.Spec.SizeRank && a.Spec.GradeRank > b.Spec.GradeRank;
            var sameGradeLargerSize = a.Spec.GradeRank == b.Spec.GradeRank && a.Spec.SizeRank > b.Spec.SizeRank;
            if ((sameSizeHigherGrade || sameGradeLargerSize) && a.PricePerKg < b.PricePerKg)
                throw new BusinessRuleException("batch.offer_price_order",
                    $"Giá {a.Spec.Name} không được thấp hơn giá {b.Spec.Name} (BR-043).");
        }
        return offers;
    }

    private static List<RemunerationTier> BuildTiers(BatchRequest req)
    {
        if (req.SurvivalThresholdPct is not { } threshold || req.BaseRemunerationPct is not { } baseRate)
            throw new BusinessRuleException("batch.remuneration_required", "Lô P phải khai ngưỡng tỷ lệ sống và tỷ lệ thù lao cơ sở (BR-046).");
        var tiers = (req.RemunerationTiers.Count == 0
                ? [new RemunerationTierRequest { SurvivalFromPct = 0, SurvivalToPct = threshold, RatePct = decimal.Round(baseRate / 2, 2) },
                   new RemunerationTierRequest { SurvivalFromPct = threshold, SurvivalToPct = 100, RatePct = baseRate }]
                : req.RemunerationTiers)
            .OrderBy(t => t.SurvivalFromPct).ToList();
        if (threshold <= 0) tiers = [new RemunerationTierRequest { SurvivalFromPct = 0, SurvivalToPct = 100, RatePct = baseRate }];
        ValidateTiers(tiers, threshold, baseRate);
        return tiers.Select((t, i) => new RemunerationTier
        {
            TierNo = (byte)(i + 1), SurvivalFromPct = t.SurvivalFromPct, SurvivalToPct = t.SurvivalToPct, RatePct = t.RatePct,
        }).ToList();
    }

    /// <summary>BR-046, BR-047: các bậc phủ liên tục 0–100%, không chồng lấn; tỷ lệ sống thấp hơn không có thù lao cao hơn;
    /// bậc từ ngưỡng trở lên có tỷ lệ cơ sở.</summary>
    internal static void ValidateTiers(IReadOnlyList<RemunerationTierRequest> tiers, decimal threshold, decimal baseRate)
    {
        if (tiers.Count == 0 || tiers[0].SurvivalFromPct != 0 || tiers[^1].SurvivalToPct != 100)
            throw new BusinessRuleException("batch.tier_coverage", "Các bậc thù lao phải phủ từ 0% tới 100% tỷ lệ sống (BR-047).");
        for (var i = 0; i < tiers.Count; i++)
        {
            if (tiers[i].SurvivalFromPct >= tiers[i].SurvivalToPct)
                throw new BusinessRuleException("batch.tier_range", "Mỗi bậc phải có cận dưới nhỏ hơn cận trên.");
            if (i > 0 && tiers[i].SurvivalFromPct != tiers[i - 1].SurvivalToPct)
                throw new BusinessRuleException("batch.tier_coverage", "Các bậc thù lao phải liền nhau, không hở, không chồng lấn (BR-047).");
            if (i > 0 && tiers[i].RatePct < tiers[i - 1].RatePct)
                throw new BusinessRuleException("batch.tier_order", "Bậc có tỷ lệ sống thấp hơn không được có tỷ lệ thù lao cao hơn (BR-046).");
            if (tiers[i].SurvivalFromPct >= threshold && tiers[i].RatePct != baseRate)
                throw new BusinessRuleException("batch.tier_base", "Bậc từ ngưỡng tỷ lệ sống trở lên phải có tỷ lệ thù lao cơ sở (BR-047).");
        }
        if (threshold > 0 && !tiers.Any(t => t.SurvivalFromPct == threshold))
            throw new BusinessRuleException("batch.tier_threshold", "Phải có một bậc bắt đầu đúng ở ngưỡng tỷ lệ sống.");
    }

    private async Task SaveOffersAndTiersAsync(Batch batch, List<Offer> offers, List<RemunerationTier> tiers, CancellationToken ct)
    {
        db.Offers.RemoveRange(await db.Offers.Where(o => o.BatchId == batch.BatchId).ToListAsync(ct));
        db.RemunerationTiers.RemoveRange(await db.RemunerationTiers.Where(t => t.BatchId == batch.BatchId).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
        var now = clock.GetUtcNow();
        foreach (var o in offers)
        {
            db.Offers.Add(new Offer
            {
                BatchId = batch.BatchId, SpecId = o.SpecId, PricePerKg = o.PricePerKg, ConversionWeightG = o.ConversionWeightG,
                OfferedQuantity = o.OfferedQuantity, CreatedAt = now,
            });
        }
        foreach (var t in tiers)
        {
            t.BatchId = batch.BatchId;
            t.CreatedAt = now;
            db.RemunerationTiers.Add(t);
        }
        await db.SaveChangesAsync(ct);
    }

    // ---------- kế hoạch chi phí và mốc giải ngân ----------
    public Task<BatchResponse> SaveCostPlanAsync(string code, CostPlanRequest req, CancellationToken ct)
        => WriteAsync(code, async (_, batch) =>
        {
            RequireEditable(batch!);
            ValidateCostItems(req.Items);
            var milestones = req.Milestones is { Count: > 0 } given ? given : DefaultMilestones(req.Items, batch!.HasHolding);
            ValidateMilestones(milestones);
            var before = await ResponseAsync(batch!, ct);
            var cost = await CostAsync(batch!.BatchId, ct);
            if (cost?.Status is "Locked" or "Approved")
                throw new BusinessRuleException("batch.cost_locked", "Kế hoạch chi phí đã khoá, không sửa được (BR-054).");
            var now = clock.GetUtcNow();
            if (cost is null || cost.Status != "Draft")
            {
                // BR-036: sửa sau khi bị yêu cầu sửa thì tạo phiên bản mới; phiên bản cũ chuyển Superseded.
                if (cost is not null)
                {
                    cost.Status = "Superseded";
                    cost.UpdatedAt = now;
                }
                cost = new StandardCostVersion
                {
                    BatchId = batch.BatchId, VersionNo = (short)((cost?.VersionNo ?? 0) + 1), Status = "Draft", CreatedAt = now, UpdatedAt = now,
                };
                db.StandardCostVersions.Add(cost);
            }
            else
            {
                db.StandardCostItems.RemoveRange(cost.StandardCostItems);
                cost.StandardCostItems.Clear();
                db.StandardCostTranchePlans.RemoveRange(cost.TranchePlans);
                cost.TranchePlans.Clear();
                cost.UpdatedAt = now;
            }
            foreach (var item in req.Items)
                cost.StandardCostItems.Add(new StandardCostItem
                {
                    Category = item.Category, Description = item.Description.Trim(), Quantity = item.Quantity, Unit = item.Unit.Trim(),
                    UnitPrice = item.UnitPrice, Basis = item.Basis?.Trim(), CostBearer = item.CostBearer, CreatedAt = now,
                });
            foreach (var m in milestones.OrderBy(m => m.No))
                cost.TranchePlans.Add(new StandardCostTranchePlan
                {
                    TrancheNo = m.No, MilestoneKind = m.Kind, MilestoneName = m.Name.Trim(), Pct = m.Pct,
                    UnlockCondition = string.IsNullOrWhiteSpace(m.UnlockCondition) ? DefaultCondition(m.Kind) : m.UnlockCondition.Trim(),
                });
            await db.SaveChangesAsync(ct);
            ApplyCostTotals(batch, cost);
            batch.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            var after = await ResponseAsync(batch, ct);
            await audit.WriteAsync("batch", batch.BatchId, "cost_plan", before, after, ct);
            return after;
        }, ct);

    /// <summary>BR-032…034: tổng Chi phí chuẩn, Chi phí chuẩn mỗi con làm tròn lên, vốn mục tiêu của lô P.</summary>
    private static void ApplyCostTotals(Batch batch, StandardCostVersion cost)
    {
        var total = CostTotal(cost.StandardCostItems);
        var perCrab = CostPerCrab(total, batch.SeedQuantity);
        var locked = perCrab * batch.SeedQuantity;
        batch.TargetCapital = Math.Max(1, locked);
        batch.MaxCapital = batch.TargetCapital;
    }

    internal static long CostTotal(IEnumerable<StandardCostItem> items)
        => items.Where(i => i.CostBearer is null or "Batch").Sum(i => Amount(i.Quantity, i.UnitPrice));

    /// <summary>BR-033: Chi phí chuẩn mỗi con = tổng ÷ sản lượng kế hoạch, làm tròn lên tới đồng.</summary>
    public static long CostPerCrab(long total, int plannedQuantity)
        => plannedQuantity <= 0 ? 0 : (total + plannedQuantity - 1) / plannedQuantity;

    internal static long Amount(decimal quantity, decimal unitPrice)
        => checked((long)decimal.Round(quantity * unitPrice, 0, MidpointRounding.AwayFromZero));

    /// <summary>BR-145: mốc 1 nhận cua xong (tiền cua và chi phí ban đầu), mốc 2 giữa vụ (thức ăn, điện nước, nhân công),
    /// phần còn lại kể cả dự phòng hao hụt giải ngân khi quyết toán. Lô không lưu nuôi gộp mốc 2 vào mốc 1.</summary>
    internal static List<MilestoneRequest> DefaultMilestones(IReadOnlyList<CostItemRequest> items, bool hasHolding)
    {
        var batchItems = items.Where(i => i.CostBearer == "Batch").ToList();
        var total = batchItems.Sum(i => Amount(i.Quantity, i.UnitPrice));
        if (total <= 0) return [new MilestoneRequest { No = 1, Kind = "Settlement", Name = "Quyết toán", Pct = 100 }];
        long Sum(params string[] categories) => batchItems.Where(i => categories.Contains(i.Category)).Sum(i => Amount(i.Quantity, i.UnitPrice));
        var receipt = Sum("Seed", "Other") + (hasHolding ? 0 : Sum("Feed", "Utilities", "Labour"));
        var mid = hasHolding ? Sum("Feed", "Utilities", "Labour") : 0;
        decimal Pct(long part) => decimal.Round(part * 100m / total, 2, MidpointRounding.ToZero);
        var result = new List<MilestoneRequest>();
        byte no = 1;
        if (receipt > 0) result.Add(new MilestoneRequest { No = no++, Kind = "Receipt", Name = "Nhận cua xong", Pct = Pct(receipt) });
        if (mid > 0) result.Add(new MilestoneRequest { No = no++, Kind = "MidCycle", Name = "Giữa vụ", Pct = Pct(mid) });
        var rest = 100m - result.Sum(m => m.Pct);
        if (rest > 0) result.Add(new MilestoneRequest { No = no, Kind = "Settlement", Name = "Quyết toán", Pct = rest });
        else result[^1].Pct += rest;
        return result;
    }

    internal static string DefaultCondition(string kind) => kind switch
    {
        "Receipt" => "Đủ phiếu nhận hàng; Lô có lưu nuôi đủ ảnh thả cua của mọi con được cấp vốn.",
        "MidCycle" => "Nhật ký chăm sóc và ảnh thiết bị đầy đủ tới mốc, có biên bản thăm trại của Nhân viên kiểm phẩm.",
        "Settlement" => "Bảng quyết toán của Lô được duyệt.",
        _ => "Theo điều kiện ghi trong hợp đồng.",
    };

    internal static void ValidateMilestones(IReadOnlyList<MilestoneRequest> milestones)
    {
        foreach (var m in milestones) Validate(m);
        if (milestones.Select(m => m.No).Distinct().Count() != milestones.Count)
            throw new BusinessRuleException("batch.milestone_duplicate", "Số thứ tự mốc bị trùng.");
        if (milestones.Sum(m => m.Pct) != 100m)
            throw new BusinessRuleException("batch.milestone_total", "Tổng tỷ lệ các mốc giải ngân phải bằng 100% (BR-146).");
        var ordered = milestones.OrderBy(m => m.No).ToList();
        if (ordered[^1].Kind != "Settlement")
            throw new BusinessRuleException("batch.milestone_last", "Mốc cuối phải là mốc quyết toán (BR-145).");
        if (ordered.Count(m => m.Kind == "Settlement") != 1 || ordered.Count(m => m.Kind == "Receipt") > 1 || ordered.Count(m => m.Kind == "MidCycle") > 1)
            throw new BusinessRuleException("batch.milestone_kind", "Mỗi Lô có tối đa một mốc nhận cua, một mốc giữa vụ và đúng một mốc quyết toán.");
    }

    internal static void ValidateCostItems(IReadOnlyList<CostItemRequest> items)
    {
        if (items is null || items.Count == 0 || items.Any(i => i is null))
            throw new BusinessRuleException("batch.invalid_cost", "Kế hoạch chi phí phải có ít nhất một khoản.");
        foreach (var item in items) Validate(item);
        if (!items.Any(i => i.Category == "MortalityReserve" && i.CostBearer == "Batch" && Amount(i.Quantity, i.UnitPrice) > 0))
            throw new BusinessRuleException("batch.mortality_reserve_required", "Kế hoạch chi phí bắt buộc có khoản dự phòng hao hụt (BR-031).");
        decimal total = 0;
        foreach (var item in items)
        {
            total += decimal.Round(item.Quantity * item.UnitPrice, 0, MidpointRounding.AwayFromZero);
            if (total > 999_999_999_999_999m)
                throw new BusinessRuleException("batch.cost_overflow", "Tổng chi phí vượt giới hạn.");
        }
        if (total <= 0) throw new BusinessRuleException("batch.invalid_cost", "Tổng Chi phí chuẩn phải lớn hơn 0.");
    }

    // ---------- gửi duyệt, huỷ ----------
    public Task<BatchResponse> SubmitAsync(string code, CancellationToken ct)
        => WriteAsync(code, async (_, batch) =>
        {
            if (!Editable.Contains(batch!.Status))
                throw new BusinessRuleException("batch.invalid_transition", "Chỉ Lô nháp hoặc Lô được yêu cầu sửa mới gửi duyệt.");
            var cost = await CostAsync(batch.BatchId, ct)
                       ?? throw new BusinessRuleException("batch.cost_required", "Cần lưu kế hoạch chi phí trước khi gửi duyệt.");
            if (cost.Status != "Draft")
                throw new BusinessRuleException("batch.cost_required", "Cần lưu lại kế hoạch chi phí (phiên bản nháp) trước khi gửi duyệt.");
            await ValidateForReviewAsync(batch, cost, ct);
            var before = await ResponseAsync(batch, ct);
            var now = clock.GetUtcNow();
            batch.Status = "PendingApproval";
            batch.RejectionReason = null;
            batch.UpdatedAt = now;
            cost.Status = "Submitted";
            cost.SubmittedAt = cost.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            var after = await ResponseAsync(batch, ct);
            await audit.WriteAsync("batch", batch.BatchId, "submit", before, after, ct);
            return after;
        }, ct);

    /// <summary>Kiểm điều khoản đã lưu trước khi gửi và khi Admin duyệt (BR-034, 044, 045, 047, 051).</summary>
    internal async Task ValidateForReviewAsync(Batch batch, StandardCostVersion cost, CancellationToken ct)
    {
        if (batch.CrabType == "SoftShellCrab")
            throw new BusinessRuleException("batch.crab_type_retired", "Cua lột không còn trong bảng phân loại (BR-028).");
        ValidateCostItems(cost.StandardCostItems.Select(i => new CostItemRequest
        {
            Category = i.Category, Description = i.Description, Quantity = i.Quantity, Unit = i.Unit, UnitPrice = (long)i.UnitPrice,
            Basis = i.Basis, CostBearer = i.CostBearer ?? "Batch",
        }).ToList());
        ValidateMilestones(cost.TranchePlans.Select(p => new MilestoneRequest
        {
            No = p.TrancheNo, Kind = p.MilestoneKind ?? "Custom", Name = p.MilestoneName ?? $"Mốc {p.TrancheNo}", Pct = p.Pct ?? 0,
        }).ToList());
        if (!await db.Offers.AnyAsync(o => o.BatchId == batch.BatchId, ct))
            throw new BusinessRuleException("batch.offer_required", "Lô phải có ít nhất một chào giá (BR-043).");
        if (batch.OfftakeBuyerPartyId is not { } buyer || !await db.Parties.AnyAsync(p => p.PartyId == buyer && p.VerificationStatus == "Verified", ct) ||
            !await parties.HasActiveRoleAsync(buyer, PartnerRoleTypes.OfftakeBuyer, ct))
            throw new BusinessRuleException("batch.offtake_buyer_invalid", "Bên cam kết thu mua phải là đối tác đã xác minh, có vai trò bên thu mua đang hoạt động (BR-044).");
        if (batch.BatchMode == "P")
        {
            var total = CostTotal(cost.StandardCostItems);
            var target = CostPerCrab(total, batch.SeedQuantity) * batch.SeedQuantity;
            if (batch.MinViableCapital > target)
                throw new BusinessRuleException("batch.min_viable_above_target", "Vốn tối thiểu khả thi không được lớn hơn vốn mục tiêu (BR-034).");
            var tiers = await db.RemunerationTiers.Where(t => t.BatchId == batch.BatchId).OrderBy(t => t.TierNo)
                .Select(t => new RemunerationTierRequest { SurvivalFromPct = t.SurvivalFromPct, SurvivalToPct = t.SurvivalToPct, RatePct = t.RatePct })
                .ToListAsync(ct);
            ValidateTiers(tiers, batch.SurvivalThresholdPct ?? 0, batch.BaseRemunerationPct ?? 0);
        }
    }

    /// <summary>BR-054: người nuôi huỷ Lô bất kỳ lúc nào trước khi Lô mở, miễn chưa có khoản góp nào được xác nhận.
    /// Mọi khoản đã trả (cọc đặt trước) được hoàn.</summary>
    public Task<BatchResponse> CancelAsync(string code, CancelBatchRequest req, CancellationToken ct)
        => WriteAsync(code, async (_, batch) =>
        {
            Validate(req);
            if (!Cancellable.Contains(batch!.Status))
                throw new BusinessRuleException("batch.not_cancellable", "Chỉ huỷ được Lô chưa mở (nháp, chờ duyệt, cần sửa, đang gọi vốn).");
            if (batch.CapitalClosedAt is not null || await db.Contributions.AnyAsync(c => c.BatchId == batch.BatchId && c.Status == "Confirmed", ct))
                throw new BusinessRuleException("batch.has_confirmed_capital", "Lô đã có khoản góp được xác nhận, không huỷ được (BR-054).");
            var before = await ResponseAsync(batch, ct);
            var now = clock.GetUtcNow();
            foreach (var c in await db.Contributions.Where(c => c.BatchId == batch.BatchId && c.Status == "Reserved").ToListAsync(ct))
            {
                c.Status = "Expired";
                c.ExpiresAt = now;
                c.UpdatedAt = now;
            }
            foreach (var r in await db.PaymentRequests.Where(r => r.Status == "Pending" && r.Contribution != null && r.Contribution.BatchId == batch.BatchId).ToListAsync(ct))
            {
                r.Status = "Cancelled";
                r.UpdatedAt = now;
            }
            batch.Status = "Cancelled";
            batch.CancelledAt = now;
            batch.CancelReason = req.Reason.Trim();
            batch.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await hooks.OnBatchCancelledAsync(batch, "Người nuôi huỷ Lô", ct);
            var after = await ResponseAsync(batch, ct);
            await audit.WriteAsync("batch", batch.BatchId, "cancel", before, after, ct);
            return after;
        }, ct);

    // ---------- chi phí thực tế (BR-037) ----------
    public Task<long> RecordActualCostAsync(string code, CostActualRequest req, CancellationToken ct)
        => WriteAsync(code, async (actor, batch) =>
        {
            Validate(req);
            if (batch!.Status is "Draft" or "PendingApproval" or "NeedsRevision" or "Rejected" or "Cancelled" or "Closed")
                throw new BusinessRuleException("batch.actual_cost_status", "Chỉ ghi chi phí thực tế cho Lô đã được duyệt và chưa đóng.");
            if (req.DocumentEvidenceId is null && string.IsNullOrWhiteSpace(req.DocumentRef))
                throw new BusinessRuleException("batch.actual_cost_document", "Chi phí thực tế phải kèm chứng từ (BR-037).");
            var cost = await db.StandardCostVersions.Where(v => v.BatchId == batch.BatchId && v.Status == "Locked").SingleOrDefaultAsync(ct)
                       ?? throw new BusinessRuleException("batch.cost_not_locked", "Lô chưa có kế hoạch chi phí đã khoá.");
            if (!await db.StandardCostItems.AnyAsync(i => i.CostItemId == req.CostItemId && i.CostVersionId == cost.CostVersionId, ct))
                throw new NotFoundException("batch.cost_item_not_found", "Khoản chi không thuộc kế hoạch chi phí đã khoá của Lô.");
            if (req.DocumentEvidenceId is { } evidenceId && !await db.Evidences.AnyAsync(e => e.EvidenceId == evidenceId && e.BatchId == batch.BatchId, ct))
                throw new NotFoundException("batch.document_not_found", "Không tìm thấy chứng từ của Lô.");
            var row = new CostActual
            {
                BatchId = batch.BatchId, CostItemId = req.CostItemId, Amount = req.Amount, DocumentEvidenceId = req.DocumentEvidenceId,
                DocumentRef = req.DocumentRef?.Trim(), Note = req.Note?.Trim(), IncurredOn = req.IncurredOn, RecordedBy = actor.UserId,
                RecordedAt = clock.GetUtcNow(),
            };
            db.CostActuals.Add(row);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("cost_actual", row.CostActualId, "record", null,
                new { batch.BatchCode, row.CostItemId, amount = req.Amount, row.DocumentEvidenceId, row.DocumentRef, row.IncurredOn }, ct);
            return row.CostActualId;
        }, ct);

    // ---------- đọc ----------
    public async Task<BatchResponse> GetAsync(string code, CancellationToken ct)
    {
        var actor = await ActorAsync(ct);
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        RequireReader(batch, actor);
        var canWrite = batch.BatchMode == "P" ? actor.IsOwner && actor.OperatorId == batch.OperatorId : actor.IsAdmin;
        return await ResponseAsync(batch, ct, canWrite);
    }

    public async Task<PagedResult<BatchResponse>> ListMineAsync(BatchListQuery filter, PageQuery paging, CancellationToken ct)
    {
        var actor = await ActorAsync(ct);
        if (actor.OperatorId is not { } operatorId)
            throw new ForbiddenException("batch.access_denied", "Bạn chưa thuộc hộ nuôi nào.");
        var query = db.Batches.AsNoTracking().Where(b => b.OperatorId == operatorId &&
            (filter.Status == null || b.Status == filter.Status) && (filter.BatchMode == null || b.BatchMode == filter.BatchMode));
        var page = await query.OrderByDescending(b => b.BatchId).ToPagedAsync(paging, ct);
        var items = new List<BatchResponse>();
        foreach (var b in page.Items) items.Add(await ResponseAsync(b, ct, b.BatchMode == "P" && actor.IsOwner, includeCost: false));
        return new(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<IReadOnlyList<SpecResponse>> SpecsAsync(string? crabType, CancellationToken ct)
        => await db.ProductSpecifications.AsNoTracking().Where(s => s.Status == "Active" && (crabType == null || s.CrabType == crabType))
            .OrderBy(s => s.CrabType).ThenBy(s => s.SizeRank).ThenByDescending(s => s.GradeRank)
            .Select(s => new SpecResponse(s.SpecId, s.SpecCode, s.CrabType, s.SizeCode, s.GradeCode, s.LiveCondition, s.Name))
            .ToListAsync(ct);

    internal Task<StandardCostVersion?> CostAsync(long batchId, CancellationToken ct)
        => db.StandardCostVersions.Include(v => v.StandardCostItems).Include(v => v.TranchePlans).AsSplitQuery()
            .Where(v => v.BatchId == batchId).OrderByDescending(v => v.VersionNo).FirstOrDefaultAsync(ct);

    internal async Task<BatchResponse> ResponseAsync(Batch b, CancellationToken ct, bool canWrite = true, bool includeCost = true)
    {
        var offers = await db.Offers.AsNoTracking().Where(o => o.BatchId == b.BatchId).Include(o => o.Spec)
            .OrderBy(o => o.Spec.SizeRank).ThenByDescending(o => o.Spec.GradeRank)
            .Select(o => new OfferResponse(o.OfferId, o.Spec.SpecCode, o.Spec.Name, o.Spec.SizeCode, o.Spec.GradeCode, (long)o.PricePerKg,
                o.ConversionWeightG, o.OfferedQuantity)).ToListAsync(ct);
        var tiers = await db.RemunerationTiers.AsNoTracking().Where(t => t.BatchId == b.BatchId).OrderBy(t => t.TierNo)
            .Select(t => new RemunerationTierResponse(t.TierNo, t.SurvivalFromPct, t.SurvivalToPct, t.RatePct)).ToListAsync(ct);
        var refs = await db.Parties.AsNoTracking().Where(p => p.PartyId == b.ExecutorPartyId || p.PartyId == b.OfftakeBuyerPartyId)
            .Select(p => new PartyRefResponse(p.PartyId, p.PartyCode, p.LegalName)).ToListAsync(ct);
        var site = b.DispatchSiteId is { } sid
            ? await db.PartySites.AsNoTracking().Where(s => s.SiteId == sid)
                .Select(s => new SiteRefResponse(s.SiteId, s.SiteCode, s.Name, s.AddressLine, s.Latitude, s.Longitude)).SingleOrDefaultAsync(ct)
            : null;
        CostPlanResponse? plan = null;
        if (includeCost && await CostAsync(b.BatchId, ct) is { } cost)
        {
            var actuals = await db.CostActuals.AsNoTracking().Where(a => a.BatchId == b.BatchId)
                .GroupBy(a => a.CostItemId).Select(g => new { g.Key, Total = g.Sum(a => a.Amount) }).ToDictionaryAsync(x => x.Key, x => (long)x.Total, ct);
            var total = CostTotal(cost.StandardCostItems);
            var perCrab = b.StandardCostPerCrab is { } locked ? (long)locked : CostPerCrab(total, b.SeedQuantity);
            var funded = b.FundedQuantity ?? b.SeedQuantity;
            plan = new CostPlanResponse(cost.VersionNo, cost.Status, total, perCrab, perCrab * b.SeedQuantity,
                cost.StandardCostItems.OrderBy(i => i.CostItemId).Select(i => new CostItemResponse(i.CostItemId, i.Category, i.Description,
                    i.Quantity, i.Unit, (long)i.UnitPrice, Amount(i.Quantity, i.UnitPrice), i.Basis, i.CostBearer, actuals.GetValueOrDefault(i.CostItemId))).ToList(),
                cost.TranchePlans.OrderBy(p => p.TrancheNo).Select(p => new MilestoneResponse(p.TrancheNo, p.MilestoneKind ?? "Custom",
                    p.MilestoneName ?? $"Mốc {p.TrancheNo}", p.Pct ?? 0, p.UnlockCondition,
                    p.Pct is { } pct ? MilestoneAmount(pct, perCrab, funded) : null)).ToList(),
                cost.LockedAt);
        }
        var editable = canWrite && Editable.Contains(b.Status);
        return new BatchResponse(b.BatchCode, b.BatchMode, b.Status, b.Title, b.CrabType, b.OperatorId,
            refs.FirstOrDefault(r => r.PartyId == b.ExecutorPartyId), b.SeedQuantity, b.FundedQuantity, b.HasHolding,
            b.HasHolding ? b.CycleDays : null, b.RestockCutoffDays, b.ExpectedAvgWeightG, b.ExpectedGrade, b.SaleDays, b.DeliveryRadiusKm, site,
            b.ExpectedReceiptDate, (long)b.TargetCapital, (long)b.MinViableCapital, b.MinViableBasis, (long)b.MinContribution,
            b.SurvivalThresholdPct, b.BaseRemunerationPct, tiers, b.FloorPricePerKg is { } floor ? (long)floor : null,
            refs.FirstOrDefault(r => r.PartyId == b.OfftakeBuyerPartyId), b.SettlementBasis, b.PlatformFeeRatePct, offers, plan,
            b.FundingOpenAt, b.FundingDeadline, b.PreorderDeadline, b.RejectionReason, b.CancelReason,
            editable, editable, canWrite && Cancellable.Contains(b.Status) && b.CapitalClosedAt is null);
    }

    /// <summary>BR-146: số tiền mốc = tỷ lệ của mốc × Chi phí chuẩn mỗi con × số con được cấp vốn.</summary>
    public static long MilestoneAmount(decimal pct, long costPerCrab, int fundedQuantity)
        => (long)decimal.Round(pct / 100m * costPerCrab * fundedQuantity, 0, MidpointRounding.ToZero);

    private static void RequireEditable(Batch batch)
    {
        if (!Editable.Contains(batch.Status))
            throw new BusinessRuleException("batch.invalid_transition", "Chỉ sửa được Lô nháp hoặc Lô được yêu cầu sửa (BR-052, BR-054).");
    }

    private static readonly TimeSpan VnOffset = TimeSpan.FromHours(7);

    internal static void Validate(object request)
    {
        var errors = new List<ValidationResult>();
        if (!Validator.TryValidateObject(request, new ValidationContext(request), errors, true))
            throw new BusinessRuleException("batch.invalid_data", string.Join(" ", errors.Select(e => e.ErrorMessage)));
    }
}

/// <summary>Điểm nối giữa Lô và các nhóm sau (đặt trước, nguồn hàng): Lô mở, Lô huỷ. Bản mặc định không làm gì.</summary>
public interface IBatchLifecycleHooks
{
    /// <summary>Số con quy đổi của các đơn đặt trước đã cọc, chưa huỷ (BR-077, BR-078).</summary>
    Task<int> DepositedPreorderCrabsAsync(long batchId, CancellationToken ct);
    /// <summary>Lô mở: đơn đặt trước đã cọc chuyển Confirmed (BR-083).</summary>
    Task OnBatchOpenedAsync(Batch batch, CancellationToken ct);
    /// <summary>Lô huỷ hoặc không mở: hoàn mọi khoản cọc (BR-054, BR-079).</summary>
    Task OnBatchCancelledAsync(Batch batch, string reason, CancellationToken ct);
}

public sealed class NoBatchLifecycleHooks : IBatchLifecycleHooks
{
    public Task<int> DepositedPreorderCrabsAsync(long batchId, CancellationToken ct) => Task.FromResult(0);
    public Task OnBatchOpenedAsync(Batch batch, CancellationToken ct) => Task.CompletedTask;
    public Task OnBatchCancelledAsync(Batch batch, string reason, CancellationToken ct) => Task.CompletedTask;
}
