using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Yêu cầu chụp đột xuất một ô, có hạn; hệ thống chọn ô ngẫu nhiên
/// </summary>
public partial class CaptureRequest
{
    public long CaptureRequestId { get; set; }

    public long BatchId { get; set; }

    public long SlotId { get; set; }

    public DateTimeOffset RequestedAt { get; set; }

    public DateTimeOffset DueAt { get; set; }

    /// <summary>
    /// Giá trị: Open, Fulfilled, Expired
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? FulfilledAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<Evidence> Evidences { get; set; } = new List<Evidence>();

    public virtual PhysicalSlot Slot { get; set; } = null!;
}
