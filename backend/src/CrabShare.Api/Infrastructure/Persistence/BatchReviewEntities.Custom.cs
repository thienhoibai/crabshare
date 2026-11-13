// Handwritten additions for V008; database-first generated files remain untouched.
namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class Batch { public string? RejectionReason { get; set; } }
public partial class FeeTier
{
    public bool MinInclusive { get; set; } = true;
    public bool MaxInclusive { get; set; }
}
public partial class StandardCostVersion
{
    public ICollection<StandardCostTranchePlan> TranchePlans { get; set; } = new List<StandardCostTranchePlan>();
}
public sealed class StandardCostTranchePlan
{
    public long CostVersionId { get; set; }
    public byte TrancheNo { get; set; }
    public DateOnly? PlannedDate { get; set; }
    public string? AnchorCode { get; set; }
    public short? OffsetDays { get; set; }
    public string UnlockCondition { get; set; } = "";
    // V019: mốc giải ngân theo tỷ lệ (BR-145, BR-146)
    public string? MilestoneKind { get; set; }
    public string? MilestoneName { get; set; }
    public decimal? Pct { get; set; }
    public StandardCostVersion CostVersion { get; set; } = null!;
}
