using CrabShare.SettlementEngine;
using FsCheck;
using FsCheck.Fluent;
using FsCheck.Xunit;

namespace CrabShare.SettlementEngine.Tests;

/// <summary>
/// Ví dụ cách viết test cho quyết toán: một test thường (ví dụ cụ thể) và vài test thuộc tính (FsCheck sinh hàng trăm bộ số).
/// Phần nghiên cứu TSK-12 mở rộng thư mục này với đầy đủ bất biến và quan hệ metamorphic.
/// </summary>
public class LargestRemainderAllocatorTests
{
    [Fact]
    public void Chia_100_cho_3_nguoi_bang_nhau_tong_van_dung_100()
    {
        var shares = LargestRemainderAllocator.Allocate(100, [("A", 1L), ("B", 1L), ("C", 1L)]);

        Assert.Equal(100, shares.Sum(s => s.Amount));
        Assert.Equal([34L, 33L, 33L], shares.Select(s => s.Amount)); // hoà phần lẻ: mã nhỏ hơn (A) được trước
    }

    // Bất biến bảo toàn: tổng các phần luôn bằng số tiền đem chia, kể cả khi âm
    [Property]
    public Property Tong_cac_phan_bang_tong_dem_chia(long total, NonEmptyArray<PositiveInt> rawWeights)
    {
        var weights = rawWeights.Get.Select((w, i) => (i, (long)w.Get)).ToList();
        var shares = LargestRemainderAllocator.Allocate(total % 10_000_000_000, weights);
        return (shares.Sum(s => s.Amount) == total % 10_000_000_000).ToProperty();
    }

    // Không ai lệch quá 1 đồng so với phần chính xác theo tỷ lệ
    [Property]
    public Property Moi_phan_lech_khong_qua_1_dong(PositiveInt total, NonEmptyArray<PositiveInt> rawWeights)
    {
        var weights = rawWeights.Get.Select((w, i) => (i, (long)w.Get)).ToList();
        var sum = weights.Sum(w => (decimal)w.Item2);
        var shares = LargestRemainderAllocator.Allocate(total.Get, weights);
        return shares.Select((s, i) => Math.Abs(s.Amount - total.Get * weights[i].Item2 / sum) < 1m).All(x => x).ToProperty();
    }

    // Metamorphic: đổi thứ tự danh sách nhà đầu tư không làm đổi số tiền của từng người
    [Property]
    public Property Doi_thu_tu_nguoi_nhan_khong_doi_ket_qua(PositiveInt total, NonEmptyArray<PositiveInt> rawWeights)
    {
        var weights = rawWeights.Get.Select((w, i) => (i, (long)w.Get)).ToList();
        var a = LargestRemainderAllocator.Allocate(total.Get, weights).ToDictionary(s => s.Key, s => s.Amount);
        var b = LargestRemainderAllocator.Allocate(total.Get, weights.AsEnumerable().Reverse().ToList()).ToDictionary(s => s.Key, s => s.Amount);
        return a.All(kv => b[kv.Key] == kv.Value).ToProperty();
    }
}
