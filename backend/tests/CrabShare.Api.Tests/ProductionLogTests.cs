using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Collection("KycDatabase"), Trait("Category", "Database")]
public partial class ProductionLogTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Farm(long UserId, long OperatorId, long BatchId, string Code);
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> work)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
    private HttpClient Client(long id, string role = Roles.OperatorMember, long? claimedOperator = null)
    {
        var client = fixture.Factory.CreateClient();
        Authenticate(client, id, role, claimedOperator);
        return client;
    }
    private static void Authenticate(HttpClient client, long id, string role = Roles.OperatorMember, long? claimedOperator = null)
    {
        client.DefaultRequestHeaders.Add("X-Test-User", id.ToString(CultureInfo.InvariantCulture));
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        if (claimedOperator is not null) client.DefaultRequestHeaders.Add("X-Test-Operator", claimedOperator.Value.ToString(CultureInfo.InvariantCulture));
    }
    private static AppUser NewUser(string name, string role, DateTimeOffset now)
    {
        var user = new AppUser { Email = $"log-{Guid.NewGuid():N}@test.local", FullName = name, PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = role, GrantedAt = now, CreatedAt = now });
        return user;
    }
    private async Task<Farm> Setup(bool configure = true, string status = "InProduction")
    {
        var farm = await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var user = NewUser("Log Owner", Roles.OperatorMember, now);
            var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Log Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved", CreatedAt = now, UpdatedAt = now };
            op.OperatorMembers.Add(new OperatorMember { User = user, MemberRole = "Owner", JoinedAt = now, CreatedAt = now });
            var batch = new Batch { BatchCode = "LOG-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Log Test", Status = status,
                SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300,
                MinContribution = 10, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, StockedAt = now.AddDays(-3), CreatedAt = now, UpdatedAt = now };
            db.Batches.Add(batch); await db.SaveChangesAsync();
            return new Farm(user.UserId, op.OperatorId, batch.BatchId, batch.BatchCode);
        });
        if (configure)
        {
            using var client = Client(farm.UserId);
            using var response = await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput());
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        return farm;
    }
    private Task<long> AddStaff(Farm farm) => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow; var user = NewUser("Log Staff", Roles.OperatorMember, now);
        db.OperatorMembers.Add(new OperatorMember { User = user, OperatorId = farm.OperatorId, MemberRole = "Staff", JoinedAt = now, CreatedAt = now });
        await db.SaveChangesAsync(); return user.UserId;
    });
    private static string Path(Farm farm) => $"/api/batches/{farm.Code}/production-logs";
    private static string ThresholdPath(Farm farm) => $"/api/batches/{farm.Code}/production-thresholds";
    // Explicit comparison fixtures only; these are never product defaults.
    private static Dictionary<string, object?> ThresholdInput(int version = 0) => new()
    {
        ["expectedVersionNo"] = version, ["phMin"] = 7.0m, ["phMax"] = 9.0m,
        ["waterTempMinC"] = 25.0m, ["waterTempMaxC"] = 31.0m, ["salinityMinPpt"] = 15.0m, ["salinityMaxPpt"] = 25.0m,
    };
    private static Dictionary<string, object?> Input() => new()
    {
        ["ph"] = 8.0m, ["waterTempC"] = 28.0m, ["salinityPpt"] = 20.0m, ["feedKg"] = 1.125m, ["note"] = "Đo thủ công",
    };
    private static async Task<JsonElement> Error(HttpResponseMessage response, HttpStatusCode status, string? code = null)
    {
        Assert.Equal(status, response.StatusCode);
        if (code is null) return default;
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("detail").GetString()));
        return problem;
    }
    private Task<int> AuditCount(long actor) => Db(db => db.AuditLogs.CountAsync(a => a.ActorUserId == actor));
    private Task<bool> AssertChain() => Db(async db =>
    {
        string? previous = null;
        foreach (var audit in await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync())
        {
            Assert.Equal(previous, audit.PrevHash); Assert.True(AuditChain.VerifyHash(audit)); previous = audit.RowHash;
        }
        return true;
    });

    [Fact]
    public async Task Manual_log_is_persisted_and_read_back_with_units_actor_and_applied_ranges()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        using var response = await client.PostAsJsonAsync(Path(farm), Input()); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(farm.Code, result.GetProperty("batchCode").GetString()); Assert.Equal("Manual", result.GetProperty("source").GetString());
        Assert.Equal("Ok", result.GetProperty("plausibilityFlag").GetString()); Assert.Equal(8.0m, result.GetProperty("ph").GetDecimal());
        Assert.Equal(28.0m, result.GetProperty("waterTempC").GetDecimal()); Assert.Equal(20.0m, result.GetProperty("salinityPpt").GetDecimal());
        Assert.Equal(1.125m, result.GetProperty("feedKg").GetDecimal()); Assert.Equal("Đo thủ công", result.GetProperty("note").GetString());
        Assert.Equal(farm.UserId, result.GetProperty("recordedBy").GetInt64()); Assert.Equal(1, result.GetProperty("thresholdVersion").GetInt32());
        Assert.Equal(7.0m, result.GetProperty("thresholdsApplied").GetProperty("phMin").GetDecimal());
        var stored = await Db(db => db.ProductionLogs.AsNoTracking().SingleAsync(l => l.BatchId == farm.BatchId));
        Assert.Equal(result.GetProperty("id").GetInt64(), stored.ProductionLogId); Assert.Equal(result.GetProperty("logDate").GetString(), stored.LogDate.ToString("yyyy-MM-dd"));
        var page = await client.GetFromJsonAsync<JsonElement>(Path(farm)); Assert.Equal(1, page.GetProperty("total").GetInt32());
        Assert.Equal(result.GetProperty("id").GetInt64(), page.GetProperty("items")[0].GetProperty("id").GetInt64());
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId))); Assert.True(await AuditCount(farm.UserId) >= 2); await AssertChain();
    }

    [Fact]
    public async Task Repeated_and_concurrent_out_of_range_requests_create_one_log_alert_and_unchanged_audit_history()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input["ph"] = 6.5m;
        var replies = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostAsJsonAsync(Path(farm), input)));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Created); Assert.Equal(3, replies.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        foreach (var reply in replies.Where(r => r.StatusCode == HttpStatusCode.Conflict)) await Error(reply, HttpStatusCode.Conflict, "production.log_exists");
        var audits = await AuditCount(farm.UserId); var before = await Db(db => db.Alerts.AsNoTracking().SingleAsync(a => a.BatchId == farm.BatchId));
        input["ph"] = 0m; await Error(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.Conflict, "production.log_exists");
        Assert.Equal(audits, await AuditCount(farm.UserId)); var after = await Db(db => db.Alerts.AsNoTracking().SingleAsync(a => a.BatchId == farm.BatchId));
        Assert.Equal(before.Message, after.Message); Assert.Equal(before.AckDeadline, after.AckDeadline); Assert.Equal(before.UpdatedAt, after.UpdatedAt);
        Assert.Equal(1, await Db(db => db.ProductionLogs.CountAsync(l => l.BatchId == farm.BatchId))); Assert.Equal(1, await Db(db => db.Alerts.CountAsync(a => a.BatchId == farm.BatchId)));
        await AssertChain(); foreach (var reply in replies) reply.Dispose();
    }

    [Fact]
    public async Task Same_date_allows_different_batches_and_existing_FarmApi_source()
    {
        var farm = await Setup(); var other = await Setup(); using var client = Client(farm.UserId); using var second = Client(other.UserId);
        var configuration = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm)); var today = DateOnly.Parse(configuration.GetProperty("businessDate").GetString()!, CultureInfo.InvariantCulture);
        await Db(async db => { var now = DateTimeOffset.UtcNow; db.ProductionLogs.Add(new ProductionLog { BatchId = farm.BatchId, LogDate = today, Ph = 8m, Source = "FarmApi", PlausibilityFlag = "Ok", ReceivedAt = now, CreatedAt = now }); await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(Path(farm), Input())).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await second.PostAsJsonAsync(Path(other), Input())).StatusCode);
        Assert.Equal(2, await Db(db => db.ProductionLogs.CountAsync(l => l.BatchId == farm.BatchId && l.LogDate == today)));
    }

    [Fact]
    public async Task Custom_out_of_range_water_is_preserved_and_raises_one_medium_alert_with_configured_ranges()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input["ph"] = 6.5m; input["waterTempC"] = 32.0m; input["salinityPpt"] = 14.0m;
        using var response = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("OutOfRange", result.GetProperty("plausibilityFlag").GetString());
        Assert.Equal(6.5m, result.GetProperty("ph").GetDecimal()); Assert.Equal(32.0m, result.GetProperty("waterTempC").GetDecimal()); Assert.Equal(14.0m, result.GetProperty("salinityPpt").GetDecimal());
        var alert = await Db(db => db.Alerts.AsNoTracking().SingleAsync(a => a.BatchId == farm.BatchId));
        Assert.Equal("WaterQuality", alert.AlertType); Assert.Equal("Medium", alert.Severity); Assert.Equal("Open", alert.Status); Assert.Equal(TimeSpan.FromHours(24), alert.AckDeadline - alert.RaisedAt);
        Assert.Contains("6.5", alert.Message); Assert.Contains("32", alert.Message); Assert.Contains("14", alert.Message); Assert.Contains("25", alert.Message); Assert.Contains("31", alert.Message); Assert.Contains("ppt", alert.Message);
        Assert.Equal(6.5m, await Db(db => db.ProductionLogs.Where(l => l.BatchId == farm.BatchId).Select(l => l.Ph).SingleAsync())); await AssertChain();
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Inclusive_water_boundaries_and_large_feed_remain_ok(bool upper)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input();
        input["ph"] = upper ? 9.0m : 7.0m; input["waterTempC"] = upper ? 31.0m : 25.0m; input["salinityPpt"] = upper ? 25.0m : 15.0m; input["feedKg"] = 999999999.999m;
        using var response = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("Ok", result.GetProperty("plausibilityFlag").GetString()); Assert.Equal(999999999.999m, result.GetProperty("feedKg").GetDecimal());
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Missing_threshold_configuration_blocks_recording_without_inventing_defaults()
    {
        var farm = await Setup(configure: false); using var client = Client(farm.UserId); var config = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm));
        Assert.Equal(JsonValueKind.Null, config.GetProperty("current").ValueKind); Assert.True(config.GetProperty("canConfigure").GetBoolean()); Assert.False(config.GetProperty("canRecord").GetBoolean());
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.UnprocessableEntity, "production.thresholds_required");
        Assert.False(await Db(db => db.ProductionLogs.AnyAsync(l => l.BatchId == farm.BatchId))); Assert.Equal(0, await AuditCount(farm.UserId));
    }

    [Fact]
    public async Task Optimistic_versions_reject_stale_configuration_and_identical_save_is_idempotent()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var before = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm)); var audits = await AuditCount(farm.UserId);
        using var identical = await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(1)); Assert.Equal(HttpStatusCode.OK, identical.StatusCode);
        var same = await identical.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal(before.GetProperty("current").GetProperty("id").GetInt64(), same.GetProperty("id").GetInt64()); Assert.Equal(1, same.GetProperty("versionNo").GetInt32()); Assert.Equal(audits, await AuditCount(farm.UserId));
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput(0)), HttpStatusCode.Conflict, "production.thresholds_changed");
        var changed = ThresholdInput(1); changed["phMin"] = 7.5m; using var next = await client.PutAsJsonAsync(ThresholdPath(farm), changed); Assert.Equal(HttpStatusCode.OK, next.StatusCode);
        Assert.Equal(2, (await next.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("versionNo").GetInt32());
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), changed), HttpStatusCode.Conflict, "production.thresholds_changed"); Assert.Equal(audits + 1, await AuditCount(farm.UserId)); await AssertChain();
    }

    [Fact]
    public async Task Concurrent_threshold_updates_publish_exactly_one_new_version()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var first = ThresholdInput(1); first["phMin"] = 7.2m; var second = ThresholdInput(1); second["phMin"] = 7.5m;
        var results = await Task.WhenAll(client.PutAsJsonAsync(ThresholdPath(farm), first), client.PutAsJsonAsync(ThresholdPath(farm), second));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK); await Error(Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict), HttpStatusCode.Conflict, "production.thresholds_changed");
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("current").GetProperty("versionNo").GetInt32()); Assert.Equal(2, await AuditCount(farm.UserId));
        foreach (var result in results) result.Dispose(); await AssertChain();
    }

    [Fact]
    public async Task Historical_log_keeps_original_thresholds_flag_and_alert_after_configuration_changes()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input["ph"] = 6.5m;
        using var created = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, created.StatusCode); var original = await created.Content.ReadFromJsonAsync<JsonElement>();
        var alert = await Db(db => db.Alerts.AsNoTracking().SingleAsync(a => a.BatchId == farm.BatchId)); var changed = ThresholdInput(1); changed["phMin"] = 6.0m;
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(ThresholdPath(farm), changed)).StatusCode);
        var history = (await client.GetFromJsonAsync<JsonElement>(Path(farm))).GetProperty("items")[0]; Assert.Equal(1, history.GetProperty("thresholdVersion").GetInt32());
        Assert.Equal(original.GetProperty("thresholdsApplied").GetProperty("id").GetInt64(), history.GetProperty("thresholdsApplied").GetProperty("id").GetInt64()); Assert.Equal(7.0m, history.GetProperty("thresholdsApplied").GetProperty("phMin").GetDecimal()); Assert.Equal("OutOfRange", history.GetProperty("plausibilityFlag").GetString());
        var unchanged = await Db(db => db.Alerts.AsNoTracking().SingleAsync(a => a.BatchId == farm.BatchId)); Assert.Equal(alert.Message, unchanged.Message); Assert.Equal("Open", unchanged.Status); Assert.Equal(alert.UpdatedAt, unchanged.UpdatedAt);
    }

    [Fact]
    public async Task Server_business_date_crosses_vietnam_midnight_and_new_logs_use_latest_version()
    {
        var farm = await Setup(); var clock = new Clock(new DateTimeOffset(2026, 10, 20, 16, 59, 59, TimeSpan.Zero));
        using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<TimeProvider>(clock))); using var client = factory.CreateClient(); Authenticate(client, farm.UserId);
        Assert.Equal("2026-10-20", (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("businessDate").GetString());
        var input = Input(); input["ph"] = 6.5m; using var first = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var dayOne = await first.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("2026-10-20", dayOne.GetProperty("logDate").GetString()); Assert.Equal("OutOfRange", dayOne.GetProperty("plausibilityFlag").GetString());
        var changed = ThresholdInput(1); changed["phMin"] = 6.0m; Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(ThresholdPath(farm), changed)).StatusCode);
        clock.Now = new DateTimeOffset(2026, 10, 20, 17, 0, 0, TimeSpan.Zero); using var second = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var dayTwo = await second.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("2026-10-21", dayTwo.GetProperty("logDate").GetString()); Assert.Equal(2, dayTwo.GetProperty("thresholdVersion").GetInt32()); Assert.Equal("Ok", dayTwo.GetProperty("plausibilityFlag").GetString()); Assert.Equal(clock.Now, dayTwo.GetProperty("createdAt").GetDateTimeOffset());
        Assert.Equal("2026-10-21", (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("businessDate").GetString());
    }

    [Theory]
    [InlineData("alert")] [InlineData("audit")]
    public async Task Alert_or_audit_failure_rolls_back_new_log_alert_and_audit_together(string failure)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var audits = await AuditCount(farm.UserId);
        // Fixed test identifiers and database-generated numeric IDs only, confined to the isolated fixture DB.
        // A CHECK injects the alert failure without SQL Server's unrelated trigger/OUTPUT restriction.
        var trigger = failure == "alert"
            ? $"ALTER TABLE dbo.alert ADD CONSTRAINT ck_vi08_log_test_failure CHECK (batch_id <> {farm.BatchId})"
            : $"CREATE TRIGGER dbo.vi08_log_test_failure ON dbo.audit_log AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE actor_user_id={farm.UserId}) THROW 51008, 'VI08 audit test failure', 1; END";
        await Db(async db => { await db.Database.ExecuteSqlRawAsync(trigger); return true; });
        try
        {
            var input = Input(); input["ph"] = 6.5m; using var response = await client.PostAsJsonAsync(Path(farm), input);
            var problem = await Error(response, HttpStatusCode.UnprocessableEntity, failure == "alert" ? "db.constraint" : "db.rule");
            var detail = problem.GetProperty("detail").GetString();
            Assert.Contains(failure == "alert" ? "ck_vi08_log_test_failure" : "VI08 audit test failure", detail);
            Assert.False(await Db(db => db.ProductionLogs.AnyAsync(l => l.BatchId == farm.BatchId))); Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId))); Assert.Equal(audits, await AuditCount(farm.UserId));
        }
        finally { await Db(async db => { await db.Database.ExecuteSqlRawAsync(failure == "alert" ? "ALTER TABLE dbo.alert DROP CONSTRAINT ck_vi08_log_test_failure" : "DROP TRIGGER dbo.vi08_log_test_failure"); return true; }); }
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(Path(farm), Input())).StatusCode); await AssertChain();
    }
}
