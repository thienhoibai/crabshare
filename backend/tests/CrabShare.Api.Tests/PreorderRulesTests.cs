using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Orders;

namespace CrabShare.Api.Tests;

public class PreorderRulesTests
{
    [Theory]
    [InlineData(4_000_000, 15, 600_000)]
    [InlineData(1_000_000, 10, 100_000)]
    [InlineData(1_000_000, 20, 200_000)]
    [InlineData(3, 15, 0)]
    public void Coc_lam_tron_away_from_zero(long total, int pct, long expected)
        => Assert.Equal(expected, PreorderService.ComputeDeposit(total, pct));

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(0.0004)]
    public void Qty_khong_hop_le(double qty)
    {
        var ex = Assert.Throws<BusinessRuleException>(() => OrderService.NormalizeLines([(1, (decimal)qty)]));
        Assert.Equal("order.invalid_quantity", ex.Code);
    }
}
