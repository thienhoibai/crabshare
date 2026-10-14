using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Evidence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class CaptureRequestTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData(null)] [InlineData(Roles.Investor)] [InlineData(Roles.Customer)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.EvidenceReviewer)]
    public async Task List_requires_operator_role(string? role)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient();
        if (role != null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        Assert.Equal(role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await client.GetAsync("/api/operators/me/capture-requests")).StatusCode);
    }
    [Theory]
    [InlineData("status=Invalid")] [InlineData("page=0")] [InlineData("pageSize=101")]
    public async Task Invalid_filters_are_400(string query)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.OperatorMember);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/operators/me/capture-requests?" + query)).StatusCode);
    }
}
