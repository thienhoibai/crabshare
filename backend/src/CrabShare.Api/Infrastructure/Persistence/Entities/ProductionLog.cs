using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Nhật ký vận hành hằng ngày của lô
/// </summary>
public partial class ProductionLog
{
    public long ProductionLogId { get; set; }

    public long BatchId { get; set; }

    public DateOnly LogDate { get; set; }

    public decimal? WaterTempC { get; set; }

    public decimal? SalinityPpt { get; set; }

    public decimal? Ph { get; set; }

    public decimal? FeedKg { get; set; }

    public string? Note { get; set; }

    /// <summary>
    /// Giá trị: FarmApi, Manual
    /// </summary>
    public string Source { get; set; } = null!;

    /// <summary>
    /// Kết quả kiểm tra hợp lý số liệu: Ok, OutOfRange (ngoài dải), Inconsistent (mâu thuẫn với số cua còn sống)
    /// </summary>
    public string PlausibilityFlag { get; set; } = null!;

    /// <summary>
    /// Có giá trị khi số liệu đã được kiểm (nhãn nguồn &quot;đã kiểm&quot;)
    /// </summary>
    public DateTimeOffset? VerifiedAt { get; set; }

    public long? RecordedBy { get; set; }

    public DateTimeOffset ReceivedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual AppUser? RecordedByNavigation { get; set; }
}
