using CrabShare.Api.Features.Catalog;
using Snapshot = CrabShare.Api.Features.Catalog.LowStockMonitor.Snapshot;

namespace CrabShare.Api.Tests;

/// <summary>NH-04 — quyết định "sắp hết hàng" và nội dung cảnh báo, không cần CSDL.</summary>
public class LowStockMonitorTests
{
    private static Snapshot Listing(string status = "Published", bool hidden = false, decimal stock = 10, decimal reserved = 0,
        string title = "Cua thịt L1") => new(1, 1, title, status, hidden, stock, reserved);

    [Theory]
    [InlineData(10, 0, false)]
    [InlineData(5, 0, false)]
    [InlineData(4.999, 0, true)]
    [InlineData(10, 6, true)]
    [InlineData(3, 3, true)]
    public void Ton_kha_dung_duoi_nguong_la_sap_het(decimal stock, decimal reserved, bool expected)
        => Assert.Equal(expected, LowStockMonitor.IsLow(Listing(stock: stock, reserved: reserved), thresholdKg: 5));

    [Theory]
    [InlineData("Draft")]
    [InlineData("SoldOut")]
    [InlineData("Closed")]
    public void Chi_niem_yet_dang_ban_moi_bao(string status)
        => Assert.False(LowStockMonitor.IsLow(Listing(status, stock: 1), thresholdKg: 5));

    [Fact]
    public void Niem_yet_bi_an_khong_bao()
        => Assert.False(LowStockMonitor.IsLow(Listing(hidden: true, stock: 1), thresholdKg: 5));

    [Fact]
    public void Noi_dung_liet_ke_moi_niem_yet_thap_cua_lo()
    {
        var message = LowStockMonitor.Message([Listing(title: "Cua L1", stock: 3, reserved: 1), Listing(title: "Cua L2", stock: 1)], 5);

        Assert.Equal("Sắp hết hàng (dưới 5 kg): \"Cua L1\" còn 2 kg; \"Cua L2\" còn 1 kg.", message);
    }

    [Fact]
    public void Noi_dung_cat_con_300_ky_tu()
    {
        var many = Enumerable.Range(1, 20).Select(i => Listing(title: $"Niêm yết có tiêu đề rất dài số {i}", stock: 1)).ToList();

        var message = LowStockMonitor.Message(many, 5);

        Assert.Equal(300, message.Length);
        Assert.EndsWith("…", message);
    }
}
