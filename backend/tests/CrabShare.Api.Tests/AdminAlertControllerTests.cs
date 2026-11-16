using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class AdminAlertControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }
    [Theory]
    [InlineData("GET", "/api/admin/alerts")]
    [InlineData("POST", "/api/admin/alerts/1/resolve")]
    public async Task Only_admin_may_access(string method, string path)
    {
        foreach (var role in new string?[] { null, Roles.OperatorMember, Roles.Investor, Roles.Customer, Roles.EvidenceReviewer })
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { note = "Test" }) };
            Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await Client(role).SendAsync(request)).StatusCode);
        }
    }
    [Fact]
    public async Task Resolve_requires_nonblank_bounded_note()
    {
        foreach (var note in new[] { "", "\n\t ", new string('x', 301) })
            Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.PlatformAdmin).PostAsJsonAsync("/api/admin/alerts/1/resolve", new { note })).StatusCode);
    }
    [Theory]
    [InlineData("status=Failed")]
    [InlineData("severity=Urgent")]
    [InlineData("page=0")]
    [InlineData("pageSize=101")]
    public async Task Invalid_filters_are_400(string query)
        => Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.PlatformAdmin).GetAsync("/api/admin/alerts?" + query)).StatusCode);
}
