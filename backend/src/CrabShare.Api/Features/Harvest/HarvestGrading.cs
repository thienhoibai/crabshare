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
            return SelectSoftShellGrade(grades, weightG);
        }

        var hardShellGrades = grades
            .Where(grade => grade.GradeCode is "L1" or "L2" or "L3" or "L4")
            .OrderBy(grade => grade.MinWeightG ?? 1)
            .ToArray();

        EnsureHardShellGradesCoverAllWeights(hardShellGrades);
        return hardShellGrades.SingleOrDefault(grade => Matches(grade, weightG)) ?? throw Missing();
    }

    private static ProductGrade SelectSoftShellGrade(IEnumerable<ProductGrade> grades, int weightG)
    {
        var softShellGrade = grades.SingleOrDefault(grade => grade.GradeCode == "SOFT") ?? throw Invalid();
        if (softShellGrade.MinWeightG is { } min && softShellGrade.MaxWeightG is { } max && min > max)
        {
            throw Invalid();
        }

        return Matches(softShellGrade, weightG) ? softShellGrade : throw Missing();
    }

    private static void EnsureHardShellGradesCoverAllWeights(IReadOnlyCollection<ProductGrade> grades)
    {
        if (grades.Count != 4 || grades.Select(grade => grade.GradeCode).Distinct().Count() != 4)
        {
            throw Invalid();
        }

        // Mỗi khoảng bắt đầu ngay sau khoảng trước: không bỏ sót gram nào và không chồng hạng.
        var nextWeightG = 1;
        foreach (var grade in grades)
        {
            var min = Math.Max(1, (int?)grade.MinWeightG ?? 1);
            var max = (int?)grade.MaxWeightG ?? short.MaxValue;
            if (min != nextWeightG || max < min || max > short.MaxValue)
            {
                throw Invalid();
            }

            nextWeightG = max + 1;
        }

        if (nextWeightG != short.MaxValue + 1)
        {
            throw Invalid();
        }
    }
    private static bool Matches(ProductGrade g, int weight) => (g.MinWeightG is null || weight >= g.MinWeightG)
        && (g.MaxWeightG is null || weight <= g.MaxWeightG);
    private static BusinessRuleException Invalid() => new("harvest.invalid_grade_configuration", "Cấu hình hạng cua thiếu, chồng lấn hoặc có khoảng trống. Cần kiểm tra product_grade.");
    private static BusinessRuleException Missing() => new("harvest.grade_not_found", "Không có hạng phù hợp với sản phẩm và cân nặng này.");
}
