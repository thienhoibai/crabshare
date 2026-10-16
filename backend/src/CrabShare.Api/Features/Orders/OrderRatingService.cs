using System.Text.Json;
using System.Text.Json.Serialization;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

public sealed class OrderRatingService(AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock)
{
    public const string RateAction = "rate";
    private const string ItemsPrefix = "#ITEMS:";

    public sealed record StoredItem(
        [property: JsonPropertyName("l")] long ListingId,
        [property: JsonPropertyName("s")] int Stars,
        [property: JsonPropertyName("c")] string? Comment);

    public async Task<OrderRatingView> GetAsync(string orderNo, CancellationToken ct)
    {
        var order = await LoadOwnedWithLinesAsync(orderNo, ct);
        var rating = await db.ProductRatings.AsNoTracking().SingleOrDefaultAsync(r => r.OrderId == order.OrderId, ct);
        var canRate = order.Status == "Completed" && rating is null;
        return new OrderRatingView(canRate, rating is null ? null : ToResponse(rating, order));
    }

    public Task<RatingResponse> RateAsync(string orderNo, RateOrderRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => RateInsideAsync(orderNo, req, ct), ct);

    private async Task<RatingResponse> RateInsideAsync(string orderNo, RateOrderRequest req, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);
        var order = await LoadOwnedWithLinesAsync(orderNo, ct);
        if (order.Status != "Completed")
            throw new BusinessRuleException("rating.order_not_completed",
                "Chỉ đánh giá được đơn đã hoàn tất.");

        var exists = await db.ProductRatings.AsNoTracking().AnyAsync(r => r.OrderId == order.OrderId, ct);
        if (exists)
            throw new ConflictException("rating.already_exists", "Đơn này đã được đánh giá.");

        var distinctLines = order.OrderLines
            .OrderBy(l => l.OrderLineId)
            .GroupBy(l => l.ListingId)
            .Select(g => g.First())
            .ToList();

        int finalStars;
        string? storedComment;

        if (req.Items is { Count: > 0 })
        {
            var validIds = distinctLines.Select(l => l.ListingId).ToHashSet();
            var storedItems = new List<StoredItem>();
            foreach (var item in req.Items)
            {
                if (!validIds.Contains(item.ListingId)) continue;
                var itemStars = Math.Clamp(item.Stars, 1, 5);
                var itemComment = string.IsNullOrWhiteSpace(item.Comment) ? null : item.Comment.Trim();
                if (itemComment is { Length: > 180 })
                    itemComment = itemComment[..180];
                storedItems.Add(new StoredItem(item.ListingId, itemStars, itemComment));
            }

            if (storedItems.Count == 0)
            {
                finalStars = Math.Clamp(req.Stars, 1, 5);
                storedComment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim();
            }
            else if (storedItems.Count == 1 && distinctLines.Count <= 1)
            {
                finalStars = storedItems[0].Stars;
                storedComment = storedItems[0].Comment;
            }
            else
            {
                finalStars = Math.Clamp((int)Math.Round(storedItems.Average(i => i.Stars), MidpointRounding.AwayFromZero), 1, 5);
                var json = JsonSerializer.Serialize(storedItems);
                storedComment = ItemsPrefix + json;
                if (storedComment.Length > 500)
                {
                    var trimmed = storedItems.Select(i => i with { Comment = i.Comment is { Length: > 80 } ? i.Comment[..80] : i.Comment }).ToList();
                    storedComment = ItemsPrefix + JsonSerializer.Serialize(trimmed);
                }
            }
        }
        else
        {
            finalStars = Math.Clamp(req.Stars, 1, 5);
            storedComment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim();
        }

        var row = new ProductRating
        {
            OrderId = order.OrderId,
            Stars = (byte)finalStars,
            Comment = storedComment,
            CreatedAt = now,
        };
        db.ProductRatings.Add(row);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsDuplicateRating(ex))
        {
            throw new ConflictException("rating.already_exists", "Đơn này đã được đánh giá.");
        }

        var listingIds = distinctLines.Select(l => l.ListingId).ToList();

        await audit.WriteAsync("product_rating", row.RatingId, RateAction, null,
            new { orderId = order.OrderId, orderNo = order.OrderNo, stars = finalStars, comment = storedComment, listingIds },
            now, ct);

        return ToResponse(row, order);
    }

    public static (int Stars, string? Comment) ExtractForListing(byte defaultStars, string? rawComment, long listingId)
    {
        var items = TryParseItems(rawComment);
        if (items is not null)
        {
            var match = items.FirstOrDefault(i => i.ListingId == listingId);
            if (match is not null)
                return (match.Stars, match.Comment);
        }
        return (defaultStars, rawComment);
    }

    public static IReadOnlyList<StoredItem>? TryParseItems(string? rawComment)
    {
        if (string.IsNullOrEmpty(rawComment) || !rawComment.StartsWith(ItemsPrefix, StringComparison.Ordinal))
            return null;
        try
        {
            return JsonSerializer.Deserialize<List<StoredItem>>(rawComment[ItemsPrefix.Length..]);
        }
        catch
        {
            return null;
        }
    }

    private async Task<SalesOrder> LoadOwnedWithLinesAsync(string orderNo, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.OrderLines).ThenInclude(l => l.ProductListing).ThenInclude(p => p.Grade)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
        if (order.CustomerId != me.UserId)
            throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");
        return order;
    }

    private static RatingResponse ToResponse(ProductRating row, SalesOrder order)
    {
        var parsed = TryParseItems(row.Comment);
        var distinctLines = order.OrderLines
            .OrderBy(l => l.OrderLineId)
            .GroupBy(l => l.ListingId)
            .Select(g => g.First())
            .ToList();

        var itemResponses = distinctLines.Select(line =>
        {
            var (stars, comment) = ExtractForListing(row.Stars, row.Comment, line.ListingId);
            return new OrderItemRatingResponse(
                line.ListingId,
                line.ProductListing?.Title ?? $"Sản phẩm #{line.ListingId}",
                line.ProductListing?.Grade?.GradeName ?? "",
                stars,
                comment);
        }).ToList();

        string? displayComment = row.Comment;
        if (parsed is not null)
        {
            var parts = itemResponses
                .Where(i => !string.IsNullOrWhiteSpace(i.Comment))
                .Select(i => $"{i.Title} ({i.Stars} sao): {i.Comment}")
                .ToList();
            displayComment = parts.Count > 0 ? string.Join("\n", parts) : null;
        }

        return new RatingResponse(row.RatingId, order.OrderNo, row.Stars, displayComment, row.CreatedAt, itemResponses);
    }

    private static bool IsDuplicateRating(DbUpdateException ex)
    {
        var text = ex.InnerException?.Message ?? ex.Message;
        return text.Contains("uq_product_rating", StringComparison.OrdinalIgnoreCase)
               || text.Contains("duplicate", StringComparison.OrdinalIgnoreCase);
    }
}
