using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class SlotEventTests
{
    private Task<long> Photo(Farm farm, DateTimeOffset capturedAt, string source = "InAppCapture", string review = "Watch", long? slotId = null, string media = "Photo", bool gps = true) => Db(async db =>
    {
        var evidence = new Evidence { BatchId = farm.BatchId, SlotId = slotId ?? farm.SlotId, Source = source, MediaType = media,
            FileUri = $"slot-event-tests/{Guid.NewGuid():N}.jpg", Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            CapturedAt = capturedAt, ReceivedAt = capturedAt, Latitude = gps ? 10.1m : null, Longitude = gps ? 106.1m : null,
            ReviewStatus = review, CreatedAt = capturedAt };
        db.Evidences.Add(evidence); await db.SaveChangesAsync(); return evidence.EvidenceId;
    });
    private Task<(long Id, string Code)> AddSlot(Farm farm, string code, bool growing = false, DateTimeOffset? allocatedAt = null) => Db(async db =>
    {
        var at = allocatedAt ?? farm.StockedAt;
        var slot = new PhysicalSlot { OperatorId = farm.OperatorId, SlotCode = code, Status = growing ? "Occupied" : "Available", CreatedAt = at, UpdatedAt = at };
        db.PhysicalSlots.Add(slot);
        if (growing)
        {
            var allocation = new SlotAllocation { BatchId = farm.BatchId, Slot = slot, AllocatedAt = at, CreatedAt = at };
            db.CrabItems.Add(new CrabItem { BatchId = farm.BatchId, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), Status = "Growing", StockedAt = at, CreatedAt = at, UpdatedAt = at });
        }
        await db.SaveChangesAsync(); return (slot.SlotId, slot.SlotCode);
    });
    private async Task<JsonElement> Die(HttpClient client, Farm farm, DateTimeOffset? at = null)
    {
        var occurred = at ?? DateTimeOffset.UtcNow.AddMinutes(-2); var input = Input(farm, "Mortality", occurred);
        input["evidenceId"] = await Photo(farm, occurred.AddSeconds(-1));
        return await Success(await client.PostAsJsonAsync(Path(farm), input));
    }
    private Task<int> AuditCount(Farm farm) => Db(db => db.AuditLogs.CountAsync(a => a.ActorUserId == farm.UserId));
    private Task<bool> VerifyAuditChain() => Db(async db =>
    {
        string? previous = null;
        foreach (var audit in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync())
        { Assert.Equal(previous, audit.PrevHash); Assert.True(AuditChain.VerifyHash(audit)); previous = audit.RowHash; }
        return true;
    });

    [Fact]
    public async Task Mortality_restock_and_relocation_preserve_registry_identity_evidence_history_and_reconciliation()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK);
        var death = await Die(client, farm);
        Assert.Equal(0, death.GetProperty("aliveCount").GetInt32());
        Assert.Equal("Dead", await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.Status).SingleAsync()));
        Assert.Equal("Available", await Db(db => db.PhysicalSlots.Where(s => s.SlotId == farm.SlotId).Select(s => s.Status).SingleAsync()));
        var context = await client.GetFromJsonAsync<JsonElement>(ContextPath(farm));
        Assert.Equal(JsonValueKind.Null, context.GetProperty("currentCrab").ValueKind);
        Assert.Equal(farm.CrabId, Assert.Single(context.GetProperty("replacementCandidates").EnumerateArray()).GetProperty("id").GetInt64());
        var photo = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-1), review: "Flagged");
        var restock = Input(farm, "Restocked", DateTimeOffset.UtcNow.AddSeconds(-30)); restock["evidenceId"] = photo; restock["replacesCrabItemId"] = farm.CrabId;
        var replacement = await Success(await client.PostAsJsonAsync(Path(farm), restock)); var newId = replacement.GetProperty("crabItemId").GetInt64();
        Assert.NotEqual(farm.CrabId, newId); Assert.Equal(1, replacement.GetProperty("aliveCount").GetInt32()); Assert.Equal(farm.CrabId, replacement.GetProperty("replacesCrabItemId").GetInt64());
        var destination = await AddSlot(farm, "0002");
        var boxes = await client.GetFromJsonAsync<JsonElement>("/api/boxes?status=Available&search=0002&page=1&pageSize=10");
        Assert.Contains(boxes.GetProperty("items").EnumerateArray(), b => b.GetProperty("slotCode").GetString() == destination.Code);
        var move = Input(farm, "Relocated", DateTimeOffset.UtcNow.AddSeconds(-10)); move["destinationSlotCode"] = destination.Code;
        var moved = await Success(await client.PostAsJsonAsync(Path(farm), move));
        Assert.Equal(newId, moved.GetProperty("crabItemId").GetInt64()); Assert.Equal(replacement.GetProperty("itemUuid").GetGuid(), moved.GetProperty("itemUuid").GetGuid());
        Assert.Equal(destination.Code, moved.GetProperty("destinationSlotCode").GetString());
        var current = await client.GetFromJsonAsync<JsonElement>(ContextPath(farm, destination.Code));
        Assert.Equal(newId, current.GetProperty("currentCrab").GetProperty("id").GetInt64());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(ContextPath(farm))).GetProperty("replacementCandidates").EnumerateArray());
        Assert.Equal(1, await Db(db => db.SlotAllocations.CountAsync(a => a.BatchId == farm.BatchId && a.ReleasedAt == null)));
        Assert.Equal(3, await Db(db => db.SlotAllocations.CountAsync(a => a.BatchId == farm.BatchId)));
        var crabEvents = await Db(db => db.CrabItemEvents.Where(e => e.CrabItem.BatchId == farm.BatchId).ToListAsync());
        Assert.Equal(3, crabEvents.Count); Assert.All(crabEvents, e => Assert.Equal(farm.UserId, e.ActorId));
        Assert.Contains(crabEvents, e => e.CrabItemId == farm.CrabId && e.EventType == "Died" && e.EvidenceId == death.GetProperty("evidenceId").GetInt64());
        Assert.Contains(crabEvents, e => e.CrabItemId == newId && e.EvidenceId == photo);
        Assert.Contains(crabEvents, e => e.CrabItemId == newId && e.EventType == "Relocated");
        Assert.Equal(replacement.GetProperty("id").GetInt64(), await Db(db => db.Evidences.Where(e => e.EvidenceId == photo).Select(e => e.SlotEventId).SingleAsync()));
        var reconciliation = await Db(db => db.VCrabCountReconciliations.SingleAsync(v => v.BatchId == farm.BatchId));
        Assert.Equal(2, reconciliation.StockedTotal); Assert.Equal(1, reconciliation.Restocked); Assert.Equal(1, reconciliation.Dead); Assert.Equal(1, reconciliation.Growing);
        Assert.Equal(reconciliation.Growing, reconciliation.StockedTotal - reconciliation.Dead - reconciliation.Harvested);
        var page = await client.GetFromJsonAsync<JsonElement>(Path(farm) + "?page=2&pageSize=1");
        Assert.Equal(3, page.GetProperty("total").GetInt32()); Assert.Equal(2, page.GetProperty("page").GetInt32()); Assert.Equal(1, page.GetProperty("pageSize").GetInt32());
        Assert.Equal(replacement.GetProperty("id").GetInt64(), Assert.Single(page.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt64());
        Assert.True(await AuditCount(farm) >= 4); await VerifyAuditChain();
    }

    [Fact]
    public async Task Exact_retry_returns_same_event_and_changed_payload_conflicts_without_extra_audits()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(farm);
        var original = await Success(await client.PostAsJsonAsync(Path(farm), input)); var audits = await AuditCount(farm);
        var retry = await Success(await client.PostAsJsonAsync(Path(farm), input)); Assert.Equal(original.GetProperty("id").GetInt64(), retry.GetProperty("id").GetInt64());
        input["note"] = "Khác nội dung"; await Failure(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.Conflict);
        Assert.Equal(audits, await AuditCount(farm)); Assert.Equal(1, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
        input["requestId"] = Guid.NewGuid(); await Success(await client.PostAsJsonAsync(Path(farm), input));
        Assert.Equal(2, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Configured_mortality_alert_uses_initial_seed_denominator_and_selected_severity_and_ack_deadline()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy(alerts: true)), HttpStatusCode.OK);
        await Die(client, farm, DateTimeOffset.UtcNow.AddMinutes(-1));
        var alert = await Db(db => db.Alerts.SingleAsync(a => a.BatchId == farm.BatchId));
        Assert.Equal("High", alert.Severity); Assert.Equal("Open", alert.Status); Assert.Equal(TimeSpan.FromHours(3), alert.AckDeadline - alert.RaisedAt);
        Assert.Contains("100", alert.Message); // seedQuantity; only one live registry crab exists in this fixture.
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy(1)), HttpStatusCode.OK);
        var unchanged = await Db(db => db.Alerts.SingleAsync(a => a.BatchId == farm.BatchId));
        Assert.Equal(alert.Message, unchanged.Message); Assert.Equal(alert.AckDeadline, unchanged.AckDeadline); Assert.Equal(alert.UpdatedAt, unchanged.UpdatedAt);
    }

    [Fact]
    public async Task Mortality_percentage_uses_seed_quantity_instead_of_current_growing_registry_count()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var policy = Policy(alerts: true);
        policy["mortalityThresholdPercent"] = 50m;
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), policy), HttpStatusCode.OK);
        await Die(client, farm, DateTimeOffset.UtcNow.AddMinutes(-1));
        // One death / 100 original seeds = 1%, even though the registry fixture had one growing crab.
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Context_exposes_current_crab_and_only_eligible_unused_camera_photos()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var valid = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2));
        await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2), source: "FarmApi");
        await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2), review: "Rejected");
        await Photo(farm, farm.StockedAt.AddMinutes(-1));
        var context = await client.GetFromJsonAsync<JsonElement>(ContextPath(farm));
        Assert.Equal(farm.Code, context.GetProperty("batchCode").GetString()); Assert.Equal(farm.SlotCode, context.GetProperty("slotCode").GetString());
        Assert.Equal("Occupied", context.GetProperty("status").GetString()); Assert.Equal(farm.CrabId, context.GetProperty("currentCrab").GetProperty("id").GetInt64());
        Assert.True(context.GetProperty("canRecord").GetBoolean()); Assert.Equal(1, context.GetProperty("aliveCount").GetInt32());
        Assert.Equal(valid, Assert.Single(context.GetProperty("availableEvidence").EnumerateArray()).GetProperty("id").GetInt64());
        Assert.Empty(context.GetProperty("replacementCandidates").EnumerateArray());
        var mortality = Input(farm, "Mortality"); mortality["evidenceId"] = valid;
        await Success(await client.PostAsJsonAsync(Path(farm), mortality));
        Assert.DoesNotContain((await client.GetFromJsonAsync<JsonElement>(ContextPath(farm))).GetProperty("availableEvidence").EnumerateArray(), e => e.GetProperty("id").GetInt64() == valid);
    }

    [Theory]
    [InlineData("Stocked")]
    [InlineData("InProduction")]
    [InlineData("Harvesting")]
    public async Task Every_active_batch_state_allows_events_when_crab_is_growing(string status)
    {
        var farm = await Setup(status); using var client = Client(farm.UserId);
        await Success(await client.PostAsJsonAsync(Path(farm), Input(farm)));
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK);
        await Die(client, farm, DateTimeOffset.UtcNow.AddSeconds(-30));
        var restock = Input(farm, "Restocked", DateTimeOffset.UtcNow.AddSeconds(-10)); restock["replacesCrabItemId"] = farm.CrabId; restock["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddSeconds(-20));
        await Success(await client.PostAsJsonAsync(Path(farm), restock));
    }
}
