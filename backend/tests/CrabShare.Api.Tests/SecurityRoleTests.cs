using System.Net;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

public class SecurityRoleTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    public static IEnumerable<object[]> DeniedRoles()
    {
        var roles = new[] { Roles.PlatformAdmin, Roles.Customer, Roles.Investor, Roles.OperatorMember, Roles.EvidenceReviewer };
        var policies = new (string Path, string[] Allowed)[] {
            ("/api/admin/users", [Roles.PlatformAdmin]),
            ("/api/boxes", [Roles.OperatorMember]),
            ("/api/me/kyc", [Roles.Investor]),
            ("/api/me/payout-account", [Roles.Investor, Roles.OperatorMember]),
            ("/api/me/addresses", [Roles.Customer, Roles.Investor]),
            ("/api/funding/batches", [Roles.Investor]),
        };
        foreach (var (path, allowed) in policies)
            foreach (var role in roles.Except(allowed)) yield return [path, role];
    }
    [Theory, MemberData(nameof(DeniedRoles))]
    public async Task Wrong_role_is_rejected_before_database_access(string path, string role)
    {
        using var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false").ConfigureTestServices(KycControllerTests.AddTestAuth));
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", "1"); client.DefaultRequestHeaders.Add("X-Test-Role", role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }
}
