using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class EvidenceExplanationControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role != null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }
    [Theory]
    [InlineData(null)] [InlineData(Roles.Investor)] [InlineData(Roles.Customer)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.EvidenceReviewer)]
    public async Task All_explanation_routes_require_operator_role(string? role)
    {
        using var client = Client(role); var expected = role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
        foreach (var suffix in new[] { "", "/1", "/1/image" }) Assert.Equal(expected, (await client.GetAsync("/api/operators/me/evidence" + suffix)).StatusCode);
        Assert.Equal(expected, (await client.PostAsJsonAsync("/api/evidence/1/explanation", new { text = "Explanation" })).StatusCode);
    }
    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("   ")]
    public async Task Missing_or_blank_explanation_is_400(string? text)
    { using var client = Client(Roles.OperatorMember); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/evidence/1/explanation", new { text })).StatusCode); }
    [Fact]
    public async Task Oversized_text_is_400()
    { using var client = Client(Roles.OperatorMember); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/evidence/1/explanation", new { text = new string('x', 1001) })).StatusCode); }
    [Theory]
    [InlineData("status=Invalid")] [InlineData("page=0")] [InlineData("pageSize=101")]
    public async Task Invalid_filters_are_400(string query)
    { using var client = Client(Roles.OperatorMember); Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/operators/me/evidence?" + query)).StatusCode); }
}
