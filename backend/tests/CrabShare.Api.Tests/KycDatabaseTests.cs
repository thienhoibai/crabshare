using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Infrastructure.Ekyc;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
[Collection("KycDatabase")]
public class KycDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private static HttpClient Client(WebApplicationFactory<Program> factory, long userId)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor);
        return client;
    }

    private WebApplicationFactory<Program> WithProvider(IEkycProvider provider)
        => fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
            s.Replace(ServiceDescriptor.Singleton(provider))));

    [Fact]
    public async Task New_investor_has_no_previous_check()
    {
        var userId = await fixture.CreateInvestorAsync();
        using var client = Client(fixture.Factory, userId);
        var result = await client.GetFromJsonAsync<KycStatusResponse>("/api/me/kyc");
        Assert.Equal("Unverified", result!.VerificationStatus);
        Assert.Null(result.VerifiedAt);
        Assert.Null(result.LastCheck);
    }

    [Fact]
    public async Task Passing_ekyc_persists_only_result_and_verifies_the_current_investor()
    {
        var userId = await fixture.CreateInvestorAsync();
        var otherUserId = await fixture.CreateInvestorAsync();
        var provider = new RecordingProvider(new(true, "TEST-PASS", "Do not persist this card name", null),
            () => Assert.Empty(Directory.EnumerateFileSystemEntries(fixture.UploadTempRoot)));
        using var factory = WithProvider(provider);
        using var client = Client(factory, userId);
        // Vượt ngưỡng temp-file 64 KB mặc định của ASP.NET; nội dung chỉ gửi tới provider.
        var bytes = new byte[96 * 1024];
        Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=").CopyTo(bytes, 0);
        using var form = KycControllerTests.Images(bytes: bytes);
        form.Add(new StringContent(otherUserId.ToString()), "userId"); // Không cho client chọn chủ hồ sơ.
        using var response = await client.PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<KycStatusResponse>())!;
        Assert.Equal("Verified", result.VerificationStatus);
        Assert.NotNull(result.VerifiedAt);
        Assert.Equal("Passed", result.LastCheck!.Result);
        Assert.NotNull(result.LastCheck.ConsentAt);
        Assert.Equal("TEST-PASS", result.LastCheck.ProviderReference);
        Assert.Null(result.LastCheck.FailureReason);
        Assert.Equal(1, provider.Calls);
        Assert.All(provider.Received, received => Assert.Equal(bytes, received));
        Assert.All(provider.Streams, stream => Assert.Throws<ObjectDisposedException>(() => stream.ReadByte()));
        Assert.False(Directory.Exists(fixture.StorageRoot));

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("Verified", (await db.Investors.FindAsync(userId))!.VerificationStatus);
        Assert.Equal("Unverified", (await db.Investors.FindAsync(otherUserId))!.VerificationStatus);
        var check = Assert.Single(await db.KycChecks.Where(c => c.UserId == userId).ToListAsync());
        Assert.Equal("EkycIdFace", check.CheckType);
        Assert.Equal("Passed", check.Result);
        var audit = Assert.Single(await db.AuditLogs.Where(a => a.ActorUserId == userId).ToListAsync());
        Assert.DoesNotContain("Do not persist", audit.NewValue!);
        AssertAuditHash(audit);
        var read = await client.GetFromJsonAsync<KycStatusResponse>("/api/me/kyc");
        Assert.Equal(check.KycCheckId, read!.LastCheck!.Id);
    }

    [Fact]
    public async Task Failed_verification_can_be_retried_and_latest_ekyc_ignores_bank_checks()
    {
        var userId = await fixture.CreateInvestorAsync();
        using var failedFactory = WithProvider(new RecordingProvider(new(false, "TEST-FAIL", null, "Face mismatch")));
        using var failedClient = Client(failedFactory, userId);
        using (var form = KycControllerTests.Images())
        using (var response = await failedClient.PostAsync("/api/kyc/ekyc", form))
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var result = (await response.Content.ReadFromJsonAsync<KycStatusResponse>())!;
            Assert.Equal("Rejected", result.VerificationStatus);
            Assert.Null(result.VerifiedAt);
            Assert.Equal("Failed", result.LastCheck!.Result);
            Assert.Equal("Face mismatch", result.LastCheck.FailureReason);
        }
        using var client = Client(fixture.Factory, userId); // FakeEkycProvider mặc định trả đạt.
        using (var form = KycControllerTests.Images())
        using (var response = await client.PostAsync("/api/kyc/ekyc", form))
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.KycChecks.Add(new KycCheck
        {
            UserId = userId, CheckType = "BankNameMatch", Result = "Failed",
            CheckedAt = DateTimeOffset.UtcNow.AddDays(1), CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        var latest = await client.GetFromJsonAsync<KycStatusResponse>("/api/me/kyc");
        Assert.Equal("Verified", latest!.VerificationStatus);
        Assert.Equal("EkycIdFace", latest.LastCheck!.CheckType);
        Assert.Equal("Passed", latest.LastCheck.Result);
        var audit = await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync();
        for (var i = 0; i < audit.Count; i++)
        {
            Assert.Equal(i == 0 ? null : audit[i - 1].RowHash, audit[i].PrevHash);
            AssertAuditHash(audit[i]);
        }
    }

    [Theory]
    [InlineData("Verified", HttpStatusCode.Conflict, "kyc.already_verified")]
    [InlineData("Locked", HttpStatusCode.Forbidden, "auth.locked")]
    public async Task Verified_or_locked_users_cannot_submit_again(string status, HttpStatusCode expected, string code)
    {
        var userId = await fixture.CreateInvestorAsync(status == "Verified" ? status : "Unverified");
        if (status == "Locked")
        {
            await using var scope = fixture.Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.AppUsers.FindAsync(userId))!.Status = "Locked";
            await db.SaveChangesAsync();
        }
        var provider = new RecordingProvider(new(true, "SHOULD-NOT-BE-CALLED", null, null));
        using var factory = WithProvider(provider);
        using var client = Client(factory, userId);
        using var form = KycControllerTests.Images();
        using var response = await client.PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(0, provider.Calls);
    }

    [Fact]
    public async Task Forged_image_headers_do_not_reach_provider_or_change_kyc()
    {
        var userId = await fixture.CreateInvestorAsync();
        var provider = new RecordingProvider(new(true, "SHOULD-NOT-BE-CALLED", null, null));
        using var factory = WithProvider(provider);
        using var client = Client(factory, userId);
        using var form = KycControllerTests.Images(bytes: Encoding.UTF8.GetBytes("This is not a PNG image."));
        using var response = await client.PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, provider.Calls);
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.KycChecks.AnyAsync(c => c.UserId == userId));
        Assert.Equal("Unverified", (await db.Investors.FindAsync(userId))!.VerificationStatus);
    }

    private static void AssertAuditHash(AuditLog audit)
    {
        var content = JsonSerializer.Serialize(new
        {
            entityType = audit.EntityType, entityId = audit.EntityId, actionType = audit.ActionType,
            oldValue = audit.OldValue, newValue = audit.NewValue, actorUserId = audit.ActorUserId, occurredAt = audit.OccurredAt,
        });
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((audit.PrevHash ?? "") + content))), audit.RowHash);
        Assert.Matches("^[0-9a-f]{64}$", audit.RowHash);
    }

    [Fact]
    public async Task Missing_consent_returns_400_without_calling_provider_or_saving_results()
    {
        var userId = await fixture.CreateInvestorAsync();
        var provider = new RecordingProvider(new(true, "SHOULD-NOT-BE-CALLED", null, null));
        using var factory = WithProvider(provider);
        using var client = Client(factory, userId);
        using var form = KycControllerTests.Images(consent: false);
        using var response = await client.PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, provider.Calls);
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.KycChecks.AnyAsync(c => c.UserId == userId));
        Assert.False(await db.AuditLogs.AnyAsync(a => a.ActorUserId == userId));
        Assert.Equal("Unverified", (await db.Investors.FindAsync(userId))!.VerificationStatus);
        Assert.Empty(Directory.EnumerateFileSystemEntries(fixture.UploadTempRoot));
        Assert.False(Directory.Exists(fixture.StorageRoot));
    }

    [Fact]
    public async Task Concurrent_submissions_for_one_investor_record_only_one_success()
    {
        var userId = await fixture.CreateInvestorAsync();
        using var first = Client(fixture.Factory, userId);
        using var second = Client(fixture.Factory, userId);
        using var firstForm = KycControllerTests.Images();
        using var secondForm = KycControllerTests.Images();
        var responses = await Task.WhenAll(first.PostAsync("/api/kyc/ekyc", firstForm), second.PostAsync("/api/kyc/ekyc", secondForm));
        try
        {
            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        }
        finally { foreach (var response in responses) response.Dispose(); }
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.KycChecks.CountAsync(c => c.UserId == userId));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.ActorUserId == userId));
    }

    [Fact]
    public async Task Concurrent_investors_keep_the_audit_chain_connected()
    {
        var firstId = await fixture.CreateInvestorAsync();
        var secondId = await fixture.CreateInvestorAsync();
        using var first = Client(fixture.Factory, firstId);
        using var second = Client(fixture.Factory, secondId);
        using var firstForm = KycControllerTests.Images();
        using var secondForm = KycControllerTests.Images();
        var responses = await Task.WhenAll(first.PostAsync("/api/kyc/ekyc", firstForm), second.PostAsync("/api/kyc/ekyc", secondForm));
        try { Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode)); }
        finally { foreach (var response in responses) response.Dispose(); }
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var audit = await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync();
        for (var i = 0; i < audit.Count; i++)
        {
            Assert.Equal(i == 0 ? null : audit[i - 1].RowHash, audit[i].PrevHash);
            AssertAuditHash(audit[i]);
        }
    }

    private sealed class RecordingProvider(EkycResult result, Action? onVerify = null) : IEkycProvider
    {
        public int Calls { get; private set; }
        public List<byte[]> Received { get; } = [];
        public List<Stream> Streams { get; } = [];

        public async Task<EkycResult> VerifyAsync(Stream front, Stream back, Stream selfie, CancellationToken ct)
        {
            Calls++;
            onVerify?.Invoke();
            foreach (var stream in new[] { front, back, selfie })
            {
                Streams.Add(stream);
                using var buffer = new MemoryStream();
                await stream.CopyToAsync(buffer, ct);
                Received.Add(buffer.ToArray());
            }
            return result;
        }
    }
}
