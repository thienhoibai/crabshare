using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Sự kiện của từng ô nuôi: thả giống, lột xác, hao hụt, thả bù, thu hoạch
/// </summary>
public partial class SlotEvent
{
    public long SlotEventId { get; set; }

    public long SlotAllocationId { get; set; }

    public long BatchId { get; set; }

    /// <summary>
    /// Giá trị: Stocked, Molted, Mortality, Restocked, Harvested, Relocated
    /// </summary>
    public string EventType { get; set; } = null!;

    public DateTimeOffset OccurredAt { get; set; }

    public short Quantity { get; set; }

    public string? Note { get; set; }

    /// <summary>
    /// Giá trị: FarmApi, Manual
    /// </summary>
    public string Source { get; set; } = null!;

    public DateTimeOffset ReceivedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<Evidence> Evidences { get; set; } = new List<Evidence>();

    public virtual SlotAllocation SlotAllocation { get; set; } = null!;
}
