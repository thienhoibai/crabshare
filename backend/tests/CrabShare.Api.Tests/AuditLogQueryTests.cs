using System.Net;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class AuditLogQueryTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> App() => factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
    [Theory]
    [InlineData(null)] [InlineData(Roles.Customer)] [InlineData(Roles.Investor)] [InlineData(Roles.OperatorMember)] [InlineData(Roles.EvidenceReviewer)]
    public async Task Audit_list_and_export_require_platform_admin(string? role)
    {
        using var app = App(); using var client = app.CreateClient();
        if (role is not null) { client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        foreach (var path in new[] { "", "/export" }) Assert.Equal(role == null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/audit-log" + path)).StatusCode);
    }
    [Theory]
    [InlineData("page=0")] [InlineData("pageSize=101")] [InlineData("throughAuditId=-1")] [InlineData("from=2026-10-17&to=2026-10-16")] [InlineData("to=9999-12-31")] [InlineData("from=0001-01-01")]
    public async Task Invalid_query_is_rejected_before_database_access(string query)
    {
        using var app = App(); using var client = app.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.PlatformAdmin);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/audit-log?" + query)).StatusCode);
    }
}
