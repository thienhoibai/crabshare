using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class HarvestTests
{
    private static async Task<JsonElement> Success(HttpResponseMessage response, HttpStatusCode status = HttpStatusCode.OK)
    {
        using (response)
        {
            var body = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == status, $"Expected {(int)status}, got {(int)response.StatusCode}: {body}");
            return JsonSerializer.Deserialize<JsonElement>(body);
        }
    }
    private static async Task Failure(HttpResponseMessage response, HttpStatusCode status)
    {
        using (response)
        {
            var body = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == status, $"Expected {(int)status}, got {(int)response.StatusCode}: {body}");
            Assert.DoesNotContain("SqlException", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Microsoft.Data.SqlClient", body, StringComparison.OrdinalIgnoreCase);
        }
    }
    private Task<long> Member(Farm farm, string role = "Staff") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow; var user = User(Roles.OperatorMember, now);
        db.OperatorMembers.Add(new OperatorMember { OperatorId = farm.OperatorId, User = user, MemberRole = role, JoinedAt = now, CreatedAt = now });
        await db.SaveChangesAsync(); return user.UserId;
    });
    private Task<Farm> AddCrab(Farm farm, string slotCode) => Db(async db =>
    {
        var at = farm.StockedAt;
        var slot = new PhysicalSlot { OperatorId = farm.OperatorId, SlotCode = slotCode, Status = "Occupied", CreatedAt = at, UpdatedAt = at };
        var allocation = new SlotAllocation { BatchId = farm.BatchId, Slot = slot, AllocatedAt = at, CreatedAt = at };
        var crab = new CrabItem { BatchId = farm.BatchId, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), Status = "Growing", StockedAt = at, CreatedAt = at, UpdatedAt = at };
        db.CrabItems.Add(crab); await db.SaveChangesAsync(); return farm with { SlotId = slot.SlotId, SlotCode = slotCode, CrabId = crab.CrabItemId };
    });
    private Task<int> AuditCount(Farm farm) => Db(db => db.AuditLogs.CountAsync(a => a.ActorUserId == farm.UserId));
    private static string RecordPath(long id) => $"/api/harvests/{id}/crabs";
    private static string ContextPath(Farm farm) => $"/api/batches/{farm.Code}/harvest-context?slotCode={farm.SlotCode}";
    private static async Task<JsonElement> Complete(HttpClient client, JsonElement harvest) => await Success(await client.PostAsJsonAsync($"/api/harvests/{harvest.GetProperty("id").GetInt64()}/complete", new { expectedRevision = harvest.GetProperty("revision").GetInt32() }));

    [Fact]
    public async Task Owner_starts_and_staff_records_but_cannot_start_edit_or_complete()
    {
        var farm = await Setup(); var staff = await Member(farm); using var ownerClient = Client(farm.UserId); using var staffClient = Client(staff);
        await Failure(await staffClient.PostAsJsonAsync(StartPath(farm), StartInput()), HttpStatusCode.Forbidden);
        var started = await Start(ownerClient, farm); var id = started.GetProperty("id").GetInt64();
        var context = await staffClient.GetFromJsonAsync<JsonElement>(ContextPath(farm));
        Assert.False(context.GetProperty("canStart").GetBoolean()); Assert.True(context.GetProperty("canRecord").GetBoolean()); Assert.False(context.GetProperty("canComplete").GetBoolean());
        Assert.Equal(farm.CrabId, context.GetProperty("currentCrab").GetProperty("id").GetInt64());
        Assert.True(context.GetProperty("currentCrab").GetProperty("allocationId").GetInt64() > 0);
        await Record(staffClient, id, RecordInput(farm));
        await Failure(await staffClient.PostAsJsonAsync($"/api/harvests/{id}/complete", new { expectedRevision = 1 }), HttpStatusCode.Forbidden);
        await Failure(await staffClient.PatchAsJsonAsync($"/api/harvests/{id}", new { expectedRevision = 1, name = "Edit", note = "No" }), HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Foreign_operator_and_mismatched_operator_claim_have_no_access()
    {
        var farm = await Setup(); var foreign = await Setup(); using var owner = Client(farm.UserId); var harvest = await Start(owner, farm); var id = harvest.GetProperty("id").GetInt64();
        using var outsider = Client(foreign.UserId);
        foreach (var path in new[] { ContextPath(farm), $"/api/harvests/{id}", RecordPath(id), StartPath(farm) })
            await Failure(await outsider.GetAsync(path), HttpStatusCode.Forbidden);
        await Failure(await outsider.PostAsJsonAsync(RecordPath(id), RecordInput(farm)), HttpStatusCode.Forbidden);
        using var staleClaim = Client(farm.UserId, claimedOperator: foreign.OperatorId);
        await Failure(await staleClaim.GetAsync(ContextPath(farm)), HttpStatusCode.Forbidden);
        using var investor = Client(farm.UserId, Roles.Investor);
        await Failure(await investor.PostAsJsonAsync(StartPath(farm), StartInput()), HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("PendingApproval")]
    [InlineData("Funding")]
    [InlineData("Settlement")]
    [InlineData("Closed")]
    public async Task Start_rejects_batches_outside_production_and_harvesting(string status)
    {
        var farm = await Setup(status); using var client = Client(farm.UserId);
        await Failure(await client.PostAsJsonAsync(StartPath(farm), StartInput()), HttpStatusCode.UnprocessableEntity);
        Assert.Equal(0, await Db(db => db.Harvests.CountAsync(h => h.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Start_aliases_replay_completed_session_and_new_session_preserves_first_timestamp()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var firstRequest = StartInput(); var first = await Start(client, farm, firstRequest);
        var timestamp = await Db(db => db.Batches.Where(b => b.BatchId == farm.BatchId).Select(b => b.HarvestStartedAt).SingleAsync());
        Assert.NotNull(timestamp); var aliasRequest = StartInput();
        var alias = await Success(await client.PostAsJsonAsync(StartPath(farm), aliasRequest));
        Assert.Equal(first.GetProperty("id").GetInt64(), alias.GetProperty("id").GetInt64());
        await Complete(client, first); var auditCount = await AuditCount(farm);
        var repeatedComplete = await Complete(client, first); Assert.Equal("Completed", repeatedComplete.GetProperty("status").GetString()); Assert.Equal(auditCount, await AuditCount(farm));
        foreach (var request in new[] { firstRequest, aliasRequest })
        {
            var replay = await Success(await client.PostAsJsonAsync(StartPath(farm), request));
            Assert.Equal(first.GetProperty("id").GetInt64(), replay.GetProperty("id").GetInt64()); Assert.Equal("Completed", replay.GetProperty("status").GetString());
        }
        var second = await Start(client, farm); Assert.NotEqual(first.GetProperty("id").GetInt64(), second.GetProperty("id").GetInt64());
        Assert.Equal(timestamp, await Db(db => db.Batches.Where(b => b.BatchId == farm.BatchId).Select(b => b.HarvestStartedAt).SingleAsync()));
        Assert.Equal("Harvesting", await Db(db => db.Batches.Where(b => b.BatchId == farm.BatchId).Select(b => b.Status).SingleAsync()));
        Assert.Equal(2, await Db(db => db.Harvests.CountAsync(h => h.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Metadata_is_trimmed_versioned_and_cannot_change_after_completion()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var harvest = await Start(client, farm, new { requestId = Guid.NewGuid(), name = "  Morning  ", note = "  Area A  " }); var id = harvest.GetProperty("id").GetInt64();
        Assert.Equal("Morning", harvest.GetProperty("name").GetString()); Assert.Equal("Area A", harvest.GetProperty("note").GetString());
        var payload = new { expectedRevision = harvest.GetProperty("revision").GetInt32(), name = "  Afternoon  ", note = "  Area B  " };
        var edited = await Success(await client.PatchAsJsonAsync($"/api/harvests/{id}", payload));
        Assert.Equal("Afternoon", edited.GetProperty("name").GetString()); Assert.Equal(payload.expectedRevision + 1, edited.GetProperty("revision").GetInt32());
        await Failure(await client.PatchAsJsonAsync($"/api/harvests/{id}", payload), HttpStatusCode.Conflict);
        await Complete(client, edited);
        await Failure(await client.PatchAsJsonAsync($"/api/harvests/{id}", new { expectedRevision = edited.GetProperty("revision").GetInt32() + 1, name = "Closed", note = "No" }), HttpStatusCode.UnprocessableEntity);
    }
}

