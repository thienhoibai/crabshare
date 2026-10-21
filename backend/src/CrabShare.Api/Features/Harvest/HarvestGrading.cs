using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Harvest;

public static class HarvestGrading
{
    public static ProductGrade Select(IReadOnlyCollection<ProductGrade> grades, int weightG, string shellCondition)
    {
        if (weightG is < 1 or > short.MaxValue || shellCondition is not ("HardShell" or "SoftShell"))
            throw new BusinessRuleException("harvest.invalid_weight", "Cân nặng hoặc xác nhận vỏ không hợp lệ.");
        if (shellCondition == "SoftShell")
        {
            var soft = grades.SingleOrDefault(g => g.GradeCode == "SOFT") ?? throw Invalid();
            if (soft.MinWeightG is { } min && soft.MaxWeightG is { } max && min > max) throw Invalid();
            return Matches(soft, weightG) ? soft : throw Missing();
        }
        var hard = grades.Where(g => g.GradeCode is "L1" or "L2" or "L3" or "L4")
            .OrderBy(g => g.MinWeightG ?? 1).ToArray();
        if (hard.Length != 4 || hard.Select(g => g.GradeCode).Distinct().Count() != 4) throw Invalid();
        var next = 1;
        foreach (var grade in hard)
        {
            var min = Math.Max(1, (int?)grade.MinWeightG ?? 1);
            var max = (int?)grade.MaxWeightG ?? short.MaxValue;
            if (min != next || max < min || max > short.MaxValue) throw Invalid();
            next = max + 1;
        }
        if (next != short.MaxValue + 1) throw Invalid();
        return hard.SingleOrDefault(g => Matches(g, weightG)) ?? throw Missing();
    }
    private static bool Matches(ProductGrade g, int weight) => (g.MinWeightG is null || weight >= g.MinWeightG)
        && (g.MaxWeightG is null || weight <= g.MaxWeightG);
    private static BusinessRuleException Invalid() => new("harvest.invalid_grade_configuration", "Cấu hình hạng cua thiếu, chồng lấn hoặc có khoảng trống. Cần kiểm tra product_grade.");
    private static BusinessRuleException Missing() => new("harvest.grade_not_found", "Không có hạng phù hợp với sản phẩm và cân nặng này.");
}
