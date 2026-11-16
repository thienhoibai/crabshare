using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<RemunerationTier> RemunerationTiers => Set<RemunerationTier>();
    public DbSet<ProductSpecification> ProductSpecifications => Set<ProductSpecification>();
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<CostActual> CostActuals => Set<CostActual>();
    public DbSet<PaymentApplication> PaymentApplications => Set<PaymentApplication>();

    private static void ConfigureBatchTerms(ModelBuilder model)
    {
        model.Entity<RemunerationTier>().ToTable("remuneration_tier").HasKey(t => new { t.BatchId, t.TierNo });
        model.Entity<ProductSpecification>().ToTable("product_specification");
        model.Entity<Offer>().ToTable("offer").HasOne(o => o.Spec).WithMany().HasForeignKey(o => o.SpecId);
        // Hai bảng có trigger: EF không được dùng OUTPUT khi chèn.
        model.Entity<CostActual>().ToTable("cost_actual", t => t.UseSqlOutputClause(false));
        model.Entity<PaymentApplication>().ToTable("payment_application", t => t.UseSqlOutputClause(false));
        model.Entity<StandardCostTranchePlan>(p =>
        {
            p.Property(x => x.MilestoneKind).HasColumnName("milestone_kind").HasMaxLength(20).IsUnicode(false);
            p.Property(x => x.MilestoneName).HasColumnName("milestone_name").HasMaxLength(100);
            p.Property(x => x.Pct).HasColumnName("pct").HasPrecision(5, 2);
        });
    }
}
