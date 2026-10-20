namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public sealed class ProductionThresholdVersion
{
    public long ThresholdVersionId { get; set; }
    public long BatchId { get; set; }
    public int VersionNo { get; set; }
    public decimal PhMin { get; set; }
    public decimal PhMax { get; set; }
    public decimal WaterTempMinC { get; set; }
    public decimal WaterTempMaxC { get; set; }
    public decimal SalinityMinPpt { get; set; }
    public decimal SalinityMaxPpt { get; set; }
    public long CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public partial class ProductionLog
{
    public long? ThresholdVersionId { get; set; }
    public ProductionThresholdVersion? ThresholdVersion { get; set; }
}
