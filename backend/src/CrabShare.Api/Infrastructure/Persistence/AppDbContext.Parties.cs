using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<Party> Parties => Set<Party>();
    public DbSet<PartnerRole> PartnerRoles => Set<PartnerRole>();
    public DbSet<PartySite> PartySites => Set<PartySite>();
    public DbSet<RelatedParty> RelatedParties => Set<RelatedParty>();
    public DbSet<BatchParticipant> BatchParticipants => Set<BatchParticipant>();
    public DbSet<PlatformParameter> PlatformParameters => Set<PlatformParameter>();
    public DbSet<PartyDocument> PartyDocuments => Set<PartyDocument>();

    private static void ConfigureParties(ModelBuilder model)
    {
        model.Entity<Party>().ToTable("party");
        // evidence_record gộp ảnh bằng chứng, kết quả nhận diện, lượt duyệt và yêu cầu chụp (V049).
        var evidenceRecord = model.Entity<EvidenceRecord>();
        evidenceRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        evidenceRecord.HasDiscriminator<string>("record_type")
            .HasValue<Evidence>("Evidence").HasValue<EvidenceDetection>("Detection").HasValue<EvidenceReview>("Review").HasValue<CaptureRequest>("CaptureRequest");
        // contract_record gộp hợp đồng góp vốn, mẫu, chữ ký, công bố và xác nhận rủi ro, cam kết bao tiêu (V048).
        var contractRecord = model.Entity<ContractRecord>();
        contractRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        contractRecord.HasDiscriminator<string>("record_type")
            .HasValue<InvestmentContract>("Contract").HasValue<ContractTemplate>("Template").HasValue<ContractSignature>("Signature")
            .HasValue<RiskDisclosure>("RiskDisclosure").HasValue<RiskAcknowledgement>("RiskAcknowledgement").HasValue<OfftakeCommitment>("Offtake");
        // user_record gộp vai trò, địa chỉ, eKYC và tài khoản nhận tiền của người dùng (V045).
        var userRecord = model.Entity<UserRecord>();
        userRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        userRecord.HasDiscriminator<string>("record_type")
            .HasValue<AppUserRole>("Role").HasValue<CustomerAddress>("Address").HasValue<KycCheck>("KycCheck")
            .HasValue<KycHandoff>("KycHandoff").HasValue<PayoutAccount>("PayoutAccount");
        // party_record gộp giấy tờ, vai trò, cơ sở và người liên quan của đối tác (V044).
        var partyRecord = model.Entity<PartyRecord>();
        partyRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        partyRecord.HasDiscriminator<string>("record_type")
            .HasValue<PartyDocument>("Document").HasValue<PartnerRole>("Role").HasValue<PartySite>("Site").HasValue<RelatedParty>("RelatedParty");
        model.Entity<Party>().HasMany(p => p.Roles).WithOne(r => r.Party).HasForeignKey(r => r.PartyId);
        model.Entity<Party>().HasMany(p => p.Sites).WithOne().HasForeignKey(s => s.PartyId);
        // Bảng có trigger chặn sửa/xoá: EF không được dùng OUTPUT khi chèn.
        model.Entity<PlatformParameter>().ToTable("platform_parameter", t => t.UseSqlOutputClause(false));
    }
}
