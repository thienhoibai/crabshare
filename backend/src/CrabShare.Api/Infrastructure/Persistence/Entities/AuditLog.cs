using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Nhật ký chỉ ghi thêm cho mọi thay đổi về tiền, hợp đồng, Standard Cost; nối chuỗi băm
/// </summary>
public partial class AuditLog
{
    public long AuditId { get; set; }

    public string EntityType { get; set; } = null!;

    public long EntityId { get; set; }

    public string ActionType { get; set; } = null!;

    public string? OldValue { get; set; }

    public string? NewValue { get; set; }

    public long? ActorUserId { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public string? PrevHash { get; set; }

    public string RowHash { get; set; } = null!;

    public virtual AppUser? ActorUser { get; set; }
}
