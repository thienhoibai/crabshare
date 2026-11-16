using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Lịch sử đổi giá công khai của mặt hàng
/// </summary>
public partial class PriceHistory
{
    public long PriceHistoryId { get; set; }

    public long ListingId { get; set; }

    public decimal PricePerKg { get; set; }

    public DateTimeOffset EffectiveFrom { get; set; }

    public long ChangedBy { get; set; }

    public bool FlaggedAbnormal { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public decimal? PreviousPricePerKg { get; set; }

    public string ReasonCode { get; set; } = null!;

    public string? Note { get; set; }

    public virtual AppUser ChangedByNavigation { get; set; } = null!;

    public virtual ProductListing Listing { get; set; } = null!;

    public virtual PriceCheck? PriceCheck { get; set; }
}
