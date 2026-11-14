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
        model.Entity<GradingStandard>().ToTable("grading_standard");
        model.Entity<GradeRuleSet>().ToTable("grade_rule_set");
        // grade_rule và measurement_value có trigger: không dùng OUTPUT khi ghi.
        model.Entity<GradeRule>().ToTable("grade_rule", t => t.UseSqlOutputClause(false));
        model.Entity<GradeRuleSet>().HasMany(s => s.Rules).WithOne().HasForeignKey(r => r.RuleSetId);
        model.Entity<AiInference>().ToTable("ai_inference");
        model.Entity<MeasurementValue>().ToTable("measurement_value", t => t.UseSqlOutputClause(false));
        model.Entity<GradeDecision>().ToTable("grade_decision");
    }
}
