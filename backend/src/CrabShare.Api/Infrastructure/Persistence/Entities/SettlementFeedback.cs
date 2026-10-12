using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phản hồi / tranh chấp về bảng quyết toán trong cửa sổ 7 ngày
/// </summary>
public partial class SettlementFeedback
{
    public long FeedbackId { get; set; }

    public long SettlementId { get; set; }

    public long UserId { get; set; }

    public string Content { get; set; } = null!;

    /// <summary>
    /// Giá trị: Open, Answered, Withdrawn, Unresolved
    /// </summary>
    public string Status { get; set; } = null!;

    public string? Response { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? RespondedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Settlement Settlement { get; set; } = null!;

    public virtual AppUser User { get; set; } = null!;
}
