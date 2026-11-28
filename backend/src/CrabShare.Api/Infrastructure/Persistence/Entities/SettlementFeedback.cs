using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phản hồi / tranh chấp về bảng quyết toán trong cửa sổ 7 ngày
/// </summary>
public partial class SettlementFeedback : SettlementRecord
{
    public long SettlementId { get; set; }

    public long UserId { get; set; }

    public string Content { get; set; } = null!;

    /// <summary>
    /// Giá trị: Open, Answered, Withdrawn, Unresolved
    /// </summary>
    public string Status { get; set; } = "Open";

    public string? Response { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? RespondedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public virtual Settlement Settlement { get; set; } = null!;

    public virtual AppUser User { get; set; } = null!;
}
