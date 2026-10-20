using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Batches;

public sealed class ExploreBatchQuery
{
    // Recognize schema states for validation; Published() always intersects this filter with publication rules.
    [RegularExpression("^(Draft|PendingApproval|Rejected|Funding|Cancelled|Stocked|InProduction|Harvesting|Settlement|Closed)$")]
    public string? Status { get; set; }
    [RegularExpression("^(FatteningMudCrab|RoeCrab|SoftShellCrab)$")]
    public string? CrabType { get; set; }
}

public sealed record ExploreFundingProgress(long ConfirmedCapital, long ReservedCapital, int InvestorCount, decimal PctOfTarget, string PercentLabel);
public sealed record ExploreCostCategory(string Category, long Amount);
public sealed record ExploreStandardCost(short VersionNo, string Status, long Total, IReadOnlyList<ExploreCostCategory> Items, DateTimeOffset? LockedAt);
public sealed record ExploreOfftakePrice(string GradeCode, string GradeName, long UnitPrice);
public sealed record ExploreBatchResponse(string BatchCode, string Title, string OperatorName, string CrabType, string Status,
    int SeedQuantity, decimal ExpectedOutputKg, short CycleDays, short RestockCutoffDays,
    long MinViableCapital, long TargetCapital, long MaxCapital, long MinContribution, decimal OperatorSharePct,
    DateTimeOffset? FundingOpenAt, DateTimeOffset? FundingDeadline, ExploreFundingProgress FundingProgress, ExploreStandardCost? StandardCost,
    decimal OfftakePreorderCapPct, decimal OfftakeDepositPct, IReadOnlyList<ExploreOfftakePrice> OfftakePrices);
