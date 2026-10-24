using CrabShare.SettlementEngine;

namespace CrabShare.SettlementEngine.Tests;

public class MutationRegressionTests
{
    [Fact]
    public void Allocator_rejects_empty_recipients()
    {
        var error = Assert.Throws<ArgumentException>(() =>
            LargestRemainderAllocator.Allocate(10, Array.Empty<(long, long)>()));
        Assert.Equal("weights", error.ParamName);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Allocator_rejects_one_invalid_weight_among_valid_weights(long weight)
    {
        var error = Assert.Throws<ArgumentException>(() =>
            LargestRemainderAllocator.Allocate(10, [(1L, 10L), (2L, weight)]));
        Assert.Equal("weights", error.ParamName);
    }

    [Theory]
    [InlineData(2, 0, 2)]
    [InlineData(-2, 0, -2)]
    [InlineData(0, 0, 0)]
    public void Equal_remainders_favor_larger_capital_and_preserve_input_order(long total, long small, long large)
    {
        var shares = LargestRemainderAllocator.Allocate(total, [(2L, 3L), (1L, 1L)]);
        Assert.Equal([new Share<long>(2, large), new Share<long>(1, small)], shares);
    }

    [Fact]
    public void Settlement_rejects_empty_investors()
    {
        var error = Assert.Throws<ArgumentException>(() =>
            SettlementCalculator.Calculate(new(10, 0, 7, 5, [])));
        Assert.Equal("input", error.ParamName);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Settlement_rejects_one_invalid_capital_among_valid_investors(long capital)
    {
        var error = Assert.Throws<ArgumentException>(() =>
            SettlementCalculator.Calculate(new(10, 0, 7, 5, [(1, 10), (2, capital)])));
        Assert.Equal("input", error.ParamName);
    }

    [Fact]
    public void Settlement_rejects_duplicate_investor_ids()
    {
        var error = Assert.Throws<ArgumentException>(() =>
            SettlementCalculator.Calculate(new(10, 0, 7, 5, [(1, 10), (1, 20)])));
        Assert.Equal("input", error.ParamName);
    }

    [Theory]
    [InlineData(-1, 5)]
    [InlineData(101, 5)]
    [InlineData(7, -1)]
    [InlineData(7, 101)]
    public void Settlement_rejects_each_percentage_outside_zero_to_one_hundred(int operatorPct, int taxPct)
    {
        var error = Assert.Throws<ArgumentOutOfRangeException>(() =>
            SettlementCalculator.Calculate(new(10, 0, operatorPct, taxPct, [(1, 10)])));
        Assert.Equal("input", error.ParamName);
    }

    [Theory]
    [InlineData(0, 0, 0, 100, 0, 110)]
    [InlineData(100, 0, 100, 0, 0, 10)]
    [InlineData(0, 100, 0, 100, 100, 10)]
    [InlineData(100, 100, 100, 0, 0, 10)]
    public void Settlement_accepts_percentage_endpoints_and_returns_exact_amounts(
        int operatorPct, int taxPct, long remuneration, long profit, long tax, long payout)
    {
        var result = SettlementCalculator.Calculate(new(110, 10, operatorPct, taxPct, [(42, 10)]));
        Assert.Equal(100, result.RevenuePool);
        Assert.Equal(remuneration, result.OperatorRemuneration);
        Assert.Equal(profit, result.Distributable);
        Assert.Equal(0, result.UncoveredLoss);
        Assert.Equal(tax, result.TaxTotal);
        Assert.Equal(new SettlementLineResult(42, 10, profit, tax, payout), Assert.Single(result.Lines));
    }

    [Fact]
    public void Zero_pool_returns_capital_without_remuneration_or_tax()
    {
        var result = SettlementCalculator.Calculate(new(10, 10, 7, 5, [(2, 3), (1, 1)]));
        Assert.Equal(0, result.RevenuePool);
        Assert.Equal(0, result.OperatorRemuneration);
        Assert.Equal(0, result.Distributable);
        Assert.Equal(0, result.UncoveredLoss);
        Assert.Equal(0, result.TaxTotal);
        Assert.Equal([new SettlementLineResult(2, 3, 0, 0, 3), new SettlementLineResult(1, 1, 0, 0, 1)], result.Lines);
    }

    [Fact]
    public void Loss_above_largest_capital_but_below_total_does_not_wipe_out_every_investor()
    {
        var result = SettlementCalculator.Calculate(new(0, 60, 7, 5, [(1, 50), (2, 50)]));
        Assert.Equal(-60, result.Distributable);
        Assert.Equal(0, result.UncoveredLoss);
        Assert.Equal(0, result.OperatorRemuneration);
        Assert.Equal(0, result.TaxTotal);
        Assert.Equal([new SettlementLineResult(1, 50, -30, 0, 20), new SettlementLineResult(2, 50, -30, 0, 20)], result.Lines);
    }

    [Fact]
    public void Rounding_to_small_investors_capital_does_not_create_additional_loss()
    {
        var result = SettlementCalculator.Calculate(new(0, 101, 7, 5, [(1, 1), (2, 1), (3, 100)]));
        Assert.Equal(-101, result.Distributable);
        Assert.Equal(0, result.UncoveredLoss);
        Assert.Equal([new SettlementLineResult(1, 1, -1, 0, 0), new SettlementLineResult(2, 1, -1, 0, 0), new SettlementLineResult(3, 100, -99, 0, 1)], result.Lines);
    }

    [Fact]
    public void Loss_equal_to_total_capital_leaves_no_uncovered_loss()
    {
        var result = SettlementCalculator.Calculate(new(0, 100, 7, 5, [(1, 30), (2, 70)]));
        Assert.Equal(0, result.UncoveredLoss);
        Assert.Equal([new SettlementLineResult(1, 30, -30, 0, 0), new SettlementLineResult(2, 70, -70, 0, 0)], result.Lines);
    }

    [Theory]
    [InlineData(30_000_000_000, 0)]
    [InlineData(100_000_000_000, 70_000_000_000)]
    public void Large_loss_at_or_above_total_capital_uses_the_cap_without_proportional_multiplication(long cost, long uncovered)
    {
        var result = SettlementCalculator.Calculate(new(0, cost, 7, 5, [(1, 10_000_000_000), (2, 20_000_000_000)]));
        Assert.Equal(-cost, result.Distributable);
        Assert.Equal(uncovered, result.UncoveredLoss);
        Assert.Equal([
            new SettlementLineResult(1, 10_000_000_000, -10_000_000_000, 0, 0),
            new SettlementLineResult(2, 20_000_000_000, -20_000_000_000, 0, 0)
        ], result.Lines);
    }
}
