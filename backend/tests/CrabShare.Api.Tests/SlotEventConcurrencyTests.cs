using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class SlotEventTests
{
    private static void AssertRaceLoser(HttpResponseMessage response)
    {
        Assert.Contains(response.StatusCode, new[] { HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity });
    }
    [Fact]
    public async Task Concurrent_mortality_for_same_crab_records_only_one_death_and_releases_allocation_once()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var first = Input(farm, "Mortality"); first["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2));
        var second = Input(farm, "Mortality"); second["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2));
        var replies = await Task.WhenAll(client.PostAsJsonAsync(Path(farm), first), client.PostAsJsonAsync(Path(farm), second));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Created);
        AssertRaceLoser(Assert.Single(replies, r => r.StatusCode != HttpStatusCode.Created));
        Assert.Equal(1, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
        Assert.Equal(1, await Db(db => db.CrabItemEvents.CountAsync(e => e.CrabItemId == farm.CrabId && e.EventType == "Died")));
        Assert.Equal(1, await AuditCount(farm)); foreach (var reply in replies) reply.Dispose(); await VerifyAuditChain();
    }

    [Fact]
    public async Task Concurrent_relocations_to_same_destination_have_one_winner_and_leave_losing_source_intact()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var secondSource = await AddSlot(farm, "0002", growing: true); var destination = await AddSlot(farm, "0003");
        var first = Input(farm, "Relocated"); first["destinationSlotCode"] = destination.Code;
        var second = Input(farm, "Relocated"); second["slotCode"] = secondSource.Code; second["destinationSlotCode"] = destination.Code;
        var replies = await Task.WhenAll(client.PostAsJsonAsync(Path(farm), first), client.PostAsJsonAsync(Path(farm), second));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Created); AssertRaceLoser(Assert.Single(replies, r => r.StatusCode != HttpStatusCode.Created));
        Assert.Equal(2, await Db(db => db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId && c.Status == "Growing")));
        Assert.Equal(2, await Db(db => db.SlotAllocations.CountAsync(a => a.BatchId == farm.BatchId && a.ReleasedAt == null)));
        Assert.Equal(1, await Db(db => db.SlotAllocations.CountAsync(a => a.SlotId == destination.Id && a.ReleasedAt == null)));
        Assert.Equal(1, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
        Assert.Equal(1, await AuditCount(farm)); foreach (var reply in replies) reply.Dispose(); await VerifyAuditChain();
    }

    [Fact]
    public async Task Concurrent_restock_for_same_dead_crab_cannot_create_duplicate_replacements()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK); await Die(client, farm);
        var first = Input(farm, "Restocked"); first["replacesCrabItemId"] = farm.CrabId; first["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddSeconds(-90));
        var second = Input(farm, "Restocked"); second["replacesCrabItemId"] = farm.CrabId; second["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddSeconds(-90));
        var replies = await Task.WhenAll(client.PostAsJsonAsync(Path(farm), first), client.PostAsJsonAsync(Path(farm), second));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Created); AssertRaceLoser(Assert.Single(replies, r => r.StatusCode != HttpStatusCode.Created));
        Assert.Equal(1, await Db(db => db.CrabItems.CountAsync(c => c.ReplacesCrabItemId == farm.CrabId)));
        Assert.Equal(1, await Db(db => db.SlotAllocations.CountAsync(a => a.SlotId == farm.SlotId && a.ReleasedAt == null)));
        Assert.Equal(2, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
        foreach (var reply in replies) reply.Dispose(); await VerifyAuditChain();
    }

    [Theory]
    [InlineData("audit")]
    [InlineData("alert")]
    public async Task Mid_transaction_failure_rolls_back_death_evidence_allocation_alert_and_audit(string failure)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy(alerts: true)), HttpStatusCode.OK);
        var photo = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2)); var auditCount = await AuditCount(farm);
        // Only generated numeric IDs and our own random test identifier enter this isolated fixture SQL.
        var identifier = "vi09_test_" + Guid.NewGuid().ToString("N");
        var create = failure == "audit"
            ? $"CREATE TRIGGER dbo.{identifier} ON dbo.audit_log AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE actor_user_id={farm.UserId}) THROW 51009, 'VI09 injected audit failure', 1; END"
            : $"ALTER TABLE dbo.alert ADD CONSTRAINT {identifier} CHECK (batch_id <> {farm.BatchId})";
        await Db(async db => { await db.Database.ExecuteSqlRawAsync(create); return true; });
        try
        {
            var input = Input(farm, "Mortality"); input["evidenceId"] = photo;
            await Failure(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.UnprocessableEntity);
            Assert.Equal("Growing", await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.Status).SingleAsync()));
            Assert.Equal("Occupied", await Db(db => db.PhysicalSlots.Where(s => s.SlotId == farm.SlotId).Select(s => s.Status).SingleAsync()));
            Assert.Null(await Db(db => db.SlotAllocations.Where(a => a.SlotId == farm.SlotId).Select(a => a.ReleasedAt).SingleAsync()));
            Assert.Null(await Db(db => db.Evidences.Where(e => e.EvidenceId == photo).Select(e => e.SlotEventId).SingleAsync()));
            Assert.Equal(0, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
            Assert.Equal(0, await Db(db => db.CrabItemEvents.CountAsync(e => e.CrabItemId == farm.CrabId)));
            Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId))); Assert.Equal(auditCount, await AuditCount(farm));
        }
        finally
        {
            await Db(async db => { await db.Database.ExecuteSqlRawAsync(failure == "audit" ? $"DROP TRIGGER dbo.{identifier}" : $"ALTER TABLE dbo.alert DROP CONSTRAINT {identifier}"); return true; });
        }
        var valid = Input(farm, "Mortality"); valid["evidenceId"] = photo;
        await Success(await client.PostAsJsonAsync(Path(farm), valid)); await VerifyAuditChain();
    }
}
