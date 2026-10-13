using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
public class BoxesTests(OperatorDatabaseFixture fixture, Xunit.Abstractions.ITestOutputHelper output) : IClassFixture<OperatorDatabaseFixture>
{
    private async Task<HttpClient> Owner(int capacity = 1200)
    {
        var client = fixture.Factory.CreateClient();
        var registered = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "Boxes test", role = "Customer" });
        registered.EnsureSuccessStatusCode();
        var auth = (await registered.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var created = await client.PostAsJsonAsync("/api/operators", new
        { legalName = "VI03", taxCode = Random.Shared.NextInt64(1000000000, 9999999999).ToString(), businessRegNo = "VI03", farmAddress = "Cà Mau" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operatorId").GetInt64();
        await using var db = fixture.OpenDb();
        await db.Operators.Where(o => o.OperatorId == id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Approved").SetProperty(o => o.ApprovedSlotCapacity, capacity));
        return client;
    }

    [Fact]
    public async Task Range_creates_1200_padded_boxes_under_two_seconds_and_enforces_capacity()
    {
        using var client = await Owner();
        // Warm application and DB connection before measuring the operation.
        (await client.GetAsync("/api/boxes")).EnsureSuccessStatusCode();
        var watch = Stopwatch.StartNew();
        var response = await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 1200, width = 4 });
        watch.Stop();
        output.WriteLine($"POST /api/boxes/range: 1200 boxes in {watch.Elapsed.TotalMilliseconds:F0} ms");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(2), $"1200 boxes took {watch.Elapsed.TotalMilliseconds:F0} ms");
        var page = await client.GetFromJsonAsync<JsonElement>("/api/boxes?pageSize=100");
        Assert.Equal(1200, page.GetProperty("total").GetInt32());
        Assert.Equal("0001", page.GetProperty("items")[0].GetProperty("slotCode").GetString());
        var last = await client.GetFromJsonAsync<JsonElement>("/api/boxes?search=1200");
        Assert.Single(last.GetProperty("items").EnumerateArray());
        var excess = await client.PostAsJsonAsync("/api/boxes", new { slotCode = "1201" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, excess.StatusCode);
        Assert.Equal("box.over_capacity", (await excess.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Single_box_layout_status_filter_and_tenant_isolation()
    {
        using var client = await Owner(5);
        var created = await client.PostAsJsonAsync("/api/boxes", new { slotCode = " A01 ", rowCode = "A", rackNo = 1, tierNo = 2, columnNo = 3 });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(2, (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("tierNo").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync("/api/boxes/A01", new { status = "Maintenance" })).StatusCode);
        var maintenance = await client.GetFromJsonAsync<JsonElement>("/api/boxes?status=Maintenance&search=A0");
        Assert.Equal(1, maintenance.GetProperty("total").GetInt32());
        using var other = await Owner();
        Assert.Equal(0, (await other.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await other.PatchAsJsonAsync("/api/boxes/A01", new { status = "Available" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync("/api/boxes/A01", new { status = "Available" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/boxes", new { slotCode = "A01" })).StatusCode);
    }

    [Fact]
    public async Task Invalid_inputs_and_overlapping_range_do_not_partially_insert()
    {
        using var client = await Owner(10);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/boxes/range", new { from = 4, to = 1, width = 4 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/boxes", new { slotCode = " ", rackNo = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/boxes?status=Unknown")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/boxes?page=0")).StatusCode);
        (await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 3, width = 4 })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/boxes/range", new { from = 3, to = 5, width = 4 })).StatusCode);
        Assert.Equal(3, (await client.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/boxes/0001", new { status = "Occupied" })).StatusCode);
    }

    [Fact]
    public async Task Concurrent_creates_cannot_exceed_capacity()
    {
        using var client = await Owner(1);
        var results = await Task.WhenAll(client.PostAsJsonAsync("/api/boxes", new { slotCode = "A" }), client.PostAsJsonAsync("/api/boxes", new { slotCode = "B" }));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Occupied_box_cannot_enter_maintenance()
    {
        using var client = await Owner(1);
        (await client.PostAsJsonAsync("/api/boxes", new { slotCode = "occupied-test" })).EnsureSuccessStatusCode();
        await using var db = fixture.OpenDb();
        await db.PhysicalSlots.Where(b => b.SlotCode == "occupied-test").ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Occupied"));
        var response = await client.PatchAsJsonAsync("/api/boxes/occupied-test", new { status = "Maintenance" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("box.in_use", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal("Occupied", (await client.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("items")[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task Concurrent_ranges_and_single_create_share_the_capacity_limit()
    {
        using var client = await Owner(10);
        var results = await Task.WhenAll(
            client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 10, width = 4 }),
            client.PostAsJsonAsync("/api/boxes/range", new { from = 11, to = 20, width = 4 }),
            client.PostAsJsonAsync("/api/boxes", new { slotCode = "single" }));
        Assert.Contains(results, r => r.StatusCode == HttpStatusCode.Created);
        foreach (var response in results)
        {
            Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.UnprocessableEntity,
                await response.Content.ReadAsStringAsync());
            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                Assert.Equal("box.over_capacity", (await response.Content.ReadFromJsonAsync<JsonElement>())!.GetProperty("code").GetString());
        }
        var total = (await client.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("total").GetInt32();
        Assert.True(total is 1 or 10);
    }

    [Fact]
    public async Task Duplicate_at_end_of_range_leaves_no_earlier_boxes()
    {
        using var client = await Owner(10);
        (await client.PostAsJsonAsync("/api/boxes", new { slotCode = "0005" })).EnsureSuccessStatusCode();
        var response = await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 5, width = 4 });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("box.duplicate", (await response.Content.ReadFromJsonAsync<JsonElement>())!.GetProperty("code").GetString());
        var page = await client.GetFromJsonAsync<JsonElement>("/api/boxes");
        Assert.Equal(1, page.GetProperty("total").GetInt32());
        Assert.Equal("0005", page.GetProperty("items")[0].GetProperty("slotCode").GetString());
    }

    [Theory]
    [InlineData(0, 1, 4)]
    [InlineData(1, 0, 4)]
    [InlineData(1, 1, 0)]
    [InlineData(1, 1, 31)]
    public async Task Invalid_range_boundaries_return_400_without_writes(int from, int to, int width)
    {
        using var client = await Owner(10);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/boxes/range", new { from, to, width })).StatusCode);
        Assert.Equal(0, (await client.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("total").GetInt32());
    }

    [Theory]
    [InlineData(1, "2147483647")]
    [InlineData(30, "000000000000000000002147483647")]
    public async Task Range_handles_maximum_integer_without_truncating_or_overflowing(int width, string expectedCode)
    {
        using var client = await Owner(1);
        var response = await client.PostAsJsonAsync("/api/boxes/range", new { from = int.MaxValue, to = int.MaxValue, width });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<JsonElement>())!;
        Assert.Equal(1, result.GetProperty("created").GetInt32());
        Assert.Equal(expectedCode, result.GetProperty("from").GetString());
        Assert.Equal(expectedCode, result.GetProperty("to").GetString());
        Assert.Equal(expectedCode, (await client.GetFromJsonAsync<JsonElement>("/api/boxes")).GetProperty("items")[0].GetProperty("slotCode").GetString());
    }

    [Theory]
    [InlineData("Draft")]
    [InlineData("Suspended")]
    public async Task Unapproved_operator_cannot_create_or_change_boxes(string status)
    {
        using var client = await Owner(10);
        (await client.PostAsJsonAsync("/api/boxes", new { slotCode = "A" })).EnsureSuccessStatusCode();
        var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(client.DefaultRequestHeaders.Authorization!.Parameter);
        var userId = long.Parse(token.Subject);
        await using var db = fixture.OpenDb();
        var operatorId = await db.OperatorMembers.Where(m => m.UserId == userId).Select(m => m.OperatorId).SingleAsync();
        await db.Operators.Where(o => o.OperatorId == operatorId).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, status));
        var results = new[] {
            await client.PostAsJsonAsync("/api/boxes", new { slotCode = "B" }),
            await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 2, width = 4 }),
            await client.PatchAsJsonAsync("/api/boxes/A", new { status = "Maintenance" })
        };
        foreach (var response in results)
        {
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            Assert.Equal("box.operator_not_approved", (await response.Content.ReadFromJsonAsync<JsonElement>())!.GetProperty("code").GetString());
        }
        var page = await client.GetFromJsonAsync<JsonElement>("/api/boxes");
        Assert.Equal(1, page.GetProperty("total").GetInt32());
        Assert.Equal("Available", page.GetProperty("items")[0].GetProperty("status").GetString());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Existing_token_cannot_bypass_locked_account_or_revoked_role(bool lockAccount)
    {
        using var client = await Owner(10);
        var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(client.DefaultRequestHeaders.Authorization!.Parameter);
        var userId = long.Parse(token.Subject);
        await using var db = fixture.OpenDb();
        if (lockAccount)
            await db.AppUsers.Where(u => u.UserId == userId).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked"));
        else
            await db.AppUserRoles.Where(r => r.UserId == userId && r.RoleCode == "OperatorMember").ExecuteDeleteAsync();
        // Locked accounts are rejected by JWT validation before reaching BoxService.
        var expected = lockAccount ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
        Assert.Equal(expected, (await client.GetAsync("/api/boxes")).StatusCode);
        Assert.Equal(expected, (await client.PostAsJsonAsync("/api/boxes", new { slotCode = "A" })).StatusCode);
        Assert.Equal(expected, (await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 2, width = 4 })).StatusCode);
        Assert.Equal(expected, (await client.PatchAsJsonAsync("/api/boxes/A", new { status = "Maintenance" })).StatusCode);
    }

    [Fact]
    public async Task Staff_can_read_but_cannot_write_and_revoked_membership_is_rejected()
    {
        using var client = await Owner(1);
        var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(client.DefaultRequestHeaders.Authorization!.Parameter);
        var userId = long.Parse(token.Subject);
        await using var db = fixture.OpenDb();
        await db.OperatorMembers.Where(m => m.UserId == userId).ExecuteUpdateAsync(s => s.SetProperty(m => m.MemberRole, "Staff"));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/boxes")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/boxes", new { slotCode = "A" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = 1, width = 4 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PatchAsJsonAsync("/api/boxes/A", new { status = "Maintenance" })).StatusCode);
        await db.OperatorMembers.Where(m => m.UserId == userId).ExecuteDeleteAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/boxes")).StatusCode);
    }
}
