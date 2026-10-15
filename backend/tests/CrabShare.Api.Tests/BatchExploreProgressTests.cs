using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests;

public class BatchExploreProgressTests
{
    [Fact]
    public void Missing_view_returns_finite_zero_progress()
    {
        var progress = BatchExploreService.Funding(null, 75000000);
        Assert.Equal(new ExploreFundingProgress(0, 0, 0, 0, "0,00%"), progress);
    }
    [Fact]
    public void Zero_denominator_is_safe_even_if_view_contains_a_percentage()
    {
        var progress = BatchExploreService.Funding(new VBatchFundingProgress { PctOfTarget = 33.33m }, 0);
        Assert.Equal(0, progress.PctOfTarget); Assert.Equal("0,00%", progress.PercentLabel);
    }
    [Fact]
    public void Percentage_comes_from_view_without_recalculation_or_cap()
    {
        var progress = BatchExploreService.Funding(new VBatchFundingProgress {
            ConfirmedCapital = 1, ReservedCapital = 200, InvestorCount = 2, PctOfTarget = 133.33m
        }, 75000000);
        Assert.Equal(133.33m, progress.PctOfTarget); Assert.Equal("133,33%", progress.PercentLabel);
        Assert.Equal(1, progress.ConfirmedCapital); Assert.Equal(200, progress.ReservedCapital);
    }
}
