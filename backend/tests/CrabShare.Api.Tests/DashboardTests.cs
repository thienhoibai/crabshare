using System.Net;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Admin;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class DashboardTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData(null)] [InlineData(Roles.Investor)] [InlineData(Roles.Customer)] [InlineData(Roles.OperatorMember)] [InlineData(Roles.EvidenceReviewer)]
    public async Task Admin_dashboard_and_reports_reject_other_roles(string? role)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        foreach (var path in new[] { "/api/admin/dashboard", "/api/admin/reports/capital.csv" })
            Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }
    [Theory]
    [InlineData(null)] [InlineData(Roles.Investor)] [InlineData(Roles.Customer)] [InlineData(Roles.PlatformAdmin)] [InlineData(Roles.EvidenceReviewer)]
    public async Task Farm_dashboard_rejects_other_roles(string? role)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        Assert.Equal(role is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await client.GetAsync("/api/operators/me/dashboard")).StatusCode);
    }
    [Fact]
    public void Date_range_uses_vietnam_day_and_bounds_report_cost()
    {
        var now = new DateTimeOffset(2026, 10, 15, 18, 0, 0, TimeSpan.Zero);
        var result = new DashboardQuery().Range(now);
        Assert.Equal(new DateOnly(2026, 10, 16), result.To); Assert.Equal(30, result.To.DayNumber - result.From.DayNumber + 1);
        Assert.Equal(TimeSpan.FromHours(7), result.Start.Offset); Assert.Equal(0, result.Start.Hour);
        Assert.Throws<AppException>(() => new DashboardQuery { From = new(2026, 10, 17), To = new(2026, 10, 16) }.Range(now));
        Assert.Throws<AppException>(() => new DashboardQuery { From = new(2025, 1, 1), To = new(2026, 10, 16) }.Range(now));
        Assert.Throws<AppException>(() => new DashboardQuery { To = DateOnly.MinValue }.Range(now));
        Assert.Throws<AppException>(() => new DashboardQuery { To = DateOnly.MaxValue }.Range(now));
    }
}
