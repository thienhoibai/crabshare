using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class ProductionLogTests
{
    [Fact]
    public async Task Staff_can_read_thresholds_and_record_but_cannot_change_configuration()
    {
        var farm = await Setup(); var staff = await AddStaff(farm); using var client = Client(staff);
        var configuration = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm));
        Assert.False(configuration.GetProperty("canConfigure").GetBoolean()); Assert.True(configuration.GetProperty("canRecord").GetBoolean()); Assert.Equal(1, configuration.GetProperty("current").GetProperty("versionNo").GetInt32());
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Forbidden);
        using var response = await client.PostAsJsonAsync(Path(farm), Input()); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(staff, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("recordedBy").GetInt64());
    }

    [Fact]
    public async Task Other_farm_and_anonymous_cannot_read_write_or_configure()
    {
        var farm = await Setup(); var other = await Setup(); using var foreign = Client(other.UserId); using var anonymous = fixture.Factory.CreateClient();
        foreach (var path in new[] { Path(farm), ThresholdPath(farm) })
        {
            await Error(await foreign.GetAsync(path), HttpStatusCode.Forbidden); await Error(await anonymous.GetAsync(path), HttpStatusCode.Unauthorized);
        }
        await Error(await foreign.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.Forbidden);
        await Error(await foreign.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Forbidden);
        await Error(await anonymous.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.Unauthorized);
        await Error(await anonymous.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("role")] [InlineData("membership")] [InlineData("locked")]
    public async Task Current_database_permissions_override_stale_operator_token(string change)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Db(async db =>
        {
            if (change == "role") db.AppUserRoles.RemoveRange(await db.AppUserRoles.Where(r => r.UserId == farm.UserId).ToListAsync());
            if (change == "membership") db.OperatorMembers.RemoveRange(await db.OperatorMembers.Where(m => m.UserId == farm.UserId).ToListAsync());
            if (change == "locked") (await db.AppUsers.SingleAsync(u => u.UserId == farm.UserId)).Status = "Locked";
            await db.SaveChangesAsync(); return true;
        });
        await Error(await client.GetAsync(Path(farm)), HttpStatusCode.Forbidden);
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.Forbidden);
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Forbidden);
        await Error(await client.GetAsync("/api/operators/me/production-logs"), HttpStatusCode.Forbidden);
        await Error(await client.GetAsync("/api/operators/me/production-batches"), HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Suspended_operator_cannot_configure_or_record()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Db(async db => { (await db.Operators.SingleAsync(o => o.OperatorId == farm.OperatorId)).Status = "Suspended"; await db.SaveChangesAsync(); return true; });
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.UnprocessableEntity, "production.operator_not_approved");
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.UnprocessableEntity, "production.operator_not_approved");
        var config = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm)); Assert.False(config.GetProperty("canConfigure").GetBoolean()); Assert.False(config.GetProperty("canRecord").GetBoolean());
    }

    [Fact]
    public async Task Foreign_operator_claim_is_rejected_even_when_database_membership_owns_batch()
    {
        var farm = await Setup(); var other = await Setup(); using var client = Client(farm.UserId, claimedOperator: other.OperatorId);
        await Error(await client.GetAsync(Path(farm)), HttpStatusCode.Forbidden);
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.Forbidden);
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Owner_demotion_to_staff_immediately_removes_configuration_permission()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Db(async db => { (await db.OperatorMembers.SingleAsync(m => m.UserId == farm.UserId)).MemberRole = "Staff"; await db.SaveChangesAsync(); return true; });
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Forbidden);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(Path(farm), Input())).StatusCode);
    }

    [Theory]
    [InlineData("share")] [InlineData("confirmed")]
    public async Task Investor_with_confirmed_interest_can_read_applied_thresholds_but_cannot_write(string interest)
    {
        var farm = await Setup(); using var owner = Client(farm.UserId); Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync(Path(farm), Input())).StatusCode);
        var investor = await fixture.CreateInvestorAsync();
        await Db(async db => { db.AppUserRoles.Add(new AppUserRole { UserId = investor, RoleCode = Roles.Investor, GrantedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); return true; });
        using var client = Client(investor, Roles.Investor); await Error(await client.GetAsync(Path(farm)), HttpStatusCode.Forbidden);
        await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            if (interest == "share") db.CapitalShares.Add(new CapitalShare { BatchId = farm.BatchId, InvestorId = investor, ConfirmedAmount = 10, SnapshottedAt = now });
            else db.Contributions.Add(new Contribution { BatchId = farm.BatchId, InvestorId = investor, Amount = 10, Status = "Confirmed", ReservedAt = now, ExpiresAt = now.AddHours(1), ConfirmedAt = now, CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        var log = Assert.Single((await client.GetFromJsonAsync<JsonElement>(Path(farm))).GetProperty("items").EnumerateArray());
        Assert.Equal(1, log.GetProperty("thresholdVersion").GetInt32()); Assert.Equal(7m, log.GetProperty("thresholdsApplied").GetProperty("phMin").GetDecimal());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(ThresholdPath(farm))).StatusCode);
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.Forbidden);
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)), HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Reserved_investment_does_not_grant_log_access()
    {
        var farm = await Setup(); var investor = await fixture.CreateInvestorAsync();
        await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            db.AppUserRoles.Add(new AppUserRole { UserId = investor, RoleCode = Roles.Investor, GrantedAt = now });
            db.Contributions.Add(new Contribution { BatchId = farm.BatchId, InvestorId = investor, Amount = 10, Status = "Reserved", ReservedAt = now, ExpiresAt = now.AddHours(1), CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        using var client = Client(investor, Roles.Investor); await Error(await client.GetAsync(Path(farm)), HttpStatusCode.Forbidden); await Error(await client.GetAsync(ThresholdPath(farm)), HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Active_database_platform_admin_can_read_but_cannot_record_for_operator()
    {
        var farm = await Setup(); using var owner = Client(farm.UserId); Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync(Path(farm), Input())).StatusCode);
        var admin = await Db(async db => { var user = NewUser("Log Admin", Roles.PlatformAdmin, DateTimeOffset.UtcNow); db.AppUsers.Add(user); await db.SaveChangesAsync(); return user.UserId; });
        using var client = Client(admin, Roles.PlatformAdmin); Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Path(farm))).StatusCode); Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(ThresholdPath(farm))).StatusCode);
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.Forbidden);
        await Db(async db => { db.AppUserRoles.RemoveRange(await db.AppUserRoles.Where(r => r.UserId == admin).ToListAsync()); await db.SaveChangesAsync(); return true; });
        await Error(await client.GetAsync(Path(farm)), HttpStatusCode.Forbidden);
    }
}
