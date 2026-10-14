using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class EvidenceReviewControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role != null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }
    [Theory]
    [InlineData(null)] [InlineData(Roles.Investor)] [InlineData(Roles.OperatorMember)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.Customer)]
    public async Task All_review_routes_require_reviewer_role(string? role)
    {
        using var client = Client(role);
        var expected = role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
        foreach (var path in new[] { "", "/1", "/1/image" }) Assert.Equal(expected, (await client.GetAsync("/api/review/evidence" + path)).StatusCode);
        Assert.Equal(expected, (await client.PostAsJsonAsync("/api/review/evidence/1/verdict", new { verdict = "Pass", note = "Reviewed" })).StatusCode);
    }
    [Theory]
    [InlineData("status=Invalid")] [InlineData("page=0")] [InlineData("pageSize=101")]
    public async Task Invalid_filters_are_400(string query)
    { using var client = Client(Roles.EvidenceReviewer); Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/review/evidence?" + query)).StatusCode); }
    [Theory]
    [InlineData("Accepted", "note")] [InlineData("pass", "note")] [InlineData("Pass", "")] [InlineData("Fail", "   ")] [InlineData(null, "note")]
    public async Task Invalid_verdict_or_note_is_400(string? verdict, string note)
    { using var client = Client(Roles.EvidenceReviewer); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/review/evidence/1/verdict", new { verdict, note })).StatusCode); }
    [Fact]
    public async Task Oversized_note_is_400()
    { using var client = Client(Roles.EvidenceReviewer); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/review/evidence/1/verdict", new { verdict = "Pass", note = new string('x', 501) })).StatusCode); }
}
