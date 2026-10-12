using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Tử số quyền lợi của từng nhà đầu tư, chốt bất biến khi lô đóng vốn
/// </summary>
public partial class CapitalShare
{
    public long BatchId { get; set; }

    public long InvestorId { get; set; }

    public decimal ConfirmedAmount { get; set; }

    public DateTimeOffset SnapshottedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual Investor Investor { get; set; } = null!;

    public virtual ICollection<SettlementLine> SettlementLines { get; set; } = new List<SettlementLine>();
}
