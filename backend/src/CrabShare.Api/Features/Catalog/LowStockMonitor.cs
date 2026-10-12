using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Catalog;

/// <summary>
/// Báo người nuôi khi niêm yết đang bán sắp hết hàng (UC24, NH-04). Bảng alert gắn theo lô nên mỗi lô một cảnh báo,
/// liệt kê mọi niêm yết thấp của lô đó. Gọi SAU khi đã lưu thay đổi tồn: lỗi ở đây chỉ ghi log, không làm hỏng
/// thao tác đã xong của người dùng.
/// </summary>
public sealed class LowStockMonitor(AppDbContext db, IAlertRaiser alerts, IOptions<AlertThresholds> thresholds,
    IOptions<LowStockOptions> options, ILogger<LowStockMonitor> logger)
{
    private const int MessageMaxLength = 300;

    public sealed record Snapshot(long ListingId, long BatchId, string Title, string Status, bool Hidden, decimal StockQtyKg, decimal ReservedQtyKg);

    public static bool IsLow(Snapshot s, decimal thresholdKg) =>
        s.Status == "Published" && !s.Hidden && s.StockQtyKg - s.ReservedQtyKg < thresholdKg;

    public static string Message(IReadOnlyList<Snapshot> low, decimal thresholdKg)
    {
        var parts = string.Join("; ", low.Select(s => $"\"{s.Title}\" còn {Math.Max(0, s.StockQtyKg - s.ReservedQtyKg):0.###} kg"));
        var message = $"Sắp hết hàng (dưới {thresholdKg:0.###} kg): {parts}.";
        return message.Length > MessageMaxLength ? message[..(MessageMaxLength - 1)] + "…" : message;
    }

    public async Task CheckAsync(IEnumerable<long> listingIds, CancellationToken ct)
    {
        var ids = listingIds.Distinct().ToList();
        if (ids.Count == 0) return;
        var thresholdKg = thresholds.Value.LowStockKg;
        var ackWithin = TimeSpan.FromHours(options.Value.LowStockAckHours);

        try
        {
            var batchIds = await db.ProductListings.AsNoTracking()
                .Where(l => ids.Contains(l.ListingId))
                .Select(l => l.BatchId)
                .Distinct()
                .ToListAsync(ct);

            var listings = await db.ProductListings.AsNoTracking()
                .Where(l => batchIds.Contains(l.BatchId))
                .Select(l => new Snapshot(l.ListingId, l.BatchId, l.Title, l.Status, l.HiddenAt != null, l.StockQtyKg, l.ReservedQtyKg))
                .ToListAsync(ct);

            foreach (var batch in listings.GroupBy(l => l.BatchId))
            {
                if (!batch.Any(l => ids.Contains(l.ListingId) && IsLow(l, thresholdKg)))
                    continue;
                var low = batch.Where(l => IsLow(l, thresholdKg)).OrderBy(l => l.ListingId).ToList();
                await alerts.RaiseAsync(batch.Key, AlertType.LowStock, AlertSeverity.Medium, Message(low, thresholdKg), ackWithin, ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Low-stock check failed for listings {ListingIds}", ids);
        }
    }
}
