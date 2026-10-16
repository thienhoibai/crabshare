using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

public sealed class RateOrderItemRequest
{
    public long ListingId { get; set; }

    [Range(1, 5)]
    public int Stars { get; set; }

    [MaxLength(500)]
    public string? Comment { get; set; }
}

public sealed class RateOrderRequest
{
    [Range(1, 5)]
    public int Stars { get; set; } = 5;

    [MaxLength(500)]
    public string? Comment { get; set; }

    public IReadOnlyList<RateOrderItemRequest>? Items { get; set; }
}

public sealed record OrderItemRatingResponse(
    long ListingId,
    string Title,
    string GradeName,
    int Stars,
    string? Comment);

public sealed record RatingResponse(
    long RatingId,
    string OrderNo,
    int Stars,
    string? Comment,
    DateTimeOffset CreatedAt,
    IReadOnlyList<OrderItemRatingResponse>? Items = null);

public sealed record OrderRatingView(bool CanRate, RatingResponse? Rating);
