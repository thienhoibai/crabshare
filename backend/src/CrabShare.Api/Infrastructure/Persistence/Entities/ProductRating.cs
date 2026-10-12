using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Đánh giá của khách cho một đơn đã nhận
/// </summary>
public partial class ProductRating
{
    public long RatingId { get; set; }

    public long OrderId { get; set; }

    public byte Stars { get; set; }

    public string? Comment { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual SalesOrder Order { get; set; } = null!;
}
