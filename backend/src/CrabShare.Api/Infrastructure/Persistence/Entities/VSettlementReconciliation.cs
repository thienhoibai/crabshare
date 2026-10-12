using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VSettlementReconciliation
{
    public long SettlementId { get; set; }

    public long BatchId { get; set; }

    public decimal ActualRevenue { get; set; }

    public decimal LockedStandardCost { get; set; }

    public decimal RevenuePool { get; set; }

    public decimal OperatorRemuneration { get; set; }

    public decimal? Distributable { get; set; }

    public decimal SumProfitShare { get; set; }

    public decimal SumCapitalReturn { get; set; }

    public decimal SumTaxWithheld { get; set; }

    public int? LineCount { get; set; }

    public decimal? Difference { get; set; }
}
