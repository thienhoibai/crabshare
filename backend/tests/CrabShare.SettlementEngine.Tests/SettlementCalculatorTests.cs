using CrabShare.SettlementEngine;
using FsCheck;
using FsCheck.Fluent;
using FsCheck.Xunit;

namespace CrabShare.SettlementEngine.Tests;

/// <summary>TH-12: bảng quyết toán (TL-12, TL-13, TL-15, TL-07) — ví dụ cụ thể và bất biến chạy với hàng trăm bộ số.</summary>
public class SettlementCalculatorTests
{
    private static SettlementInput Input(long revenue, long cost, decimal operatorPct = 7, decimal taxPct = 0, params (long, long)[] shares)
        => new(revenue, cost, operatorPct, taxPct, shares);

    [Fact]
    public void Pool_duong_tru_thu_lao_roi_chia_theo_von_khop_tung_dong()
    {
        // Doanh thu 150 tr, chi phí khoá 100 tr → Pool 50 tr; thù lao 7% = 3,5 tr; chia 46,5 tr theo vốn 30/50/20
        var r = SettlementCalculator.Calculate(Input(150_000_000, 100_000_000, 7, 0, (1, 30_000_000), (2, 50_000_000), (3, 20_000_000)));

        Assert.Equal(50_000_000, r.RevenuePool);
        Assert.Equal(3_500_000, r.OperatorRemuneration);
        Assert.Equal(46_500_000, r.Distributable);
        Assert.Equal([13_950_000L, 23_250_000L, 9_300_000L], r.Lines.Select(l => l.ProfitShare));
        Assert.Equal(r.Distributable, r.Lines.Sum(l => l.ProfitShare));
        Assert.Equal([43_950_000L, 73_250_000L, 29_300_000L], r.Lines.Select(l => l.NetPayout));
        Assert.Equal(0, r.UncoveredLoss);
    }

    [Fact]
    public void Thu_lao_lam_tron_xuong_va_phan_le_chia_bang_largest_remainder()
    {
        // Pool 1.000.001 đ, thù lao 7% = 70.000,07 → 70.000; còn 930.001 chia 3 người bằng nhau
        var r = SettlementCalculator.Calculate(Input(2_000_001, 1_000_000, 7, 0, (1, 1_000_000), (2, 1_000_000), (3, 1_000_000)));

        Assert.Equal(70_000, r.OperatorRemuneration);
        Assert.Equal(930_001, r.Lines.Sum(l => l.ProfitShare));
        Assert.Equal([310_001L, 310_000L, 310_000L], r.Lines.Select(l => l.ProfitShare));
    }

    [Fact]
    public void Pool_am_khong_co_thu_lao_lo_chia_theo_von()
    {
        // Doanh thu 70 tr, chi phí 100 tr → Pool −30 tr, chia lỗ theo vốn 60/40
        var r = SettlementCalculator.Calculate(Input(70_000_000, 100_000_000, 7, 5, (1, 60_000_000), (2, 40_000_000)));

        Assert.Equal(-30_000_000, r.RevenuePool);
        Assert.Equal(0, r.OperatorRemuneration);
        Assert.Equal([-18_000_000L, -12_000_000L], r.Lines.Select(l => l.ProfitShare));
        Assert.Equal([42_000_000L, 28_000_000L], r.Lines.Select(l => l.NetPayout));
        Assert.Equal(0, r.TaxTotal); // lỗ thì không có khoản khấu trừ
    }

    [Fact]
    public void Lo_vuot_tong_von_moi_nguoi_mat_het_von_phan_vuot_khong_chia_cho_nha_dau_tu()
    {
        // Doanh thu 0, chi phí 100 tr, vốn chỉ 80 tr → mỗi người mất đúng vốn của mình; 20 tr lỗ vượt không ai trong số nhà đầu tư chịu
        var r = SettlementCalculator.Calculate(Input(0, 100_000_000, 7, 0, (1, 50_000_000), (2, 30_000_000)));

        Assert.Equal([-50_000_000L, -30_000_000L], r.Lines.Select(l => l.ProfitShare));
        Assert.All(r.Lines, l => Assert.Equal(0, l.NetPayout));
        Assert.Equal(20_000_000, r.UncoveredLoss);
    }

    [Fact]
    public void Khau_tru_thue_tren_phan_chia_duong_lam_tron_xuong()
    {
        var r = SettlementCalculator.Calculate(Input(110_000_333, 100_000_000, 5, 5, (1, 1), (2, 2)));

        // Pool 10.000.333; thù lao 5% = 500.016; chia 9.500.317 theo 1:2 → 3.166.772 / 6.333.545; thuế 5% làm tròn xuống
        Assert.Equal([3_166_772L, 6_333_545L], r.Lines.Select(l => l.ProfitShare));
        Assert.Equal([158_338L, 316_677L], r.Lines.Select(l => l.TaxWithheld));
        Assert.Equal(r.Lines.Sum(l => l.TaxWithheld), r.TaxTotal);
        Assert.All(r.Lines, l => Assert.Equal(l.Capital + l.ProfitShare - l.TaxWithheld, l.NetPayout));
    }

    [Fact]
    public void Lo_100_nha_dau_tu_tinh_nhanh()
    {
        var shares = Enumerable.Range(1, 100).Select(i => ((long)i, (long)(1_000_000 + i * 37_000))).ToArray();
        var started = System.Diagnostics.Stopwatch.StartNew();
        var r = SettlementCalculator.Calculate(Input(123_456_789, 98_765_432, 7, 5, shares));
        Assert.True(started.Elapsed < TimeSpan.FromSeconds(1));
        Assert.Equal(r.Distributable, r.Lines.Sum(l => l.ProfitShare));
    }

    // Bất biến bảo toàn: tổng phần chia − lỗ vượt trần = đúng phần đem chia, với mọi doanh thu, chi phí, cơ cấu vốn
    [Property]
    public Property Tong_phan_chia_khop_tung_dong(NonNegativeInt revenueK, PositiveInt costK, NonEmptyArray<PositiveInt> capitalK)
    {
        var shares = capitalK.Get.Take(50).Select((c, i) => ((long)i + 1, (long)c.Get * 1_000)).ToArray();
        var r = SettlementCalculator.Calculate(Input((long)revenueK.Get * 1_000 + 7, (long)costK.Get * 1_000, 7, 5, shares));
        return (r.Lines.Sum(l => l.ProfitShare) - r.UncoveredLoss == r.Distributable).ToProperty();
    }

    // Trần lỗ: không ai mất quá vốn của mình, số nhận về không bao giờ âm
    [Property]
    public Property Khong_ai_lo_qua_von(NonNegativeInt revenueK, PositiveInt costK, NonEmptyArray<PositiveInt> capitalK)
    {
        var shares = capitalK.Get.Take(50).Select((c, i) => ((long)i + 1, (long)c.Get * 1_000)).ToArray();
        var r = SettlementCalculator.Calculate(Input((long)revenueK.Get * 1_000, (long)costK.Get * 1_000, 10, 5, shares));
        return r.Lines.All(l => l.Capital + l.ProfitShare >= 0 && l.NetPayout >= 0 && l.TaxWithheld >= 0).ToProperty();
    }

    // Thù lao chỉ có khi Pool dương và không bao giờ vượt Pool
    [Property]
    public Property Thu_lao_chi_tren_pool_duong(NonNegativeInt revenueK, PositiveInt costK)
    {
        var r = SettlementCalculator.Calculate(Input((long)revenueK.Get * 1_000, (long)costK.Get * 1_000, 10, 0, (1, 1_000_000)));
        return (r.RevenuePool > 0 ? r.OperatorRemuneration >= 0 && r.OperatorRemuneration <= r.RevenuePool : r.OperatorRemuneration == 0).ToProperty();
    }
}
