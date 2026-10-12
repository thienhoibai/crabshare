using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CrabShare.Api.Tests;

/// <summary>
/// Test API chạy cả ứng dụng trong bộ nhớ (WebApplicationFactory). Test này không cần CSDL.
/// Test cần CSDL thì đánh dấu [Trait("Category", "Database")] và chạy trên máy có LocalDB.
/// </summary>
public class HealthControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Live_tra_ve_200()
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")).CreateClient();

        var response = await client.GetAsync("/api/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
