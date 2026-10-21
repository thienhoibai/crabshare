using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

public partial class ProductionLogTests
{
    private static string TimelinePath(Farm farm) => $"/api/batches/{farm.Code}/timeline";

    [Fact]
    public async Task Timeline_empty_has_explicit_end_and_private_cache_headers()
    {
        var farm = await Setup(false); using var client = Client(farm.UserId);
        using var response = await client.GetAsync(TimelinePath(farm));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Empty(page.GetProperty("groups").EnumerateArray());
        Assert.False(page.GetProperty("hasMore").GetBoolean());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("nextBefore").ValueKind);
        Assert.Equal("Asia/Ho_Chi_Minh", page.GetProperty("timeZone").GetString());
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Theory]
    [InlineData("Confirmed", true)] [InlineData("share", true)]
    [InlineData("Reserved", false)] [InlineData("Expired", false)]
    [InlineData("Refunded", false)] [InlineData("none", false)]
    public async Task Timeline_investor_access_uses_current_eligible_interest(string interest, bool allowed)
    {
        var farm = await Setup(false); var investor = await fixture.CreateInvestorAsync();
        await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            db.AppUserRoles.Add(new AppUserRole { UserId = investor, RoleCode = Roles.Investor, GrantedAt = now });
            if (interest == "share") db.CapitalShares.Add(new CapitalShare { BatchId = farm.BatchId, InvestorId = investor, ConfirmedAmount = 10, SnapshottedAt = now });
            else if (interest != "none") db.Contributions.Add(new Contribution { BatchId = farm.BatchId, InvestorId = investor, Status = interest, Amount = 10, ReservedAt = now, ExpiresAt = now.AddHours(1), ConfirmedAt = interest == "Confirmed" ? now : null, CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        using var client = Client(investor, Roles.Investor);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync(TimelinePath(farm))).StatusCode);
        var other = await Setup(false);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(TimelinePath(other))).StatusCode);
        await Db(async db => { db.AppUserRoles.RemoveRange(await db.AppUserRoles.Where(r => r.UserId == investor).ToListAsync()); await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(TimelinePath(farm))).StatusCode);
    }

    [Fact]
    public async Task Timeline_owner_staff_admin_and_current_membership_are_enforced()
    {
        var farm = await Setup(false); var other = await Setup(false); var staff = await AddStaff(farm);
        using var owner = Client(farm.UserId); using var worker = Client(staff); using var foreign = Client(other.UserId);
        using var anonymous = fixture.Factory.CreateClient(); using var mismatched = Client(farm.UserId, claimedOperator: other.OperatorId);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(TimelinePath(farm))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await worker.GetAsync(TimelinePath(farm))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await foreign.GetAsync(TimelinePath(farm))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await mismatched.GetAsync(TimelinePath(farm))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(TimelinePath(farm))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync("/api/batches/DOES-NOT-EXIST/timeline")).StatusCode);
        var admin = await Db(async db => { var user = NewUser("Timeline Admin", Roles.PlatformAdmin, DateTimeOffset.UtcNow); db.AppUsers.Add(user); await db.SaveChangesAsync(); return user.UserId; });
        using var adminClient = Client(admin, Roles.PlatformAdmin);
        Assert.Equal(HttpStatusCode.OK, (await adminClient.GetAsync(TimelinePath(farm))).StatusCode);
        await Db(async db => { (await db.AppUsers.SingleAsync(u => u.UserId == admin)).Status = "Locked"; db.OperatorMembers.RemoveRange(await db.OperatorMembers.Where(m => m.UserId == staff).ToListAsync()); await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await adminClient.GetAsync(TimelinePath(farm))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await worker.GetAsync(TimelinePath(farm))).StatusCode);
    }

    private async Task<long> TimelineSeed(Farm farm)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var bytes = EvidenceImages.Png();
        var stored = await scope.ServiceProvider.GetRequiredService<IFileStorage>().SaveAsync(new MemoryStream(bytes), "timeline.png", "image/png", "timeline-tests", default);
        return await Db(async db =>
        {
            var at = DateTimeOffset.Parse("2026-10-19T17:10:00Z");
            db.ProductionLogs.Add(new ProductionLog { BatchId = farm.BatchId, LogDate = new(2026, 10, 20), Source = "Manual", Ph = 7.5m, WaterTempC = 28, SalinityPpt = 20, FeedKg = 1.25m, PlausibilityFlag = "Ok", CreatedAt = at, ReceivedAt = at });
            db.ProductionLogs.Add(new ProductionLog { BatchId = farm.BatchId, LogDate = new(2026, 10, 18), Source = "Manual", PlausibilityFlag = "Ok", CreatedAt = at, ReceivedAt = at });
            var slot = new PhysicalSlot { OperatorId = farm.OperatorId, SlotCode = "TL001", Status = "Occupied", CreatedAt = at, UpdatedAt = at };
            var allocation = new SlotAllocation { BatchId = farm.BatchId, Slot = slot, AllocatedAt = at.AddDays(-1), CreatedAt = at };
            var ev = new SlotEvent { BatchId = farm.BatchId, SlotAllocation = allocation, EventType = "Molted", Quantity = 1, OccurredAt = at, ReceivedAt = at, Source = "Manual" };
            db.SlotEvents.Add(ev);
            var accepted = new Infrastructure.Persistence.Entities.Evidence { BatchId = farm.BatchId, Slot = slot, SlotEvent = ev, MediaType = "Photo", Source = "InAppCapture", CapturedAt = at, ReceivedAt = at, FileUri = stored.Uri, Sha256 = stored.Sha256, ReviewStatus = "Accepted", Latitude = 10, Longitude = 100 };
            db.Evidences.Add(accepted);
            foreach (var status in new[] { "Flagged", "Watch", "Rejected" })
                db.Evidences.Add(new Infrastructure.Persistence.Entities.Evidence { BatchId = farm.BatchId, MediaType = "Photo", Source = "InAppCapture", CapturedAt = at.AddDays(1), ReceivedAt = at, FileUri = stored.Uri + status, Sha256 = new string('a', 64), ReviewStatus = status });
            db.Alerts.Add(new Alert { BatchId = farm.BatchId, AlertType = "WaterQuality", Severity = "Medium", Message = "Kiểm tra nước", Status = "Acknowledged", RaisedAt = at, AckDeadline = at.AddDays(1), AcknowledgedAt = at.AddHours(1), AcknowledgedBy = farm.UserId, ResponseNote = "PRIVATE-NOTE", CreatedAt = at, UpdatedAt = at });
            db.Alerts.Add(new Alert { BatchId = farm.BatchId, AlertType = "DataSilence", Severity = "Low", Message = "Ngày trước", Status = "Open", RaisedAt = at.AddMinutes(-11), AckDeadline = at.AddDays(1), CreatedAt = at, UpdatedAt = at });
            await db.SaveChangesAsync(); return accepted.EvidenceId;
        });
    }

    [Fact]
    public async Task Timeline_merges_sources_orders_ties_and_pages_whole_vietnam_days()
    {
        var farm = await Setup(false); var evidenceId = await TimelineSeed(farm);
        var other = await Setup(false); await TimelineSeed(other);
        using var client = Client(farm.UserId);
        using var response = await client.GetAsync(TimelinePath(farm) + "?days=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync(); var page = JsonDocument.Parse(raw).RootElement;
        var group = Assert.Single(page.GetProperty("groups").EnumerateArray());
        Assert.Equal("2026-10-20", group.GetProperty("date").GetString());
        var items = group.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(new[] { "Alert", "Evidence", "SlotEvent", "ProductionLog" }, items.Select(i => i.GetProperty("type").GetString()));
        Assert.Equal(4, items.Select(i => i.GetProperty("id").GetString()).Distinct().Count());
        Assert.Equal(evidenceId.ToString(), items[1].GetProperty("sourceId").GetString());
        Assert.Equal(JsonValueKind.Null, items[3].GetProperty("occurredAt").ValueKind);
        Assert.Equal(1.25m, items[3].GetProperty("productionLog").GetProperty("feedKg").GetDecimal());
        Assert.Equal("Acknowledged", items[0].GetProperty("alert").GetProperty("status").GetString());
        foreach (var secret in new[] { "fileUri", "sha256", "latitude", "longitude", "acknowledgedBy", "PRIVATE-NOTE", "recordedBy", other.Code }) Assert.DoesNotContain(secret, raw);
        Assert.True(page.GetProperty("hasMore").GetBoolean()); Assert.Equal("2026-10-20", page.GetProperty("nextBefore").GetString());
        var next = await client.GetFromJsonAsync<JsonElement>(TimelinePath(farm) + "?days=1&before=2026-10-20");
        Assert.Equal("2026-10-19", Assert.Single(next.GetProperty("groups").EnumerateArray()).GetProperty("date").GetString());
        var last = await client.GetFromJsonAsync<JsonElement>(TimelinePath(farm) + "?days=1&before=2026-10-19");
        Assert.Equal("2026-10-18", Assert.Single(last.GetProperty("groups").EnumerateArray()).GetProperty("date").GetString());
        Assert.False(last.GetProperty("hasMore").GetBoolean()); Assert.Equal(JsonValueKind.Null, last.GetProperty("nextBefore").ValueKind);
        var all = await client.GetFromJsonAsync<JsonElement>(TimelinePath(farm));
        Assert.Equal(6, all.GetProperty("groups").EnumerateArray().Sum(g => g.GetProperty("items").GetArrayLength()));
    }

    [Fact]
    public async Task Timeline_file_checks_batch_access_and_current_accepted_state()
    {
        var farm = await Setup(false); var id = await TimelineSeed(farm); var other = await Setup(false);
        using var client = Client(farm.UserId); using var foreign = Client(other.UserId); using var anonymous = fixture.Factory.CreateClient();
        var path = TimelinePath(farm) + $"/evidence/{id}/file";
        using var image = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode); Assert.Equal(EvidenceImages.Png(), await image.Content.ReadAsByteArrayAsync());
        Assert.Equal("image/png", image.Content.Headers.ContentType?.MediaType);
        Assert.True(image.Headers.CacheControl?.NoStore); Assert.Contains("nosniff", image.Headers.GetValues("X-Content-Type-Options"));
        Assert.Equal(HttpStatusCode.Forbidden, (await foreign.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await foreign.GetAsync(TimelinePath(other) + $"/evidence/{id}/file")).StatusCode);
        await Db(async db => { (await db.Evidences.SingleAsync(e => e.EvidenceId == id)).ReviewStatus = "Rejected"; await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData("?days=0")] [InlineData("?days=31")] [InlineData("?before=bad")]
    public async Task Timeline_rejects_invalid_pagination(string query)
    {
        var farm = await Setup(false); using var client = Client(farm.UserId);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(TimelinePath(farm) + query)).StatusCode);
    }
}
