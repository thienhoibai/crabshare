using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public class OperatorsAuthenticationTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData("POST", "/api/operators")]
    [InlineData("GET", "/api/operators/me")]
    [InlineData("PUT", "/api/operators/me")]
    [InlineData("POST", "/api/operators/me/submit")]
    [InlineData("GET", "/api/operators/me/members")]
    [InlineData("POST", "/api/operators/me/members")]
    [InlineData("DELETE", "/api/operators/me/members/1")]
    [InlineData("GET", "/api/admin/operators")]
    [InlineData("POST", "/api/admin/operators/1/approve")]
    [InlineData("POST", "/api/admin/operators/1/reject")]
    [InlineData("POST", "/api/admin/operators/1/suspend")]
    public async Task Anonymous_is_rejected(string method, string path)
    {
        using var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")).CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}

[Trait("Category", "Database")]
public class OperatorsControllerTests(OperatorDatabaseFixture fixture) : IClassFixture<OperatorDatabaseFixture>
{
    private static object Profile(string? taxCode = null) => new
    {
        legalName = "  HTX Cua Việt  ", taxCode = taxCode ?? Random.Shared.NextInt64(1000000000, 9999999999).ToString(),
        businessRegNo = "DK-123", farmAddress = "  Năm Căn, Cà Mau  "
    };

    private async Task<(HttpClient Client, AuthResponse Auth, string Password)> UserAsync()
    {
        var client = fixture.Factory.CreateClient();
        const string password = "Test-password-123";
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"{Guid.NewGuid():N}@test.local", password, fullName = "Người đăng ký", role = "Customer" });
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth, password);
    }

    private static async Task<JsonElement> CreateAsync(HttpClient client, object? profile = null)
    {
        var response = await client.PostAsJsonAsync("/api/operators", profile ?? Profile());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.EndsWith("/api/operators/me", response.Headers.Location!.ToString());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Create_persists_owner_role_and_login_claim_and_supports_original_token()
    {
        var (client, auth, password) = await UserAsync();
        Assert.Null(auth.User.OperatorId);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/operators/me")).StatusCode);
        var created = await CreateAsync(client);
        var id = created.GetProperty("operatorId").GetInt64();
        Assert.Equal("Draft", created.GetProperty("status").GetString());
        Assert.Equal("HTX Cua Việt", created.GetProperty("legalName").GetString());
        await using var db = fixture.OpenDb();
        var member = await db.OperatorMembers.SingleAsync(m => m.UserId == auth.User.UserId);
        Assert.Equal(id, member.OperatorId);
        Assert.Equal("Owner", member.MemberRole);
        Assert.Equal(1, await db.AppUserRoles.CountAsync(r => r.UserId == member.UserId && r.RoleCode == Roles.OperatorMember));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/operators/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/operators", Profile())).StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password });
        var loggedIn = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Contains(Roles.OperatorMember, loggedIn.User.Roles);
        Assert.Equal(id, loggedIn.User.OperatorId);
        Assert.Equal(id.ToString(), new JwtSecurityTokenHandler().ReadJwtToken(loggedIn.AccessToken).Claims.Single(c => c.Type == "operator_id").Value);
        var submitted = await client.PostAsync("/api/operators/me/submit", null);
        Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
        var result = await submitted.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Submitted", result.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.String, result.GetProperty("submittedAt").ValueKind);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PutAsJsonAsync("/api/operators/me", Profile())).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync("/api/operators/me/submit", null)).StatusCode);
    }

    [Theory]
    [InlineData("Draft", HttpStatusCode.OK)]
    [InlineData("Rejected", HttpStatusCode.OK)]
    [InlineData("Submitted", HttpStatusCode.UnprocessableEntity)]
    [InlineData("Approved", HttpStatusCode.UnprocessableEntity)]
    [InlineData("Suspended", HttpStatusCode.UnprocessableEntity)]
    public async Task Edit_and_submit_follow_state_rules(string status, HttpStatusCode expected)
    {
        var (client, _, _) = await UserAsync();
        var created = await CreateAsync(client);
        await using var db = fixture.OpenDb();
        var op = await db.Operators.FindAsync(created.GetProperty("operatorId").GetInt64());
        op!.Status = status;
        await db.SaveChangesAsync();
        Assert.Equal(expected, (await client.PutAsJsonAsync("/api/operators/me", Profile())).StatusCode);
        var submit = await client.PostAsync("/api/operators/me/submit", null);
        Assert.Equal(status == "Draft" ? HttpStatusCode.OK : HttpStatusCode.UnprocessableEntity, submit.StatusCode);
    }

    [Fact]
    public async Task Staff_can_view_and_edit_but_cannot_submit_and_revoked_role_is_rejected()
    {
        var (owner, _, _) = await UserAsync();
        var op = await CreateAsync(owner);
        var (staff, auth, _) = await UserAsync();
        await using var db = fixture.OpenDb();
        db.OperatorMembers.Add(new OperatorMember { UserId = auth.User.UserId, OperatorId = op.GetProperty("operatorId").GetInt64(), MemberRole = "Staff", JoinedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow });
        var role = new AppUserRole { UserId = auth.User.UserId, RoleCode = Roles.OperatorMember, GrantedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow };
        db.AppUserRoles.Add(role);
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/operators/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.PutAsJsonAsync("/api/operators/me", Profile())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync("/api/operators/me/submit", null)).StatusCode);
        db.AppUserRoles.Remove(role);
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/operators/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync("/api/operators/me", Profile())).StatusCode);
    }

    [Fact]
    public async Task Client_cannot_select_another_operator_or_grant_permissions()
    {
        var (owner, _, _) = await UserAsync();
        var op = await CreateAsync(owner);
        var (stranger, _, _) = await UserAsync();
        var forged = new { operatorId = op.GetProperty("operatorId").GetInt64(), memberRole = "Owner", role = "OperatorMember", legalName = "Attack", taxCode = "999", businessRegNo = "1", farmAddress = "1" };
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/operators/me?operatorId={forged.operatorId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.PutAsJsonAsync("/api/operators/me", forged)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.PostAsJsonAsync("/api/operators/me/submit", forged)).StatusCode);
        Assert.Equal("HTX Cua Việt", (await owner.GetFromJsonAsync<JsonElement>("/api/operators/me")).GetProperty("legalName").GetString());
    }

    [Fact]
    public async Task Duplicate_tax_code_rolls_back_operator_membership_and_role()
    {
        var taxCode = Random.Shared.NextInt64(1000000000, 9999999999).ToString();
        var (first, _, _) = await UserAsync();
        await CreateAsync(first, Profile(taxCode));
        var (second, auth, _) = await UserAsync();
        await using var db = fixture.OpenDb();
        var before = await db.Operators.CountAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await second.PostAsJsonAsync("/api/operators", Profile(taxCode))).StatusCode);
        Assert.Equal(before, await db.Operators.CountAsync());
        Assert.False(await db.OperatorMembers.AnyAsync(m => m.UserId == auth.User.UserId));
        Assert.False(await db.AppUserRoles.AnyAsync(r => r.UserId == auth.User.UserId && r.RoleCode == Roles.OperatorMember));
    }

    [Fact]
    public async Task Concurrent_creation_and_submission_only_succeed_once()
    {
        var (client, auth, _) = await UserAsync();
        await using var db = fixture.OpenDb();
        var before = await db.Operators.CountAsync();
        var results = await Task.WhenAll(
            client.PostAsJsonAsync("/api/operators", Profile()),
            client.PostAsJsonAsync("/api/operators", Profile()));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(before + 1, await db.Operators.CountAsync());
        Assert.Equal(1, await db.OperatorMembers.CountAsync(m => m.UserId == auth.User.UserId));
        Assert.Equal(1, await db.AppUserRoles.CountAsync(r => r.UserId == auth.User.UserId && r.RoleCode == Roles.OperatorMember));
        var operatorCount = await db.Operators.CountAsync();
        var submissions = await Task.WhenAll(
            client.PostAsync("/api/operators/me/submit", null),
            client.PostAsync("/api/operators/me/submit", null));
        Assert.Single(submissions, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(submissions, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        Assert.Equal(operatorCount, await db.Operators.CountAsync());
    }

    [Fact]
    public async Task Existing_role_is_not_duplicated_and_invalid_input_is_rejected()
    {
        var (client, auth, _) = await UserAsync();
        await using var db = fixture.OpenDb();
        db.AppUserRoles.Add(new AppUserRole { UserId = auth.User.UserId, RoleCode = Roles.OperatorMember, GrantedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/operators", new { legalName = "  ", taxCode = new string('1', 15) })).StatusCode);
        var created = await CreateAsync(client);
        Assert.Equal(1, await db.AppUserRoles.CountAsync(r => r.UserId == auth.User.UserId && r.RoleCode == Roles.OperatorMember));
        var op = await db.Operators.FindAsync(created.GetProperty("operatorId").GetInt64());
        op!.FarmAddress = " ";
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync("/api/operators/me/submit", null)).StatusCode);
    }
}
