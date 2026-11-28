using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Cảnh báo vận hành, có hạn xác nhận và tự leo thang
/// </summary>
public partial class Alert : CareRecord
{
    public long BatchId { get; set; }

    /// <summary>
    /// Giá trị: Mortality, WaterQuality, MilestoneDelay, LowStock, DataSilence, EvidenceFlag
    /// </summary>
    public string AlertType { get; set; } = null!;

    /// <summary>
    /// Giá trị: Low, Medium, High, Critical
    /// </summary>
    public string Severity { get; set; } = null!;

    public string Message { get; set; } = null!;

    public DateTimeOffset RaisedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset AckDeadline { get; set; }

    public DateTimeOffset? AcknowledgedAt { get; set; }

    public long? AcknowledgedBy { get; set; }

    public string? ResponseNote { get; set; }

    public DateTimeOffset? EscalatedAt { get; set; }

    /// <summary>
    /// Giá trị: Open, Acknowledged, Escalated, Resolved
    /// </summary>
    public string Status { get; set; } = "Open";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public virtual AppUser? AcknowledgedByNavigation { get; set; }

    public virtual Batch Batch { get; set; } = null!;
}
