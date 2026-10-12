using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Lượt quét tem của người mua; dùng để phát hiện tem bị sao chép
/// </summary>
public partial class TagScan
{
    public long TagScanId { get; set; }

    public long TagId { get; set; }

    public DateTimeOffset ScannedAt { get; set; }

    public long? ScannedBy { get; set; }

    /// <summary>
    /// Người quét có phải chủ đơn chứa con cua này không
    /// </summary>
    public bool IsOrderOwner { get; set; }

    public virtual AppUser? ScannedByNavigation { get; set; }

    public virtual CrabTag Tag { get; set; } = null!;
}
