namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// VI-09 authored extension; kept outside generated AppDbContext.cs.
public sealed class SlotEventPolicyVersion
{
    public long PolicyVersionId { get; set; }
    public long BatchId { get; set; }
    public int VersionNo { get; set; }
    public string RestockCutoffBasis { get; set; } = "";
    public short RestockCutoffDays { get; set; }
    public int? MortalityWindowHours { get; set; }
    public decimal? MortalityThresholdPercent { get; set; }
    public string? MortalitySeverity { get; set; }
    public int? MortalityAckWithinHours { get; set; }
    public long CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
