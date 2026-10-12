using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Khiếu nại đơn hàng và cách giải quyết
/// </summary>
public partial class Complaint
{
    public long ComplaintId { get; set; }

    public long OrderId { get; set; }

    /// <summary>
    /// Giá trị: LateDelivery, WrongGrade, Damaged, NotReceived, Other
    /// </summary>
    public string ComplaintType { get; set; } = null!;

    public string Description { get; set; } = null!;

    public string? EvidenceUri { get; set; }

    /// <summary>
    /// Giá trị: Open, OperatorResponded, Escalated, Resolved, Rejected
    /// </summary>
    public string Status { get; set; } = null!;

    /// <summary>
    /// Giá trị: Refund, Compensation, Replacement, NoAction
    /// </summary>
    public string? Resolution { get; set; }

    public decimal? RefundAmount { get; set; }

    public long? ResolvedBy { get; set; }

    public DateTimeOffset OpenedAt { get; set; }

    public DateTimeOffset? ResolvedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual SalesOrder Order { get; set; } = null!;

    public virtual AppUser? ResolvedByNavigation { get; set; }
}
