using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Đợt giải ngân theo mốc, suy ra từ Standard Cost đã khoá
/// </summary>
public partial class DisbursementTranche
{
    public long TrancheId { get; set; }

    public long BatchId { get; set; }

    public byte TrancheNo { get; set; }

    public decimal PlannedAmount { get; set; }

    public DateOnly PlannedDate { get; set; }

    public string UnlockCondition { get; set; } = null!;

    /// <summary>
    /// Giá trị: Planned, Requested, NeedsExplanation, Released, Blocked
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? RequestedAt { get; set; }

    public DateTimeOffset? ExplanationDeadline { get; set; }

    public DateTimeOffset? ReleasedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<Evidence> Evidences { get; set; } = new List<Evidence>();

    public virtual ICollection<PaymentInstruction> PaymentInstructions { get; set; } = new List<PaymentInstruction>();
}
