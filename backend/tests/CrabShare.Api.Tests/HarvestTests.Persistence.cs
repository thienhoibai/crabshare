using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class HarvestTests
{
    [Fact]
    public async Task Complete_syncs_existing_listing_stock_and_returns_grade_summary_once()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var second = await AddCrab(farm, "0002");
        var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64();
        await Record(client, id, RecordInput(farm, 250));
        await Record(client, id, RecordInput(second, 500));
        var listingIds = await Db(async db =>
        {
            var grades = await db.ProductGrades.Where(g => g.GradeCode == "L1" || g.GradeCode == "L3").ToDictionaryAsync(g => g.GradeCode, g => g.GradeId);
            var l3 = new ProductListing { BatchId = farm.BatchId, GradeId = grades["L3"], Title = "L3", StorageType = "Fresh", CurrentPricePerKg = 1, StockQtyKg = 0, ReservedQtyKg = 0, Status = "Draft", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var l1 = new ProductListing { BatchId = farm.BatchId, GradeId = grades["L1"], Title = "L1", StorageType = "Fresh", CurrentPricePerKg = 1, StockQtyKg = 0, ReservedQtyKg = 0, Status = "Draft", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.ProductListings.AddRange(l3, l1); await db.SaveChangesAsync(); return new { l3.ListingId, L1 = l1.ListingId };
        });

        var current = await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{id}");
        var completionBody = new { expectedRevision = current.GetProperty("revision").GetInt32() };
        var concurrent = await Task.WhenAll(
            client.PostAsJsonAsync($"/api/harvests/{id}/complete", completionBody),
            client.PostAsJsonAsync($"/api/harvests/{id}/complete", completionBody));
        var completed = await Success(concurrent[0]);
        await Success(concurrent[1]);
        Assert.Equal(2, completed.GetProperty("harvestedCount").GetInt32());
        Assert.Equal(0.750m, completed.GetProperty("totalWeightKg").GetDecimal());
        var summaries = completed.GetProperty("gradeSummaries").EnumerateArray().ToDictionary(x => x.GetProperty("gradeCode").GetString()!);
        Assert.Equal(1, summaries["L3"].GetProperty("crabCount").GetInt32());
        Assert.Equal(0.250m, summaries["L3"].GetProperty("totalWeightKg").GetDecimal());
        Assert.Equal(1, summaries["L1"].GetProperty("crabCount").GetInt32());
        Assert.Equal(0.500m, summaries["L1"].GetProperty("totalWeightKg").GetDecimal());
        Assert.Equal(0.250m, await Db(db => db.ProductListings.Where(l => l.ListingId == listingIds.ListingId).Select(l => l.StockQtyKg).SingleAsync()));
        Assert.Equal(0.500m, await Db(db => db.ProductListings.Where(l => l.ListingId == listingIds.L1).Select(l => l.StockQtyKg).SingleAsync()));

        await Complete(client, completed);
        Assert.Equal(0.250m, await Db(db => db.ProductListings.Where(l => l.ListingId == listingIds.ListingId).Select(l => l.StockQtyKg).SingleAsync()));
    }

    [Fact]
    public async Task Complete_rolls_back_when_reconciled_stock_would_fall_below_reservations()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64();
        await Record(client, id, RecordInput(farm));
        var listingId = await Db(async db =>
        {
            var gradeId = await db.ProductGrades.Where(g => g.GradeCode == "L3").Select(g => g.GradeId).SingleAsync();
            var listing = new ProductListing { BatchId = farm.BatchId, GradeId = gradeId, Title = "L3", StorageType = "Fresh", CurrentPricePerKg = 1, StockQtyKg = 0.250m, ReservedQtyKg = 0.250m, Status = "Published", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.ProductListings.Add(listing);
            (await db.CrabItems.SingleAsync(c => c.CrabItemId == farm.CrabId)).Status = "Packed";
            await db.SaveChangesAsync(); return listing.ListingId;
        });
        var current = await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{id}");

        await Failure(await client.PostAsJsonAsync($"/api/harvests/{id}/complete", new { expectedRevision = current.GetProperty("revision").GetInt32() }), HttpStatusCode.UnprocessableEntity);

        Assert.Equal("Open", (await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{id}")).GetProperty("status").GetString());
        Assert.Equal(0.250m, await Db(db => db.ProductListings.Where(l => l.ListingId == listingId).Select(l => l.StockQtyKg).SingleAsync()));
    }

    [Fact]
    public async Task Record_replay_after_completion_slot_reuse_and_tag_change_returns_original_snapshot()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64(); var input = RecordInput(farm);
        var first = await Record(client, id, input);
        await Complete(client, await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{id}"));
        var replacement = await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow; var slot = await db.PhysicalSlots.FindAsync(farm.SlotId); slot!.Status = "Occupied";
            var allocation = new SlotAllocation { BatchId = farm.BatchId, SlotId = farm.SlotId, AllocatedAt = now, CreatedAt = now };
            var crab = new CrabItem { BatchId = farm.BatchId, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), Status = "Growing", StockedAt = now, CreatedAt = now, UpdatedAt = now };
            db.CrabItems.Add(crab); var tag = await db.CrabTags.SingleAsync(t => t.CrabItemId == farm.CrabId); tag.Status = "Void"; tag.VoidedAt = now; tag.VoidReason = "Test snapshot";
            var old = await db.CrabItems.FindAsync(farm.CrabId); old!.Status = "Packed";
            await db.SaveChangesAsync(); return crab.CrabItemId;
        });
        var second = await Start(client, farm); await Record(client, second.GetProperty("id").GetInt64(), new { requestId = Guid.NewGuid(), slotCode = farm.SlotCode, expectedCrabItemId = replacement, weightG = 500, shellCondition = "HardShell" });
        var auditCount = await AuditCount(farm);
        var replay = await Success(await client.PostAsJsonAsync(RecordPath(id), input));
        foreach (var field in new[] { "crabItemId", "itemUuid", "harvestId", "batchCode", "slotCode", "weightG", "shellCondition", "gradeCode", "gradeName", "tagCode", "tagStatus", "tracePath", "harvestedCount", "remainingGrowingCount" }) Assert.Equal(first.GetProperty(field).ToString(), replay.GetProperty(field).ToString()); Assert.Equal(first.GetProperty("totalWeightKg").GetDecimal(), replay.GetProperty("totalWeightKg").GetDecimal()); Assert.Equal(first.GetProperty("recordedAt").GetDateTimeOffset(), replay.GetProperty("recordedAt").GetDateTimeOffset()); Assert.Equal("Printed", replay.GetProperty("tagStatus").GetString());
        Assert.Equal(1, replay.GetProperty("harvestedCount").GetInt32()); Assert.Equal(0, replay.GetProperty("remainingGrowingCount").GetInt32()); Assert.Equal(auditCount, await AuditCount(farm));
        var history = await client.GetFromJsonAsync<JsonElement>(RecordPath(id)); var historyRecord = Assert.Single(history.GetProperty("items").EnumerateArray());
        Assert.Equal(farm.CrabId, historyRecord.GetProperty("crabItemId").GetInt64()); Assert.Equal("Printed", historyRecord.GetProperty("tagStatus").GetString());
        input["weightG"] = 300; await Failure(await client.PostAsJsonAsync(RecordPath(id), input), HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Request_ids_cannot_be_reused_with_other_actor_or_payload_and_stale_crab_is_rejected()
    {
        var farm = await Setup(); var staff = await Member(farm); using var client = Client(farm.UserId); using var staffClient = Client(staff);
        var startRequest = new Dictionary<string, object?> { ["requestId"] = Guid.NewGuid(), ["name"] = "First", ["note"] = "Note" };
        var harvest = await Start(client, farm, startRequest); var id = harvest.GetProperty("id").GetInt64();
        startRequest["name"] = "Changed"; await Failure(await client.PostAsJsonAsync(StartPath(farm), startRequest), HttpStatusCode.Conflict);
        var stale = RecordInput(farm); stale["expectedCrabItemId"] = farm.CrabId + 1;
        await Failure(await client.PostAsJsonAsync(RecordPath(id), stale), HttpStatusCode.Conflict); await AssertUnharvested(farm);
        var record = RecordInput(farm); await Record(client, id, record);
        await Failure(await staffClient.PostAsJsonAsync(RecordPath(id), record), HttpStatusCode.Conflict);
        await Failure(await client.PostAsJsonAsync(RecordPath(id), RecordInput(farm)), HttpStatusCode.Conflict);
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
    }

    [Fact]
    public async Task Partial_harvest_keeps_other_crabs_growing_and_reconciles_totals_and_history()
    {
        var farm = await Setup(); var second = await AddCrab(farm, "0002"); using var client = Client(farm.UserId);
        var firstUuid = await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.ItemUuid).SingleAsync());
        var allocationId = await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.SlotAllocationId).SingleAsync());
        var started = await Start(client, farm); var id = started.GetProperty("id").GetInt64(); var result = await Record(client, id, RecordInput(farm, 499));
        Assert.Equal(1, result.GetProperty("remainingGrowingCount").GetInt32()); Assert.Equal(0.499m, result.GetProperty("totalWeightKg").GetDecimal());
        Assert.Equal(2, await Db(db => db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId)));
        Assert.Equal("Growing", await Db(db => db.CrabItems.Where(c => c.CrabItemId == second.CrabId).Select(c => c.Status).SingleAsync()));
        Assert.Equal(firstUuid, await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.ItemUuid).SingleAsync()));
        var slotEvent = await Db(db => db.SlotEvents.SingleAsync(e => e.BatchId == farm.BatchId && e.EventType == "Harvested")); Assert.Equal(allocationId, slotEvent.SlotAllocationId); Assert.Equal("Manual", slotEvent.Source);
        var events = await Db(db => db.CrabItemEvents.Where(e => e.CrabItemId == farm.CrabId).ToListAsync());
        Assert.Contains(events, e => e.EventType == "Harvested" && e.ActorId == farm.UserId); Assert.Contains(events, e => e.EventType == "TagPrinted" && e.ActorId == farm.UserId);
        var reconciliation = await Db(db => db.VCrabCountReconciliations.SingleAsync(r => r.BatchId == farm.BatchId));
        Assert.Equal(2, reconciliation.StockedTotal); Assert.Equal(1, reconciliation.Harvested); Assert.Equal(1, reconciliation.DeclaredHarvested); Assert.Equal(1, reconciliation.Growing); Assert.Equal(1, reconciliation.HarvestedWithoutActiveTag);
        Assert.Equal(reconciliation.Growing, reconciliation.StockedTotal - reconciliation.Dead - reconciliation.Harvested);
        var before = await Db(db => db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId && c.Status == "InStock"));
        var completed = await Complete(client, await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{id}")); await Complete(client, completed);
        Assert.Equal(before, await Db(db => db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId && c.Status == "InStock")));
        Assert.Equal("Harvesting", await Db(db => db.Batches.Where(b => b.BatchId == farm.BatchId).Select(b => b.Status).SingleAsync()));
        string? previous = null;
        foreach (var audit in await Db(db => db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync()))
        { Assert.Equal(previous, audit.PrevHash); Assert.True(AuditChain.VerifyHash(audit)); previous = audit.RowHash; }
    }

    [Fact]
    public async Task Concurrent_records_have_one_winner_and_one_crab_tag_event_and_total()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64();
        var responses = await Task.WhenAll(client.PostAsJsonAsync(RecordPath(id), RecordInput(farm)), client.PostAsJsonAsync(RecordPath(id), RecordInput(farm)));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created); await Failure(Assert.Single(responses, r => r.StatusCode != HttpStatusCode.Created), HttpStatusCode.Conflict);
        foreach (var response in responses) response.Dispose();
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
        Assert.Equal(1, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId && e.EventType == "Harvested")));
        Assert.Equal(1, await Db(db => db.Harvests.Where(h => h.HarvestId == id).Select(h => h.HarvestedCount).SingleAsync()));
        Assert.Equal(0.250m, await Db(db => db.Harvests.Where(h => h.HarvestId == id).Select(h => h.TotalWeightKg).SingleAsync()));
    }

    [Fact]
    public async Task Concurrent_starts_keep_one_open_session_and_both_request_aliases()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var first = StartInput(); var second = StartInput();
        var responses = await Task.WhenAll(client.PostAsJsonAsync(StartPath(farm), first), client.PostAsJsonAsync(StartPath(farm), second));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created); Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        var bodies = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<JsonElement>())); Assert.Equal(bodies[0].GetProperty("id").GetInt64(), bodies[1].GetProperty("id").GetInt64());
        foreach (var response in responses) response.Dispose();
        Assert.Equal(1, await Db(db => db.Harvests.CountAsync(h => h.BatchId == farm.BatchId)));
        await Complete(client, bodies[0]);
        foreach (var request in new[] { first, second })
        { var replay = await Success(await client.PostAsJsonAsync(StartPath(farm), request)); Assert.Equal(bodies[0].GetProperty("id").GetInt64(), replay.GetProperty("id").GetInt64()); }
    }

    [Theory]
    [InlineData("audit")]
    [InlineData("tag")]
    [InlineData("event")]
    public async Task Injected_mid_transaction_failure_rolls_back_crab_tag_slot_events_and_totals(string stage)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64(); var audits = await AuditCount(farm);
        var identifier = "harvest_test_" + Guid.NewGuid().ToString("N");
        var sql = stage == "audit" ? $"CREATE TRIGGER dbo.{identifier} ON dbo.audit_log AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE actor_user_id={farm.UserId}) THROW 51071, 'Injected harvest audit failure', 1; END"
            : stage == "tag" ? $"ALTER TABLE dbo.crab_tag ADD CONSTRAINT {identifier} CHECK (crab_item_id <> {farm.CrabId})"
            : $"ALTER TABLE dbo.crab_item_event ADD CONSTRAINT {identifier} CHECK (crab_item_id <> {farm.CrabId} OR event_type <> 'TagPrinted')";
        await Db(async db => { await db.Database.ExecuteSqlRawAsync(sql); return true; });
        try
        {
            await Failure(await client.PostAsJsonAsync(RecordPath(id), RecordInput(farm)), HttpStatusCode.UnprocessableEntity);
            await AssertUnharvested(farm); Assert.Equal(audits, await AuditCount(farm));
        }
        finally { await Db(async db => { await db.Database.ExecuteSqlRawAsync(stage == "audit" ? $"DROP TRIGGER dbo.{identifier}" : $"ALTER TABLE dbo.{(stage == "tag" ? "crab_tag" : "crab_item_event")} DROP CONSTRAINT {identifier}"); return true; }); }
        await Record(client, id, RecordInput(farm));
    }
}

