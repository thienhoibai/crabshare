using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class AlertControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }

    [Theory]
    [InlineData("GET", "/api/operators/me/alerts", Roles.Investor)]
    [InlineData("GET", "/api/batches/TEST/alerts", Roles.OperatorMember)]
    [InlineData("POST", "/api/alerts/1/acknowledge", Roles.Customer)]
    public async Task Anonymous_is_401_and_wrong_role_is_403(string method, string path, string wrongRole)
    {
        foreach (var role in new string?[] { null, wrongRole })
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { responseNote = "Test" }) };
            Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await Client(role).SendAsync(request)).StatusCode);
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\n\t")]
    public async Task Acknowledge_requires_a_note_before_database_access(string note)
        => Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.OperatorMember).PostAsJsonAsync("/api/alerts/1/acknowledge", new { responseNote = note })).StatusCode);

    [Fact]
    public async Task Oversized_note_is_400()
        => Assert.Equal(HttpStatusCode.BadRequest, (await Client(Roles.OperatorMember).PostAsJsonAsync("/api/alerts/1/acknowledge", new { responseNote = new string('x', 301) })).StatusCode);

    [Theory]
    [InlineData("/api/operators/me/alerts?status=Failed", Roles.OperatorMember)]
    [InlineData("/api/batches/TEST/alerts?status=Failed", Roles.Investor)]
    public async Task Invalid_status_is_400(string path, string role)
        => Assert.Equal(HttpStatusCode.BadRequest, (await Client(role).GetAsync(path)).StatusCode);
}
