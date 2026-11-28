using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Chỉ dẫn thu tiền (mã VietQR) vào tài khoản lô; gắn với đúng một nghĩa vụ
/// </summary>
public partial class PaymentRequest : PaymentRecord
{
    /// <summary>
    /// Nội dung chuyển khoản
    /// </summary>
    public string ReferenceCode { get; set; } = null!;

    public long BatchAccountId { get; set; }

    /// <summary>
    /// Giá trị: Contribution, OrderPayment, PreOrderDeposit, PreOrderBalance, OfftakeDeposit, OfftakePayment
    /// </summary>
    public string Purpose { get; set; } = null!;

    public decimal Amount { get; set; }

    public long? ContributionId { get; set; }

    public long? OrderId { get; set; }

    public long? OfftakeId { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>
    /// Giá trị: Pending, Paid, Expired, Cancelled
    /// </summary>
    public string Status { get; set; } = "Pending";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public virtual BatchAccount BatchAccount { get; set; } = null!;

    public virtual Contribution? Contribution { get; set; }

    public virtual OfftakeCommitment? Offtake { get; set; }

    public virtual SalesOrder? Order { get; set; }

    public virtual ICollection<ProviderTransaction> ProviderTransactions { get; set; } = new List<ProviderTransaction>();
}
