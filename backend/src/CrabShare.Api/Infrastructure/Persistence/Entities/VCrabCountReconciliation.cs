using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VCrabCountReconciliation
{
    public long BatchId { get; set; }

    public int? StockedTotal { get; set; }

    public int? Restocked { get; set; }

    public int? Dead { get; set; }

    public int? Growing { get; set; }

    public int? Harvested { get; set; }

    public int? DeclaredHarvested { get; set; }

    public int? Sold { get; set; }

    public int? InStock { get; set; }

    public int? Lost { get; set; }

    public int? HarvestedWithoutActiveTag { get; set; }
}
