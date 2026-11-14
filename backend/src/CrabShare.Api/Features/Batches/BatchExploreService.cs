using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

public sealed class ExploreBatchQuery
{
    /// <summary>open = đang gọi vốn hoặc nhận đặt trước (mặc định); all = mọi Lô đã công bố.</summary>
    [RegularExpression("^(open|all)$")] public string Scope { get; set; } = "open";
    [RegularExpression("^(FatteningMudCrab|RoeCrab|YoungFemaleCrab|OilRoeCrab)$")] public string? CrabType { get; set; }
    [RegularExpression("^(P|T|A)$")] public string? BatchMode { get; set; }
    /// <summary>Toạ độ địa chỉ giao của khách: chỉ hiện Lô có bán kính giao phủ địa chỉ này (BR-084).</summary>
    [Range(-90, 90)] public decimal? Latitude { get; set; }
    [Range(-180, 180)] public decimal? Longitude { get; set; }
}

public sealed record ExploreOffer(string SpecCode, string SpecName, string SizeCode, string GradeCode, long PricePerKg, int ConversionWeightG,
    int OfferedQuantity);
public sealed record ExploreCostCategory(string Category, long Amount);
public sealed record ExploreBatchResponse(
    string BatchCode, string BatchMode, string Status, string Title, string CrabType, string ExecutorName,
    int PlannedQuantity, int? FundedQuantity, bool HasHolding, short? HoldingDays, short? SaleDays, int? ExpectedAvgWeightG, string? ExpectedGrade,
    DateOnly? ExpectedReceiptDate, decimal? DeliveryRadiusKm, decimal? DistanceKm,
    long StandardCostTotal, long? StandardCostPerCrab, IReadOnlyList<ExploreOffer> Offers, long? FloorPricePerKg, string? OfftakeBuyerName,
    decimal? PlatformFeeRatePct, string SettlementBasis,
    long TargetCapital, long ConfirmedCapital, long ReservedCapital, long RemainingCapital, int InvestorCount, long MinContribution,
    int SellableCrabs, int DepositedPreorderCrabs, decimal PreorderRatioPct,
    DateTimeOffset? FundingOpenAt, DateTimeOffset? FundingDeadline, DateTimeOffset? PreorderDeadline,
    IReadOnlyList<ExploreCostCategory>? CostByCategory);

/// <summary>
/// Trang gọi vốn và trang đặt trước (BR-056, BR-084, BR-220). Chỉ số đã phát sinh, giá và rủi ro; không có lợi nhuận hay lợi suất kỳ vọng
/// (BR-219). Số liệu công khai chỉ gồm số tổng, không có thông tin cá nhân.
/// </summary>
public sealed class BatchExploreService(AppDbContext db, TimeProvider clock, IBatchLifecycleHooks hooks)
{
    private static readonly string[] PublishedStatuses = ["Funding", "Sourcing", "InProduction", "Harvesting", "Selling", "Settlement", "Closed"];

    public async Task<PagedResult<ExploreBatchResponse>> ListAsync(ExploreBatchQuery query, PageQuery paging, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var batches = db.Batches.AsNoTracking().Where(b => b.ApprovedAt != null && PublishedStatuses.Contains(b.Status) &&
            (query.CrabType == null || b.CrabType == query.CrabType) && (query.BatchMode == null || b.BatchMode == query.BatchMode));
        if (query.Scope == "open")
            batches = batches.Where(b => (b.BatchMode == "P" && b.Status == "Funding" && b.FundingOpenAt <= now && b.FundingDeadline > now) ||
                                         (b.BatchMode != "P" && b.Status == "Sourcing" && b.PreorderDeadline > now));
        var rows = await batches.OrderBy(b => b.FundingDeadline ?? b.PreorderDeadline).ThenByDescending(b => b.BatchId).ToListAsync(ct);
        var result = new List<ExploreBatchResponse>();
        foreach (var b in rows)
        {
            var response = await ResponseAsync(b, query, false, ct);
            if (response is not null) result.Add(response);
        }
        var page = result.Skip((paging.Page - 1) * paging.PageSize).Take(paging.PageSize).ToList();
        return new PagedResult<ExploreBatchResponse>(page, paging.Page, paging.PageSize, result.Count);
    }

    public async Task<ExploreBatchResponse> GetAsync(string code, CancellationToken ct)
    {
        var b = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code && b.ApprovedAt != null && PublishedStatuses.Contains(b.Status), ct)
                ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô đã công bố.");
        return (await ResponseAsync(b, new ExploreBatchQuery { Scope = "all" }, true, ct))!;
    }

    private async Task<ExploreBatchResponse?> ResponseAsync(Batch b, ExploreBatchQuery query, bool detail, CancellationToken ct)
    {
        var site = b.DispatchSiteId is { } sid ? await db.PartySites.AsNoTracking().SingleOrDefaultAsync(s => s.SiteId == sid, ct) : null;
        decimal? distance = null;
        if (query.Latitude is { } lat && query.Longitude is { } lng && site?.Latitude is { } sLat && site.Longitude is { } sLng)
        {
            distance = DistanceKm(lat, lng, sLat, sLng);
            if (b.DeliveryRadiusKm is { } radius && distance > radius) return null;
        }
        else if (query.Latitude is not null)
            return null;

        var now = clock.GetUtcNow();
        var contributions = await db.Contributions.AsNoTracking().Where(c => c.BatchId == b.BatchId &&
                (c.Status == "Confirmed" || (c.Status == "Reserved" && c.ExpiresAt > now)))
            .Select(c => new { c.Status, c.Amount, c.InvestorId }).ToListAsync(ct);
        var confirmed = (long)contributions.Where(c => c.Status == "Confirmed").Sum(c => c.Amount);
        var reserved = (long)contributions.Where(c => c.Status == "Reserved").Sum(c => c.Amount);
        var cost = await db.StandardCostVersions.AsNoTracking().Include(v => v.StandardCostItems)
            .Where(v => v.BatchId == b.BatchId && v.Status == "Locked").SingleOrDefaultAsync(ct);
        var total = cost is null ? 0 : BatchService.CostTotal(cost.StandardCostItems);
        var perCrab = b.StandardCostPerCrab is { } locked ? (long)locked : (long?)null;
        var sellable = SellableCrabs(b, confirmed);
        var deposited = await hooks.DepositedPreorderCrabsAsync(b.BatchId, ct);
        var funded = b.BatchMode == "P" ? (b.FundedQuantity ?? sellable) : b.SeedQuantity;
        var offers = await db.Offers.AsNoTracking().Where(o => o.BatchId == b.BatchId).Include(o => o.Spec)
            .OrderBy(o => o.Spec.SizeRank).ThenByDescending(o => o.Spec.GradeRank)
            .Select(o => new ExploreOffer(o.Spec.SpecCode, o.Spec.Name, o.Spec.SizeCode, o.Spec.GradeCode, (long)o.PricePerKg, o.ConversionWeightG, o.OfferedQuantity))
            .ToListAsync(ct);
        var names = await db.Parties.AsNoTracking().Where(p => p.PartyId == b.ExecutorPartyId || p.PartyId == b.OfftakeBuyerPartyId)
            .ToDictionaryAsync(p => p.PartyId, p => p.LegalName, ct);
        var categories = detail && cost is not null
            ? cost.StandardCostItems.Where(i => i.CostBearer is null or "Batch").GroupBy(i => i.Category).OrderBy(g => g.Key)
                .Select(g => new ExploreCostCategory(g.Key, g.Sum(i => BatchService.Amount(i.Quantity, i.UnitPrice)))).ToList()
            : null;
        var target = (long)b.TargetCapital;
        return new ExploreBatchResponse(b.BatchCode, b.BatchMode, b.Status, b.Title, b.CrabType,
            b.ExecutorPartyId is { } e ? names.GetValueOrDefault(e, "") : "", b.SeedQuantity, b.FundedQuantity, b.HasHolding,
            b.HasHolding ? b.CycleDays : null, b.SaleDays, b.ExpectedAvgWeightG, b.ExpectedGrade, b.ExpectedReceiptDate, b.DeliveryRadiusKm,
            distance is null ? null : decimal.Round(distance.Value, 1), total, perCrab, offers,
            b.FloorPricePerKg is { } floor ? (long)floor : null,
            b.OfftakeBuyerPartyId is { } buyer ? names.GetValueOrDefault(buyer) : null, b.PlatformFeeRatePct, b.SettlementBasis,
            b.BatchMode == "P" ? target : 0, confirmed, reserved, b.BatchMode == "P" ? Math.Max(0, target - confirmed - reserved) : 0,
            contributions.Where(c => c.Status == "Confirmed").Select(c => c.InvestorId).Distinct().Count(), (long)b.MinContribution,
            sellable, deposited, funded > 0 ? decimal.Round(deposited * 100m / funded, 2) : 0,
            b.FundingOpenAt, b.FundingDeadline, b.PreorderDeadline, categories);
    }

    /// <summary>BR-055: lô P bán trước được số con đã có vốn (phần nguyên của vốn đã xác nhận ÷ Chi phí chuẩn mỗi con);
    /// lô T, A bằng sản lượng kế hoạch; không vượt sản lượng kế hoạch.</summary>
    public static int SellableCrabs(Batch b, long confirmedCapital)
    {
        if (b.BatchMode != "P") return b.SeedQuantity;
        if (b.FundedQuantity is { } funded) return funded;
        if (b.StandardCostPerCrab is not { } perCrab || perCrab <= 0) return 0;
        return (int)Math.Min(b.SeedQuantity, confirmedCapital / (long)perCrab);
    }

    /// <summary>Khoảng cách theo đường tròn lớn (km).</summary>
    public static decimal DistanceKm(decimal lat1, decimal lng1, decimal lat2, decimal lng2)
    {
        const double r = 6371.0088;
        double Rad(decimal d) => (double)d * Math.PI / 180;
        var dLat = Rad(lat2 - lat1);
        var dLng = Rad(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) + Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return (decimal)(2 * r * Math.Asin(Math.Min(1, Math.Sqrt(a))));
    }
}
