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

    public async Task<OrderRatingView> GetAsync(string orderNo, CancellationToken ct)
    {
        var order = await LoadOwnedAsync(orderNo, ct);
        var rating = await db.ProductRatings.AsNoTracking().SingleOrDefaultAsync(r => r.OrderId == order.OrderId, ct);
        var canRate = order.Status == "Completed" && rating is null;
        return new OrderRatingView(canRate, rating is null ? null : ToResponse(rating, order.OrderNo));
    }

    public Task<RatingResponse> RateAsync(string orderNo, RateOrderRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => RateInsideAsync(orderNo, req, ct), ct);

    private async Task<RatingResponse> RateInsideAsync(string orderNo, RateOrderRequest req, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);
        var order = await LoadOwnedAsync(orderNo, ct);
        if (order.Status != "Completed")
            throw new BusinessRuleException("rating.order_not_completed",
                "Chỉ đánh giá được đơn đã hoàn tất.");

        var exists = await db.ProductRatings.AsNoTracking().AnyAsync(r => r.OrderId == order.OrderId, ct);
        if (exists)
            throw new ConflictException("rating.already_exists", "Đơn này đã được đánh giá.");

        var comment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim();
        var row = new ProductRating
        {
            OrderId = order.OrderId,
            Stars = (byte)req.Stars,
            Comment = comment,
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

        var listingIds = await db.OrderLines.AsNoTracking()
            .Where(l => l.OrderId == order.OrderId)
            .Select(l => l.ListingId)
            .Distinct()
            .ToListAsync(ct);

        await audit.WriteAsync("product_rating", row.RatingId, RateAction, null,
            new { orderId = order.OrderId, orderNo = order.OrderNo, stars = req.Stars, comment, listingIds },
            now, ct);

        return ToResponse(row, order.OrderNo);
    }

    private async Task<SalesOrder> LoadOwnedAsync(string orderNo, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
        if (order.CustomerId != me.UserId)
            throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");
        return order;
    }

    private static RatingResponse ToResponse(ProductRating row, string orderNo)
        => new(row.RatingId, orderNo, row.Stars, row.Comment, row.CreatedAt);

    private static bool IsDuplicateRating(DbUpdateException ex)
    {
        var text = ex.InnerException?.Message ?? ex.Message;
        return text.Contains("uq_product_rating", StringComparison.OrdinalIgnoreCase)
               || text.Contains("duplicate", StringComparison.OrdinalIgnoreCase);
    }
}
