using CrabShare.Api.Features.Catalog;

namespace CrabShare.Api.Tests;

/// <summary>Ngưỡng và cách tính theo TL-27 §6.4: median, MAD, modified Z-score 3,5; đường lui 20% khi MAD = 0.</summary>
public class PriceAnomalyTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 14, 10, 0, 0, TimeSpan.FromHours(7));

    private static List<PriceAnomaly.Sample> Samples(int count, int operators, Func<int, long> price, int daysAgo = 5) =>
        Enumerable.Range(0, count).Select(i => new PriceAnomaly.Sample(price(i), i % operators + 1, Now.AddDays(-daysAgo))).ToList();

    [Fact]
    public void Duoi_20_giao_dich_thi_chua_du_du_lieu_va_khong_gan_co()
    {
        var result = PriceAnomaly.Evaluate(10_000, Samples(19, 5, _ => 400_000), Now);

        Assert.False(result.HasEnoughData);
        Assert.False(result.IsFlagged);
        Assert.Equal("None", result.Method);
        Assert.Equal(PriceAnomaly.LongWindowDays, result.WindowDays);
    }

    [Fact]
    public void Du_20_giao_dich_nhung_duoi_3_nguoi_nuoi_thi_chua_du_du_lieu()
    {
        var result = PriceAnomaly.Evaluate(10_000, Samples(30, 2, _ => 400_000), Now);

        Assert.False(result.HasEnoughData);
        Assert.False(result.IsFlagged);
        Assert.Equal(2, result.OperatorCount);
    }

    [Fact]
    public void Thieu_mau_trong_30_ngay_thi_mo_rong_toi_90_ngay()
    {
        var samples = Samples(10, 3, _ => 400_000, daysAgo: 10);
        samples.AddRange(Samples(15, 3, _ => 400_000, daysAgo: 60));
        samples.AddRange(Samples(5, 3, _ => 400_000, daysAgo: 120));

        var result = PriceAnomaly.Evaluate(400_000, samples, Now);

        Assert.True(result.HasEnoughData);
        Assert.Equal(PriceAnomaly.LongWindowDays, result.WindowDays);
        Assert.Equal(25, result.SampleCount);
    }

    [Fact]
    public void Gia_lech_xa_median_vuot_nguong_modified_z_thi_gan_co()
    {
        // giá 380.000–420.000, median 400.000
        var samples = Samples(21, 4, i => 380_000 + i * 2_000);

        var normal = PriceAnomaly.Evaluate(405_000, samples, Now);
        var dumping = PriceAnomaly.Evaluate(150_000, samples, Now);

        Assert.Equal("ModifiedZ", normal.Method);
        Assert.Equal(400_000m, normal.Median);
        Assert.False(normal.IsFlagged);
        Assert.True(dumping.IsFlagged);
        Assert.True(dumping.Score < -PriceAnomaly.ModifiedZThreshold);
    }

    [Fact]
    public void Mad_bang_0_thi_dung_nguong_20_phan_tram()
    {
        var samples = Samples(20, 3, _ => 400_000);

        var within = PriceAnomaly.Evaluate(470_000, samples, Now);
        var beyond = PriceAnomaly.Evaluate(490_000, samples, Now);

        Assert.Equal("PercentFromMedian", within.Method);
        Assert.Equal(0m, within.Mad);
        Assert.False(within.IsFlagged);
        Assert.True(beyond.IsFlagged);
    }

    [Fact]
    public void Giao_dich_trong_tuong_lai_khong_duoc_tinh()
    {
        var samples = Samples(20, 3, _ => 400_000);
        samples.Add(new PriceAnomaly.Sample(1, 9, Now.AddDays(1)));

        var result = PriceAnomaly.Evaluate(400_000, samples, Now);

        Assert.Equal(20, result.SampleCount);
    }
}
