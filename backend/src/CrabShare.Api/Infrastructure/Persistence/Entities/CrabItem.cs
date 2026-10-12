using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Từng con cua, có mã từ lúc thả giống; lúc nuôi gắn với ô, từ lúc thu hoạch gắn với tem
/// </summary>
public partial class CrabItem
{
    public long CrabItemId { get; set; }

    /// <summary>
    /// Mã nội bộ của con cua, sinh lúc thả giống
    /// </summary>
    public Guid ItemUuid { get; set; }

    public long BatchId { get; set; }

    public long SlotAllocationId { get; set; }

    /// <summary>
    /// Thời điểm thả con cua vào ô
    /// </summary>
    public DateTimeOffset StockedAt { get; set; }

    /// <summary>
    /// Con cua chết mà con này thả bù thay
    /// </summary>
    public long? ReplacesCrabItemId { get; set; }

    /// <summary>
    /// Null khi còn nuôi hoặc đã chết
    /// </summary>
    public long? HarvestId { get; set; }

    public long? GradeId { get; set; }

    public short? WeightG { get; set; }

    /// <summary>
    /// Gán khi đóng đơn bằng cách quét tem
    /// </summary>
    public long? OrderLineId { get; set; }

    /// <summary>
    /// Giá trị: Growing, Dead, InStock, Packed, Sold, DeliveredInKind, Lost
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<CrabItemEvent> CrabItemEvents { get; set; } = new List<CrabItemEvent>();

    public virtual CrabTag? CrabTag { get; set; }

    public virtual ProductGrade? Grade { get; set; }

    public virtual Harvest? Harvest { get; set; }

    public virtual ICollection<CrabItem> InverseReplacesCrabItem { get; set; } = new List<CrabItem>();

    public virtual OrderLine? OrderLine { get; set; }

    public virtual CrabItem? ReplacesCrabItem { get; set; }

    public virtual SlotAllocation SlotAllocation { get; set; } = null!;
}
