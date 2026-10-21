using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class HarvestTests
{
    [Fact]
    public async Task Legacy_sessions_are_readonly_and_new_open_session_does_not_invent_legacy_completion()
    {
        var farm = await Setup("Harvesting"); using var client = Client(farm.UserId);
        var legacyId = await Db(async db =>
        {
            var legacy = new Harvest { BatchId = farm.BatchId, HarvestedAt = farm.StockedAt, DeclaredBy = farm.UserId, CreatedAt = farm.StockedAt, HarvestedCount = 0, TotalWeightKg = 0 };
            db.Harvests.Add(legacy); await db.SaveChangesAsync(); return legacy.HarvestId;
        });
        var legacyResponse = await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{legacyId}");
        Assert.Equal("Legacy", legacyResponse.GetProperty("status").GetString()); Assert.Equal(JsonValueKind.Null, legacyResponse.GetProperty("completedAt").ValueKind);
        Assert.False(legacyResponse.GetProperty("canRecord").GetBoolean()); Assert.False(legacyResponse.GetProperty("canComplete").GetBoolean());
        await Failure(await client.PostAsJsonAsync(RecordPath(legacyId), RecordInput(farm)), HttpStatusCode.UnprocessableEntity);
        await Failure(await client.PostAsJsonAsync($"/api/harvests/{legacyId}/complete", new { expectedRevision = 1 }), HttpStatusCode.UnprocessableEntity);
        var opened = await Start(client, farm); Assert.NotEqual(legacyId, opened.GetProperty("id").GetInt64());
        var old = await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{legacyId}"); Assert.Equal("Legacy", old.GetProperty("status").GetString()); Assert.Equal(JsonValueKind.Null, old.GetProperty("completedAt").ValueKind);
    }

    [Theory]
    [InlineData("Suspended", "operator")]
    [InlineData("Locked", "user")]
    [InlineData("revoked", "role")]
    [InlineData("removed", "membership")]
    public async Task Current_database_permissions_are_checked_even_when_token_remains_valid(string status, string target)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64();
        await Db(async db =>
        {
            if (target == "operator") { var op = await db.Operators.FindAsync(farm.OperatorId); op!.Status = status; }
            else if (target == "user") { var user = await db.AppUsers.FindAsync(farm.UserId); user!.Status = status; }
            else if (target == "role") db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == farm.UserId));
            else db.OperatorMembers.Remove(await db.OperatorMembers.SingleAsync(m => m.UserId == farm.UserId));
            await db.SaveChangesAsync(); return true;
        });
        await Failure(await client.PostAsJsonAsync(RecordPath(id), RecordInput(farm)), target == "operator" ? HttpStatusCode.UnprocessableEntity : HttpStatusCode.Forbidden);
        await AssertUnharvested(farm);
    }

    [Fact]
    public async Task Snapshots_and_start_aliases_are_immutable_in_sql_and_open_session_unique()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var started = await Start(client, farm); var id = started.GetProperty("id").GetInt64(); await Record(client, id, RecordInput(farm));
        foreach (var sql in new[]
        {
            $"UPDATE dbo.harvest_record SET weight_g=251 WHERE harvest_id={id}",
            $"DELETE dbo.harvest_record WHERE harvest_id={id}",
            $"UPDATE dbo.harvest_start_request SET request_hash=REPLICATE('a',64) WHERE harvest_id={id}",
            $"DELETE dbo.harvest_start_request WHERE harvest_id={id}",
        }) await Assert.ThrowsAsync<SqlException>(() => Db(async db => { await db.Database.ExecuteSqlRawAsync(sql); return true; }));
        var now = DateTimeOffset.UtcNow;
        var duplicate = await Assert.ThrowsAsync<SqlException>(() => Db(async db =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT dbo.harvest(batch_id,harvested_at,harvested_count,total_weight_kg,declared_by,created_at,lifecycle_status) VALUES({farm.BatchId},{now},0,0,{farm.UserId},{now},'Open')"); return true;
        })); Assert.Contains(duplicate.Number, new[] { 2601, 2627 });
        var history = await client.GetFromJsonAsync<JsonElement>(RecordPath(id)); Assert.Equal(250, Assert.Single(history.GetProperty("items").EnumerateArray()).GetProperty("weightG").GetInt32());
    }

    [Fact]
    public async Task Concurrent_metadata_edits_use_revision_and_concurrent_completion_audits_once()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64(); var revision = harvest.GetProperty("revision").GetInt32();
        var edits = await Task.WhenAll(client.PatchAsJsonAsync($"/api/harvests/{id}", new { expectedRevision = revision, name = "A" }), client.PatchAsJsonAsync($"/api/harvests/{id}", new { expectedRevision = revision, name = "B" }));
        Assert.Single(edits, e => e.StatusCode == HttpStatusCode.OK); await Failure(Assert.Single(edits, e => e.StatusCode != HttpStatusCode.OK), HttpStatusCode.Conflict); foreach (var edit in edits) edit.Dispose();
        var current = await client.GetFromJsonAsync<JsonElement>($"/api/harvests/{id}"); var auditCount = await AuditCount(farm);
        var completes = await Task.WhenAll(client.PostAsJsonAsync($"/api/harvests/{id}/complete", new { expectedRevision = current.GetProperty("revision").GetInt32() }), client.PostAsJsonAsync($"/api/harvests/{id}/complete", new { expectedRevision = current.GetProperty("revision").GetInt32() }));
        Assert.All(completes, e => Assert.Equal(HttpStatusCode.OK, e.StatusCode)); foreach (var complete in completes) complete.Dispose(); Assert.Equal(auditCount + 1, await AuditCount(farm));
    }
    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Direct_sql_rejects_null_lifecycle_with_partial_or_complete_completion_metadata(bool hasTime, bool hasActor)
    {
        var farm = await Setup(); var now = DateTimeOffset.UtcNow;
        var error = await Assert.ThrowsAsync<SqlException>(() => Db(async db =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT dbo.harvest(batch_id,harvested_at,harvested_count,total_weight_kg,declared_by,created_at,lifecycle_status,completed_at,completed_by) VALUES({farm.BatchId},{farm.StockedAt},0,0,{farm.UserId},{now},NULL,{(hasTime ? now : (DateTimeOffset?)null)},{(hasActor ? farm.UserId : (long?)null)})"); return true;
        })); Assert.Equal(547, error.Number);
        Assert.Equal(0, await Db(db => db.Harvests.CountAsync(h => h.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Boxes_filter_batch_and_keep_occupied_harvesting_allocation_available_to_clients()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var other = await Db(async db =>
        {
            var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == farm.BatchId); batch.BatchId = 0; batch.BatchCode = "HV-" + Guid.NewGuid().ToString("N")[..12];
            db.Batches.Add(batch); await db.SaveChangesAsync(); return farm with { BatchId = batch.BatchId, Code = batch.BatchCode };
        });
        await AddCrab(other, "0002"); var harvest = await Start(client, farm);
        var page = await client.GetFromJsonAsync<JsonElement>($"/api/boxes?status=Occupied&batchCode={farm.Code}&page=1&pageSize=100");
        Assert.Equal(1, page.GetProperty("total").GetInt32()); var box = Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.Equal(farm.SlotCode, box.GetProperty("slotCode").GetString()); Assert.Equal(farm.Code, box.GetProperty("batchCode").GetString());
        await Record(client, harvest.GetProperty("id").GetInt64(), RecordInput(farm));
        var after = await client.GetFromJsonAsync<JsonElement>($"/api/boxes?status=Occupied&batchCode={farm.Code}"); Assert.Equal(0, after.GetProperty("total").GetInt32());
        var otherPage = await client.GetFromJsonAsync<JsonElement>($"/api/boxes?status=Occupied&batchCode={other.Code}"); Assert.Equal(1, otherPage.GetProperty("total").GetInt32());
    }
}
