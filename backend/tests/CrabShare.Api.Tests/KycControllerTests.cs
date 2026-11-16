using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Accounts;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>Phân quyền và validation phải kết thúc trước khi gọi CSDL/provider; chạy trong CI.</summary>
public class KycControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    internal static void AddTestAuth(IServiceCollection services)
        => services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = KycTestAuthHandler.SchemeName;
            options.DefaultChallengeScheme = KycTestAuthHandler.SchemeName;
            options.DefaultForbidScheme = KycTestAuthHandler.SchemeName;
        }).AddScheme<AuthenticationSchemeOptions, KycTestAuthHandler>(KycTestAuthHandler.SchemeName, _ => { });

    private HttpClient Client(string? role = null)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")
            .ConfigureTestServices(AddTestAuth)).CreateClient();
        if (role is not null)
        {
            client.DefaultRequestHeaders.Add("X-Test-User", "1");
            client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }
        return client;
    }

    internal static MultipartFormDataContent Images(bool? consent = true, string? missing = null,
        string contentType = "image/png", byte[]? bytes = null)
    {
        var form = new MultipartFormDataContent();
        if (consent is not null) form.Add(new StringContent(consent.Value ? "true" : "false"), "consent");
        foreach (var name in new[] { "idCardFront", "idCardBack", "selfie" })
        {
            if (name == missing) continue;
            var file = new ByteArrayContent(bytes ?? Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII="));
            file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            form.Add(file, name, name + ".png");
        }
        return form;
    }

    [Theory]
    [InlineData("GET", "/api/me/kyc")]
    [InlineData("POST", "/api/kyc/ekyc")]
    public async Task Anonymous_requests_are_unauthorized(string method, string path)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "POST") request.Content = Images();
        using var response = await Client().SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(Roles.Customer)]
    [InlineData(Roles.OperatorMember)]
    [InlineData(Roles.PlatformAdmin)]
    [InlineData(Roles.EvidenceReviewer)]
    public async Task Other_roles_cannot_read_or_submit_kyc(string role)
    {
        using var client = Client(role);
        using var read = await client.GetAsync("/api/me/kyc");
        using var form = Images();
        using var submit = await client.PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.Forbidden, read.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, submit.StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(null)]
    public async Task Consent_must_be_explicitly_true(bool? consent)
    {
        using var form = Images(consent);
        using var response = await Client(Roles.Investor).PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty("Consent", out _));
    }

    [Theory]
    [InlineData("idCardFront", "IdCardFront")]
    [InlineData("idCardBack", "IdCardBack")]
    [InlineData("selfie", "Selfie")]
    public async Task All_three_images_are_required(string missing, string errorKey)
    {
        using var form = Images(missing: missing);
        using var response = await Client(Roles.Investor).PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty(errorKey, out _));
    }

    [Theory]
    [InlineData("application/pdf", "kyc.image_format")]
    [InlineData("image/png", "kyc.image_required")]
    public async Task Unsupported_or_empty_images_are_rejected(string type, string code)
    {
        using var form = Images(contentType: type, bytes: type == "image/png" ? [] : [1, 2, 3]);
        using var response = await Client(Roles.Investor).PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(code, problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Images_over_five_megabytes_are_rejected()
    {
        using var form = Images(bytes: new byte[EkycUploadLimits.MaxImageBytes + 1]);
        using var response = await Client(Roles.Investor).PostAsync("/api/kyc/ekyc", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
