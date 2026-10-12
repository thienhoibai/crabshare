using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VBatchFundingProgress
{
    public long BatchId { get; set; }

    public string BatchCode { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateTimeOffset? FundingDeadline { get; set; }

    public decimal MinViableCapital { get; set; }

    public decimal TargetCapital { get; set; }

    public decimal MaxCapital { get; set; }

    public decimal ConfirmedCapital { get; set; }

    public decimal ReservedCapital { get; set; }

    public int? InvestorCount { get; set; }

    public decimal? PctOfTarget { get; set; }

    public int ReachedMinViable { get; set; }
}
