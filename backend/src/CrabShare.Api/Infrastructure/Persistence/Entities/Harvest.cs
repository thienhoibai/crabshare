using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Khai báo thu hoạch của lô
/// </summary>
public partial class Harvest
{
    public long HarvestId { get; set; }

    public long BatchId { get; set; }

    public DateTimeOffset HarvestedAt { get; set; }

    public int HarvestedCount { get; set; }

    public decimal TotalWeightKg { get; set; }

    public long DeclaredBy { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<CrabItem> CrabItems { get; set; } = new List<CrabItem>();

    public virtual AppUser DeclaredByNavigation { get; set; } = null!;
}
