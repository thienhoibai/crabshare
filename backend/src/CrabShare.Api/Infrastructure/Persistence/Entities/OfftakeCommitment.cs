using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Cam kết bao tiêu gắn với một khoản góp: khối lượng, giá chốt, cọc
/// </summary>
public partial class OfftakeCommitment
{
    public long OfftakeId { get; set; }

    public long ContributionId { get; set; }

    public long BatchId { get; set; }

    public long GradeId { get; set; }

    public decimal CommittedQtyKg { get; set; }

    public decimal FixedUnitPrice { get; set; }

    public decimal DepositAmount { get; set; }

    /// <summary>
    /// Giá trị: Pending, Held, Applied, Forfeited, Refunded
    /// </summary>
    public string DepositStatus { get; set; } = null!;

    /// <summary>
    /// Giá trị: PendingHarvest, WindowOpen, Fulfilled, Expired, Cancelled
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? WindowOpensAt { get; set; }

    public DateTimeOffset? WindowExpiresAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual Contribution Contribution { get; set; } = null!;

    public virtual ProductGrade Grade { get; set; } = null!;

    public virtual ICollection<PaymentRequest> PaymentRequests { get; set; } = new List<PaymentRequest>();

    public virtual ICollection<SalesOrder> SalesOrders { get; set; } = new List<SalesOrder>();
}
