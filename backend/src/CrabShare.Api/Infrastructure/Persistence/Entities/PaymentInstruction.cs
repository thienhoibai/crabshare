using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Lệnh chi CrabShare gửi tổ chức trung gian: giải ngân, chi trả, hoàn tiền, nộp thuế
/// </summary>
public partial class PaymentInstruction
{
    public long InstructionId { get; set; }

    public long BatchAccountId { get; set; }

    /// <summary>
    /// Giá trị: Disbursement, Payout, Refund, TaxPayment
    /// </summary>
    public string InstructionType { get; set; } = null!;

    public decimal Amount { get; set; }

    public long? PayoutAccountId { get; set; }

    public string? BeneficiaryNote { get; set; }

    public long? TrancheId { get; set; }

    public long? SettlementLineId { get; set; }

    public long? ContributionId { get; set; }

    public long? OrderId { get; set; }

    /// <summary>
    /// Giá trị: Created, Sent, Succeeded, Failed, Disputed
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? SentAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual BatchAccount BatchAccount { get; set; } = null!;

    public virtual Contribution? Contribution { get; set; }

    public virtual SalesOrder? Order { get; set; }

    public virtual PayoutAccount? PayoutAccount { get; set; }

    public virtual ICollection<ProviderTransaction> ProviderTransactions { get; set; } = new List<ProviderTransaction>();

    public virtual SettlementLine? SettlementLine { get; set; }

    public virtual DisbursementTranche? Tranche { get; set; }
}
