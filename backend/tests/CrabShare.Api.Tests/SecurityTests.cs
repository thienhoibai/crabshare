using System.Net;
using System.Security.Cryptography;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CrabShare.Api.Tests;

public class SecurityTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    [Fact]
    public async Task Only_configured_proxy_network_can_forward_https()
    {
        await using var app = await App("10.1.2.3", "10.1.2.0/24");
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("http://api.test/private", null)).StatusCode);
    }

    [Fact]
    public void Five_failed_or_inflight_attempts_block_then_expire_without_extending_lockout()
    {
        var clock = new Clock(); var limiter = new LoginAttemptLimiter(clock);
        Parallel.For(0, 5, _ => limiter.Begin("one@test.local"));
        Assert.Equal(429, Assert.Throws<AppException>(() => limiter.Begin("one@test.local")).StatusCode);
        clock.Now = clock.Now.AddMinutes(14);
        Assert.Throws<AppException>(() => limiter.Begin("one@test.local"));
        clock.Now = clock.Now.AddMinutes(1);
        limiter.Begin("one@test.local");
        limiter.Success("one@test.local");
        for (var i = 0; i < 5; i++) limiter.Begin("one@test.local");
        limiter.Begin("different@test.local");
    }

    [Fact]
    public void Protection_is_randomized_restart_safe_and_tampering_fails_closed()
    {
        var path = Path.Combine(Path.GetTempPath(), "CrabShareSecurityTests", Guid.NewGuid().ToString("N"));
        var first = new PayoutAccountProtection(path);
        var encrypted = first.Protect("001234567890");
        Assert.DoesNotContain("001234567890", encrypted);
        Assert.NotEqual(encrypted, first.Protect("001234567890"));
        var restarted = new PayoutAccountProtection(path);
        Assert.Equal("001234567890", restarted.Unprotect(encrypted));
        Assert.Equal(first.Digest("vcb", "001234567890"), restarted.Digest("VCB", "001234567890"));
        Assert.NotEqual(first.Digest("VCB", "001234567890"), first.Digest("ACB", "001234567890"));
        Assert.ThrowsAny<CryptographicException>(() => first.Unprotect(encrypted[..^10] + "tampered!"));
        Assert.ThrowsAny<CryptographicException>(() => first.Unprotect("001234567890"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Production_rejects_http_and_does_not_trust_arbitrary_forwarded_proto(bool spoof)
    {
        await using var app = await App();
        using var client = app.GetTestClient();
        if (spoof) client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        var response = await client.PostAsync("http://api.test/private", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("security.https_required", await response.Content.ReadAsStringAsync());
        var secure = await client.PostAsync("https://api.test/private", null);
        Assert.Equal(HttpStatusCode.OK, secure.StatusCode);
        Assert.Contains("max-age=", secure.Headers.GetValues("Strict-Transport-Security").Single());
    }

    [Fact]
    public async Task Auth_endpoint_ip_limit_returns_429_with_retry_header()
    {
        await using var app = await App();
        using var client = app.GetTestClient();
        for (var i = 0; i < 60; i++) Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("https://api.test/login", null)).StatusCode);
        var blocked = await client.PostAsync("https://api.test/login", null);
        Assert.Equal((HttpStatusCode)429, blocked.StatusCode);
        Assert.NotNull(blocked.Headers.RetryAfter);
    }

    private static async Task<WebApplication> App(string remoteIp = "198.51.100.20", string? network = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        { ["Security:DataProtectionKeyPath"] = Path.Combine(Path.GetTempPath(), "CrabShareSecurityTests", "middleware") });
        if (network is not null) builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Security:KnownNetworks:0"] = network });
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddAppSecurity(builder.Configuration, builder.Environment);
        // Test the middleware alone; no actual DB, startup upgrade or background job.
        var upgrade = builder.Services.Single(d => d.ImplementationType == typeof(PayoutProtectionUpgrade));
        builder.Services.Remove(upgrade);
        var app = builder.Build();
        app.Use(async (context, next) => { context.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp); await next(context); });
        app.UseRouting(); app.UseAppSecurity();
        app.MapPost("/private", () => Results.Ok());
        app.MapPost("/login", () => Results.Ok()).RequireRateLimiting("auth-attempts");
        await app.StartAsync(); return app;
    }
}
