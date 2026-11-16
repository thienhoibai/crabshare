using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Infrastructure.Ekyc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class PaymentProfileTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? role = null)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")
            .ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        return client;
    }

    [Theory]
    [InlineData("GET", "/api/me/payout-account")]
    [InlineData("PUT", "/api/me/payout-account")]
    [InlineData("GET", "/api/me/addresses")]
    [InlineData("POST", "/api/me/addresses")]
    [InlineData("GET", "/api/me/addresses/1")]
    [InlineData("PUT", "/api/me/addresses/1")]
    [InlineData("DELETE", "/api/me/addresses/1")]
    public async Task Authentication_is_required(string method, string path)
    {
        using var req = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) };
        using var response = await Client().SendAsync(req);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(Roles.Customer, "/api/me/payout-account")]
    [InlineData(Roles.PlatformAdmin, "/api/me/payout-account")]
    [InlineData(Roles.OperatorMember, "/api/me/addresses")]
    [InlineData(Roles.Investor, "/api/me/addresses")]
    public async Task Other_roles_are_forbidden(string role, string path)
    {
        using var response = await Client(role).GetAsync(path);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("", "123456", "Nguyen An")]
    [InlineData("VCB", "12abc", "Nguyen An")]
    [InlineData("VCB", "123456", "   ")]
    public async Task Invalid_bank_details_return_400(string bank, string account, string name)
    {
        using var response = await Client(Roles.Investor).PutAsJsonAsync("/api/me/payout-account",
            new { bankCode = bank, accountNo = account, accountHolderName = name });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_address_returns_400()
    {
        using var response = await Client(Roles.Customer).PostAsJsonAsync("/api/me/addresses",
            new { recipientName = "An", recipientPhone = "abc", addressLine = "", province = "" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("Trần Đăng Khôi", "  TRAN   DANG KHOI  ", true)]
    [InlineData("HTX Cua Cà Mau", "htx cua ca mau", true)]
    [InlineData("Nguyễn An", "Nguyen Anh", false)]
    public async Task Fake_matcher_normalizes_accents_case_and_whitespace(string expected, string actual, bool matched)
        => Assert.Equal(matched, (await new FakeBankNameMatcher().MatchAsync(expected, actual, default)).Matched);
}
