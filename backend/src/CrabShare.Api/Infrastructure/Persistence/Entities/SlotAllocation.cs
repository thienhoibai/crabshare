using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Gán ô nuôi cho lô; mỗi ô chỉ thuộc một lô đang hoạt động
/// </summary>
public partial class SlotAllocation
{
    public long SlotAllocationId { get; set; }

    public long BatchId { get; set; }

    public long SlotId { get; set; }

    public DateTimeOffset AllocatedAt { get; set; }

    public DateTimeOffset? ReleasedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<CrabItem> CrabItems { get; set; } = new List<CrabItem>();

    public virtual PhysicalSlot Slot { get; set; } = null!;

    public virtual ICollection<SlotEvent> SlotEvents { get; set; } = new List<SlotEvent>();
}
