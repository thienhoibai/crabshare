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
        model.Entity<Party>().HasMany(p => p.Roles).WithOne(r => r.Party).HasForeignKey(r => r.PartyId);
        model.Entity<Party>().HasMany(p => p.Sites).WithOne().HasForeignKey(s => s.PartyId);
        model.Entity<PartnerRole>().ToTable("partner_role");
        model.Entity<PartySite>().ToTable("party_site");
        model.Entity<RelatedParty>().ToTable("related_party");
        model.Entity<BatchParticipant>().ToTable("batch_participant");
        model.Entity<PartyDocument>().ToTable("party_document");
        // Bảng có trigger chặn sửa/xoá: EF không được dùng OUTPUT khi chèn.
        model.Entity<PlatformParameter>().ToTable("platform_parameter", t => t.UseSqlOutputClause(false));
    }
}
