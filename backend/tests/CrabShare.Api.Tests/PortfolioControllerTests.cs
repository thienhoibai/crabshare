using System.Net;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class PortfolioControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role != null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }
    [Theory]
    [InlineData(null)] [InlineData(Roles.Customer)] [InlineData(Roles.OperatorMember)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.EvidenceReviewer)]
    public async Task Only_investors_can_read_portfolio(string? role)
    {
        using var client = Client(role);
        foreach (var path in new[] { "", "/TEST" }) Assert.Equal(role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/investor/portfolio" + path)).StatusCode);
    }
    [Theory]
    [InlineData("status=Bad")] [InlineData("page=0")] [InlineData("pageSize=101")]
    public async Task Invalid_filters_are_400_before_database_access(string query)
    { using var client = Client(Roles.Investor); Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/investor/portfolio?" + query)).StatusCode); }
    [Fact]
    public async Task Oversized_batch_code_is_400()
    { using var client = Client(Roles.Investor); Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/investor/portfolio/" + new string('x', 21))).StatusCode); }
}
