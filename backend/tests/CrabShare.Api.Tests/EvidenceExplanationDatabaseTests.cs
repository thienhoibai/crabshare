using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class EvidenceExplanationDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Scenario(long OperatorUser, long Reviewer, long Evidence, long Batch, string BatchCode, byte[] Bytes);
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private HttpClient Client(long id, string role = Roles.OperatorMember)
    { var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", role); return client; }
    private Task<Scenario> Setup(string memberRole = "Owner", string status = "Flagged") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        AppUser User(string role) { var user = new AppUser { Email = $"explain-{Guid.NewGuid():N}@test.local", FullName = "Test " + role, PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now }; user.AppUserRoles.Add(new AppUserRole { RoleCode = role, GrantedAt = now }); return user; }
        var owner = User(Roles.OperatorMember); var reviewer = User(Roles.EvidenceReviewer);
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Explanation Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved" };
        op.OperatorMembers.Add(new OperatorMember { User = owner, MemberRole = memberRole, JoinedAt = now });
        var batch = new Batch { BatchCode = "EX-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Explanation Test", Status = "InProduction",
            SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10,
            OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, CreatedAt = now, UpdatedAt = now };
        var slot = new PhysicalSlot { Operator = op, SlotCode = "0014", Status = "Occupied", CreatedAt = now, UpdatedAt = now };
        var bytes = EvidenceImages.Png(); await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var file = await scope.ServiceProvider.GetRequiredService<IFileStorage>().SaveAsync(new MemoryStream(bytes), "test.png", "image/png", "explanation-tests", default);
        var evidence = new Infrastructure.Persistence.Entities.Evidence { Batch = batch, Slot = slot, MediaType = "Photo", Source = "InAppCapture", FileUri = file.Uri, Sha256 = file.Sha256, ReceivedAt = now, CapturedAt = now, RiskScore = 100, ReviewStatus = status };
        db.AppUsers.Add(reviewer); db.Evidences.Add(evidence); await db.SaveChangesAsync(); return new Scenario(owner.UserId, reviewer.UserId, evidence.EvidenceId, batch.BatchId, batch.BatchCode, bytes);
    });
    private Task<bool> Chain() => Db(async db => {
        string? previous = null; foreach (var row in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync()) {
            Assert.Equal(previous, row.PrevHash); Assert.Matches("^[0-9a-f]{64}$", row.RowHash); Assert.True(AuditChain.VerifyHash(row)); previous = row.RowHash;
        } return true;
    });
    [Theory]
    [InlineData("Owner")] [InlineData("Staff")]
    public async Task Explanation_is_saved_audited_and_visible_to_reviewer_without_changing_status(string memberRole)
    {
        var test = await Setup(memberRole); using var owner = Client(test.OperatorUser); using var reviewer = Client(test.Reviewer, Roles.EvidenceReviewer);
        var response = await owner.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text = "  Ảnh chụp lại cùng hộp 0014.  " });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var saved = (await response.Content.ReadFromJsonAsync<OperatorEvidenceItem>())!;
        Assert.Equal("Ảnh chụp lại cùng hộp 0014.", saved.Explanation); Assert.NotNull(saved.ExplainedAt); Assert.Equal("Flagged", saved.ReviewStatus);
        var detail = (await reviewer.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!;
        Assert.Equal(saved.Explanation, detail.Explanation); Assert.Equal(saved.ExplainedAt, detail.ExplainedAt);
        Assert.DoesNotContain("fileUri", await response.Content.ReadAsStringAsync());
        await Db(async db => { var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == "Evidence" && a.EntityId == test.Evidence); Assert.Equal("ExplainEvidence", audit.ActionType); Assert.Equal(test.OperatorUser, audit.ActorUserId); Assert.Contains("\"explanation\"", audit.NewValue); return true; }); await Chain();
    }
    [Fact]
    public async Task List_filters_and_paginates_only_current_farm_and_returns_latest_reviewer_note()
    {
        var test = await Setup(); await Setup(); using var client = Client(test.OperatorUser); using var reviewer = Client(test.Reviewer, Roles.EvidenceReviewer);
        Assert.Equal(HttpStatusCode.OK, (await reviewer.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "NeedMoreEvidence", note = "Explain image timestamp" })).StatusCode);
        var result = (await client.GetFromJsonAsync<PagedResult<OperatorEvidenceItem>>($"/api/operators/me/evidence?status=Flagged&q={test.BatchCode}&pageSize=1"))!;
        var item = Assert.Single(result.Items); Assert.Equal(1, result.Total); Assert.Equal(test.Evidence, item.Id); Assert.Equal("Explain image timestamp", item.LatestReview!.Note);
        Assert.Empty((await client.GetFromJsonAsync<PagedResult<OperatorEvidenceItem>>($"/api/operators/me/evidence?q={test.BatchCode}&pageSize=1&page=2"))!.Items);
        Assert.Empty((await client.GetFromJsonAsync<PagedResult<OperatorEvidenceItem>>("/api/operators/me/evidence?status=Accepted"))!.Items);
    }
    [Fact]
    public async Task Repeated_text_is_idempotent_but_changed_text_keeps_previous_audit_snapshot()
    {
        var test = await Setup(); using var client = Client(test.OperatorUser);
        async Task<OperatorEvidenceItem> Explain(string text) { var reply = await client.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text }); Assert.Equal(HttpStatusCode.OK, reply.StatusCode); return (await reply.Content.ReadFromJsonAsync<OperatorEvidenceItem>())!; }
        var first = await Explain("Camera clock differed"); var again = await Explain(" Camera clock differed "); Assert.Equal(first.ExplainedAt, again.ExplainedAt);
        var second = await Explain("Camera clock differed by five minutes"); Assert.True(second.ExplainedAt > first.ExplainedAt);
        await Db(async db => { var audits = await db.AuditLogs.Where(a => a.EntityType == "Evidence" && a.EntityId == test.Evidence).OrderBy(a => a.AuditId).ToListAsync(); Assert.Equal(2, audits.Count); Assert.Contains("Camera clock differed", audits[1].OldValue); return true; }); await Chain();
    }
    private sealed class FrozenClock(DateTimeOffset value) : TimeProvider { public override DateTimeOffset GetUtcNow() => value; }
    [Fact]
    public async Task Explanation_after_need_more_reopens_same_reviewer_even_with_same_millisecond_clock()
    {
        var test = await Setup(); using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<TimeProvider>(new FrozenClock(AuditChain.Timestamp(DateTimeOffset.UtcNow)))));
        HttpClient Create(long user, string role) { var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", user.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", role); return client; }
        using var owner = Create(test.OperatorUser, Roles.OperatorMember); using var reviewer = Create(test.Reviewer, Roles.EvidenceReviewer);
        Assert.Equal(HttpStatusCode.OK, (await reviewer.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "NeedMoreEvidence", note = "Explain" })).StatusCode);
        Assert.False((await reviewer.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!.CanReview);
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text = "The same physical box was photographed" })).StatusCode);
        var detail = (await reviewer.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!;
        Assert.True(detail.CanReview); Assert.True(detail.ExplainedAt > Assert.Single(detail.Reviews).ReviewedAt);
        Assert.Equal(HttpStatusCode.OK, (await reviewer.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Explanation checked" })).StatusCode);
        Assert.Equal("Accepted", (await owner.GetFromJsonAsync<OperatorEvidenceItem>($"/api/operators/me/evidence/{test.Evidence}"))!.ReviewStatus); await Chain();
    }
    [Theory]
    [InlineData("Accepted")] [InlineData("Rejected")] [InlineData("Watch")]
    public async Task Non_flagged_evidence_rejects_explanation_without_audit(string status)
    {
        var test = await Setup(status: status); using var client = Client(test.OperatorUser);
        Assert.False((await client.GetFromJsonAsync<OperatorEvidenceItem>($"/api/operators/me/evidence/{test.Evidence}"))!.CanExplain);
        var reply = await client.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text = "Explain" }); Assert.Equal(HttpStatusCode.Conflict, reply.StatusCode); Assert.Contains("evidence.explanation_closed", await reply.Content.ReadAsStringAsync());
        Assert.False(await Db(db => db.AuditLogs.AnyAsync(a => a.EntityType == "Evidence" && a.EntityId == test.Evidence)));
    }
    [Fact]
    public async Task Foreign_farm_cannot_read_photo_or_submit_explanation()
    {
        var own = await Setup(); var foreign = await Setup(); using var client = Client(own.OperatorUser);
        foreach (var suffix in new[] { "", "/image" }) Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/operators/me/evidence/{foreign.Evidence}{suffix}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/evidence/{foreign.Evidence}/explanation", new { text = "Foreign" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/operators/me/evidence/{long.MaxValue}")).StatusCode);
    }
    [Theory]
    [InlineData("Locked")] [InlineData("NoRole")] [InlineData("NoMembership")]
    public async Task Current_database_permissions_override_stale_operator_token(string change)
    {
        var test = await Setup(); await Db(async db => {
            if (change == "Locked") (await db.AppUsers.SingleAsync(u => u.UserId == test.OperatorUser)).Status = "Locked";
            else if (change == "NoRole") db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == test.OperatorUser));
            else db.OperatorMembers.Remove(await db.OperatorMembers.SingleAsync(m => m.UserId == test.OperatorUser)); await db.SaveChangesAsync(); return true;
        }); using var client = Client(test.OperatorUser);
        foreach (var suffix in new[] { "", $"/{test.Evidence}", $"/{test.Evidence}/image" }) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/operators/me/evidence" + suffix)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text = "Explain" })).StatusCode);
    }
    [Theory]
    [InlineData(null)] [InlineData("../outside.png")]
    public async Task Own_photo_has_private_headers_and_unsafe_path_is_404(string? path)
    {
        var test = await Setup(); using var client = Client(test.OperatorUser);
        if (path != null) { await Db(async db => { (await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence)).FileUri = path; await db.SaveChangesAsync(); return true; }); Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/operators/me/evidence/{test.Evidence}/image")).StatusCode); return; }
        var image = await client.GetAsync($"/api/operators/me/evidence/{test.Evidence}/image"); Assert.Equal(HttpStatusCode.OK, image.StatusCode); Assert.Equal(test.Bytes, await image.Content.ReadAsByteArrayAsync()); Assert.True(image.Headers.CacheControl!.NoStore); Assert.Equal("nosniff", Assert.Single(image.Headers.GetValues("X-Content-Type-Options")));
    }
    private sealed class FailAudit : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        { if (data.Context!.ChangeTracker.Entries<AuditLog>().Any(e => e.State == EntityState.Added)) throw new InvalidOperationException("Injected audit failure"); return base.SavingChangesAsync(data, result, ct); }
    }
    [Fact]
    public async Task Failed_audit_rolls_back_explanation_and_timestamp()
    {
        var test = await Setup(); using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddDbContext<AppDbContext>(o => o.AddInterceptors(new FailAudit()))));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", test.OperatorUser.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.OperatorMember);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text = "Explain" })).StatusCode);
        var row = await Db(db => db.Evidences.AsNoTracking().SingleAsync(e => e.EvidenceId == test.Evidence)); Assert.Null(row.Explanation); Assert.Null(row.ExplainedAt); Assert.Equal("Flagged", row.ReviewStatus);
    }
    [Fact]
    public async Task Explanation_racing_final_verdict_cannot_modify_closed_status()
    {
        var test = await Setup(); using var owner = Client(test.OperatorUser); using var reviewer = Client(test.Reviewer, Roles.EvidenceReviewer);
        var replies = await Task.WhenAll(owner.PostAsJsonAsync($"/api/evidence/{test.Evidence}/explanation", new { text = "Explain concurrent" }), reviewer.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Verified original" }));
        Assert.Equal(HttpStatusCode.OK, replies[1].StatusCode); Assert.Contains(replies[0].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        var row = await Db(db => db.Evidences.AsNoTracking().SingleAsync(e => e.EvidenceId == test.Evidence)); Assert.Equal("Accepted", row.ReviewStatus); if (replies[0].StatusCode == HttpStatusCode.Conflict) Assert.Null(row.Explanation); else Assert.Equal("Explain concurrent", row.Explanation); await Chain();
    }
}
