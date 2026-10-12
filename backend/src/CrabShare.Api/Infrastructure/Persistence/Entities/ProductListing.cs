using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Mặt hàng đăng bán của một lô theo một phân loại
/// </summary>
public partial class ProductListing
{
    public long ListingId { get; set; }

    public long BatchId { get; set; }

    public long GradeId { get; set; }

    public string Title { get; set; } = null!;

    /// <summary>
    /// Giá trị: Fresh, Frozen
    /// </summary>
    public string StorageType { get; set; } = null!;

    public DateTimeOffset? FrozenAt { get; set; }

    public decimal CurrentPricePerKg { get; set; }

    public decimal StockQtyKg { get; set; }

    public decimal ReservedQtyKg { get; set; }

    /// <summary>
    /// Giá trị: Draft, Published, SoldOut, Closed
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? PublishedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ProductGrade Grade { get; set; } = null!;

    public virtual ICollection<OrderLine> OrderLines { get; set; } = new List<OrderLine>();

    public virtual ICollection<PriceHistory> PriceHistories { get; set; } = new List<PriceHistory>();

    public virtual ICollection<StockReservation> StockReservations { get; set; } = new List<StockReservation>();
}
