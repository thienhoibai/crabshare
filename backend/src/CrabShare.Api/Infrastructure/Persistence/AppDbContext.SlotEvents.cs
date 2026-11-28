using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<SlotEventDetail> SlotEventDetails => Set<SlotEventDetail>();

    private static void ConfigureSlotEvents(ModelBuilder model)
    {
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
            e.Property(x => x.AliveCount).HasColumnName("alive_count");
            e.HasIndex(x => new { x.BatchId, x.RequestId }).IsUnique();
        });
        model.Entity<CrabItem>().HasIndex(x => x.ReplacesCrabItemId).IsUnique().HasFilter("[replaces_crab_item_id] IS NOT NULL")
            .HasDatabaseName("ux_crab_item_replacement");
    }
}
