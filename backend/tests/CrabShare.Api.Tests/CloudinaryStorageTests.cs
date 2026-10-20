using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Infrastructure;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

public sealed class CloudinaryStorageTests
{
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
    private static ServiceProvider Services(Func<HttpRequestMessage, Task<HttpResponseMessage>> send, string? root = null)
    {
        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = "Server=(localdb)\\MSSQLLocalDB;Database=Unused;Trusted_Connection=True",
            ["Storage:Provider"] = "Cloudinary", ["Storage:RootPath"] = root ?? Path.GetTempPath(),
            ["Cloudinary:CloudName"] = "test-cloud", ["Cloudinary:ApiKey"] = "12345", ["Cloudinary:ApiSecret"] = "test-secret",
        };
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<Microsoft.Extensions.Hosting.IHostEnvironment>(new StorageEnvironment());
        services.AddInfrastructure(new ConfigurationBuilder().AddInMemoryCollection(settings).Build());
        services.AddHttpClient("CloudinaryStorage").ConfigurePrimaryHttpMessageHandler(() => new Handler(send));
        return services.BuildServiceProvider();
    }
    private sealed class StorageEnvironment : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "CloudinaryStorageTests";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
    [Fact]
    public void Explicit_cloudinary_provider_is_selected_instead_of_silently_saving_locally()
    {
        using var services = Services(_ => throw new InvalidOperationException("No HTTP expected"));
        Assert.Equal("CloudinaryFileStorage", services.GetRequiredService<IFileStorage>().GetType().Name);
    }
    [Fact]
    public async Task Upload_is_authenticated_preserves_original_hash_and_uses_an_asset_identifier_without_a_delivery_token()
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        using var services = Services(async request =>
        {
            Assert.Equal("https://api.cloudinary.com/v1_1/test-cloud/image/upload", request.RequestUri!.AbsoluteUri);
            Assert.Equal(new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("12345:test-secret"))), request.Headers.Authorization);
            var body = Assert.IsType<MultipartFormDataContent>(request.Content);
            var fields = new Dictionary<string, string>();
            foreach (var part in body.Where(p => p.Headers.ContentDisposition?.Name?.Trim('"') != "file")) fields[part.Headers.ContentDisposition!.Name!.Trim('"')] = await part.ReadAsStringAsync();
            Assert.Equal("authenticated", fields["type"]); Assert.Equal("false", fields["overwrite"]);
            Assert.StartsWith("crabshare/evidence/2026/10/", fields["public_id"]);
            var file = body.Single(p => p.Headers.ContentDisposition?.Name?.Trim('"') == "file");
            Assert.Equal(bytes, await file.ReadAsByteArrayAsync());
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { public_id = fields["public_id"], format = "png", resource_type = "image", type = "authenticated", bytes = bytes.Length })) };
        });
        var stored = await services.GetRequiredService<IFileStorage>().SaveAsync(new MemoryStream(bytes), "capture.png", "image/png", "evidence/2026/10", default);
        Assert.StartsWith("cloudinary:test-cloud/image/authenticated/crabshare/evidence/2026/10/", stored.Uri);
        Assert.EndsWith(".png", stored.Uri); Assert.DoesNotContain("secret", stored.Uri); Assert.DoesNotContain("signature", stored.Uri);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(bytes)), stored.Sha256); Assert.Equal(4, stored.SizeBytes);
    }
    [Fact]
    public async Task Read_original_generates_a_short_lived_signed_download_internally_and_returns_image_bytes()
    {
        using var services = Services(request =>
        {
            Assert.Equal("/v1_1/test-cloud/image/download", request.RequestUri!.AbsolutePath);
            var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(request.RequestUri.Query);
            Assert.Equal("authenticated", query["type"].ToString()); Assert.Equal("crabshare/evidence/test", query["public_id"].ToString());
            Assert.Equal("png", query["format"].ToString()); Assert.Equal("12345", query["api_key"].ToString());
            Assert.InRange(long.Parse(query["expires_at"].ToString()) - long.Parse(query["timestamp"].ToString()), 1, 300);
            var canonical = string.Join("&", query.Where(p => p.Key is not ("api_key" or "signature")).OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => $"{p.Key}={p.Value}"));
            Assert.Equal(Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(canonical + "test-secret"))), query["signature"].ToString());
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([8, 9, 10]) });
        });
        await using var stream = await services.GetRequiredService<IFileStorage>().OpenReadAsync("cloudinary:test-cloud/image/authenticated/crabshare/evidence/test.png", default);
        using var result = new MemoryStream(); await stream.CopyToAsync(result); Assert.Equal(new byte[] { 8, 9, 10 }, result.ToArray());
    }
    [Theory]
    [InlineData("cloudinary:other-cloud/image/authenticated/crabshare/test.png")]
    [InlineData("https://attacker.invalid/test.png")]
    [InlineData("cloudinary:test-cloud/image/authenticated/../test.png")]
    public async Task Invalid_identifiers_never_cause_an_outbound_request(string uri)
    {
        using var services = Services(_ => throw new InvalidOperationException("Outbound request must not happen"));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => services.GetRequiredService<IFileStorage>().OpenReadAsync(uri, default));
    }
    [Fact]
    public async Task Cleanup_deletes_only_the_recorded_authenticated_asset()
    {
        using var services = Services(async request =>
        {
            Assert.Equal("/v1_1/test-cloud/image/destroy", request.RequestUri!.AbsolutePath);
            var body = await request.Content!.ReadAsStringAsync();
            Assert.Contains("public_id=crabshare%2Fevidence%2Ftest", body); Assert.Contains("type=authenticated", body);
            return new(HttpStatusCode.OK) { Content = new StringContent("{\"result\":\"ok\"}") };
        });
        await services.GetRequiredService<IFileStorage>().DeleteAsync("cloudinary:test-cloud/image/authenticated/crabshare/evidence/test.png", default);
    }

    [Fact]
    public async Task Previously_local_images_remain_readable_when_new_uploads_use_cloudinary()
    {
        var root = Path.Combine(Path.GetTempPath(), "CrabShareCloudinaryTests", Guid.NewGuid().ToString("N"));
        using var services = Services(_ => throw new InvalidOperationException("Legacy image must not go to Cloudinary"), root);
        var legacy = services.GetRequiredService<LocalFileStorage>();
        var stored = await legacy.SaveAsync(new MemoryStream([1, 3, 5]), "old.png", "image/png", "legacy", default);
        try
        {
            await using var read = await services.GetRequiredService<IFileStorage>().OpenReadAsync(stored.Uri, default);
            using var output = new MemoryStream(); await read.CopyToAsync(output); Assert.Equal(new byte[] { 1, 3, 5 }, output.ToArray());
        }
        finally
        {
            await services.GetRequiredService<IFileStorage>().DeleteAsync(stored.Uri, default);
            Directory.Delete(Path.Combine(root, "legacy")); Directory.Delete(root);
        }
    }
    [Fact]
    public async Task Access_failures_return_a_safe_service_error_without_upstream_body_or_credentials()
    {
        using var services = Services(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized)
        { Content = new StringContent("test-secret sensitive upstream body") }));
        var error = await Assert.ThrowsAsync<CrabShare.Api.Common.Errors.AppException>(() =>
            services.GetRequiredService<IFileStorage>().OpenReadAsync("cloudinary:test-cloud/image/authenticated/crabshare/evidence/test.png", default));
        Assert.Equal(503, error.StatusCode); Assert.DoesNotContain("test-secret", error.ToString()); Assert.DoesNotContain("sensitive upstream body", error.ToString());
    }
}
