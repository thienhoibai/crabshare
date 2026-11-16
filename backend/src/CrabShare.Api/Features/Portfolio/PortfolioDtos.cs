using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Portfolio;

public sealed class PortfolioQuery
{
    [RegularExpression("^(Funding|Stocked|InProduction|Harvesting|Settlement|Closed|Cancelled)$")]
    public string? Status { get; set; }
    [StringLength(100)] public string? Q { get; set; }
}
public sealed record PortfolioBatch(string Code, string Title, string OperatorName, string CrabType, string Status,
    long TargetCapital, long RaisedCapital, long MinContribution, int CycleDays, int SeedQuantity,
    DateTimeOffset? FundingDeadline, DateTimeOffset? StockedAt, DateOnly? ExpectedHarvestDate,
    int? DayOfCycle, int? AliveCount, int OpenAlerts);
public sealed record PortfolioSettlement(string Status, long CapitalReturn, long ProfitShare, long TaxWithheld,
    long NetPayout, decimal InKindQtyKg);
public sealed record PortfolioItem(PortfolioBatch Batch, long ConfirmedAmount, decimal? CapitalRatio,
    string CapitalBasis, DateTimeOffset? LastConfirmedAt, PortfolioSettlement? Settlement);
public sealed record PortfolioSummary(long TotalConfirmedAmount, long ActiveConfirmedAmount, int TotalBatches,
    int ActiveBatches, long ApprovedNetPayout);
public sealed record PortfolioPage(IReadOnlyList<PortfolioItem> Items, int Page, int PageSize, int Total, PortfolioSummary Summary);
public sealed record PortfolioTimelineEvent(string Type, string Label, DateTimeOffset At);
public sealed record PortfolioContribution(long Id, long Amount, string Status, DateTimeOffset ReservedAt,
    DateTimeOffset? ConfirmedAt, string? ContractNo, string? ContractStatus, DateTimeOffset? FullySignedAt);
public sealed record PortfolioProduction(DateOnly LogDate, decimal? Ph, decimal? WaterTempC, decimal? SalinityPpt,
    decimal? FeedKg, string Source, string PlausibilityFlag, DateTimeOffset? VerifiedAt);
public sealed record PortfolioDetail(PortfolioItem Position, IReadOnlyList<PortfolioContribution> Contributions,
    IReadOnlyList<PortfolioTimelineEvent> Timeline, PortfolioProduction? LatestProduction);
