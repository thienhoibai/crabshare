using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class KycHandoffDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed class TestClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; private set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
        public void Advance(TimeSpan duration) => Now = Now.Add(duration);
    }

    private static HttpClient Client(WebApplicationFactory<Program> factory, long userId, string role = Roles.Investor)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        return client;
    }

    private static WebApplicationFactory<Program> WithClock(WebApplicationFactory<Program> factory, TestClock clock)
        => factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.Replace(ServiceDescriptor.Singleton<TimeProvider>(clock))));

    private static async Task<KycHandoffCreatedResponse> Create(HttpClient client)
    {
        using var response = await client.PostAsync("/api/me/kyc/handoffs", content: null);
        Assert.True(response.StatusCode == HttpStatusCode.Created,
            $"Expected 201 Created, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<KycHandoffCreatedResponse>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        return problem.GetProperty("code").GetString();
    }

    [Fact]
    public async Task Claim_is_owner_bound_idempotent_and_stores_only_the_token_hash()
    {
        var ownerId = await fixture.CreateInvestorAsync();
        var otherId = await fixture.CreateInvestorAsync();
        using var owner = Client(fixture.Factory, ownerId);
        using var other = Client(fixture.Factory, otherId, Roles.Customer);
        var created = await Create(owner);
        Assert.Equal(43, created.Token.Length);

        using (var mismatch = await other.PostAsJsonAsync("/api/me/kyc/handoffs/claim", new { token = created.Token }))
        {
            Assert.Equal(HttpStatusCode.Forbidden, mismatch.StatusCode);
            Assert.Equal("kyc.handoff_account_mismatch", await ErrorCode(mismatch));
        }

        var pending = await owner.GetFromJsonAsync<KycHandoffStatusResponse>($"/api/me/kyc/handoffs/{created.Id}");
        Assert.Equal("Pending", pending!.Status);

        using (var claim = await owner.PostAsJsonAsync("/api/me/kyc/handoffs/claim", new { token = created.Token }))
        {
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);
            Assert.Equal("Claimed", (await claim.Content.ReadFromJsonAsync<KycHandoffStatusResponse>())!.Status);
        }
        using (var repeat = await owner.PostAsJsonAsync("/api/me/kyc/handoffs/claim", new { token = created.Token }))
        {
            Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
            Assert.Equal("Claimed", (await repeat.Content.ReadFromJsonAsync<KycHandoffStatusResponse>())!.Status);
        }

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.KycHandoffs.AsNoTracking().SingleAsync(h => h.HandoffId == created.Id);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(created.Token))), row.TokenHash);
        Assert.NotEqual(created.Token, row.TokenHash);
        Assert.Equal("Claimed", row.Status);
        Assert.NotNull(row.ClaimedAt);
    }

    [Fact]
    public async Task Expired_qr_is_reported_during_status_poll_and_cannot_be_claimed()
    {
        var userId = await fixture.CreateInvestorAsync();
        var clock = new TestClock(new DateTimeOffset(2026, 11, 25, 8, 0, 0, TimeSpan.Zero));
        using var factory = WithClock(fixture.Factory, clock);
        using var client = Client(factory, userId);
        var created = await Create(client);
        Assert.Equal(clock.Now.AddMinutes(5), created.ExpiresAt);

        clock.Advance(TimeSpan.FromMinutes(5));
        var expired = await client.GetFromJsonAsync<KycHandoffStatusResponse>($"/api/me/kyc/handoffs/{created.Id}");
        Assert.Equal("Expired", expired!.Status);

        using var claim = await client.PostAsJsonAsync("/api/me/kyc/handoffs/claim", new { token = created.Token });
        Assert.Equal((HttpStatusCode)422, claim.StatusCode);
        Assert.Equal("kyc.handoff_expired", await ErrorCode(claim));
    }

    [Fact]
    public async Task Replacing_or_cancelling_qr_closes_the_previous_session()
    {
        var userId = await fixture.CreateInvestorAsync();
        using var client = Client(fixture.Factory, userId);
        var first = await Create(client);
        var second = await Create(client);

        var replaced = await client.GetFromJsonAsync<KycHandoffStatusResponse>($"/api/me/kyc/handoffs/{first.Id}");
        Assert.Equal("Cancelled", replaced!.Status);

        using (var cancel = await client.PostAsync($"/api/me/kyc/handoffs/{second.Id}/cancel", content: null))
        {
            Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
            Assert.Equal("Cancelled", (await cancel.Content.ReadFromJsonAsync<KycHandoffStatusResponse>())!.Status);
        }
        using var claim = await client.PostAsJsonAsync("/api/me/kyc/handoffs/claim", new { token = second.Token });
        Assert.Equal(HttpStatusCode.Conflict, claim.StatusCode);
        Assert.Equal("kyc.handoff_cancelled", await ErrorCode(claim));
    }
}
