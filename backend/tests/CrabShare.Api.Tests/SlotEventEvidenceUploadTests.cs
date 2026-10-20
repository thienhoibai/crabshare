using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class SlotEventTests
{
    [Theory]
    [InlineData("InProduction")]
    [InlineData("Harvesting")]
    public async Task Restock_camera_upload_accepts_freed_dead_crab_slot_and_links_to_replacement(string status)
    {
        var farm = await Setup(status); using var client = Client(farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK); await Die(client, farm);
        using (var ordinary = EvidenceControllerTests.Upload(farm.Code, farm.SlotCode))
            await Failure(await client.PostAsync("/api/evidence", ordinary), HttpStatusCode.UnprocessableEntity);
        using var capture = EvidenceControllerTests.Upload(farm.Code, farm.SlotCode, EvidenceImages.Noise(9109));
        capture.Add(new StringContent("Restocked"), "slotEventType");
        var uploaded = await Success(await client.PostAsync("/api/evidence", capture));
        var evidenceId = uploaded.GetProperty("id").GetInt64();
        var persisted = await Db(db => db.Evidences.SingleAsync(e => e.EvidenceId == evidenceId));
        Assert.Equal("InAppCapture", persisted.Source); Assert.Equal("Photo", persisted.MediaType);
        Assert.Equal(farm.SlotId, persisted.SlotId); Assert.NotNull(persisted.Latitude); Assert.NotNull(persisted.Longitude);
        Assert.Null(persisted.SlotEventId);
        var context = await client.GetFromJsonAsync<JsonElement>(ContextPath(farm));
        Assert.Contains(context.GetProperty("availableEvidence").EnumerateArray(), e => e.GetProperty("id").GetInt64() == evidenceId);
        var restock = Input(farm, "Restocked", DateTimeOffset.UtcNow); restock["evidenceId"] = evidenceId; restock["replacesCrabItemId"] = farm.CrabId;
        var replacement = await Success(await client.PostAsJsonAsync(Path(farm), restock));
        Assert.Equal(evidenceId, replacement.GetProperty("evidenceId").GetInt64());
        Assert.Equal(replacement.GetProperty("id").GetInt64(), await Db(db => db.Evidences.Where(e => e.EvidenceId == evidenceId).Select(e => e.SlotEventId).SingleAsync()));
        await VerifyAuditChain();
    }

    [Fact]
    public async Task Restock_upload_marker_does_not_allow_arbitrary_available_or_occupied_slots()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var empty = await AddSlot(farm, "0002");
        foreach (var code in new[] { farm.SlotCode, empty.Code })
        {
            using var form = EvidenceControllerTests.Upload(farm.Code, code);
            form.Add(new StringContent("Restocked"), "slotEventType");
            await Failure(await client.PostAsync("/api/evidence", form), HttpStatusCode.UnprocessableEntity);
        }
        Assert.False(await Db(db => db.Evidences.AnyAsync(e => e.BatchId == farm.BatchId)));
    }
}
