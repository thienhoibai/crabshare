namespace CrabShare.SettlementEngine;

/// <summary>
/// Bảng quyết toán của một lô (TH-12), phần THUẦN: không đọc CSDL, không phụ thuộc thời gian (TL-12, TL-13, TL-15, TL-07).
/// 1. Revenue Pool = doanh thu thực thu − chi phí chuẩn đã khoá (TL-12 §6.1).
/// 2. Thù lao người nuôi = tỷ lệ × max(0, Pool), làm tròn xuống tới đồng (TL-15 §6); Pool ≤ 0 thì bằng 0.
/// 3. Phần chia cho nhà đầu tư = Pool − thù lao (Pool dương) hoặc chính Pool (âm), chia theo vốn đã chốt bằng
///    <see cref="LargestRemainderAllocator"/>: tổng các dòng khớp đúng tới 1 đồng.
/// 4. Pool âm: mỗi người lỗ tối đa bằng vốn đã góp (TL-13 §6.2); phần vượt trần của người đã chạm trần chia lại cho người chưa chạm,
///    lặp tới khi hết. Lỗ vượt tổng vốn của mọi nhà đầu tư là <see cref="SettlementResult.UncoveredLoss"/> — không nhà đầu tư nào chịu.
/// 5. Khoản khấu trừ thuế = tỷ lệ người nuôi khai × phần chia dương, làm tròn xuống (TL-07: nền tảng chỉ hiển thị, người nuôi khai thay).
/// </summary>
public static class SettlementCalculator
{
    public static SettlementResult Calculate(SettlementInput input)
    {
        if (input.Shares.Count == 0) throw new ArgumentException("Lô chưa có nhà đầu tư nào được chốt vốn.", nameof(input));
        if (input.Shares.Any(s => s.Capital <= 0)) throw new ArgumentException("Vốn đã chốt phải dương.", nameof(input));
        if (input.Shares.Select(s => s.InvestorId).Distinct().Count() != input.Shares.Count)
            throw new ArgumentException("Mỗi nhà đầu tư chỉ có một dòng vốn.", nameof(input));
        if (input.OperatorSharePct is < 0 or > 100 || input.TaxWithholdingPct is < 0 or > 100)
            throw new ArgumentOutOfRangeException(nameof(input), "Tỷ lệ phải trong khoảng 0–100%.");

        var pool = input.ActualRevenue - input.LockedStandardCost;
        var remuneration = pool > 0 ? (long)decimal.Floor(pool * input.OperatorSharePct / 100m) : 0;
        var distributable = pool > 0 ? pool - remuneration : pool;

        var weights = input.Shares.Select(s => (Key: s.InvestorId, Weight: s.Capital)).ToList();
        IReadOnlyDictionary<long, long> profit = distributable >= 0
            ? LargestRemainderAllocator.Allocate(distributable, weights).ToDictionary(s => s.Key, s => s.Amount)
            : AllocateLoss(-distributable, weights).ToDictionary(kv => kv.Key, kv => -kv.Value);
        var uncovered = distributable < 0 ? -distributable + profit.Values.Sum() : 0;

        var lines = input.Shares.Select(s =>
        {
            var share = profit[s.InvestorId];
            var tax = share > 0 ? (long)decimal.Floor(share * input.TaxWithholdingPct / 100m) : 0;
            return new SettlementLineResult(s.InvestorId, s.Capital, share, tax, s.Capital + share - tax);
        }).ToList();
        return new SettlementResult(pool, remuneration, distributable, uncovered, lines.Sum(l => l.TaxWithheld), lines);
    }

    /// <summary>
    /// Chia khoản lỗ <paramref name="loss"/> (số dương) theo vốn, mỗi người không quá vốn của mình (TL-13 §6.2, ca 3):
    /// largest-remainder trên phần lỗ còn lại, người chạm trần bị kẹp và rút khỏi vòng sau, phần vượt chia lại cho người còn dư địa.
    /// </summary>
    internal static Dictionary<long, long> AllocateLoss(long loss, IReadOnlyList<(long Key, long Weight)> capital)
    {
        var result = capital.ToDictionary(c => c.Key, _ => 0L);
        if (loss >= capital.Sum(c => c.Weight))
        {
            foreach (var c in capital) result[c.Key] = c.Weight;
            return result;
        }

        var active = capital.ToList();
        var remaining = loss;
        while (remaining > 0 && active.Count > 0)
        {
            var shares = LargestRemainderAllocator.Allocate(remaining, active);
            remaining = 0;
            var stillActive = new List<(long Key, long Weight)>();
            foreach (var (c, s) in active.Zip(shares))
            {
                var room = c.Weight - result[c.Key];
                if (s.Amount >= room)
                {
                    result[c.Key] = c.Weight;
                    remaining += s.Amount - room;
                }
                else
                {
                    result[c.Key] += s.Amount;
                    stillActive.Add(c);
                }
            }
            active = stillActive;
        }
        return result;
    }
}

/// <param name="ActualRevenue">Doanh thu thực thu, nguyên đồng, ≥ 0.</param>
/// <param name="LockedStandardCost">Tổng chi phí chuẩn đã khoá, nguyên đồng.</param>
/// <param name="OperatorSharePct">Tỷ lệ thù lao người nuôi trên Pool dương (5–10% theo lô).</param>
/// <param name="TaxWithholdingPct">Tỷ lệ khấu trừ thuế người nuôi khai thay; 0 = chưa khai.</param>
/// <param name="Shares">Vốn đã chốt của từng nhà đầu tư (capital_share).</param>
public sealed record SettlementInput(
    long ActualRevenue, long LockedStandardCost, decimal OperatorSharePct, decimal TaxWithholdingPct,
    IReadOnlyList<(long InvestorId, long Capital)> Shares);

/// <param name="ProfitShare">Phần chia (âm khi lỗ), trước thuế.</param>
/// <param name="NetPayout">Số nhà đầu tư nhận = vốn + phần chia − thuế; không bao giờ âm.</param>
public sealed record SettlementLineResult(long InvestorId, long Capital, long ProfitShare, long TaxWithheld, long NetPayout);

/// <param name="Distributable">Phần chia cho nhà đầu tư: Pool − thù lao (Pool dương) hoặc Pool (âm).</param>
/// <param name="UncoveredLoss">Phần lỗ vượt tổng vốn của mọi nhà đầu tư (chỉ khi Pool âm rất lớn); không chia cho nhà đầu tư.</param>
public sealed record SettlementResult(
    long RevenuePool, long OperatorRemuneration, long Distributable, long UncoveredLoss, long TaxTotal,
    IReadOnlyList<SettlementLineResult> Lines);
