using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Dòng chi phí theo hạng mục trong một phiên bản Standard Cost
/// </summary>
public partial class StandardCostItem
{
    public long CostItemId { get; set; }

    public long CostVersionId { get; set; }

    /// <summary>
    /// Giá trị: Seed, Feed, Utilities, Labour, MortalityReserve, Depreciation, Other
    /// </summary>
    public string Category { get; set; } = null!;

    public string Description { get; set; } = null!;

    public decimal Quantity { get; set; }

    public string Unit { get; set; } = null!;

    public decimal UnitPrice { get; set; }

    /// <summary>
    /// Đợt giải ngân; NULL với khấu hao
    /// </summary>
    public byte? TrancheNo { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual StandardCostVersion CostVersion { get; set; } = null!;
}
