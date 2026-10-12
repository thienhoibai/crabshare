namespace CrabShare.SettlementEngine;

/// <summary>
/// Chia một số tiền nguyên (VND) theo tỷ lệ, tổng các phần luôn bằng đúng số tiền ban đầu (TL-13, BR-10).
/// Thuật toán largest remainder (Hamilton): làm tròn xuống từng phần, phần dư chia cho người có phần lẻ lớn nhất;
/// hoà nhau thì người góp vốn lớn hơn được trước, rồi đến mã (key) nhỏ hơn — cố định để kết quả lặp lại được.
/// Đây là phần lõi THUẦN của quyết toán: không đọc CSDL, không phụ thuộc thời gian, dễ kiểm thử bằng FsCheck (TSK-12).
/// </summary>
public static class LargestRemainderAllocator
{
    /// <param name="total">Tổng cần chia, đơn vị đồng. Có thể âm (Revenue Pool âm thì chia lỗ).</param>
    /// <param name="weights">Trọng số của từng người (thường là số vốn đã góp), phải dương.</param>
    /// <returns>Số tiền của từng người, cùng thứ tự với <paramref name="weights"/>.</returns>
    public static IReadOnlyList<Share<TKey>> Allocate<TKey>(long total, IReadOnlyList<(TKey Key, long Weight)> weights)
        where TKey : IComparable<TKey>
    {
        if (weights.Count == 0) throw new ArgumentException("Cần ít nhất một người nhận.", nameof(weights));
        if (weights.Any(w => w.Weight <= 0)) throw new ArgumentException("Trọng số phải dương.", nameof(weights));

        var sign = total < 0 ? -1 : 1;
        var abs = Math.Abs(total);
        var weightSum = weights.Sum(w => (decimal)w.Weight);

        var parts = weights.Select((w, i) =>
        {
            var exact = abs * w.Weight / weightSum;
            var floor = (long)decimal.Floor(exact);
            return (Index: i, w.Key, w.Weight, Floor: floor, Remainder: exact - floor);
        }).ToList();

        var leftover = abs - parts.Sum(p => p.Floor);
        var winners = parts
            .OrderByDescending(p => p.Remainder)
            .ThenByDescending(p => p.Weight)
            .ThenBy(p => p.Key)
            .Take((int)leftover)
            .Select(p => p.Index)
            .ToHashSet();

        return parts
            .Select(p => new Share<TKey>(p.Key, sign * (p.Floor + (winners.Contains(p.Index) ? 1 : 0))))
            .ToList();
    }
}

public sealed record Share<TKey>(TKey Key, long Amount);
