using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Lịch sử từng con cua từ lúc thả tới tay người mua; chỉ ghi thêm
/// </summary>
public partial class CrabItemEvent
{
    public long CrabItemEventId { get; set; }

    public long CrabItemId { get; set; }

    /// <summary>
    /// Giá trị: Stocked, Died, Harvested, TagPrinted, TagActivated, TagVoided, StoredIn, Packed, Delivered, Lost
    /// </summary>
    public string EventType { get; set; } = null!;

    public DateTimeOffset OccurredAt { get; set; }

    public long? ActorId { get; set; }

    public long? EvidenceId { get; set; }

    public long? TagId { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual AppUser? Actor { get; set; }

    public virtual CrabItem CrabItem { get; set; } = null!;

    public virtual Evidence? Evidence { get; set; }

    public virtual CrabTag? Tag { get; set; }
}
