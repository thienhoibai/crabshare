using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Grading;

public static class GradeLabels
{
    public const string Out = "OUT";
    public const string Special = "SPECIAL";
    public const string Grade1 = "G1";
    public const string Below = "BELOW";

    public static int SizeRank(string? size) => size switch { "M" => 1, "L" => 2, "XL" => 3, _ => 0 };
    public static int GradeRank(string? grade) => grade switch { Special => 2, Grade1 => 1, _ => 0 };
    public static bool IsSize(string? s) => s is "M" or "L" or "XL" or Out;
    public static bool IsGrade(string? g) => g is Special or Grade1 or Below;

    /// <summary>BR-158: ngoài quy cách hoặc mức C dưới ngưỡng là dưới chuẩn.</summary>
    public static bool IsSubstandard(string size, string grade) => size == Out || grade == Below;

    /// <summary>Mã quy cách hàng (V019): FAT/ROE/YFC/OIL-size-hạng; ngoài quy cách chỉ có một quy cách OUT-G1.</summary>
    public static string? SpecCode(string crabType, string size, string grade)
    {
        var abbr = crabType switch
        {
            "FatteningMudCrab" => "FAT", "RoeCrab" => "ROE", "YoungFemaleCrab" => "YFC", "OilRoeCrab" => "OIL", _ => null,
        };
        if (abbr is null || grade == Below) return null;
        return size == Out ? $"{abbr}-OUT-G1" : $"{abbr}-{size}-{grade}";
    }
}

public static class HoldReasons
{
    public const string NearThreshold = "NearThreshold";
    public const string ImageQuality = "ImageQuality";
    public const string LowConfidence = "LowConfidence";
    public const string CaliperRequired = "CaliperRequired";
    public const string SensoryPending = "SensoryPending";
    public const string QcHold = "QcHold";

    public static IReadOnlyList<string> Parse(string? value)
        => string.IsNullOrWhiteSpace(value) ? [] : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public static string? Join(IEnumerable<string> reasons)
    {
        var list = reasons.Distinct().ToList();
        return list.Count == 0 ? null : string.Join(',', list);
    }
}

/// <summary>Số đo đưa vào đề xuất. Chiều dài mai chỉ dùng khi đo bằng thước kẹp hoặc AI đủ tin cậy (BR-153, BR-226).</summary>
public sealed record GradeInput(decimal WeightG, decimal? CarapaceLengthCm, decimal? EdgeBandMm, decimal? AiConfidence, string? ImageQuality,
    bool CarapaceFromCaliper, decimal ConfidenceThreshold);

public sealed record GradeProposal(string Size, decimal? CIndex, string? CLevel, string? Sensory, string? Grade, IReadOnlyList<string> HoldReasons)
{
    public string Status => HoldReasons.Count == 0 ? "Draft" : "Hold";
}

/// <summary>
/// Đề xuất phân hạng từ số đo theo bộ quy tắc của Lô (BR-038, BR-153, BR-155, BR-227). Hệ thống chỉ đề xuất;
/// Nhân viên kiểm phẩm kiểm cảm quan rồi mới duyệt. C = khối lượng (g) ÷ CL (cm)³ là chỉ số hình thái, không phải tỷ lệ thịt.
/// </summary>
public static class GradeEngine
{
    public static bool UsesCIndex(IEnumerable<GradeRule> rules) => rules.Any(r => r.RuleKind == "PhysicalFactor" && r.Metric == "CIndex");

    public static decimal CIndex(decimal weightG, decimal carapaceLengthCm)
        => decimal.Round(weightG / (carapaceLengthCm * carapaceLengthCm * carapaceLengthCm), 4, MidpointRounding.AwayFromZero);

    public static GradeProposal Propose(IReadOnlyCollection<GradeRule> rules, decimal nearThresholdPct, GradeInput input)
    {
        var holds = new List<string>();
        var sizeRules = rules.Where(r => r.RuleKind == "Size" && r.Metric == "WeightG").ToList();
        var size = Classify(sizeRules, input.WeightG) ?? GradeLabels.Out; // BR-158: nhỏ hơn M là ngoài quy cách
        if (IsNear(sizeRules, input.WeightG, nearThresholdPct)) holds.Add(HoldReasons.NearThreshold);

        // Ảnh lỗi hoặc AI không chắc thì bắt buộc đo thước kẹp (BR-226), trừ khi đã có số thước kẹp.
        var aiUntrusted = !input.CarapaceFromCaliper &&
                          (input.ImageQuality is "Poor" or "Unusable" || input.AiConfidence is { } conf && conf < input.ConfidenceThreshold);
        if (!input.CarapaceFromCaliper && input.ImageQuality is "Poor" or "Unusable") holds.Add(HoldReasons.ImageQuality);
        if (!input.CarapaceFromCaliper && input.AiConfidence is { } c && c < input.ConfidenceThreshold) holds.Add(HoldReasons.LowConfidence);

        decimal? cIndex = null;
        string? cLevel = null;
        if (UsesCIndex(rules))
        {
            var length = aiUntrusted ? null : input.CarapaceLengthCm;
            if (length is { } cl and > 0)
            {
                cIndex = CIndex(input.WeightG, cl);
                var cRules = rules.Where(r => r.RuleKind == "PhysicalFactor" && r.Metric == "CIndex").ToList();
                cLevel = Classify(cRules, cIndex.Value) ?? GradeLabels.Below;
                if (IsNear(cRules, cIndex.Value, nearThresholdPct)) holds.Add(HoldReasons.NearThreshold);
            }
            else holds.Add(HoldReasons.CaliperRequired);
        }

        string? sensory = null;
        var sensoryRules = rules.Where(r => r.RuleKind == "Sensory" && r.Metric == "EdgeBandMm").ToList();
        if (sensoryRules.Count > 0 && input.EdgeBandMm is { } band && !(aiUntrusted && input.ImageQuality is "Unusable"))
        {
            sensory = Classify(sensoryRules, band);
            if (IsNear(sensoryRules, band, nearThresholdPct)) holds.Add(HoldReasons.NearThreshold);
        }

        var levels = new[] { cLevel, sensory }.Where(l => l is not null).ToList();
        var grade = levels.Count == 0 ? null : levels.MinBy(GradeLabels.GradeRank);
        if (grade is null && !holds.Contains(HoldReasons.CaliperRequired)) holds.Add(HoldReasons.SensoryPending);
        if (UsesCIndex(rules) && cLevel is null) grade = null;
        return new GradeProposal(size, cIndex, cLevel, sensory, grade, holds.Distinct().ToList());
    }

    /// <summary>Nhãn của quy tắc chứa giá trị; null nếu không quy tắc nào chứa.</summary>
    public static string? Classify(IEnumerable<GradeRule> rules, decimal value)
        => rules.OrderBy(r => r.SortOrder).FirstOrDefault(r => Matches(r, value))?.ResultLabel;

    public static bool Matches(GradeRule rule, decimal x)
    {
        var lowerIncl = rule.Boundary is "LowerInclusive" or "BothInclusive";
        var upperIncl = rule.Boundary is "UpperInclusive" or "BothInclusive";
        var aboveLower = rule.LowerBound is not { } lo || x > lo || (lowerIncl && x == lo);
        var belowUpper = rule.UpperBound is not { } hi || x < hi || (upperIncl && x == hi);
        return aboveLower && belowUpper;
    }

    /// <summary>Số đo cách một ngưỡng không quá near% của ngưỡng đó thì vào Hold (BR-155: cận ngưỡng).</summary>
    public static bool IsNear(IEnumerable<GradeRule> rules, decimal x, decimal nearPct)
    {
        if (nearPct <= 0) return false;
        foreach (var r in rules)
            foreach (var bound in new[] { r.LowerBound, r.UpperBound })
                if (bound is { } b && b > 0 && Math.Abs(x - b) <= b * nearPct / 100m)
                    return true;
        return false;
    }
}
