using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Batches;

/// <summary>Presence with a chosen public name is an explicit publication opt-in; never bind this from a client request.</summary>
public sealed class PublicFarmPublication
{
    public long OperatorId { get; set; }
    public string PublicName { get; set; } = "";
    public string? Commune { get; set; }
    public string? District { get; set; }
    public string? Province { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? PhotoUrl { get; set; }
    /// <summary>Họ tên chủ trại. Chỉ điền khi chủ trại đã đồng ý cho công khai trên trang chủ; để trống thì không hiện.</summary>
    public string? OwnerName { get; set; }
    /// <summary>Ảnh đại diện của chủ trại (đường dẫn /... trong web hoặc https), cùng điều kiện đồng ý như họ tên.</summary>
    public string? OwnerPhotoUrl { get; set; }
    public bool PublishRatings { get; set; }
    public bool PublishProduction { get; set; }
}

public sealed class PublicFarmProfileOptions
{
    public const string Section = "PublicFarmProfiles";
    public List<PublicFarmPublication> Profiles { get; set; } = [];
}

public sealed record PublicFarmProfile(
    string Id, string Name, string? Commune, string? District, string? Province,
    decimal? Latitude, decimal? Longitude, string? PhotoUrl,
    int? RackCount, int? BoxCount, int? LiveCrabCount, int? CompletedBatchCount,
    decimal? RatingAverage, int? RatingCount,
    string? OwnerName = null, decimal? DeliveredKg = null, string? OwnerPhotoUrl = null);

/// <summary>
/// Opt-in extension of the existing public lot response. Empty configuration returns null and performs no farm query.
/// Does not publish private operator names, addresses, tax IDs, contacts, review text or reviewer identities.
/// </summary>
public sealed class PublicFarmProfileService(AppDbContext db, IOptions<PublicFarmProfileOptions> options)
{
    private static readonly string[] Published = ["Funding", "Sourcing", "InProduction", "Harvesting", "Selling", "Settlement", "Closed"];
    private static readonly string[] AtFarm = ["Received", "Holding", "Graded", "Allocated"];
    private readonly Dictionary<long, PublicFarmProfile?> cache = [];

    public static PublicFarmPublication? PublicationFor(PublicFarmProfileOptions options, long operatorId)
    {
        var matches = options.Profiles.Where(p => p.OperatorId == operatorId).ToArray();
        if (operatorId <= 0 || matches.Length != 1) return null;
        var p = matches[0];
        return !string.IsNullOrWhiteSpace(p.PublicName) ? p : null;
    }

    public async Task<PublicFarmProfile?> GetAsync(long operatorId, CancellationToken ct)
    {
        if (cache.TryGetValue(operatorId, out var cached)) return cached;
        var publication = PublicationFor(options.Value, operatorId);
        if (publication is null || !await db.Operators.AsNoTracking().AnyAsync(o => o.OperatorId == operatorId && o.Status == "Approved", ct))
            return cache[operatorId] = null;

        var batches = db.Batches.AsNoTracking().Where(b => b.OperatorId == operatorId && b.BatchMode == "P" &&
            b.ApprovedAt != null && Published.Contains(b.Status));
        int? rackCount = null, boxCount = null, liveCrabCount = null, completedBatchCount = null, ratingCount = null;
        decimal? ratingAverage = null, deliveredKg = null;
        if (publication.PublishProduction)
        {
            var slots = await db.PhysicalSlots.AsNoTracking().Where(s => s.OperatorId == operatorId)
                .Select(s => new { s.RowCode, s.RackNo }).ToListAsync(ct);
            boxCount = slots.Count;
            // Unlabelled racks are unknown, not zero. Rack numbers can repeat between rows.
            if (slots.All(s => s.RackNo != null)) rackCount = slots.Select(s => (s.RowCode, s.RackNo)).Distinct().Count();
            var productionIds = batches.Where(b => b.Status == "InProduction" || b.Status == "Harvesting").Select(b => b.BatchId);
            liveCrabCount = await db.CrabUnits.AsNoTracking().CountAsync(c => productionIds.Contains(c.BatchId) && AtFarm.Contains(c.InventoryStatus), ct);
            completedBatchCount = await batches.CountAsync(b => b.Status == "Closed", ct);
            // Thành tích: số kg khách đã nghiệm thu (biên bản đã xác nhận) của các lô P đã công bố của trại.
            var batchIds = batches.Select(b => b.BatchId);
            var orderIds = db.SalesOrders.AsNoTracking().Where(o => batchIds.Contains(o.BatchId)).Select(o => o.OrderId);
            deliveredKg = await db.DeliveryAcceptances.AsNoTracking()
                .Where(a => a.Status == "Confirmed" && orderIds.Contains(a.OrderId))
                .SumAsync(a => (decimal?)a.AcceptedKg, ct) ?? 0m;
        }
        if (publication.PublishRatings)
        {
            // BR-176 uses order_rating, not the legacy product_rating / v_operator_reputation view.
            var ratings = from rating in db.OrderRatings.AsNoTracking()
                          join order in db.SalesOrders.AsNoTracking() on rating.OrderId equals order.OrderId
                          join batch in batches on order.BatchId equals batch.BatchId
                          where order.OrderType == "PreOrder" && (order.Status == "Delivered" || order.Status == "Completed") &&
                                rating.Stars >= 1 && rating.Stars <= 5
                          select (decimal)rating.Stars;
            var summary = await ratings.GroupBy(_ => 1)
                .Select(g => new { Count = g.Count(), Average = g.Average() }).SingleOrDefaultAsync(ct);
            ratingCount = summary?.Count ?? 0;
            ratingAverage = summary is null ? null : decimal.Round(summary.Average, 2, MidpointRounding.AwayFromZero);
        }

        var coordinatesValid = publication.Latitude is >= -90 and <= 90 && publication.Longitude is >= -180 and <= 180;
        return cache[operatorId] = new PublicFarmProfile(
            $"operator-{operatorId}", publication.PublicName.Trim(), Clean(publication.Commune), Clean(publication.District), Clean(publication.Province),
            coordinatesValid ? publication.Latitude : null, coordinatesValid ? publication.Longitude : null, PublicPhoto(publication.PhotoUrl),
            rackCount, boxCount, liveCrabCount, completedBatchCount, ratingAverage, ratingCount,
            Clean(publication.OwnerName), deliveredKg,
            // Ảnh chủ trại chỉ đi kèm khi có họ tên đã được đồng ý công khai.
            Clean(publication.OwnerName) is null ? null : PublicPhoto(publication.OwnerPhotoUrl));
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    public static string? PublicPhoto(string? value)
    {
        var url = Clean(value);
        if (url is null) return null;
        if (url.StartsWith('/') && !url.StartsWith("//")) return url;
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps ? url : null;
    }
}
