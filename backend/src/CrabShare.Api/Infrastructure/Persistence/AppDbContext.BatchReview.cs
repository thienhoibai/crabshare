using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<StandardCostTranchePlan> StandardCostTranchePlans => Set<StandardCostTranchePlan>();
    private static void ConfigureBatchReview(ModelBuilder model)
    {
        model.Entity<Batch>().Property(b => b.RejectionReason).HasColumnName("rejection_reason").HasMaxLength(300);
        model.Entity<DisbursementTranche>().Property(t=>t.AnchorCode).HasColumnName("anchor_code").HasMaxLength(20).IsUnicode(false);
        model.Entity<DisbursementTranche>().Property(t=>t.OffsetDays).HasColumnName("offset_days");
        model.Entity<StandardCostTranchePlan>(p =>
        {
            p.Property(x => x.CostVersionId).HasColumnName("cost_version_id");
            p.Property(x => x.TrancheNo).HasColumnName("tranche_no");
            p.Property(x => x.PlannedDate).HasColumnName("planned_date");
            p.Property(x=>x.AnchorCode).HasColumnName("anchor_code").HasMaxLength(20).IsUnicode(false);
            p.Property(x=>x.OffsetDays).HasColumnName("offset_days");
            p.Property(x => x.UnlockCondition).HasColumnName("unlock_condition").HasMaxLength(300);
            p.HasOne(x => x.CostVersion).WithMany(v => v.TranchePlans).HasForeignKey(x => x.CostVersionId).OnDelete(DeleteBehavior.NoAction);
        });
    }
}
