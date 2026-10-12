using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class PriceCheck
{
    public long PriceHistoryId { get; set; }

    public string SegmentKey { get; set; } = null!;

    public short WindowDays { get; set; }

    public int SampleCount { get; set; }

    public int OperatorCount { get; set; }

    public bool HasEnoughData { get; set; }

    public decimal? MedianPricePerKg { get; set; }

    public decimal? MadPerKg { get; set; }

    public string Method { get; set; } = null!;

    public decimal? Score { get; set; }

    public decimal? Threshold { get; set; }

    public bool IsFlagged { get; set; }

    public string AlgorithmVersion { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public virtual PriceHistory PriceHistory { get; set; } = null!;
}
