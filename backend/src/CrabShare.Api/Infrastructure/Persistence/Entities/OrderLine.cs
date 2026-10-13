using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Dòng hàng trong đơn; mặt hàng phải cùng lô với đơn
/// </summary>
public partial class OrderLine
{
    public long OrderLineId { get; set; }

    public long OrderId { get; set; }

    public long BatchId { get; set; }

    public long ListingId { get; set; }

    public decimal QuantityKg { get; set; }

    /// <summary>
    /// Giá tại thời điểm đặt
    /// </summary>
    public decimal UnitPrice { get; set; }

    /// <summary>
    /// Phiên bản giá đang hiệu lực lúc đặt (TL-27 §6.1); unit_price bằng giá của bản ghi này
    /// </summary>
    public long PriceHistoryId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<CrabItem> CrabItems { get; set; } = new List<CrabItem>();

    public virtual ProductListing ProductListing { get; set; } = null!;

    public virtual SalesOrder SalesOrder { get; set; } = null!;

    public virtual StockReservation? StockReservation { get; set; }
}
