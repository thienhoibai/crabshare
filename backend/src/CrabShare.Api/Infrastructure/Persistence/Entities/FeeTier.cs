using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Bậc phí nền tảng theo quy mô vốn của lô
/// </summary>
public partial class FeeTier
{
    public long FeeTierId { get; set; }

    public string TierCode { get; set; } = null!;

    public decimal MinCapital { get; set; }

    public decimal? MaxCapital { get; set; }

    public decimal FeeAmount { get; set; }

    public DateOnly EffectiveFrom { get; set; }

    public DateOnly? EffectiveTo { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual ICollection<Batch> Batches { get; set; } = new List<Batch>();
}
