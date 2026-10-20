using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<SlotEventPolicyVersion> SlotEventPolicies => Set<SlotEventPolicyVersion>();
    public DbSet<SlotEventDetail> SlotEventDetails => Set<SlotEventDetail>();

    private static void ConfigureSlotEvents(ModelBuilder model)
    {
        model.Entity<SlotEventPolicyVersion>(e =>
        {
            e.ToTable("slot_event_policy_version", t => t.UseSqlOutputClause(false));
            e.HasKey(x => x.PolicyVersionId);
            e.Property(x => x.PolicyVersionId).HasColumnName("policy_version_id");
            e.Property(x => x.BatchId).HasColumnName("batch_id");
            e.Property(x => x.VersionNo).HasColumnName("version_no");
            e.Property(x => x.RestockCutoffBasis).HasColumnName("restock_cutoff_basis").HasMaxLength(20).IsUnicode(false);
            e.Property(x => x.RestockCutoffDays).HasColumnName("restock_cutoff_days");
            e.Property(x => x.MortalityWindowHours).HasColumnName("mortality_window_hours");
            e.Property(x => x.MortalityThresholdPercent).HasColumnName("mortality_threshold_percent").HasPrecision(9, 2);
            e.Property(x => x.MortalitySeverity).HasColumnName("mortality_severity").HasMaxLength(20).IsUnicode(false);
            e.Property(x => x.MortalityAckWithinHours).HasColumnName("mortality_ack_within_hours");
            e.Property(x => x.CreatedBy).HasColumnName("created_by");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").HasPrecision(3);
            e.HasIndex(x => new { x.BatchId, x.VersionNo }).IsUnique();
            e.HasOne<Batch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.NoAction);
        });
        model.Entity<SlotEventDetail>(e =>
        {
            e.ToTable("slot_event_detail", t => t.UseSqlOutputClause(false));
            e.HasKey(x => x.SlotEventId);
            e.Property(x => x.SlotEventId).HasColumnName("slot_event_id").ValueGeneratedNever();
            e.Property(x => x.BatchId).HasColumnName("batch_id");
            e.Property(x => x.CrabItemId).HasColumnName("crab_item_id");
            e.Property(x => x.DestinationSlotAllocationId).HasColumnName("destination_slot_allocation_id");
            e.Property(x => x.ActorId).HasColumnName("actor_id");
            e.Property(x => x.RequestId).HasColumnName("request_id");
            e.Property(x => x.RequestHash).HasColumnName("request_hash").HasMaxLength(64).IsFixedLength().IsUnicode(false);
            e.Property(x => x.PolicyVersionId).HasColumnName("policy_version_id");
            e.Property(x => x.AliveCount).HasColumnName("alive_count");
            e.HasIndex(x => new { x.BatchId, x.RequestId }).IsUnique();
        });
        model.Entity<CrabItem>().HasIndex(x => x.ReplacesCrabItemId).IsUnique().HasFilter("[replaces_crab_item_id] IS NOT NULL")
            .HasDatabaseName("ux_crab_item_replacement");
    }
}
