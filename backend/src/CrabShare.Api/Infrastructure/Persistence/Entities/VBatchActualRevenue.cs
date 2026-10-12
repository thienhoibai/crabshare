using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VBatchActualRevenue
{
    public long BatchId { get; set; }

    public string BatchCode { get; set; } = null!;

    public decimal OrderRevenue { get; set; }

    public decimal ForfeitedDeposits { get; set; }

    public decimal ComplaintRefunds { get; set; }

    public decimal? ActualRevenue { get; set; }
}
