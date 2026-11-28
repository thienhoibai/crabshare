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
        model.Entity<SalesOrderLine>().HasOne(l => l.Spec).WithMany().HasForeignKey(l => l.SpecId);
    }
}
