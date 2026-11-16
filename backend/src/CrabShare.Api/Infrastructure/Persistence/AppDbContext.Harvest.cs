using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<HarvestStartRequestLog> HarvestStartRequests => Set<HarvestStartRequestLog>();
    public DbSet<HarvestRecord> HarvestRecords => Set<HarvestRecord>();

    private static void ConfigureHarvest(ModelBuilder model)
    {
        model.Entity<HarvestStartRequestLog>().ToTable("harvest_start_request", t => t.UseSqlOutputClause(false));
        model.Entity<HarvestRecord>().ToTable("harvest_record", t => t.UseSqlOutputClause(false));
        model.Entity<Harvest>().Property(h => h.RevisionNo).IsConcurrencyToken();
        model.Entity<Harvest>().HasIndex(h => h.BatchId).IsUnique()
            .HasFilter("[lifecycle_status] = 'Open'").HasDatabaseName("ux_harvest_open_batch");
    }
}
