using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Boxes;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Detection;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class EvidenceDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Farm(long UserId, long BatchId, string BatchCode, long SlotId, string SlotCode);
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
    private HttpClient Client(long id)
    {
        var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.OperatorMember); return client;
    }
    private Task<Farm> Setup(string role = "Owner") => Db<Farm>(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var user = new AppUser { Email = $"evidence-{Guid.NewGuid():N}@test.local", FullName = "Evidence Operator", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.OperatorMember, GrantedAt = now });
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Evidence Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved" };
        op.OperatorMembers.Add(new OperatorMember { User = user, MemberRole = role, JoinedAt = now });
        var batch = new Batch { BatchCode = "EV-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Evidence Test", Status = "InProduction",
            SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10,
            OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, StockedAt = now.AddDays(-1), CreatedAt = now, UpdatedAt = now };
        var slot = new PhysicalSlot { Operator = op, SlotCode = "0001", Status = "Occupied", CreatedAt = now, UpdatedAt = now };
        db.SlotAllocations.Add(new SlotAllocation { Batch = batch, Slot = slot, AllocatedAt = now.AddHours(-1), CreatedAt = now });
        await db.SaveChangesAsync(); return new(user.UserId, batch.BatchId, batch.BatchCode, slot.SlotId, slot.SlotCode);
    });
    private async Task<EvidenceResponse> Upload(Farm farm, byte[]? bytes = null, long? requestId = null)
    {
        using var client = Client(farm.UserId); using var form = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode, bytes, captureRequestId: requestId);
        var response = await client.PostAsync("/api/evidence", form); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<EvidenceResponse>())!;
    }
    private Task<bool> AssertChain() => Db(async db =>
    {
        string? previous = null;
        foreach (var row in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync())
        { Assert.Equal(previous, row.PrevHash); Assert.Matches("^[0-9a-f]{64}$", row.RowHash); Assert.True(AuditChain.VerifyHash(row)); previous = row.RowHash; }
        return true;
    });

    [Theory]
    [InlineData("Owner")]
    [InlineData("Staff")]
    public async Task Photo_stores_original_bytes_metadata_nullable_detection_and_lowercase_audit(string role)
    {
        var farm = await Setup(role); var bytes = EvidenceImages.Png(reverse: true); var before = DateTimeOffset.UtcNow;
        var result = await Upload(farm, bytes);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(bytes)), result.Sha256);
        Assert.InRange(result.ReceivedAt, before.AddSeconds(-1), DateTimeOffset.UtcNow.AddSeconds(1));
        Assert.Equal(10.123456m, result.Latitude); Assert.Equal(106.654321m, result.Longitude); Assert.Equal("none", result.Detection.ModelVersion);
        Assert.Null(result.Detection.CrabDetected); Assert.Null(result.Detection.Confidence);
        await using var scope = fixture.Factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Evidences.Include(e => e.EvidenceDetections).SingleAsync(e => e.EvidenceId == result.Id);
        Assert.Equal(farm.SlotId, row.SlotId); Assert.Equal("InAppCapture", row.Source); Assert.Equal(result.RiskScore, row.RiskScore);
        var detection = Assert.Single(row.EvidenceDetections); Assert.Null(detection.CrabDetected); Assert.Null(detection.Confidence);
        await using var file = await scope.ServiceProvider.GetRequiredService<IFileStorage>().OpenReadAsync(row.FileUri, default);
        using var buffer = new MemoryStream(); await file.CopyToAsync(buffer); Assert.Equal(bytes, buffer.ToArray());
        await AssertChain();
    }

    [Fact]
    public async Task Exact_duplicate_is_flagged_and_near_duplicate_uses_dHash()
    {
        var farm = await Setup(); var first = await Upload(farm); var same = await Upload(farm); var similar = await Upload(farm, EvidenceImages.Png(tint: 1));
        Assert.NotEqual(first.Id, same.Id); Assert.Equal("Exact", same.DuplicateMatch); Assert.Equal("Flagged", same.ReviewStatus); Assert.Equal(100m, same.RiskScore);
        Assert.Equal("Similar", similar.DuplicateMatch); Assert.Equal("Flagged", similar.ReviewStatus); Assert.NotEqual(first.Sha256, similar.Sha256);
        await AssertChain();
    }

    [Fact]
    public async Task Concurrent_identical_uploads_cannot_both_be_accepted_as_original()
    {
        var farm = await Setup();
        // Bytes not used by previous tests, including a new encoded metadata chunk via color.
        var bytes = EvidenceImages.Noise(873);
        var results = await Task.WhenAll(Upload(farm, bytes), Upload(farm, bytes));
        Assert.Single(results, r => r.DuplicateMatch == "Exact");
        Assert.Single(results, r => r.DuplicateMatch == "None" && r.ReviewStatus == "Accepted");
        Assert.All(results.Where(r => r.DuplicateMatch == "Exact"), r => Assert.Equal("Flagged", r.ReviewStatus));
        await AssertChain();
    }

    [Fact]
    public async Task Foreign_farm_and_released_slot_are_rejected_before_saving_files()
    {
        var own = await Setup(); var other = await Setup();
        using var client = Client(own.UserId); using var form = EvidenceControllerTests.Upload(other.BatchCode, other.SlotCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/evidence", form)).StatusCode);
        await Db(async db => { (await db.SlotAllocations.SingleAsync(a => a.SlotId == own.SlotId)).ReleasedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(); return true; });
        using var released = EvidenceControllerTests.Upload(own.BatchCode, own.SlotCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync("/api/evidence", released)).StatusCode);
        Assert.False(await Db(db => db.Evidences.AnyAsync(e => e.BatchId == own.BatchId || e.BatchId == other.BatchId)));
    }

    [Fact]
    public async Task Corrupt_photo_has_no_database_or_storage_side_effects()
    {
        var farm = await Setup(); var before = Directory.Exists(fixture.StorageRoot) ? Directory.GetFiles(fixture.StorageRoot, "*", SearchOption.AllDirectories).Length : 0;
        using var client = Client(farm.UserId); using var form = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode, [1,2,3]);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/evidence", form)).StatusCode);
        Assert.False(await Db(db => db.Evidences.AnyAsync(e => e.BatchId == farm.BatchId)));
        Assert.Equal(before, Directory.Exists(fixture.StorageRoot) ? Directory.GetFiles(fixture.StorageRoot, "*", SearchOption.AllDirectories).Length : 0);
    }

    [Fact]
    public async Task Box_read_is_paged_and_filters_current_farm_and_live_allocation()
    {
        var own = await Setup(); await Setup();
        using var client = Client(own.UserId);
        var page = (await client.GetFromJsonAsync<PagedResult<BoxResponse>>("/api/boxes?status=Occupied&search=0001&pageSize=1"))!;
        Assert.Equal(1, page.Total); Assert.Equal(own.BatchCode, Assert.Single(page.Items).BatchCode);
        Assert.Empty((await client.GetFromJsonAsync<PagedResult<BoxResponse>>("/api/boxes?page=2&pageSize=1"))!.Items);
    }

    [Fact]
    public async Task Capture_request_validation_and_fulfillment_are_atomic_with_evidence_audit()
    {
        var farm = await Setup();
        var requestId = await Db(async db => { var now = DateTimeOffset.UtcNow; var request = new CaptureRequest { BatchId = farm.BatchId, SlotId = farm.SlotId, Status = "Open", RequestedAt = now.AddMinutes(-10), DueAt = now.AddMinutes(10), CreatedAt = now }; db.CaptureRequests.Add(request); await db.SaveChangesAsync(); return request.CaptureRequestId; });
        var bytes = EvidenceImages.Noise(2211);
        var result = await Upload(farm, bytes, requestId);
        Assert.Equal("Accepted", result.ReviewStatus);
        Assert.Equal("Fulfilled", result.CaptureRequestStatus);
        Assert.Equal(result.CaptureRequestStatus, await Db(async db => (await db.CaptureRequests.SingleAsync(r => r.CaptureRequestId == requestId)).Status));
        await AssertChain();
    }

    [Fact]
    public async Task Duplicate_photo_does_not_satisfy_a_capture_request()
    {
        var farm = await Setup(); var bytes = EvidenceImages.Noise(985); await Upload(farm, bytes);
        var requestId = await Db(async db => { var now = DateTimeOffset.UtcNow; var request = new CaptureRequest { BatchId = farm.BatchId, SlotId = farm.SlotId, Status = "Open", RequestedAt = now.AddMinutes(-10), DueAt = now.AddMinutes(10) }; db.CaptureRequests.Add(request); await db.SaveChangesAsync(); return request.CaptureRequestId; });
        var result = await Upload(farm, bytes, requestId);
        Assert.Equal("Flagged", result.ReviewStatus); Assert.Equal("Open", result.CaptureRequestStatus);
        Assert.False(await Db(db => db.AuditLogs.AnyAsync(a => a.EntityType == "CaptureRequest" && a.EntityId == requestId)));
    }

    [Fact]
    public async Task Expired_or_wrong_capture_request_is_rejected_without_evidence()
    {
        var farm = await Setup();
        var requestId = await Db(async db => { var now = DateTimeOffset.UtcNow; var request = new CaptureRequest { BatchId = farm.BatchId, SlotId = farm.SlotId, Status = "Expired", RequestedAt = now.AddHours(-1), DueAt = now.AddMinutes(-1) }; db.CaptureRequests.Add(request); await db.SaveChangesAsync(); return request.CaptureRequestId; });
        using var client = Client(farm.UserId); using var expired = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode, captureRequestId: requestId);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync("/api/evidence", expired)).StatusCode);
        using var wrong = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode, captureRequestId: long.MaxValue);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/evidence", wrong)).StatusCode);
        Assert.False(await Db(db => db.Evidences.AnyAsync(e => e.BatchId == farm.BatchId)));
    }

    private sealed class User(long id) : ICurrentUser
    { public bool IsAuthenticated => true; public long UserId => id; public long? OperatorId => null; public bool IsInRole(string role) => role == Roles.OperatorMember; public long RequireOperatorId() => throw new NotSupportedException(); }
    private sealed class TestDetector(string mode) : ICrabDetector
    {
        public Task<CrabDetectionResult> DetectAsync(Stream image, CancellationToken ct) => mode switch
        {
            "negative" => Task.FromResult(new CrabDetectionResult(false, 0.98765m, "test-v1")),
            "invalid" => Task.FromResult(new CrabDetectionResult(true, 1.1m, "test-v1")),
            _ => throw new InvalidOperationException("Injected detector outage"),
        };
    }
    [Theory]
    [InlineData("negative", 4101)] [InlineData("invalid", 4102)] [InlineData("outage", 4103)]
    public async Task Detector_is_a_weak_signal_and_outages_keep_a_truthful_unknown_result(string mode, int seed)
    {
        var farm = await Setup();
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<ICrabDetector>(new TestDetector(mode))));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", farm.UserId.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.OperatorMember);
        using var form = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode, EvidenceImages.Noise(seed));
        var response = await client.PostAsync("/api/evidence", form); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<EvidenceResponse>())!;
        Assert.Equal("Accepted", result.ReviewStatus);
        if (mode == "negative") { Assert.False(result.Detection.CrabDetected); Assert.Equal(0.9876m, result.Detection.Confidence); Assert.Equal("test-v1", result.Detection.ModelVersion); Assert.InRange(result.RiskScore, 0.01m, 15m); }
        else { Assert.Null(result.Detection.CrabDetected); Assert.Null(result.Detection.Confidence); Assert.Equal("unavailable", result.Detection.ModelVersion); }
        var saved = await Db(db => db.EvidenceDetections.AsNoTracking().SingleAsync(d => d.EvidenceId == result.Id));
        Assert.Equal(result.Detection.CrabDetected, saved.CrabDetected); Assert.Equal(result.Detection.Confidence, saved.Confidence); Assert.Equal(result.Detection.ModelVersion, saved.ModelVersion);
        await AssertChain();
    }
    [Theory]
    [InlineData("Locked")] [InlineData("NoRole")] [InlineData("NoMembership")]
    public async Task Stale_tokens_cannot_upload_or_list_boxes_after_access_is_revoked(string change)
    {
        var farm = await Setup();
        await Db(async db => {
            if (change == "Locked") (await db.AppUsers.SingleAsync(u => u.UserId == farm.UserId)).Status = "Locked";
            else if (change == "NoRole") db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == farm.UserId));
            else db.OperatorMembers.Remove(await db.OperatorMembers.SingleAsync(m => m.UserId == farm.UserId));
            await db.SaveChangesAsync(); return true;
        });
        using var client = Client(farm.UserId); using var form = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/evidence", form)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/boxes")).StatusCode);
        Assert.False(await Db(db => db.Evidences.AnyAsync(e => e.BatchId == farm.BatchId)));
    }
    [Fact]
    public async Task Old_capture_is_stored_as_watch_with_server_receive_time()
    {
        var farm = await Setup(); var captured = DateTimeOffset.UtcNow.AddDays(-2); var before = DateTimeOffset.UtcNow;
        using var client = Client(farm.UserId); using var form = EvidenceControllerTests.Upload(farm.BatchCode, farm.SlotCode, EvidenceImages.Noise(6101), capturedAt: captured);
        var response = await client.PostAsync("/api/evidence", form); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<EvidenceResponse>())!;
        Assert.Equal("Watch", result.ReviewStatus); Assert.Equal(40m, result.RiskScore); Assert.Equal(AuditChain.Timestamp(captured), result.CapturedAt);
        Assert.InRange(result.ReceivedAt, before.AddSeconds(-1), DateTimeOffset.UtcNow.AddSeconds(1));
    }
    private sealed class FailAudit : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        { if (data.Context!.ChangeTracker.Entries<AuditLog>().Any(e => e.State == EntityState.Added)) throw new InvalidOperationException("Injected audit failure"); return base.SavingChangesAsync(data, result, ct); }
    }
    [Fact]
    public async Task Audit_failure_rolls_back_evidence_and_removes_its_saved_file()
    {
        var farm = await Setup();
        var before = Directory.Exists(fixture.StorageRoot) ? Directory.GetFiles(fixture.StorageRoot, "*", SearchOption.AllDirectories).Length : 0;
        await using var scope = fixture.Factory.Services.CreateAsyncScope(); var existing = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var settings = new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(existing.Database.GetConnectionString()).AddInterceptors(new FailAudit()).Options;
        await using var db = new AppDbContext(settings); var me = new User(farm.UserId);
        var service = new EvidenceService(db, me, new EvidenceAccess(db, me), new EvidenceImageProcessor(), scope.ServiceProvider.GetRequiredService<IFileStorage>(), new NoopCrabDetector(), Options.Create(new EvidenceOptions()), TimeProvider.System, NullLogger<EvidenceService>.Instance);
        var request = new UploadEvidenceRequest { BatchCode = farm.BatchCode, SlotCode = farm.SlotCode, Image = EvidenceImages.File(EvidenceImages.Png()), CapturedAt = DateTimeOffset.UtcNow.AddSeconds(-1), Latitude = 10, Longitude = 106 };
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UploadAsync(request, default));
        Assert.False(await Db(db => db.Evidences.AnyAsync(e => e.BatchId == farm.BatchId)));
        Assert.Equal(before, Directory.GetFiles(fixture.StorageRoot, "*", SearchOption.AllDirectories).Length);
        await AssertChain();
    }
}
