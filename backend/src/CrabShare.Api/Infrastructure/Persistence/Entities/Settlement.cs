using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Bảng quyết toán của lô; bất biến sau khi được duyệt
/// </summary>
public partial class Settlement
{
    public long SettlementId { get; set; }

    public long BatchId { get; set; }

    public short RevisionNo { get; set; }

    public decimal ActualRevenue { get; set; }

    public decimal LockedStandardCost { get; set; }

    /// <summary>
    /// = actual_revenue − locked_standard_cost, có thể âm
    /// </summary>
    public decimal RevenuePool { get; set; }

    public decimal OperatorSharePct { get; set; }

    public decimal OperatorRemuneration { get; set; }

    public decimal DepreciationAmount { get; set; }

    public decimal TaxTotal { get; set; }

    /// <summary>
    /// Giá trị: Draft, Proposed, Disputed, Approved, PaidOut, Closed
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? ProposedAt { get; set; }

    public DateTimeOffset? FeedbackDeadline { get; set; }

    public long? ApprovedBy { get; set; }

    public DateTimeOffset? ApprovedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual AppUser? ApprovedByNavigation { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<SettlementFeedback> SettlementFeedbacks { get; set; } = new List<SettlementFeedback>();

    public virtual ICollection<SettlementLine> SettlementLines { get; set; } = new List<SettlementLine>();
}
