using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
public class BatchesTests(OperatorDatabaseFixture fixture) : IClassFixture<OperatorDatabaseFixture>
{
    private async Task<(HttpClient Client, AuthResponse Auth, long OperatorId)> Owner(string status = "Approved")
    {
        var client = fixture.Factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "VI04", role = "Customer" });
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var op = await client.PostAsJsonAsync("/api/operators", new
        { legalName = "VI04", taxCode = Random.Shared.NextInt64(1000000000, 9999999999).ToString(), businessRegNo = "VI04", farmAddress = "Cà Mau" });
        op.EnsureSuccessStatusCode();
        var id = (await op.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operatorId").GetInt64();
        await using var db = fixture.OpenDb();
        await db.Operators.Where(o => o.OperatorId == id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, status));
        return (client, auth, id);
    }

    private static Dictionary<string, object?> Batch() => new()
    {
        ["title"] = "Lô thử", ["crabType"] = "SoftShellCrab", ["seedQuantity"] = 1500,
        ["expectedOutputKg"] = 300, ["cycleDays"] = 45, ["restockCutoffDays"] = 10,
        ["minViableCapital"] = 60_000_000, ["targetCapital"] = 75_000_000,
        ["maxCapital"] = 90_000_000, ["minContribution"] = 1_000_000, ["operatorSharePct"] = 7,
    };
    private static object Costs(string category = "MortalityReserve", int? tranche = 1) => new { items = new[]
    { new { category, description = "Dự phòng", quantity = 1.5m, unit = "đợt", unitPrice = 1001, trancheNo = tranche } }, total = 1 };
    private static async Task<string> Create(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/batches", Batch());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("batchCode").GetString()!;
    }

    [Theory]
    [InlineData("Approved", HttpStatusCode.Created)]
    [InlineData("Draft", HttpStatusCode.UnprocessableEntity)]
    [InlineData("Submitted", HttpStatusCode.UnprocessableEntity)]
    [InlineData("Rejected", HttpStatusCode.UnprocessableEntity)]
    [InlineData("Suspended", HttpStatusCode.UnprocessableEntity)]
    public async Task Only_approved_operator_creates_draft(string status, HttpStatusCode expected)
    {
        var (client, _, id) = await Owner(status);
        var req = Batch(); req["operatorId"] = -1; req["status"] = "Funding";
        var response = await client.PostAsJsonAsync("/api/batches", req);
        Assert.Equal(expected, response.StatusCode);
        if (expected == HttpStatusCode.Created)
        {
            var data = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("Draft", data.GetProperty("status").GetString());
            Assert.Equal(id, data.GetProperty("operatorId").GetInt64());
        }
    }

    [Fact]
    public async Task Create_save_replace_submit_and_state_guards()
    {
        var (client, _, _) = await Owner();
        var code = await Create(client);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        var missing = await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs("Feed"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missing.StatusCode);
        Assert.Equal("batch.mortality_reserve_required", (await missing.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        var saved = await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs());
        saved.EnsureSuccessStatusCode();
        // 1.5 * 1001 = 1501.5, rounded to whole VND once per item.
        Assert.Equal(1502, (await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("standardCost").GetProperty("total").GetInt64());
        (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        var submitted = await client.PostAsync($"/api/batches/{code}/submit", null);
        submitted.EnsureSuccessStatusCode();
        var data = await submitted.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("PendingApproval", data.GetProperty("status").GetString());
        Assert.Equal("Submitted", data.GetProperty("standardCost").GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PutAsJsonAsync($"/api/batches/{code}", Batch())).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).StatusCode);
        await using var db = fixture.OpenDb();
        var batchId = await db.Batches.Where(b => b.BatchCode == code).Select(b => b.BatchId).SingleAsync();
        Assert.Equal(1, await db.StandardCostVersions.CountAsync(v => v.BatchId == batchId));
        Assert.Equal(1, await db.StandardCostItems.CountAsync(i => i.CostVersion.BatchId == batchId));
        Assert.Equal(4, await db.AuditLogs.CountAsync(a => a.EntityType == "batch" && a.EntityId == batchId));
    }

    [Theory]
    [InlineData("minViableCapital", 80000000, false)]
    [InlineData("maxCapital", 70000000, false)]
    [InlineData("minViableCapital", 75000000, true)]
    [InlineData("maxCapital", 75000000, true)]
    [InlineData("operatorSharePct", 5, true)]
    [InlineData("operatorSharePct", 10, true)]
    [InlineData("operatorSharePct", 4, false)]
    [InlineData("operatorSharePct", 11, false)]
    [InlineData("cycleDays", 0, false)]
    [InlineData("cycleDays", -1, false)]
    public async Task Validation_applies_to_create_and_update(string field, int value, bool valid)
    {
        var (client, _, _) = await Owner();
        var code = await Create(client);
        var req = Batch(); req[field] = value;
        foreach (var response in new[] { await client.PostAsJsonAsync("/api/batches", req), await client.PutAsJsonAsync($"/api/batches/{code}", req) })
        {
            if (valid) Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            else Assert.Contains(response.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.UnprocessableEntity });
        }
    }

    [Fact]
    public async Task Other_operator_cannot_access_and_list_is_scoped()
    {
        var (owner, _, _) = await Owner(); var code = await Create(owner);
        var (other, _, _) = await Owner();
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/batches/{code}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/batches/{code}", Batch())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        Assert.Equal(0, (await other.GetFromJsonAsync<JsonElement>("/api/operators/me/batches")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await owner.GetFromJsonAsync<JsonElement>("/api/operators/me/batches?status=Draft")).GetProperty("total").GetInt32());
    }

    [Theory]
    [InlineData("Unknown", 1)] [InlineData("Depreciation", 1)] [InlineData("Feed", null)]
    public async Task Invalid_cost_category_or_tranche_is_rejected(string category, int? tranche)
    {
        var (client, _, _) = await Owner(); var code = await Create(client);
        Assert.Contains((await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs(category, tranche))).StatusCode,
            new[] { HttpStatusCode.BadRequest, HttpStatusCode.UnprocessableEntity });
    }

    [Fact]
    public async Task Failure_after_save_rolls_back_new_and_replaced_costs_and_submit()
    {
        var (owner, auth, _) = await Owner(); var code = await Create(owner);
        await using var failing = fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddDbContext<AppDbContext>(options => options.AddInterceptors(new FailAfterSave()))));
        using var client = failing.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).StatusCode);
        Assert.Equal(JsonValueKind.Null, (await owner.GetFromJsonAsync<JsonElement>($"/api/batches/{code}")).GetProperty("standardCost").ValueKind);
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        var data = await owner.GetFromJsonAsync<JsonElement>($"/api/batches/{code}");
        Assert.Equal("Draft", data.GetProperty("status").GetString());
        Assert.Equal("Draft", data.GetProperty("standardCost").GetProperty("status").GetString());
        Assert.Single(data.GetProperty("standardCost").GetProperty("items").EnumerateArray());
    }
    private sealed class FailAfterSave : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("VI04 fail before commit");
    }

    [Fact]
    public async Task Staff_can_read_but_cannot_write_and_revoked_or_stale_membership_is_denied()
    {
        var (owner, _, operatorId) = await Owner(); var code = await Create(owner);
        var (staff, auth, oldId) = await Owner();
        await using var db = fixture.OpenDb();
        await db.OperatorMembers.Where(m => m.UserId == auth.User.UserId).ExecuteUpdateAsync(s => s.SetProperty(m => m.OperatorId, operatorId).SetProperty(m => m.MemberRole, "Staff"));
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync($"/api/batches/{code}")).StatusCode);
        Assert.Equal(1, (await staff.GetFromJsonAsync<JsonElement>("/api/operators/me/batches")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/api/batches", Batch())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync($"/api/batches/{code}", Batch())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        var login = await staff.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password = "Test-password-123" });
        var fresh = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        staff.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fresh.AccessToken);
        await db.OperatorMembers.Where(m => m.UserId == auth.User.UserId).ExecuteUpdateAsync(s => s.SetProperty(m => m.OperatorId, oldId));
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/operators/me/batches")).StatusCode);
        await db.OperatorMembers.Where(m => m.UserId == auth.User.UserId).ExecuteDeleteAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync($"/api/batches/{code}")).StatusCode);
    }

    [Fact]
    public async Task Submit_rechecks_reserve_and_approval_and_concurrent_submit_only_succeeds_once()
    {
        var (client, _, opId) = await Owner(); var code = await Create(client);
        (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        await using var db = fixture.OpenDb();
        await db.StandardCostItems.Where(i => i.CostVersion.Batch.BatchCode == code).ExecuteUpdateAsync(s => s.SetProperty(i => i.Category, "Feed"));
        var response = await client.PostAsync($"/api/batches/{code}/submit", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("batch.mortality_reserve_required", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        await db.Operators.Where(o => o.OperatorId == opId).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Suspended"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        await db.Operators.Where(o => o.OperatorId == opId).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Approved"));
        var results = await Task.WhenAll(client.PostAsync($"/api/batches/{code}/submit", null), client.PostAsync($"/api/batches/{code}/submit", null));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Definitively_rejected_batch_preserves_history_and_cannot_be_edited()
    {
        var (client, _, _) = await Owner(); var code = await Create(client);
        (await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/batches/{code}/submit", null)).EnsureSuccessStatusCode();
        await using var db = fixture.OpenDb();
        await db.Batches.Where(b => b.BatchCode == code).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Rejected"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await client.PutAsJsonAsync($"/api/batches/{code}", Batch())).StatusCode);
        var costs = await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,costs.StatusCode);
        Assert.Equal(1, await db.StandardCostVersions.CountAsync(v => v.Batch.BatchCode == code));
        Assert.Equal(1, await db.StandardCostItems.CountAsync(i => i.CostVersion.Batch.BatchCode == code));
        Assert.Equal("Submitted", await db.StandardCostVersions.Where(v => v.Batch.BatchCode == code && v.VersionNo == 1).Select(v => v.Status).SingleAsync());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
    }

    [Theory]
    [InlineData(0, 10, false)] [InlineData(-1, 10, false)] [InlineData(1, -1, false)]
    [InlineData(1, 0, true)] [InlineData(1.001, 10, true)] [InlineData(1.0001, 10, false)]
    public async Task Cost_quantity_and_price_follow_schema(decimal quantity, long price, bool valid)
    {
        var (client, _, _) = await Owner(); var code = await Create(client);
        var response = await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new { items = new[] {
            new { category = "MortalityReserve", description = "Dự phòng", quantity, unit = "khoản", unitPrice = price, trancheNo = (int?)0 },
            new { category = "Depreciation", description = "Khấu hao", quantity = 1m, unit = "khoản", unitPrice = 0L, trancheNo = (int?)null } } });
        if (valid) response.EnsureSuccessStatusCode();
        else Assert.Contains(response.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.UnprocessableEntity });
    }

    [Fact]
    public async Task Decimal18_money_overflow_returns_validation_error_instead_of_server_error()
    {
        var (client, _, _) = await Owner(); var code = await Create(client);
        var request = Batch(); request["maxCapital"] = 1000000000000000000L;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/batches", request)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/batches/{code}", request)).StatusCode);
        var response = await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new { items = new[] {
            new { category = "MortalityReserve", description = "Dự phòng", quantity = 1, unit = "khoản", unitPrice = 1000000000000000000L, trancheNo = 1 } } });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Oversized_cost_total_is_rejected_without_decimal_overflow_or_partial_write()
    {
        var (client, _, _) = await Owner(); var code = await Create(client);
        var item = new { category = "MortalityReserve", description = "Dự phòng", quantity = 999999999m, unit = "khoản", unitPrice = 999999999999999999L, trancheNo = 1 };
        var response = await client.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new { items = Enumerable.Repeat(item, 100).ToArray() });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await client.GetFromJsonAsync<JsonElement>($"/api/batches/{code}")).GetProperty("standardCost").ValueKind);
    }
}

