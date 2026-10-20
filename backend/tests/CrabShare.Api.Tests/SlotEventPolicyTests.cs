using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

public partial class SlotEventTests
{
    // Deliberately chosen farm policy; these numbers must never become product defaults.
    private static Dictionary<string, object?> Policy(int version = 0, string basis = "AfterStocking", int days = 14, bool alerts = false) => new()
    {
        ["expectedVersionNo"] = version, ["restockCutoffBasis"] = basis, ["restockCutoffDays"] = days,
        ["mortalityWindowHours"] = alerts ? 6 : null, ["mortalityThresholdPercent"] = alerts ? 0.5m : null,
        ["mortalitySeverity"] = alerts ? "High" : null, ["mortalityAckWithinHours"] = alerts ? 3 : null,
    };
    private static async Task<JsonElement> Success(HttpResponseMessage response, HttpStatusCode status = HttpStatusCode.Created)
    {
        Assert.Equal(status, response.StatusCode); return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    private static async Task Failure(HttpResponseMessage response, HttpStatusCode status)
    {
        using (response)
        {
            Assert.Equal(status, response.StatusCode);
            var error = await response.Content.ReadFromJsonAsync<JsonElement>();
            if (status == HttpStatusCode.BadRequest) Assert.True(error.TryGetProperty("errors", out _));
            else
            {
                Assert.False(string.IsNullOrWhiteSpace(error.GetProperty("code").GetString()));
                Assert.False(string.IsNullOrWhiteSpace(error.GetProperty("detail").GetString()));
            }
        }
    }

    [Fact]
    public async Task Unconfigured_farm_has_no_cutoff_or_mortality_alert_default()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var policy = await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm));
        Assert.True(policy.GetProperty("canConfigure").GetBoolean());
        Assert.Equal(JsonValueKind.Null, policy.GetProperty("current").ValueKind);
        Assert.Equal(JsonValueKind.Null, policy.GetProperty("restockDeadline").ValueKind);
        Assert.Equal(10, policy.GetProperty("suggestedRestockCutoffDays").GetInt32());
        var evidence = await Photo(farm, DateTimeOffset.UtcNow.AddMinutes(-2));
        var mortality = Input(farm, "Mortality"); mortality["evidenceId"] = evidence;
        await Success(await client.PostAsJsonAsync(Path(farm), mortality));
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId)));
        var restock = Input(farm, "Restocked", DateTimeOffset.UtcNow.AddSeconds(-10));
        restock["replacesCrabItemId"] = farm.CrabId; restock["evidenceId"] = await Photo(farm, DateTimeOffset.UtcNow.AddSeconds(-20));
        await Failure(await client.PostAsJsonAsync(Path(farm), restock), HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Owner_policy_versions_are_immutable_and_stale_writes_conflict()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var first = await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.OK);
        Assert.Equal(1, first.GetProperty("versionNo").GetInt32()); Assert.Equal(farm.UserId, first.GetProperty("createdBy").GetInt64());
        Assert.Equal("AfterStocking", first.GetProperty("restockCutoffBasis").GetString());
        await Failure(await client.PutAsJsonAsync(PolicyPath(farm), Policy(0, days: 21)), HttpStatusCode.Conflict);
        var next = await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy(1, "BeforeHarvest", 8)), HttpStatusCode.OK);
        Assert.Equal(2, next.GetProperty("versionNo").GetInt32()); Assert.NotEqual(first.GetProperty("id").GetInt64(), next.GetProperty("id").GetInt64());
        var config = await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm));
        Assert.Equal(farm.StockedAt.ToOffset(TimeSpan.FromHours(7)).Date.AddDays(82).ToString("yyyy-MM-dd"), config.GetProperty("restockDeadline").GetString());
        Assert.Equal(14, first.GetProperty("restockCutoffDays").GetInt32());
    }

    [Fact]
    public async Task Concurrent_policy_writes_publish_one_version()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var replies = await Task.WhenAll(client.PutAsJsonAsync(PolicyPath(farm), Policy(days: 12)), client.PutAsJsonAsync(PolicyPath(farm), Policy(days: 18)));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Conflict);
        foreach (var reply in replies) reply.Dispose();
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm))).GetProperty("current").GetProperty("versionNo").GetInt32());
    }

    [Fact]
    public async Task Staff_can_record_but_only_owner_can_configure_policy()
    {
        var farm = await Setup(memberRole: "Staff"); using var client = Client(farm.UserId);
        Assert.False((await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm))).GetProperty("canConfigure").GetBoolean());
        await Failure(await client.PutAsJsonAsync(PolicyPath(farm), Policy()), HttpStatusCode.Forbidden);
        await Success(await client.PostAsJsonAsync(Path(farm), Input(farm)));
    }

    [Theory]
    [InlineData("mortalityWindowHours", 6)]
    [InlineData("mortalityThresholdPercent", 1)]
    [InlineData("mortalityAckWithinHours", 3)]
    public async Task Partial_mortality_configuration_is_rejected(string field, int value)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var policy = Policy(); policy[field] = value;
        await Failure(await client.PutAsJsonAsync(PolicyPath(farm), policy), HttpStatusCode.BadRequest);
        Assert.Equal(JsonValueKind.Null, (await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm))).GetProperty("current").ValueKind);
    }

    [Theory]
    [InlineData("AfterStocking", 3)]
    [InlineData("BeforeHarvest", 87)]
    public async Task Restock_cutoff_is_inclusive_through_vietnam_day_and_rejects_server_expired_backdating(string basis, int days)
    {
        var clock = new Clock(new DateTimeOffset(2026, 10, 20, 16, 59, 59, TimeSpan.Zero));
        var stocked = new DateTimeOffset(2026, 10, 16, 17, 30, 0, TimeSpan.Zero); // Oct 17 in Vietnam.
        var farm = await Setup(stockedAt: stocked);
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<TimeProvider>(clock)));
        using var client = factory.CreateClient(); Authenticate(client, farm.UserId);
        await Success(await client.PutAsJsonAsync(PolicyPath(farm), Policy(basis: basis, days: days)), HttpStatusCode.OK);
        var policy = await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm));
        Assert.Equal("2026-10-20", policy.GetProperty("restockDeadline").GetString()); Assert.Equal("2026-10-20", policy.GetProperty("businessDate").GetString());
        var deathAt = clock.Now.AddMinutes(-4); var death = Input(farm, "Mortality", deathAt); death["evidenceId"] = await Photo(farm, deathAt.AddSeconds(-1));
        await Success(await client.PostAsJsonAsync(Path(farm), death));
        var restock = Input(farm, "Restocked", clock.Now); restock["replacesCrabItemId"] = farm.CrabId; restock["evidenceId"] = await Photo(farm, clock.Now.AddMinutes(-1));
        await Success(await client.PostAsJsonAsync(Path(farm), restock));
        var newCrab = await Db(db => db.CrabItems.Where(c => c.ReplacesCrabItemId == farm.CrabId).Select(c => c.CrabItemId).SingleAsync());
        clock.Now = clock.Now.AddMilliseconds(500);
        var secondDeath = Input(farm, "Mortality", clock.Now); secondDeath["evidenceId"] = await Photo(farm, clock.Now);
        await Success(await client.PostAsJsonAsync(Path(farm), secondDeath));
        var late = Input(farm, "Restocked", clock.Now); late["replacesCrabItemId"] = newCrab; late["evidenceId"] = await Photo(farm, clock.Now);
        clock.Now = new DateTimeOffset(2026, 10, 20, 17, 0, 0, TimeSpan.Zero);
        await Failure(await client.PostAsJsonAsync(Path(farm), late), HttpStatusCode.UnprocessableEntity);
        Assert.Equal("2026-10-21", (await client.GetFromJsonAsync<JsonElement>(PolicyPath(farm))).GetProperty("businessDate").GetString());
        Assert.False(await Db(db => db.CrabItems.AnyAsync(c => c.ReplacesCrabItemId == newCrab)));
    }
}
