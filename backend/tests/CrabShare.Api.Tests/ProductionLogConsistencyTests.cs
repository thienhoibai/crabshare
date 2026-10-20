using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class ProductionLogTests
{
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Stored_threshold_versions_cannot_be_updated_or_deleted(bool delete)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var state = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm)); var id = state.GetProperty("current").GetProperty("id").GetInt64();
        var error = await Assert.ThrowsAsync<SqlException>(() => Db(async db =>
        {
            return delete
                ? await db.Database.ExecuteSqlAsync($"DELETE FROM dbo.production_threshold_version WHERE threshold_version_id={id}")
                : await db.Database.ExecuteSqlAsync($"UPDATE dbo.production_threshold_version SET ph_min=7.5 WHERE threshold_version_id={id}");
        }));
        Assert.Equal(50060, error.Number);
        var current = (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("current");
        Assert.Equal(id, current.GetProperty("id").GetInt64()); Assert.Equal(7.0m, current.GetProperty("phMin").GetDecimal());
    }

    [Fact]
    public async Task Database_rejects_a_threshold_version_owned_by_a_different_batch()
    {
        var own = await Setup(); var other = await Setup(); using var client = Client(other.UserId);
        var foreign = (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(other))).GetProperty("current").GetProperty("id").GetInt64();
        var day = new DateOnly(2026, 1, 1);
        var error = await Assert.ThrowsAsync<SqlException>(() => Db(db => db.Database.ExecuteSqlAsync($"INSERT dbo.production_log(batch_id,log_date,source,plausibility_flag,threshold_version_id,recorded_by) VALUES({own.BatchId},{day},'Manual','Ok',{foreign},{own.UserId})")));
        Assert.Equal(547, error.Number); Assert.Contains("fk_production_log_threshold_batch", error.Message);
        Assert.False(await Db(db => db.ProductionLogs.AnyAsync(l => l.BatchId == own.BatchId)));
    }

    [Fact]
    public async Task Racing_configuration_and_recording_preserve_one_coherent_applied_version_and_flag()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var changed = ThresholdInput(1); changed["phMin"] = 8.5m;
        var logTask = client.PostAsJsonAsync(Path(farm), Input()); var configurationTask = client.PutAsJsonAsync(ThresholdPath(farm), changed);
        await Task.WhenAll(logTask, configurationTask);
        using var logReply = await logTask; using var configurationReply = await configurationTask;
        Assert.Equal(HttpStatusCode.Created, logReply.StatusCode); Assert.Equal(HttpStatusCode.OK, configurationReply.StatusCode);
        var log = await logReply.Content.ReadFromJsonAsync<JsonElement>(); var version = log.GetProperty("thresholdVersion").GetInt32(); var applied = log.GetProperty("thresholdsApplied");
        Assert.Contains(version, new[] { 1, 2 }); Assert.Equal(version, applied.GetProperty("versionNo").GetInt32());
        Assert.Equal(version == 1 ? 7.0m : 8.5m, applied.GetProperty("phMin").GetDecimal()); Assert.Equal(version == 1 ? "Ok" : "OutOfRange", log.GetProperty("plausibilityFlag").GetString());
        Assert.Equal(version == 2, await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId)));
        var history = Assert.Single((await client.GetFromJsonAsync<JsonElement>(Path(farm))).GetProperty("items").EnumerateArray()); Assert.Equal(version, history.GetProperty("thresholdVersion").GetInt32()); await AssertChain();
    }

    [Fact]
    public async Task Configuration_audit_failure_rolls_back_the_new_version_and_keeps_expected_version_valid()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var count = await AuditCount(farm.UserId);
        var trigger = $"CREATE TRIGGER dbo.vi08_threshold_test_failure ON dbo.audit_log AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE actor_user_id={farm.UserId}) THROW 51008, 'VI08 configuration audit failure', 1; END";
        await Db(async db => { await db.Database.ExecuteSqlRawAsync(trigger); return true; });
        var changed = ThresholdInput(1); changed["phMin"] = 7.5m;
        try
        {
            var problem = await Error(await client.PutAsJsonAsync(ThresholdPath(farm), changed), HttpStatusCode.UnprocessableEntity, "db.rule"); Assert.Contains("VI08 configuration audit failure", problem.GetProperty("detail").GetString());
            var current = (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("current"); Assert.Equal(1, current.GetProperty("versionNo").GetInt32()); Assert.Equal(7m, current.GetProperty("phMin").GetDecimal());
            Assert.Equal(count, await AuditCount(farm.UserId)); Assert.Equal(1, await Db(db => db.ProductionThresholdVersions.CountAsync(v => v.BatchId == farm.BatchId)));
        }
        finally { await Db(async db => { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER dbo.vi08_threshold_test_failure"); return true; }); }
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(ThresholdPath(farm), changed)).StatusCode); await AssertChain();
    }
}
