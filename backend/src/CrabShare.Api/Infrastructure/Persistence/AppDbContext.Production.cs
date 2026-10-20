using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<ProductionThresholdVersion> ProductionThresholdVersions => Set<ProductionThresholdVersion>();

    private static void ConfigureProduction(ModelBuilder model)
    {
        model.Entity<ProductionThresholdVersion>(e =>
        {
            e.ToTable("production_threshold_version", t => t.UseSqlOutputClause(false));
            e.HasKey(v => v.ThresholdVersionId);
            e.HasAlternateKey(v => new { v.ThresholdVersionId, v.BatchId });
            e.HasIndex(v => new { v.BatchId, v.VersionNo }).IsUnique();
            e.Property(v => v.ThresholdVersionId).HasColumnName("threshold_version_id");
            e.Property(v => v.BatchId).HasColumnName("batch_id");
            e.Property(v => v.VersionNo).HasColumnName("version_no");
            e.Property(v => v.PhMin).HasColumnName("ph_min").HasPrecision(3, 1);
            e.Property(v => v.PhMax).HasColumnName("ph_max").HasPrecision(3, 1);
            e.Property(v => v.WaterTempMinC).HasColumnName("water_temp_min_c").HasPrecision(4, 1);
            e.Property(v => v.WaterTempMaxC).HasColumnName("water_temp_max_c").HasPrecision(4, 1);
            e.Property(v => v.SalinityMinPpt).HasColumnName("salinity_min_ppt").HasPrecision(4, 1);
            e.Property(v => v.SalinityMaxPpt).HasColumnName("salinity_max_ppt").HasPrecision(4, 1);
            e.Property(v => v.CreatedBy).HasColumnName("created_by");
            e.Property(v => v.CreatedAt).HasColumnName("created_at").HasPrecision(3);
            e.HasOne<Batch>().WithMany().HasForeignKey(v => v.BatchId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne<AppUser>().WithMany().HasForeignKey(v => v.CreatedBy).OnDelete(DeleteBehavior.NoAction);
        });
        model.Entity<ProductionLog>(e =>
        {
            e.Property(l => l.ThresholdVersionId).HasColumnName("threshold_version_id");
            e.HasOne(l => l.ThresholdVersion).WithMany()
                .HasForeignKey(l => new { l.ThresholdVersionId, l.BatchId })
                .HasPrincipalKey(v => new { v.ThresholdVersionId, v.BatchId }).OnDelete(DeleteBehavior.NoAction);
        });
    }
}
