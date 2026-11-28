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
        // payment_record gộp yêu cầu thanh toán, lệnh chi, giao dịch, phân bổ giao dịch và đợt giải ngân (V047). Bảng có trigger: không dùng OUTPUT.
        var paymentRecord = model.Entity<PaymentRecord>();
        paymentRecord.ToTable(t => t.UseSqlOutputClause(false));
        paymentRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        paymentRecord.HasDiscriminator<string>("record_type")
            .HasValue<PaymentRequest>("Request").HasValue<PaymentInstruction>("Instruction").HasValue<ProviderTransaction>("Transaction")
            .HasValue<PaymentApplication>("Application").HasValue<DisbursementTranche>("Disbursement");
        // cost_record gộp phiên bản chi phí chuẩn, khoản chi, lịch giải ngân dự kiến và chi phí thực tế (V046). Bảng có trigger: không dùng OUTPUT.
        var costRecord = model.Entity<CostRecord>();
        costRecord.ToTable(t => t.UseSqlOutputClause(false));
        costRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        costRecord.HasDiscriminator<string>("record_type")
            .HasValue<StandardCostVersion>("Version").HasValue<StandardCostItem>("Item").HasValue<StandardCostTranchePlan>("TranchePlan").HasValue<CostActual>("Actual");
        // batch_record gộp các bản ghi phụ của lô (V043). Phiên bản ngưỡng có trigger chặn sửa: không dùng OUTPUT khi ghi.
        var batchRecord = model.Entity<BatchRecord>();
        batchRecord.ToTable(t => t.UseSqlOutputClause(false));
        batchRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        batchRecord.HasDiscriminator<string>("record_type")
            .HasValue<BatchAccount>("Account").HasValue<BatchParticipant>("Participant").HasValue<RemunerationTier>("RemunerationTier")
            .HasValue<ProductionThresholdVersion>("ThresholdVersion").HasValue<HoldingOperation>("HoldingOperation")
            .HasValue<CollectiveDecision>("CollectiveDecision").HasValue<Vote>("Vote");
        // offer_record gộp quy cách sản phẩm và chào bán (V052).
        var offerRecord = model.Entity<OfferRecord>();
        offerRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        offerRecord.HasDiscriminator<string>("record_type").HasValue<ProductSpecification>("Specification").HasValue<Offer>("Offer");
        model.Entity<Offer>().HasOne(o => o.Spec).WithMany().HasForeignKey(o => o.SpecId);
        // Hai bảng có trigger: EF không được dùng OUTPUT khi chèn.
        model.Entity<StandardCostTranchePlan>(p =>
        {
            p.Property(x => x.MilestoneKind).HasColumnName("milestone_kind").HasMaxLength(20).IsUnicode(false);
            p.Property(x => x.MilestoneName).HasColumnName("milestone_name").HasMaxLength(100);
            p.Property(x => x.Pct).HasColumnName("pct").HasPrecision(5, 2);
        });
    }
}
