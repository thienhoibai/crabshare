using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class SlotEventTests
{
    [Fact]
    public async Task Legacy_slot_history_without_individual_link_or_count_snapshot_returns_null_after_relocation()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var legacyId = await Db(async db =>
        {
            var allocationId = await db.SlotAllocations.Where(a => a.SlotId == farm.SlotId).Select(a => a.SlotAllocationId).SingleAsync();
            var legacy = new SlotEvent { BatchId = farm.BatchId, SlotAllocationId = allocationId, EventType = "Stocked", OccurredAt = farm.StockedAt,
                Quantity = 1, Source = "Manual", ReceivedAt = farm.StockedAt };
            db.SlotEvents.Add(legacy); await db.SaveChangesAsync(); return legacy.SlotEventId;
        });
        var destination = await AddSlot(farm, "0002"); var move = Input(farm, "Relocated"); move["destinationSlotCode"] = destination.Code;
        var moved = await Success(await client.PostAsJsonAsync(Path(farm), move));
        Assert.Equal(farm.CrabId, moved.GetProperty("crabItemId").GetInt64()); Assert.Equal(1, moved.GetProperty("aliveCount").GetInt32());
        var page = await client.GetFromJsonAsync<JsonElement>(Path(farm));
        var old = Assert.Single(page.GetProperty("items").EnumerateArray(), e => e.GetProperty("id").GetInt64() == legacyId);
        Assert.Equal("Stocked", old.GetProperty("eventType").GetString()); Assert.Equal(farm.SlotCode, old.GetProperty("slotCode").GetString());
        Assert.Equal(JsonValueKind.Null, old.GetProperty("crabItemId").ValueKind);
        Assert.Equal(JsonValueKind.Null, old.GetProperty("itemUuid").ValueKind);
        Assert.Equal(JsonValueKind.Null, old.GetProperty("actorId").ValueKind);
        Assert.Equal(JsonValueKind.Null, old.GetProperty("aliveCount").ValueKind);
    }

    [Fact]
    public async Task Remaining_growing_crab_can_record_events_when_harvested_crab_was_later_lost()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Db(async db =>
        {
            var harvestedAt = farm.StockedAt.AddDays(1);
            var slot = new PhysicalSlot { OperatorId = farm.OperatorId, SlotCode = "0002", Status = "Available", CreatedAt = farm.StockedAt, UpdatedAt = harvestedAt };
            var allocation = new SlotAllocation { BatchId = farm.BatchId, Slot = slot, AllocatedAt = farm.StockedAt, ReleasedAt = harvestedAt, CreatedAt = farm.StockedAt };
            var harvest = new Harvest { BatchId = farm.BatchId, HarvestedAt = harvestedAt, HarvestedCount = 1, TotalWeightKg = 0.3m, DeclaredBy = farm.UserId, CreatedAt = harvestedAt };
            var gradeId = await db.ProductGrades.Select(g => g.GradeId).FirstAsync();
            db.CrabItems.Add(new CrabItem { BatchId = farm.BatchId, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), StockedAt = farm.StockedAt,
                Harvest = harvest, GradeId = gradeId, WeightG = 300, Status = "Lost", CreatedAt = farm.StockedAt, UpdatedAt = harvestedAt });
            await db.SaveChangesAsync(); return true;
        });
        var before = await Db(db => db.VCrabCountReconciliations.SingleAsync(r => r.BatchId == farm.BatchId));
        Assert.Equal(2, before.StockedTotal); Assert.Equal(1, before.Growing); Assert.Equal(1, before.Harvested); Assert.Equal(1, before.Lost);
        await Success(await client.PostAsJsonAsync(Path(farm), Input(farm)));
        var after = await Db(db => db.VCrabCountReconciliations.SingleAsync(r => r.BatchId == farm.BatchId));
        Assert.Equal(after.Growing, after.StockedTotal - after.Dead - after.Harvested);
        Assert.Equal(after.Growing, await Db(db => db.SlotAllocations.CountAsync(a => a.BatchId == farm.BatchId && a.ReleasedAt == null)));
    }
}
