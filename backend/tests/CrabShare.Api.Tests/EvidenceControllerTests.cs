using System.Net;
using System.Net.Http.Headers;
using System.Data.Common;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

public class EvidenceControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private sealed class RejectDatabaseConnections : DbConnectionInterceptor
    {
        public override InterceptionResult ConnectionOpening(DbConnection connection, ConnectionEventData eventData, InterceptionResult result)
            => throw new InvalidOperationException("Controller authorization and validation must not access the database.");

        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection, ConnectionEventData eventData,
            InterceptionResult result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("Controller authorization and validation must not access the database.");
    }

    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(services =>
        {
            KycControllerTests.AddTestAuth(services);
            services.AddDbContext<AppDbContext>(options => options.AddInterceptors(new RejectDatabaseConnections()));
        })).CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }
    internal static MultipartFormDataContent Upload(string batch = "TEST", string slot = "0001", byte[]? bytes = null,
        string mime = "image/png", string? omitted = null, string? latitude = null, DateTimeOffset? capturedAt = null, long? captureRequestId = null)
    {
        var form = new MultipartFormDataContent();
        var fields = new Dictionary<string, string> { ["batchCode"] = batch, ["slotCode"] = slot,
            ["capturedAt"] = (capturedAt ?? DateTimeOffset.UtcNow.AddSeconds(-1)).ToString("O"), ["latitude"] = latitude ?? "10.123456", ["longitude"] = "106.654321" };
        foreach (var (key, value) in fields) if (key != omitted) form.Add(new StringContent(value), key);
        if (captureRequestId is { } id) form.Add(new StringContent(id.ToString()), "captureRequestId");
        if (omitted != "image")
        {
            var file = new ByteArrayContent(bytes ?? EvidenceImages.Png()); file.Headers.ContentType = new MediaTypeHeaderValue(mime); form.Add(file, "image", "camera.png");
        }
        return form;
    }
    [Theory]
    [InlineData(null)] [InlineData(Roles.Investor)] [InlineData(Roles.Customer)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.EvidenceReviewer)]
    public async Task Upload_is_only_for_authenticated_farm_members(string? role)
    {
        using var form = Upload(); Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await Client(role).PostAsync("/api/evidence", form)).StatusCode);
        Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await Client(role).GetAsync("/api/boxes")).StatusCode);
    }
    [Theory]
    [InlineData("batchCode")] [InlineData("slotCode")] [InlineData("capturedAt")] [InlineData("latitude")] [InlineData("longitude")] [InlineData("image")]
    public async Task Missing_metadata_is_400_before_database_access(string field)
    { using var form = Upload(omitted: field); Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.OperatorMember).PostAsync("/api/evidence", form)).StatusCode); }
    [Theory]
    [InlineData("91")] [InlineData("NaN")] [InlineData("not-a-number")]
    public async Task Invalid_location_is_400(string latitude)
    { using var form = Upload(latitude: latitude); Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.OperatorMember).PostAsync("/api/evidence", form)).StatusCode); }
    [Fact]
    public async Task Unsupported_media_empty_photo_and_future_capture_are_400()
    {
        foreach (var form in new[] { Upload(mime: "text/plain"), Upload(bytes: []), Upload(capturedAt: DateTimeOffset.UtcNow.AddDays(1)) })
        { using (form) Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.OperatorMember).PostAsync("/api/evidence", form)).StatusCode); }
    }
    [Theory]
    [InlineData("status=Bad")] [InlineData("page=0")] [InlineData("pageSize=101")]
    public async Task Invalid_box_filters_are_400(string query)
        => Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.OperatorMember).GetAsync("/api/boxes?" + query)).StatusCode);
}
