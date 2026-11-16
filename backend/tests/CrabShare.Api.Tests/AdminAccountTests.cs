using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class AdminAccountTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }
    [Theory]
    [InlineData("GET", "/api/admin/users")]
    [InlineData("GET", "/api/admin/users/1")]
    [InlineData("POST", "/api/admin/users/1/lock")]
    [InlineData("POST", "/api/admin/users/1/unlock")]
    [InlineData("GET", "/api/admin/kyc-checks")]
    [InlineData("POST", "/api/admin/kyc-checks/1/approve-exception")]
    public async Task Anonymous_is_401_and_every_non_admin_role_is_403(string method, string path)
    {
        foreach (var role in new string?[] { null, Roles.Investor, Roles.Customer, Roles.OperatorMember, Roles.EvidenceReviewer })
        {
            using var client = Client(role);
            using var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { reason = "Test" }) };
            Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await client.SendAsync(request)).StatusCode);
        }
    }
    [Theory]
    [InlineData("/api/admin/users?role=Operator")]
    [InlineData("/api/admin/users?status=Approved")]
    [InlineData("/api/admin/users?page=0")]
    [InlineData("/api/admin/users?pageSize=101")]
    [InlineData("/api/admin/kyc-checks?result=Rejected")]
    [InlineData("/api/admin/kyc-checks?checkType=Face")]
    public async Task Invalid_filters_return_400_before_database_access(string path)
        => Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.PlatformAdmin).GetAsync(path)).StatusCode);
    [Theory]
    [InlineData("/api/admin/users/1/lock")]
    [InlineData("/api/admin/users/1/unlock")]
    [InlineData("/api/admin/kyc-checks/1/approve-exception")]
    public async Task Decision_requires_a_nonblank_bounded_reason(string path)
    {
        foreach (var reason in new[] { "", "   ", new string('x', 301) })
            Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.PlatformAdmin).PostAsJsonAsync(path, new { reason })).StatusCode);
    }
}
