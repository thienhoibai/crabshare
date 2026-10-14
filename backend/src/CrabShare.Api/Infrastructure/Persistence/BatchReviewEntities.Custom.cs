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
    public DateOnly PlannedDate { get; set; }
    public string UnlockCondition { get; set; } = "";
    public StandardCostVersion CostVersion { get; set; } = null!;
}
