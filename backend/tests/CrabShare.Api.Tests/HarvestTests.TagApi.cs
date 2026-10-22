using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Net.Http.Headers;
using CrabShare.Api.Features.Harvest;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using CrabShare.Api.Common.Auditing;
using Microsoft.Extensions.Logging;

namespace CrabShare.Api.Tests;

public partial class HarvestTests
{
    private sealed class TraceLogProvider : ILoggerProvider
    {
        private readonly List<string> _messages = [];
        public IReadOnlyList<string> Messages { get { lock (_messages) return _messages.ToArray(); } }
        public ILogger CreateLogger(string categoryName) => new TraceLogger(_messages);
        public void Dispose() { }

        private sealed class TraceLogger(List<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Warning;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                if (!IsEnabled(logLevel)) return;
                lock (messages) messages.Add(formatter(state, exception));
            }
        }
    }

    [Fact]
    public async Task Trace_is_anonymous_and_returns_allowlist_with_one_scan()
    {
        var (farm, code) = await HarvestOne();
        using var operatorClient = Client(farm.UserId);
        var evidenceId = await AcceptedEvidence(farm);
        using (var activation = await operatorClient.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId }))
            Assert.Equal(HttpStatusCode.OK, activation.StatusCode);

        using var anonymousClient = fixture.Factory.CreateClient();
        using var response = await anonymousClient.GetAsync($"/api/trace/{code}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymousClient.GetAsync($"/api/tags/{code}/label")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymousClient.GetAsync($"/api/batches/{farm.Code}/harvests")).StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(code, json.GetProperty("tagCode").GetString());
        Assert.Equal("0001", json.GetProperty("slotCode").GetString());
        Assert.Equal((short)250, json.GetProperty("weightG").GetInt16());
        Assert.Equal("L3", json.GetProperty("gradeCode").GetString());
        Assert.False(json.TryGetProperty("operatorName", out _));
        Assert.False(json.TryGetProperty("farmAddress", out _));
        Assert.False(json.TryGetProperty("itemUuid", out _));
        Assert.False(json.TryGetProperty("harvestPhotoUri", out _));
        Assert.False(json.TryGetProperty("orderNo", out _));
        Assert.All(json.GetProperty("events").EnumerateArray(), e =>
        {
            Assert.False(e.TryGetProperty("note", out _));
        });

        var scan = await Db(db => db.TagScans.Where(s => s.Tag.TagCode == code)
            .Select(s => new { s.ScannedBy, s.IsOrderOwner }).SingleAsync());
        Assert.Null(scan.ScannedBy);
        Assert.False(scan.IsOrderOwner);
    }

    [Fact]
    public async Task Trace_rejects_malformed_and_inactive_tags_without_recording_scans()
    {
        var printedCode = (await HarvestOne()).Code;
        var (voidFarm, voidCode) = await HarvestOne();
        using var voidingClient = Client(voidFarm.UserId);
        using (var voided = await voidingClient.PostAsJsonAsync($"/api/tags/{voidCode}/void", new { reason = "Tem test bị hỏng" }))
            Assert.Equal(HttpStatusCode.OK, voided.StatusCode);

        using var anonymousClient = fixture.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymousClient.GetAsync("/api/trace/invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymousClient.GetAsync("/api/trace/23456789ABCD")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await anonymousClient.GetAsync($"/api/trace/{printedCode}")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await anonymousClient.GetAsync($"/api/trace/{voidCode}")).StatusCode);
        Assert.Equal(0, await Db(db => db.TagScans.CountAsync(s => s.Tag.TagCode == printedCode || s.Tag.TagCode == voidCode)));
    }

    [Fact]
    public async Task Trace_scan_write_failure_does_not_fail_lookup()
    {
        var (farm, code) = await HarvestOne();
        using var operatorClient = Client(farm.UserId);
        var evidenceId = await AcceptedEvidence(farm);
        using (var activation = await operatorClient.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId }))
            Assert.Equal(HttpStatusCode.OK, activation.StatusCode);

        await Db(db => db.Database.ExecuteSqlRawAsync("CREATE TRIGGER dbo.cs82_trace_scan_failure ON dbo.tag_scan AFTER INSERT AS BEGIN THROW 51082, 'CS82 test scan failure', 1; END"));
        try
        {
            var logs = new TraceLogProvider();
            using var testFactory = fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureLogging(logging => logging.AddProvider(logs)));
            using var anonymousClient = testFactory.CreateClient();
            using var response = await anonymousClient.GetAsync($"/api/trace/{code}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("CS82 test scan failure", body, StringComparison.Ordinal);
            Assert.Contains(logs.Messages, message => message.Contains("Trace scan logging failed", StringComparison.Ordinal));
            Assert.Equal(0, await Db(db => db.TagScans.CountAsync(s => s.Tag.TagCode == code)));
        }
        finally
        {
            await Db(db => db.Database.ExecuteSqlRawAsync("DROP TRIGGER dbo.cs82_trace_scan_failure"));
        }
    }

    private async Task<(Farm Farm, string Code)> HarvestOne()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var harvest = await Start(client, farm);
        var recorded = await Record(client, harvest.GetProperty("id").GetInt64(), RecordInput(farm));
        return (farm, recorded.GetProperty("tagCode").GetString()!);
    }
    private Task<long> AcceptedEvidence(Farm farm, long? crabItemId = null) => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var evidence = new Evidence { BatchId = farm.BatchId, CrabItemId = crabItemId ?? farm.CrabId, Source = "InAppCapture", MediaType = "Photo",
            FileUri = $"tag-tests/{Guid.NewGuid():N}.jpg", Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            CapturedAt = now, ReceivedAt = now, Latitude = 10.1m, Longitude = 106.1m, ReviewStatus = "Accepted", CreatedAt = now };
        db.Evidences.Add(evidence); await db.SaveChangesAsync(); return evidence.EvidenceId;
    });

    [Fact]
    public async Task Database_enforces_active_tag_evidence_check_and_evidence_crab_foreign_key()
    {
        var farm = await Setup();
        var evidenceId = await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var evidence = new Evidence { BatchId = farm.BatchId, SlotId = farm.SlotId, Source = "InAppCapture", MediaType = "Photo",
                FileUri = $"tag-tests/{Guid.NewGuid():N}.jpg", Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
                CapturedAt = now, ReceivedAt = now, Latitude = 10.1m, Longitude = 106.1m, ReviewStatus = "Accepted", CreatedAt = now };
            db.Evidences.Add(evidence); await db.SaveChangesAsync(); return evidence.EvidenceId;
        });
        var badActive = await Assert.ThrowsAsync<SqlException>(() => Db(db => db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT dbo.crab_tag(crab_item_id,tag_code,status,printed_at,printed_by,activated_at,activation_evidence_id)
            VALUES({farm.CrabId},{"23456789ABXY"},'Active',{DateTimeOffset.UtcNow},{farm.UserId},{DateTimeOffset.UtcNow},NULL)
            """)));
        Assert.Contains("ck_crab_tag_active", badActive.Message, StringComparison.OrdinalIgnoreCase);
        var badFk = await Assert.ThrowsAsync<SqlException>(() => Db(db => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE dbo.evidence SET crab_item_id={long.MaxValue} WHERE evidence_id={evidenceId}")));
        Assert.Equal(547, badFk.Number);
        Assert.Null(await Db(db => db.Evidences.Where(e => e.EvidenceId == evidenceId).Select(e => e.CrabItemId).SingleAsync()));
    }

    [Fact]
    public async Task Tag_list_and_label_are_scoped_and_use_configured_trace_base()
    {
        var (farm, code) = await HarvestOne(); using var client = Client(farm.UserId);
        var page = await client.GetFromJsonAsync<JsonElement>("/api/tags?status=Printed&page=1&pageSize=20");
        Assert.Equal(1, page.GetProperty("total").GetInt32());
        Assert.Equal(code, page.GetProperty("items")[0].GetProperty("tagCode").GetString());
        var label = await client.GetFromJsonAsync<JsonElement>($"/api/tags/{code}/label");
        Assert.Equal(code, label.GetProperty("tagCode").GetString());
        Assert.Equal($"http://localhost:5173/truy-xuat/{code}", label.GetProperty("traceUrl").GetString());
    }

    [Fact]
    public async Task Evidence_upload_can_use_printed_tag_after_harvest_releases_its_box()
    {
        var (farm, code) = await HarvestOne(); using var client = Client(farm.UserId); using var form = new MultipartFormDataContent();
        form.Add(new StringContent(code), "tagCode");
        form.Add(new StringContent(DateTimeOffset.UtcNow.AddSeconds(-1).ToString("O")), "capturedAt");
        form.Add(new StringContent("10.123456"), "latitude"); form.Add(new StringContent("106.654321"), "longitude");
        var file = new ByteArrayContent(EvidenceImages.Noise(1966)); file.Headers.ContentType = new MediaTypeHeaderValue("image/png"); form.Add(file, "image", "harvest.png");
        using var response = await client.PostAsync("/api/evidence", form); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var uploaded = await response.Content.ReadFromJsonAsync<JsonElement>(); var evidenceId = uploaded.GetProperty("id").GetInt64();
        var evidence = await Db(db => db.Evidences.AsNoTracking().SingleAsync(e => e.EvidenceId == evidenceId));
        Assert.Equal(farm.CrabId, evidence.CrabItemId); Assert.Equal(farm.BatchId, evidence.BatchId); Assert.Equal(farm.SlotId, evidence.SlotId);
    }

    [Fact]
    public async Task Accepted_matching_photo_activates_idempotently_and_trace_requires_active_tag()
    {
        var (farm, code) = await HarvestOne();
        var evidenceId = await AcceptedEvidence(farm);
        using var client = Client(farm.UserId);
        var before = await client.GetAsync($"/api/trace/{code}"); Assert.Equal(HttpStatusCode.UnprocessableEntity, before.StatusCode);
        var activated = await client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId }); Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
        Assert.Equal("Active", (await activated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId })).StatusCode);
        Assert.Equal(1, await Db(db => db.CrabItemEvents.CountAsync(e => e.Tag!.TagCode == code && e.EventType == "TagActivated")));
        var trace = await client.GetAsync($"/api/trace/{code}"); Assert.Equal(HttpStatusCode.OK, trace.StatusCode); Assert.True(trace.Headers.CacheControl!.NoStore);
        var foreignEvidence = evidenceId + 100;
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId = foreignEvidence })).StatusCode);
    }

    [Fact]
    public async Task Foreign_evidence_id_is_indistinguishable_from_missing_evidence()
    {
        var (farm, code) = await HarvestOne(); var foreign = await Setup(); var evidenceId = await AcceptedEvidence(foreign);
        using var client = Client(farm.UserId);
        var response = await client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("evidence_ineligible", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Concurrent_same_evidence_activation_is_idempotent()
    {
        var (farm, code) = await HarvestOne(); var evidenceId = await AcceptedEvidence(farm); using var client = Client(farm.UserId);
        var results = await Task.WhenAll(
            client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId }),
            client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId }));
        Assert.All(results, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(1, await Db(db => db.CrabItemEvents.CountAsync(e => e.Tag!.TagCode == code && e.EventType == "TagActivated")));
        Assert.Equal(1, await Db(db => db.AuditLogs.CountAsync(a => a.EntityType == "CrabTag" && a.ActionType == "ActivateTag" && a.NewValue!.Contains(code))));
    }

    [Fact]
    public async Task Revoked_operator_membership_is_rechecked_after_audit_lock()
    {
        var (farm, code) = await HarvestOne(); var evidenceId = await AcceptedEvidence(farm); using var client = Client(farm.UserId);
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var blocker = scope.ServiceProvider.GetRequiredService<CrabShare.Api.Infrastructure.Persistence.AppDbContext>();
        await using var held = await blocker.Database.BeginTransactionAsync();
        await using (var command = blocker.Database.GetDbConnection().CreateCommand())
        {
            command.Transaction = held.GetDbTransaction();
            command.CommandText = "SELECT TOP (1) audit_id FROM dbo.audit_log WITH (TABLOCKX,HOLDLOCK) ORDER BY audit_id DESC";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) { }
        }
        var pending = client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId });
        await Task.Delay(300);
        await Db(async db => { db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == farm.UserId && r.RoleCode == "OperatorMember")); await db.SaveChangesAsync(); return true; });
        await held.CommitAsync();
        using var response = await pending;
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Printed", await Db(db => db.CrabTags.Where(t => t.TagCode == code).Select(t => t.Status).SingleAsync()));
    }

    [Theory]
    [InlineData("Watch", "Photo", "InAppCapture", false)]
    [InlineData("Flagged", "Photo", "InAppCapture", false)]
    [InlineData("Rejected", "Photo", "InAppCapture", false)]
    [InlineData("Accepted", "Video", "InAppCapture", false)]
    [InlineData("Accepted", "Photo", "FarmApi", false)]
    [InlineData("Accepted", "Photo", "InAppCapture", true)]
    public async Task Ineligible_evidence_does_not_activate_tag(string status, string media, string source, bool wrongCrab)
    {
        var (farm, code) = await HarvestOne();
        var crabId = wrongCrab ? (await AddCrab(farm, "0002")).CrabId : farm.CrabId;
        var evidenceId = await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var evidence = new Evidence { BatchId = farm.BatchId, CrabItemId = crabId, Source = source, MediaType = media,
                FileUri = $"tag-tests/{Guid.NewGuid():N}.jpg", Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
                CapturedAt = now, ReceivedAt = now, Latitude = 10.1m, Longitude = 106.1m, ReviewStatus = status, CreatedAt = now };
            db.Evidences.Add(evidence); await db.SaveChangesAsync(); return evidence.EvidenceId;
        });
        using var client = Client(farm.UserId);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId })).StatusCode);
        Assert.Equal("Printed", await Db(db => db.CrabTags.Where(t => t.TagCode == code).Select(t => t.Status).SingleAsync()));
    }

    [Fact]
    public async Task Owner_can_void_and_replace_in_stock_tag_but_void_code_has_no_trace()
    {
        var (farm, code) = await HarvestOne(); using var client = Client(farm.UserId);
        var response = await client.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "  Label damaged  " });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Void", body.GetProperty("voidedTag").GetProperty("status").GetString());
        var replacement = body.GetProperty("replacementTag").GetProperty("tagCode").GetString()!;
        Assert.NotEqual(code, replacement);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.GetAsync($"/api/trace/{code}")).StatusCode);
        Assert.Equal("Printed", await Db(db => db.CrabTags.Where(t => t.TagCode == replacement).Select(t => t.Status).SingleAsync()));
        Assert.Null(await Db(db => db.CrabTags.Where(t => t.TagCode == replacement).Select(t => t.ActivationEvidenceId).SingleAsync()));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "again" })).StatusCode);
    }

    [Fact]
    public async Task Replacement_retries_only_a_duplicate_tag_code()
    {
        var (farm, _) = await HarvestOne(); var (_, occupied) = await HarvestOne(); var free = new HarvestTagCodeGenerator().NewCode();
        var codes = new Codes(occupied, free);
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<IHarvestTagCodeGenerator>(); s.AddSingleton<IHarvestTagCodeGenerator>(codes); }));
        using var client = factory.CreateClient(); Authenticate(client, farm.UserId);
        var response = await client.PostAsJsonAsync($"/api/tags/{(await Db(db => db.CrabTags.Where(t => t.CrabItemId == farm.CrabId).Select(t => t.TagCode).SingleAsync()))}/void", new { reason = "Damaged" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(free, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("replacementTag").GetProperty("tagCode").GetString());
        Assert.Equal(2, codes.Calls);
    }

    [Fact]
    public async Task Invalid_generated_tag_code_does_not_void_original_tag()
    {
        var (farm, code) = await HarvestOne(); var codes = new Codes("not-a-valid-code");
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<IHarvestTagCodeGenerator>(); s.AddSingleton<IHarvestTagCodeGenerator>(codes); }));
        using var client = factory.CreateClient(); Authenticate(client, farm.UserId);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "Damaged" })).StatusCode);
        Assert.Equal("Printed", await Db(db => db.CrabTags.Where(t => t.TagCode == code).Select(t => t.Status).SingleAsync()));
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
    }

    [Fact]
    public async Task Concurrent_void_requests_create_only_one_replacement()
    {
        var (farm, code) = await HarvestOne(); using var client = Client(farm.UserId);
        var responses = await Task.WhenAll(
            client.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "Damaged" }),
            client.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "Damaged" }));
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId && t.Status != "Void")));
        Assert.Equal(1, await Db(db => db.CrabItemEvents.CountAsync(e => e.CrabItemId == farm.CrabId && e.EventType == "TagVoided")));
    }

    private sealed class RejectTagAudit : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<AuditLog>().Any(e => e.State == EntityState.Added)) throw new InvalidOperationException("Injected tag audit failure");
            return base.SavingChangesAsync(eventData, result, ct);
        }
    }

    [Fact]
    public async Task Audit_failure_rolls_back_void_and_replacement()
    {
        var (farm, code) = await HarvestOne();
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddDbContext<CrabShare.Api.Infrastructure.Persistence.AppDbContext>(o => o.AddInterceptors(new RejectTagAudit()))));
        using var client = factory.CreateClient(); Authenticate(client, farm.UserId);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "Damaged" })).StatusCode);
        Assert.Equal("Printed", await Db(db => db.CrabTags.Where(t => t.TagCode == code).Select(t => t.Status).SingleAsync()));
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
        Assert.False(await Db(db => db.CrabItemEvents.AnyAsync(e => e.CrabItemId == farm.CrabId && e.EventType == "TagVoided")));
    }

    [Fact]
    public async Task Tag_routes_hide_foreign_tags_and_staff_cannot_void()
    {
        var (farm, code) = await HarvestOne(); var otherFarm = await Setup(); using var foreign = Client(otherFarm.UserId);
        Assert.Equal(HttpStatusCode.NotFound, (await foreign.GetAsync($"/api/tags/{code}/label")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await foreign.PostAsJsonAsync($"/api/tags/{code}/activate", new { evidenceId = 1 })).StatusCode);
        var staff = await Member(farm); using var staffClient = Client(staff);
        Assert.Equal(HttpStatusCode.Forbidden, (await staffClient.PostAsJsonAsync($"/api/tags/{code}/void", new { reason = "not owner" })).StatusCode);
        Assert.Equal("Printed", await Db(db => db.CrabTags.Where(t => t.TagCode == code).Select(t => t.Status).SingleAsync()));
    }
}
