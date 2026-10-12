using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Tài khoản chuyên dùng của lô do tổ chức trung gian thanh toán giữ hộ
/// </summary>
public partial class BatchAccount
{
    public long BatchAccountId { get; set; }

    public long BatchId { get; set; }

    public string ProviderName { get; set; } = null!;

    public string ProviderAccountNo { get; set; } = null!;

    /// <summary>
    /// Giá trị: Requested, Open, Frozen, Closed
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? OpenedAt { get; set; }

    public DateTimeOffset? ClosedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<PaymentInstruction> PaymentInstructions { get; set; } = new List<PaymentInstruction>();

    public virtual ICollection<PaymentRequest> PaymentRequests { get; set; } = new List<PaymentRequest>();

    public virtual ICollection<ProviderTransaction> ProviderTransactions { get; set; } = new List<ProviderTransaction>();
}
