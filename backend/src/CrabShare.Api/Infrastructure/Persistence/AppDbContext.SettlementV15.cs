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
        // settlement_record gộp bảng quyết toán, dòng chia và phản hồi (V051). Bảng có trigger khoá số liệu: không dùng OUTPUT.
        var settlementRecord = model.Entity<SettlementRecord>();
        settlementRecord.ToTable(t => t.UseSqlOutputClause(false));
        settlementRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        settlementRecord.HasDiscriminator<string>("record_type")
            .HasValue<Settlement>("Settlement").HasValue<SettlementLine>("Line").HasValue<SettlementFeedback>("Feedback");
    }
}
