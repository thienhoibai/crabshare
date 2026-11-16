using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<SiteVisitReport> SiteVisitReports => Set<SiteVisitReport>();
    public DbSet<CollectiveDecision> CollectiveDecisions => Set<CollectiveDecision>();
    public DbSet<Vote> Votes => Set<Vote>();

    private static void ConfigureSettlementV15(ModelBuilder model)
    {
        model.Entity<SiteVisitReport>().ToTable("site_visit_report");
        model.Entity<CollectiveDecision>().ToTable("collective_decision");
        model.Entity<Vote>().ToTable("vote");
    }
}
