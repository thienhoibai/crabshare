using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class CaptureRequestDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Farm(long UserId, long BatchId, string Code, long SlotId);
    private sealed class Clock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private Task<Farm> Setup(string status = "InProduction") => Db<Farm>(async db => {
        var now = DateTimeOffset.UtcNow;
        var user = new AppUser { Email = $"capture-{Guid.NewGuid():N}@test.local", FullName = "Capture test", PasswordHash = "test", Status = "Active" };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.OperatorMember, GrantedAt = now });
        var farm = new Infrastructure.Persistence.Entities.Operator { LegalName = "Capture farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved" };
        farm.OperatorMembers.Add(new OperatorMember { User = user, MemberRole = "Owner", JoinedAt = now });
        var batch = new Batch { Operator = farm, BatchCode = "CR-" + Guid.NewGuid().ToString("N")[..12], Title = "Capture test", Status = status, CrabType = "FatteningMudCrab", SeedQuantity = 3, ExpectedOutputKg = 1,
            CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, StockedAt = now.AddDays(-1) };
        var slot = new PhysicalSlot { Operator = farm, SlotCode = "0014", Status = "Occupied" };
        db.SlotAllocations.Add(new SlotAllocation { Batch = batch, Slot = slot, AllocatedAt = now.AddDays(-1) });
        db.SlotAllocations.Add(new SlotAllocation { Batch = batch, Slot = new PhysicalSlot { Operator = farm, SlotCode = "0015", Status = "Available" }, AllocatedAt = now.AddDays(-1) });
        db.SlotAllocations.Add(new SlotAllocation { Batch = batch, Slot = new PhysicalSlot { Operator = farm, SlotCode = "0016", Status = "Occupied" }, AllocatedAt = now.AddDays(-1), ReleasedAt = now.AddHours(-1) });
        await db.SaveChangesAsync(); return new(user.UserId, batch.BatchId, batch.BatchCode, slot.SlotId);
    });
    private HttpClient Client(long id) { var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.OperatorMember); return client; }
    private async Task<CaptureRequestJobResult> Run(DateTimeOffset now, int hour = 0)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var clock = new Clock(now);
        return await new CaptureRequestJob(db, new AlertService(db, scope.ServiceProvider.GetRequiredService<ICurrentUser>(), clock), Options.Create(new CaptureRequestOptions { DailyRequestHour = hour }), clock).RunAsync();
    }
    private Task<List<CaptureRequest>> Requests(Farm farm) => Db(db => db.CaptureRequests.AsNoTracking().Where(r => r.BatchId == farm.BatchId).OrderBy(r => r.CaptureRequestId).ToListAsync());
    private Task<bool> Chain() => Db(async db => { string? previous = null; foreach (var row in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync()) { Assert.Equal(previous, row.PrevHash); Assert.Matches("^[0-9a-f]{64}$", row.RowHash); Assert.True(AuditChain.VerifyHash(row)); previous = row.RowHash; } return true; });

    [Fact]
    public async Task Concurrent_daily_runs_select_only_live_occupied_boxes_without_duplicate_requests()
    {
        var farm = await Setup(); var inactive = await Setup("Stocked"); var now = DateTimeOffset.UtcNow;
        await Task.WhenAll(Run(now), Run(now)); await Run(now.AddMinutes(1));
        var request = Assert.Single(await Requests(farm)); Assert.Equal(farm.SlotId, request.SlotId); Assert.Equal("Open", request.Status); Assert.Equal(AuditChain.Timestamp(now).AddHours(2), request.DueAt);
        Assert.Empty(await Requests(inactive)); await Chain();
    }
    [Fact]
    public async Task Vietnam_daily_cutoff_and_completed_requests_do_not_issue_twice_today()
    {
        var farm = await Setup(); var local = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)); var start = new DateTimeOffset(local.Date, local.Offset);
        await Run(start.AddHours(8), 9); Assert.Empty(await Requests(farm));
        await Run(start.AddHours(9), 9); var request = Assert.Single(await Requests(farm));
        await Db(async db => { var row = await db.CaptureRequests.SingleAsync(r => r.CaptureRequestId == request.CaptureRequestId); row.Status = "Fulfilled"; row.FulfilledAt = start.AddHours(10); await db.SaveChangesAsync(); return true; });
        await Run(start.AddHours(11), 9); Assert.Single(await Requests(farm));
        await Run(start.AddDays(1).AddHours(9), 9); Assert.Equal(2, (await Requests(farm)).Count); await Chain();
    }
    [Fact]
    public async Task Expiry_and_evidence_flag_are_atomic_idempotent_and_do_not_expire_at_exact_deadline()
    {
        var farm = await Setup(); var now = DateTimeOffset.UtcNow; await Run(now);
        var request = Assert.Single(await Requests(farm)); await Run(request.DueAt); Assert.Equal("Open", (await Requests(farm)).Single().Status);
        await Run(request.DueAt.AddMilliseconds(1)); await Run(request.DueAt.AddMinutes(1));
        Assert.Equal("Expired", (await Requests(farm)).First().Status);
        var alert = await Db(db => db.Alerts.AsNoTracking().SingleAsync(a => a.BatchId == farm.BatchId && a.AlertType == "EvidenceFlag")); Assert.Contains("0014", alert.Message);
        Assert.Equal(1, await Db(db => db.AuditLogs.CountAsync(a => a.EntityType == "CaptureRequest" && a.EntityId == request.CaptureRequestId && a.ActionType == "ExpireCaptureRequest"))); await Chain();
    }
    [Fact]
    public async Task Scoped_API_and_correct_photo_fulfill_the_request_and_remove_it_from_open_list()
    {
        var farm = await Setup(); var other = await Setup(); var now = DateTimeOffset.UtcNow; await Run(now);
        using var client = Client(farm.UserId);
        var open = (await client.GetFromJsonAsync<PagedResult<CaptureRequestResponse>>("/api/operators/me/capture-requests?pageSize=1"))!;
        Assert.Equal(1, open.Total); var request = Assert.Single(open.Items); Assert.Equal(farm.Code, request.BatchCode);
        using var wrong = EvidenceControllerTests.Upload(farm.Code, "0015", captureRequestId: request.Id);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync("/api/evidence", wrong)).StatusCode);
        using var image = EvidenceControllerTests.Upload(farm.Code, "0014", EvidenceImages.Noise(270001), capturedAt: DateTimeOffset.UtcNow, captureRequestId: request.Id);
        var sent = await client.PostAsync("/api/evidence", image); Assert.Equal(HttpStatusCode.Created, sent.StatusCode);
        Assert.Equal("Fulfilled", (await sent.Content.ReadFromJsonAsync<EvidenceResponse>())!.CaptureRequestStatus);
        Assert.Empty((await client.GetFromJsonAsync<PagedResult<CaptureRequestResponse>>("/api/operators/me/capture-requests"))!.Items);
        Assert.Equal("Fulfilled", Assert.Single((await client.GetFromJsonAsync<PagedResult<CaptureRequestResponse>>("/api/operators/me/capture-requests?status=Fulfilled"))!.Items).Status);
        Assert.Equal("Open", Assert.Single(await Requests(other)).Status);
        await Db(async db => { (await db.AppUsers.SingleAsync(u => u.UserId == farm.UserId)).Status = "Locked"; await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/operators/me/capture-requests")).StatusCode); await Chain();
    }
    private sealed class FailAlert : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        { if (data.Context!.ChangeTracker.Entries<Alert>().Any(e => e.State == EntityState.Added)) throw new InvalidOperationException("Injected alert failure"); return base.SavingChangesAsync(data, result, ct); }
    }
    [Fact]
    public async Task Failed_alert_rolls_back_expiration_and_its_audit()
    {
        var farm = await Setup(); var now = DateTimeOffset.UtcNow; await Run(now); var request = Assert.Single(await Requests(farm));
        await using var scope = fixture.Factory.Services.CreateAsyncScope(); var original = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(original.Database.GetConnectionString()).AddInterceptors(new FailAlert()).Options);
        var clock = new Clock(request.DueAt.AddSeconds(1)); var alerts = new AlertService(db, scope.ServiceProvider.GetRequiredService<ICurrentUser>(), clock);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new CaptureRequestJob(db, alerts, Options.Create(new CaptureRequestOptions()), clock).RunAsync());
        Assert.Equal("Open", (await Requests(farm)).First().Status);
        Assert.False(await Db(db => db.AuditLogs.AnyAsync(a => a.EntityType == "CaptureRequest" && a.EntityId == request.CaptureRequestId && a.ActionType == "ExpireCaptureRequest"))); await Chain();
    }
}
