namespace CrabShare.Api.Features.Catalog;

/// <summary>
/// So giá mới với giá thực bán của các giao dịch tương đồng đã hoàn tất (TL-27 §6.4).
/// Chỉ gắn cờ để người xem chú ý; không chặn, không sửa giá.
/// </summary>
public static class PriceAnomaly
{
    public const string AlgorithmVersion = "mad-v1";
    public const int MinSamples = 20;
    public const int MinOperators = 3;
    public const short ShortWindowDays = 30;
    public const short LongWindowDays = 90;
    public const decimal ModifiedZThreshold = 3.5m;
    public const decimal PercentThreshold = 0.20m;

    public sealed record Sample(long PricePerKg, long OperatorId, DateTimeOffset At);

    public sealed record Result(
        short WindowDays,
        int SampleCount,
        int OperatorCount,
        bool HasEnoughData,
        decimal? Median,
        decimal? Mad,
        string Method,
        decimal? Score,
        decimal? Threshold,
        bool IsFlagged);

    public static Result Evaluate(long pricePerKg, IReadOnlyCollection<Sample> samples, DateTimeOffset now)
    {
        var window = ShortWindowDays;
        var inWindow = Within(samples, now, window);
        if (inWindow.Count < MinSamples)
        {
            window = LongWindowDays;
            inWindow = Within(samples, now, window);
        }

        var operators = inWindow.Select(s => s.OperatorId).Distinct().Count();
        if (inWindow.Count < MinSamples || operators < MinOperators)
            return new Result(window, inWindow.Count, operators, false, null, null, "None", null, null, false);

        var prices = inWindow.Select(s => (decimal)s.PricePerKg).ToList();
        var median = Median(prices);
        var mad = Median(prices.Select(p => Math.Abs(p - median)).ToList());

        if (mad > 0)
        {
            var z = Math.Round(0.6745m * (pricePerKg - median) / mad, 3);
            return new Result(window, inWindow.Count, operators, true, median, mad, "ModifiedZ", z, ModifiedZThreshold,
                Math.Abs(z) > ModifiedZThreshold);
        }

        var pct = Math.Round((pricePerKg - median) / median, 3);
        return new Result(window, inWindow.Count, operators, true, median, mad, "PercentFromMedian", pct, PercentThreshold,
            Math.Abs(pct) > PercentThreshold);
    }

    private static List<Sample> Within(IEnumerable<Sample> samples, DateTimeOffset now, short days) =>
        samples.Where(s => s.At > now.AddDays(-days) && s.At <= now).ToList();

    internal static decimal Median(List<decimal> values)
    {
        values.Sort();
        var mid = values.Count / 2;
        return values.Count % 2 == 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }
}
