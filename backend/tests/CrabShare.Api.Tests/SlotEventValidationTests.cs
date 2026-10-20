using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class SlotEventTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(-1)]
    public async Task Quantity_must_be_exactly_one_and_invalid_requests_do_not_write(int quantity)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(farm); input["quantity"] = quantity;
        await Failure(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
        Assert.Equal(0, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId))); Assert.Equal(0, await AuditCount(farm));
    }

    [Theory]
    [InlineData("requestId", null)]
    [InlineData("requestId", "not-a-uuid")]
    [InlineData("eventType", "Harvested")]
    [InlineData("occurredAt", "2026-10-19T10:00:00")]
    [InlineData("evidenceId", 1)]
    [InlineData("destinationSlotCode", "0002")]
    [InlineData("replacesCrabItemId", 1)]
    public async Task Required_request_identity_offset_and_event_specific_fields_are_validated(string field, object? value)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(farm);
        if (value is null) input.Remove(field); else input[field] = value;
        await Failure(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("Mortality")]
    [InlineData("Restocked")]
    [InlineData("Relocated")]
    public async Task Events_require_their_corresponding_evidence_replacement_or_destination(string type)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Failure(await client.PostAsJsonAsync(Path(farm), Input(farm, type)), HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Future_and_before_stocking_or_last_event_timestamps_are_rejected()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Failure(await client.PostAsJsonAsync(Path(farm), Input(farm, occurredAt: DateTimeOffset.UtcNow.AddDays(1))), HttpStatusCode.UnprocessableEntity);
        await Failure(await client.PostAsJsonAsync(Path(farm), Input(farm, occurredAt: farm.StockedAt.AddSeconds(-1))), HttpStatusCode.UnprocessableEntity);
        await Success(await client.PostAsJsonAsync(Path(farm), Input(farm, occurredAt: DateTimeOffset.UtcNow.AddMinutes(-1))));
        await Failure(await client.PostAsJsonAsync(Path(farm), Input(farm, occurredAt: DateTimeOffset.UtcNow.AddMinutes(-2))), HttpStatusCode.UnprocessableEntity);
        var recentSlot = await AddSlot(farm, "0002", growing: true, allocatedAt: DateTimeOffset.UtcNow.AddMinutes(-1));
        var beforeAllocation = Input(farm, occurredAt: DateTimeOffset.UtcNow.AddMinutes(-2)); beforeAllocation["slotCode"] = recentSlot.Code;
        await Failure(await client.PostAsJsonAsync(Path(farm), beforeAllocation), HttpStatusCode.UnprocessableEntity);
        Assert.Equal(1, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId)));
    }

    [Theory]
    [InlineData("Draft")]
    [InlineData("Funding")]
    [InlineData("Settlement")]
    [InlineData("Closed")]
    public async Task Inactive_batch_cannot_record_events_even_with_a_growing_registry_crab(string status)
    {
        var farm = await Setup(status); using var client = Client(farm.UserId);
        await Failure(await client.PostAsJsonAsync(Path(farm), Input(farm)), HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Ownership_role_and_approved_operator_are_checked_from_database()
    {
        var farm = await Setup(); var other = await Setup();
        using var anonymous = fixture.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync(Path(farm), Input(farm))).StatusCode);
        using var investor = Client(farm.UserId, Roles.Investor);
        Assert.Equal(HttpStatusCode.Forbidden, (await investor.PostAsJsonAsync(Path(farm), Input(farm))).StatusCode);
        using var crossFarm = Client(other.UserId, claimedOperator: farm.OperatorId);
        await Failure(await crossFarm.PostAsJsonAsync(Path(farm), Input(farm)), HttpStatusCode.Forbidden);
        using var client = Client(farm.UserId);
        await Db(async db => { var op = await db.Operators.FindAsync(farm.OperatorId); op!.Status = "Suspended"; await db.SaveChangesAsync(); return true; });
        await Failure(await client.PostAsJsonAsync(Path(farm), Input(farm)), HttpStatusCode.UnprocessableEntity);
    }

    [Theory]
    [InlineData("FarmApi", "Photo", "Watch", true)]
    [InlineData("InAppCapture", "Video", "Watch", true)]
    [InlineData("InAppCapture", "Photo", "Rejected", true)]
    [InlineData("InAppCapture", "Photo", "Watch", false)]
    public async Task Mortality_rejects_non_camera_non_photo_rejected_and_missing_gps_evidence(string source, string media, string review, bool gps)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var input = Input(farm, "Mortality"); input["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2), source, review, media: media, gps: gps);
        await Failure(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.UnprocessableEntity);
        Assert.Equal("Growing", await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.Status).SingleAsync()));
    }

    [Fact]
    public async Task Evidence_must_match_batch_slot_and_current_allocation_period_and_be_unused()
    {
        var farm = await Setup(); var other = await Setup(); using var client = Client(farm.UserId);
        var second = await AddSlot(farm, "0002");
        var photos = new[] { await Photo(other, DateTimeOffset.UtcNow.AddMinutes(-2)), await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2), slotId: second.Id), await Photo(farm, farm.StockedAt.AddSeconds(-1)) };
        foreach (var photo in photos)
        {
            var invalid = Input(farm, "Mortality"); invalid["evidenceId"] = photo;
            await Failure(await client.PostAsJsonAsync(Path(farm), invalid), HttpStatusCode.UnprocessableEntity);
        }
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK);
        var death = await Die(client, farm);
        var restock = Input(farm, "Restocked"); restock["replacesCrabItemId"] = farm.CrabId; restock["evidenceId"] = death.GetProperty("evidenceId").GetInt64();
        await Failure(await client.PostAsJsonAsync(Path(farm), restock), HttpStatusCode.Conflict);
        restock["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-3)); // Before the death.
        await Failure(await client.PostAsJsonAsync(Path(farm), restock), HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Replacement_is_explicit_and_confined_to_the_dead_crabs_original_slot_and_batch()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK); await Die(client, farm);
        var empty = await AddSlot(farm, "0002"); var restock = Input(farm, "Restocked");
        restock["slotCode"] = empty.Code; restock["replacesCrabItemId"] = farm.CrabId; restock["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddSeconds(-90), slotId: empty.Id);
        await Failure(await client.PostAsJsonAsync(Path(farm), restock), HttpStatusCode.UnprocessableEntity);
        var other = await Setup(); restock["slotCode"] = farm.SlotCode; restock["replacesCrabItemId"] = other.CrabId;
        restock["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddSeconds(-90));
        await Failure(await client.PostAsJsonAsync(Path(farm), restock), HttpStatusCode.UnprocessableEntity);
        Assert.Equal(1, await Db(db => db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Relocation_requires_available_same_operator_destination_and_respects_destination_history()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var occupied = await AddSlot(farm, "0002", growing: true); var move = Input(farm, "Relocated"); move["destinationSlotCode"] = occupied.Code;
        await Failure(await client.PostAsJsonAsync(Path(farm), move), HttpStatusCode.UnprocessableEntity);
        move["destinationSlotCode"] = farm.SlotCode; await Failure(await client.PostAsJsonAsync(Path(farm), move), HttpStatusCode.UnprocessableEntity);
        move["destinationSlotCode"] = "9999"; await Failure(await client.PostAsJsonAsync(Path(farm), move), HttpStatusCode.NotFound);
        var available = await AddSlot(farm, "0003", growing: true);
        var otherSlotFarm = farm with { SlotId = available.Id, SlotCode = available.Code };
        await Die(client, otherSlotFarm, DateTimeOffset.UtcNow.AddSeconds(-20));
        move["destinationSlotCode"] = available.Code; move["occurredAt"] = DateTimeOffset.UtcNow.AddMinutes(-1);
        await Failure(await client.PostAsJsonAsync(Path(farm), move), HttpStatusCode.UnprocessableEntity);
    }
}
