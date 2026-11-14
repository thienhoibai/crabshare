using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<SalesOrderLine> SalesOrderLines => Set<SalesOrderLine>();
    public DbSet<DeliveryTranche> DeliveryTranches => Set<DeliveryTranche>();
    public DbSet<DeliveryTrancheLine> DeliveryTrancheLines => Set<DeliveryTrancheLine>();

    private static void ConfigureSales(ModelBuilder model)
    {
        model.Entity<SalesOrderLine>().ToTable("sales_order_line").HasOne(l => l.Spec).WithMany().HasForeignKey(l => l.SpecId);
        model.Entity<DeliveryTranche>().ToTable("delivery_tranche").HasMany(t => t.Lines).WithOne().HasForeignKey(l => l.TrancheId);
        model.Entity<DeliveryTrancheLine>().ToTable("delivery_tranche_line").HasKey(l => new { l.TrancheId, l.LineId });
    }
}
