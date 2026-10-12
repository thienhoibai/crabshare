using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VOperatorReputation
{
    public long OperatorId { get; set; }

    public string LegalName { get; set; } = null!;

    public string Status { get; set; } = null!;

    public int? ClosedBatches { get; set; }

    public int? ProfitableBatches { get; set; }

    public decimal? AvgRating { get; set; }

    public int? ComplaintCount { get; set; }

    public int? EscalatedAlerts { get; set; }
}
