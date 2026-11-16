using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public virtual DbSet<BatchOfftakePrice> BatchOfftakePrices { get; set; } = null!;

    private static void ConfigureBatchOfftakePrice(ModelBuilder model)
    {
        var entity = model.Entity<BatchOfftakePrice>();
        entity.ToTable("batch_offtake_price", tb =>
            tb.HasComment("Giá chốt bao tiêu (đồng/kg) theo hạng, công khai trên lô"));
        entity.HasKey(e => new { e.BatchId, e.GradeId }).HasName("pk_batch_offtake_price");
        entity.HasIndex(e => e.GradeId, "ix_batch_offtake_price_grade_id");
        entity.Property(e => e.BatchId).HasColumnName("batch_id");
        entity.Property(e => e.GradeId).HasColumnName("grade_id");
        entity.Property(e => e.UnitPrice)
            .HasPrecision(18, 0)
            .HasColumnName("unit_price");
        entity.Property(e => e.CreatedAt)
            .HasPrecision(3)
            .HasDefaultValueSql("(sysdatetimeoffset())", "df_batch_offtake_price_created_at")
            .HasColumnName("created_at");
        entity.Property(e => e.UpdatedAt)
            .HasPrecision(3)
            .HasDefaultValueSql("(sysdatetimeoffset())", "df_batch_offtake_price_updated_at")
            .HasColumnName("updated_at");
        entity.HasOne(d => d.Batch).WithMany(p => p.BatchOfftakePrices)
            .HasForeignKey(d => d.BatchId)
            .OnDelete(DeleteBehavior.ClientSetNull)
            .HasConstraintName("fk_batch_offtake_price_batch_id");
        entity.HasOne(d => d.Grade).WithMany()
            .HasForeignKey(d => d.GradeId)
            .OnDelete(DeleteBehavior.ClientSetNull)
            .HasConstraintName("fk_batch_offtake_price_grade_id");
    }
}
