using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phần chia của từng nhà đầu tư; tổng khớp Revenue Pool tới từng đồng
/// </summary>
public partial class SettlementLine
{
    public long SettlementLineId { get; set; }

    public long SettlementId { get; set; }

    public long BatchId { get; set; }

    public long InvestorId { get; set; }

    public decimal CapitalReturn { get; set; }

    /// <summary>
    /// Âm khi lô lỗ; lỗ không vượt vốn góp
    /// </summary>
    public decimal ProfitShare { get; set; }

    public decimal TaxWithheld { get; set; }

    public decimal NetPayout { get; set; }

    public decimal InKindQtyKg { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual CapitalShare CapitalShare { get; set; } = null!;

    public virtual Investor Investor { get; set; } = null!;

    public virtual ICollection<PaymentInstruction> PaymentInstructions { get; set; } = new List<PaymentInstruction>();

    public virtual Settlement Settlement { get; set; } = null!;
}
