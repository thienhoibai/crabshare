using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VBatchCommitmentCap
{
    public long BatchId { get; set; }

    public string BatchCode { get; set; } = null!;

    public decimal ExpectedOutputKg { get; set; }

    public decimal OfftakePreorderCapPct { get; set; }

    public decimal? CapKg { get; set; }

    public decimal OfftakeKg { get; set; }

    public decimal PreorderKg { get; set; }

    public decimal? RemainingKg { get; set; }
}
