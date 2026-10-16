using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

public sealed class RateOrderRequest
{
    [Range(1, 5)]
    public int Stars { get; set; }

    [MaxLength(500)]
    public string? Comment { get; set; }
}

public sealed record RatingResponse(
    long RatingId,
    string OrderNo,
    int Stars,
    string? Comment,
    DateTimeOffset CreatedAt);

public sealed record OrderRatingView(bool CanRate, RatingResponse? Rating);
