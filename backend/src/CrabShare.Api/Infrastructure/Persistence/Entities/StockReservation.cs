using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Giữ chỗ tồn kho có thời hạn khi đặt hàng
/// </summary>
public partial class StockReservation
{
    public long StockReservationId { get; set; }

    public long OrderLineId { get; set; }

    public long ListingId { get; set; }

    public decimal QuantityKg { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>
    /// Giá trị: Active, Committed, Released
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ProductListing Listing { get; set; } = null!;

    public virtual OrderLine OrderLine { get; set; } = null!;
}
