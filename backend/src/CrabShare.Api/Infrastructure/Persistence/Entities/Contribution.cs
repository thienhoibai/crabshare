using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Khoản góp vốn: giữ chỗ rồi được xác nhận khi tiền về tài khoản lô
/// </summary>
public partial class Contribution
{
    public long ContributionId { get; set; }

    public long BatchId { get; set; }

    public long InvestorId { get; set; }

    public decimal Amount { get; set; }

    /// <summary>
    /// Giá trị: Reserved, Confirmed, Expired, Refunded
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset ReservedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? ConfirmedAt { get; set; }

    public DateTimeOffset? RefundedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual InvestmentContract? InvestmentContract { get; set; }

    public virtual Investor Investor { get; set; } = null!;

    public virtual ICollection<OfftakeCommitment> OfftakeCommitments { get; set; } = new List<OfftakeCommitment>();

    public virtual ICollection<PaymentInstruction> PaymentInstructions { get; set; } = new List<PaymentInstruction>();

    public virtual ICollection<PaymentRequest> PaymentRequests { get; set; } = new List<PaymentRequest>();
}
