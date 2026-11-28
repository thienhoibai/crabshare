using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<GradingStandard> GradingStandards => Set<GradingStandard>();
    public DbSet<GradeRuleSet> GradeRuleSets => Set<GradeRuleSet>();
    public DbSet<GradeRule> GradeRules => Set<GradeRule>();
    public DbSet<AiInference> AiInferences => Set<AiInference>();
    public DbSet<MeasurementValue> MeasurementValues => Set<MeasurementValue>();
    public DbSet<GradeDecision> GradeDecisions => Set<GradeDecision>();

    private static void ConfigureGrading(ModelBuilder model)
    {
        // grading_rule gộp chuẩn, bộ quy tắc và từng quy tắc (V038). Bảng có trigger nên không dùng OUTPUT khi ghi.
        var rule = model.Entity<GradingRuleRecord>();
        rule.ToTable(t => t.UseSqlOutputClause(false));
        rule.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        rule.HasDiscriminator<string>("record_type")
            .HasValue<GradingStandard>("Standard").HasValue<GradeRuleSet>("RuleSet").HasValue<GradeRule>("Rule");
        model.Entity<GradeRuleSet>().HasMany(s => s.Rules).WithOne().HasForeignKey(r => r.RuleSetId);
        // measurement_record gộp lượt đo, kết quả AI và số đo (V037). Số đo có trigger chỉ ghi thêm.
        var measurement = model.Entity<MeasurementRecord>();
        measurement.ToTable(t => t.UseSqlOutputClause(false));
        measurement.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        measurement.HasDiscriminator<string>("record_type")
            .HasValue<MeasurementSession>("Session").HasValue<AiInference>("AiInference").HasValue<MeasurementValue>("Value");
        model.Entity<GradeDecision>().ToTable("grade_decision");
    }
}
