using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class ProductionLogTests
{
    [Fact]
    public async Task History_date_filters_are_inclusive_order_by_date_then_id_and_preserve_legacy_flags()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var ids = await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var logs = new[]
            {
                new ProductionLog { BatchId = farm.BatchId, LogDate = new(2026, 1, 1), Source = "Manual", PlausibilityFlag = "Inconsistent", ReceivedAt = now, CreatedAt = now },
                new ProductionLog { BatchId = farm.BatchId, LogDate = new(2026, 1, 2), Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = now, CreatedAt = now },
                new ProductionLog { BatchId = farm.BatchId, LogDate = new(2026, 1, 2), Source = "FarmApi", PlausibilityFlag = "OutOfRange", ReceivedAt = now, CreatedAt = now },
                new ProductionLog { BatchId = farm.BatchId, LogDate = new(2026, 1, 3), Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = now, CreatedAt = now },
            };
            // Separate inserts establish a known id ordering within a business date.
            foreach (var log in logs) { db.ProductionLogs.Add(log); await db.SaveChangesAsync(); }
            return logs.Select(l => l.ProductionLogId).ToArray();
        });
        var page = await client.GetFromJsonAsync<JsonElement>(Path(farm) + "?from=2026-01-01&to=2026-01-02&page=1&pageSize=2");
        Assert.Equal(3, page.GetProperty("total").GetInt32()); Assert.Equal(1, page.GetProperty("page").GetInt32()); Assert.Equal(2, page.GetProperty("pageSize").GetInt32());
        Assert.Equal(new[] { ids[2], ids[1] }, page.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt64()));
        var next = await client.GetFromJsonAsync<JsonElement>(Path(farm) + "?from=2026-01-01&to=2026-01-02&page=2&pageSize=2"); var legacy = Assert.Single(next.GetProperty("items").EnumerateArray());
        Assert.Equal(ids[0], legacy.GetProperty("id").GetInt64()); Assert.Equal("Inconsistent", legacy.GetProperty("plausibilityFlag").GetString());
        Assert.Equal(JsonValueKind.Null, legacy.GetProperty("thresholdVersion").ValueKind); Assert.Equal(JsonValueKind.Null, legacy.GetProperty("thresholdsApplied").ValueKind);
        var aggregate = await client.GetFromJsonAsync<JsonElement>("/api/operators/me/production-logs?from=2026-01-02&to=2026-01-02&page=1&pageSize=1");
        Assert.Equal(2, aggregate.GetProperty("total").GetInt32()); Assert.Equal(ids[2], Assert.Single(aggregate.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt64());
    }

    [Fact]
    public async Task Aggregate_history_and_active_batches_are_scoped_and_keep_harvesting_and_missing_configuration()
    {
        var own = await Setup(status: "Harvesting"); var other = await Setup(); using var client = Client(own.UserId); using var foreign = Client(other.UserId);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(Path(own), Input())).StatusCode); Assert.Equal(HttpStatusCode.Created, (await foreign.PostAsJsonAsync(Path(other), Input())).StatusCode);
        var aggregate = await client.GetFromJsonAsync<JsonElement>("/api/operators/me/production-logs?page=1&pageSize=1"); Assert.Equal(1, aggregate.GetProperty("total").GetInt32()); Assert.Equal(own.Code, Assert.Single(aggregate.GetProperty("items").EnumerateArray()).GetProperty("batchCode").GetString());
        var batches = await client.GetFromJsonAsync<JsonElement>("/api/operators/me/production-batches?page=1&pageSize=1"); var batch = Assert.Single(batches.GetProperty("items").EnumerateArray());
        Assert.Equal(own.Code, batch.GetProperty("batchCode").GetString()); Assert.Equal("Harvesting", batch.GetProperty("status").GetString()); Assert.True(batch.GetProperty("loggedToday").GetBoolean()); Assert.True(batch.GetProperty("canRecord").GetBoolean());
        Assert.Equal(100, batch.GetProperty("seedQuantity").GetInt32()); Assert.Equal(0, batch.GetProperty("aliveCount").GetInt32()); Assert.Equal(own.Code, batch.GetProperty("latestLog").GetProperty("batchCode").GetString());
        var unconfigured = await Setup(configure: false, status: "Stocked"); using var pending = Client(unconfigured.UserId);
        var waiting = Assert.Single((await pending.GetFromJsonAsync<JsonElement>("/api/operators/me/production-batches")).GetProperty("items").EnumerateArray());
        Assert.Equal("Stocked", waiting.GetProperty("status").GetString()); Assert.False(waiting.GetProperty("canRecord").GetBoolean()); Assert.False(waiting.GetProperty("loggedToday").GetBoolean()); Assert.Equal(JsonValueKind.Null, waiting.GetProperty("latestLog").ValueKind);
    }

    [Fact]
    public async Task Legacy_FarmApi_log_today_does_not_mark_manual_log_as_completed()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var state = await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm)); var today = DateOnly.Parse(state.GetProperty("businessDate").GetString()!);
        await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow; db.ProductionLogs.Add(new ProductionLog { BatchId = farm.BatchId, LogDate = today, Source = "FarmApi", PlausibilityFlag = "Ok", ReceivedAt = now, CreatedAt = now }); await db.SaveChangesAsync(); return true;
        });
        var batch = Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/operators/me/production-batches")).GetProperty("items").EnumerateArray());
        Assert.False(batch.GetProperty("loggedToday").GetBoolean()); Assert.Equal("FarmApi", batch.GetProperty("latestLog").GetProperty("source").GetString());
    }
}
