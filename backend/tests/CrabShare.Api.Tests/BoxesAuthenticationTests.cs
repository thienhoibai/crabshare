using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CrabShare.Api.Tests;

public class BoxesAuthenticationTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData("GET", "/api/boxes")]
    [InlineData("POST", "/api/boxes")]
    [InlineData("POST", "/api/boxes/range")]
    [InlineData("PATCH", "/api/boxes/0001")]
    public async Task Anonymous_cannot_access_boxes(string method, string path)
    {
        using var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")).CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
