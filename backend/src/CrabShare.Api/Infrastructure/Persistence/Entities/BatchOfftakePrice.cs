namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Giá chốt bao tiêu (đồng/kg) theo hạng trên một lô — TL-30 BR-32/33.</summary>
public sealed class BatchOfftakePrice
{
    public long BatchId { get; set; }

    public long GradeId { get; set; }

    public decimal UnitPrice { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Batch Batch { get; set; } = null!;

    public ProductGrade Grade { get; set; } = null!;
}
