using System.Net;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class BatchExploreControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")
            .ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role != null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }

    [Theory]
    [InlineData(null)] [InlineData(Roles.Customer)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.OperatorMember)]
    public async Task Discovery_list_requires_investor(string? role)
    {
        using var client = Client(role);
        Assert.Equal(role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/batches")).StatusCode);
    }

    [Theory]
    [InlineData("status=Bad")] [InlineData("crabType=Bad")] [InlineData("page=0")]
    [InlineData("pageSize=101")] [InlineData("page=abc")]
    public async Task Invalid_queries_are_rejected_before_database_access(string query)
    {
        using var client = Client(Roles.Investor);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/batches?" + query)).StatusCode);
    }
}
