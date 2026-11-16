using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class EvidenceReviewDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Scenario(long Reviewer, long Evidence, long Batch, byte[] Bytes);
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private HttpClient Client(long id)
    { var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", id.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.EvidenceReviewer); return client; }
    private Task<Scenario> Setup() => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var reviewer = new AppUser { Email = $"review-{Guid.NewGuid():N}@test.local", FullName = "Evidence Reviewer", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now,
            Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now, CreatedAt = now } };
        reviewer.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.EvidenceReviewer, GrantedAt = now });
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Review Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved" };
        var batch = new Batch { BatchCode = "REV-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Review Test", Status = "InProduction",
            SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10,
            OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, CreatedAt = now, UpdatedAt = now };
        var bytes = EvidenceImages.Png();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var file = await scope.ServiceProvider.GetRequiredService<Infrastructure.Storage.IFileStorage>().SaveAsync(new MemoryStream(bytes), "test.png", "image/png", "review-tests", default);
        var evidence = new Infrastructure.Persistence.Entities.Evidence { Batch = batch, MediaType = "Photo", Source = "InAppCapture", FileUri = file.Uri, Sha256 = file.Sha256,
            ReceivedAt = now, CapturedAt = now, RiskScore = 100, ReviewStatus = "Flagged" };
        evidence.EvidenceDetections.Add(new EvidenceDetection { ModelVersion = "none", DetectedAt = now });
        db.AppUsers.Add(reviewer); db.Evidences.Add(evidence); await db.SaveChangesAsync(); return new Scenario(reviewer.UserId, evidence.EvidenceId, batch.BatchId, bytes);
    });
    private Task<bool> Chain() => Db(async db =>
    {
        string? previous = null;
        foreach (var row in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync())
        { Assert.Equal(previous, row.PrevHash); Assert.Matches("^[0-9a-f]{64}$", row.RowHash); Assert.True(AuditChain.VerifyHash(row)); previous = row.RowHash; }
        return true;
    });
    [Theory]
    [InlineData("Pass", "Accepted")] [InlineData("Fail", "Rejected")] [InlineData("NeedMoreEvidence", "Flagged")]
    public async Task Verdict_persists_status_note_reviewer_and_chained_audit(string verdict, string status)
    {
        var test = await Setup(); using var client = Client(test.Reviewer);
        var response = await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict, note = "  Checked metadata  " });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<ReviewEvidenceDetail>())!;
        Assert.Equal(status, detail.Evidence.ReviewStatus); Assert.False(detail.CanReview);
        var review = Assert.Single(detail.Reviews); Assert.Equal(test.Reviewer, review.ReviewerId); Assert.Equal("Evidence Reviewer", review.ReviewerName); Assert.Equal("Checked metadata", review.Note);
        await Db(async db => {
            Assert.Equal(status, (await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence)).ReviewStatus);
            Assert.Equal(verdict, (await db.EvidenceReviews.SingleAsync(r => r.EvidenceId == test.Evidence)).Verdict);
            var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == "Evidence" && a.EntityId == test.Evidence && a.ActionType == "ReviewEvidence");
            Assert.Equal(test.Reviewer, audit.ActorUserId); Assert.Contains("\"reviewStatus\"", audit.NewValue); return true;
        });
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict, note = "Again" })).StatusCode);
        await Chain();
    }
    [Theory]
    [InlineData("Share")] [InlineData("Confirmed")] [InlineData("Refunded")]
    public async Task Investor_conflict_hides_queue_and_returns_explicit_403_on_all_direct_routes(string kind)
    {
        var test = await Setup();
        await Db(async db => {
            var now = DateTimeOffset.UtcNow;
            if (kind == "Share") db.CapitalShares.Add(new CapitalShare { BatchId = test.Batch, InvestorId = test.Reviewer, ConfirmedAmount = 100, SnapshottedAt = now, CreatedAt = now });
            else db.Contributions.Add(new Contribution { BatchId = test.Batch, InvestorId = test.Reviewer, Amount = 100, Status = kind, ReservedAt = now.AddHours(-1), ExpiresAt = now.AddHours(1), ConfirmedAt = now, RefundedAt = kind == "Refunded" ? now : null, CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        using var client = Client(test.Reviewer);
        var page = (await client.GetFromJsonAsync<PagedResult<ReviewEvidenceSummary>>($"/api/review/evidence?q={test.Evidence}"))!;
        Assert.DoesNotContain(page.Items, e => e.Id == test.Evidence);
        foreach (var suffix in new[] { "", "/image" }) {
            var response = await client.GetAsync($"/api/review/evidence/{test.Evidence}{suffix}"); Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode); Assert.Contains("evidence.reviewer_conflict", await response.Content.ReadAsStringAsync());
        }
        var verdict = await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Checked" });
        Assert.Equal(HttpStatusCode.Forbidden, verdict.StatusCode); Assert.Contains("evidence.reviewer_conflict", await verdict.Content.ReadAsStringAsync());
        Assert.False(await Db(db => db.EvidenceReviews.AnyAsync(r => r.EvidenceId == test.Evidence)));
    }
    [Fact]
    public async Task Reserved_contribution_is_allowed_and_image_is_private_original_bytes()
    {
        var test = await Setup();
        await Db(async db => { var now = DateTimeOffset.UtcNow; db.Contributions.Add(new Contribution { BatchId = test.Batch, InvestorId = test.Reviewer, Amount = 100, Status = "Reserved", ReservedAt = now, ExpiresAt = now.AddHours(1), CreatedAt = now, UpdatedAt = now }); await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Reviewer);
        var response = await client.GetAsync($"/api/review/evidence/{test.Evidence}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.DoesNotContain("fileUri", await response.Content.ReadAsStringAsync());
        var image = await client.GetAsync($"/api/review/evidence/{test.Evidence}/image"); Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal(test.Bytes, await image.Content.ReadAsByteArrayAsync()); Assert.Equal("image/png", image.Content.Headers.ContentType!.MediaType); Assert.True(image.Headers.CacheControl!.NoStore); Assert.Equal("nosniff", Assert.Single(image.Headers.GetValues("X-Content-Type-Options")));
    }
    [Theory]
    [InlineData("Locked")] [InlineData("NoRole")]
    public async Task Stale_reviewer_token_is_denied_after_revocation(string change)
    {
        var test = await Setup(); await Db(async db => { if (change == "Locked") (await db.AppUsers.SingleAsync(u => u.UserId == test.Reviewer)).Status = "Locked";
            else db.AppUserRoles.Remove(await db.AppUserRoles.SingleAsync(r => r.UserId == test.Reviewer)); await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Reviewer);
        foreach (var path in new[] { "", $"/{test.Evidence}", $"/{test.Evidence}/image" }) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/review/evidence" + path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Checked" })).StatusCode);
    }
    [Fact]
    public async Task New_explanation_allows_same_reviewer_to_update_unique_row_and_keeps_previous_audit()
    {
        var test = await Setup(); using var client = Client(test.Reviewer);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "NeedMoreEvidence", note = "Explain timestamp" })).StatusCode);
        var first = await Db(db => db.EvidenceReviews.AsNoTracking().SingleAsync(r => r.EvidenceId == test.Evidence));
        await Db(async db => { var row = await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence); row.Explanation = "Camera clock was incorrect"; row.ExplainedAt = first.ReviewedAt.AddSeconds(1); await db.SaveChangesAsync(); return true; });
        Assert.True((await client.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!.CanReview);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Explanation checked" })).StatusCode);
        await Db(async db => { var review = Assert.Single(await db.EvidenceReviews.Where(r => r.EvidenceId == test.Evidence).ToListAsync()); Assert.Equal(first.EvidenceReviewId, review.EvidenceReviewId);
            var audits = await db.AuditLogs.Where(a => a.EntityType == "Evidence" && a.EntityId == test.Evidence).OrderBy(a => a.AuditId).ToListAsync(); Assert.Equal(2, audits.Count); Assert.Contains("NeedMoreEvidence", audits[0].NewValue); Assert.Contains("NeedMoreEvidence", audits[1].OldValue); return true; });
        await Chain();
    }
    [Fact]
    public async Task Another_reviewer_can_decide_a_pending_request_for_more_evidence()
    {
        var test = await Setup(); var other = await Setup(); using var a = Client(test.Reviewer); using var b = Client(other.Reviewer);
        Assert.Equal(HttpStatusCode.OK, (await a.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "NeedMoreEvidence", note = "Need clearer image" })).StatusCode);
        Assert.True((await b.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!.CanReview);
        Assert.Equal(HttpStatusCode.OK, (await b.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Fail", note = "Reviewed the original" })).StatusCode);
        Assert.Equal(2, (await b.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!.Reviews.Count);
        await Chain();
    }
    [Theory]
    [InlineData("Accepted")] [InlineData("Rejected")]
    public async Task Only_flagged_evidence_can_receive_a_new_verdict(string status)
    {
        var test = await Setup(); await Db(async db => { (await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence)).ReviewStatus = status; await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Reviewer);
        Assert.False((await client.GetFromJsonAsync<ReviewEvidenceDetail>($"/api/review/evidence/{test.Evidence}"))!.CanReview);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Checked" })).StatusCode);
        Assert.False(await Db(db => db.EvidenceReviews.AnyAsync(r => r.EvidenceId == test.Evidence)));
    }
    [Fact]
    public async Task Watch_evidence_can_be_decided_by_a_reviewer()
    {
        var test = await Setup();
        await Db(async db => { (await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence)).ReviewStatus = "Watch"; await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Reviewer);
        var response = await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Watch reviewed" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Accepted", (await response.Content.ReadFromJsonAsync<ReviewEvidenceDetail>())!.Evidence.ReviewStatus);
    }
    [Fact]
    public async Task Concurrent_final_verdicts_have_one_winner_and_one_conflict()
    {
        var test = await Setup(); var other = await Setup(); using var a = Client(test.Reviewer); using var b = Client(other.Reviewer);
        var replies = await Task.WhenAll(a.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "A" }), b.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Fail", note = "B" }));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Single(await Db(db => db.EvidenceReviews.Where(r => r.EvidenceId == test.Evidence).ToListAsync())); await Chain();
    }
    [Theory]
    [InlineData("review-tests/missing.png")] [InlineData("../outside.png")]
    public async Task Missing_or_escaping_image_is_404(string path)
    {
        var test = await Setup(); await Db(async db => { (await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence)).FileUri = path; await db.SaveChangesAsync(); return true; });
        using var client = Client(test.Reviewer); Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/review/evidence/{test.Evidence}/image")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/review/evidence/{long.MaxValue}")).StatusCode);
    }
    private sealed class FailAudit : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        { if (data.Context!.ChangeTracker.Entries<AuditLog>().Any(e => e.State == EntityState.Added)) throw new InvalidOperationException("Injected audit failure"); return base.SavingChangesAsync(data, result, ct); }
    }
    [Fact]
    public async Task Failed_audit_rolls_back_verdict_and_status()
    {
        var test = await Setup(); using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddDbContext<AppDbContext>(o => o.AddInterceptors(new FailAudit()))));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", test.Reviewer.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.EvidenceReviewer);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsJsonAsync($"/api/review/evidence/{test.Evidence}/verdict", new { verdict = "Pass", note = "Checked" })).StatusCode);
        await Db(async db => { Assert.Equal("Flagged", (await db.Evidences.SingleAsync(e => e.EvidenceId == test.Evidence)).ReviewStatus); Assert.False(await db.EvidenceReviews.AnyAsync(r => r.EvidenceId == test.Evidence)); return true; });
    }
}
