using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Tài khoản nhận tiền của nhà đầu tư hoặc người nuôi (đúng một chủ sở hữu)
/// </summary>
public partial class PayoutAccount
{
    public long PayoutAccountId { get; set; }

    public long? OwnerUserId { get; set; }

    public long? OwnerOperatorId { get; set; }

    public string BankCode { get; set; } = null!;

    public string AccountNo { get; set; } = null!;

    public string AccountHolderName { get; set; } = null!;

    /// <summary>
    /// Giá trị: Pending, Matched, Mismatched
    /// </summary>
    public string NameMatchStatus { get; set; } = null!;

    /// <summary>
    /// Giá trị: Active, Locked, Closed
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Operator? OwnerOperator { get; set; }

    public virtual AppUser? OwnerUser { get; set; }

    public virtual ICollection<PaymentInstruction> PaymentInstructions { get; set; } = new List<PaymentInstruction>();
}
