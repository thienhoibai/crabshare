using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Devices;
using CrabShare.Api.Infrastructure.Detection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>Bộ nhận diện giả: ảnh nào cũng "không thấy cua", để thử cảnh báo BR-119.</summary>
public sealed class NoCrabDetector : ICrabDetector
{
    public Task<CrabDetectionResult> DetectAsync(Stream image, CancellationToken ct) => Task.FromResult(new CrabDetectionResult(false, 0.93m, "test-no-crab"));
}

public sealed class DeviceFixture : Br15Fixture
{
    protected override void Configure(IWebHostBuilder builder)
        => builder.ConfigureTestServices(s => s.AddScoped<ICrabDetector, NoCrabDetector>());
}

/// <summary>G4: API nhận dữ liệu theo mục 11 của Hướng dẫn: khoá thiết bị, mã bản tin, lượt đo, ảnh hộp, chỉ số nước, hiệu chuẩn, mất kết nối (BR-112…119, 223…231).</summary>
[Trait("Category", "Database")]
public sealed class DeviceIngestTests(DeviceFixture f) : IClassFixture<DeviceFixture>
{
    private async Task<(string Code, string Key)> RegisterAsync(object body)
    {
        using var admin = f.Admin();
        var registered = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/devices", body));
        return (registered.GetProperty("device").GetProperty("deviceCode").GetString()!, registered.GetProperty("deviceKey").GetString()!);
    }

    private HttpClient Device(string key)
    {
        var client = f.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Device-Key", key);
        return client;
    }

    private static MultipartFormDataContent Multipart(object meta, params (string Name, byte[] Bytes)[] images)
    {
        var form = new MultipartFormDataContent { { new StringContent(JsonSerializer.Serialize(meta, Br15Fixture.Json)), "meta" } };
        foreach (var (name, bytes) in images)
        {
            var content = new ByteArrayContent(bytes);
            content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(content, name, $"{name}.jpg");
        }
        return form;
    }

    private static object StationMeta(Guid id, string code, bool door = true, DateTimeOffset? calibrated = null, decimal range = 0.12m) => new
    {
        messageId = id, deviceCode = code, deviceType = "Station", firmwareVersion = "0.3.1", capturedAt = DateTimeOffset.UtcNow.AddSeconds(-3),
        weightG = 412.3m, weightSamples = 10, weightRangeG = range, tofMm = 318, cameraHeightMm = 370,
        lastCalibratedAt = calibrated ?? DateTimeOffset.UtcNow.AddDays(-1),
        presets = new { white = new { exposureUs = 12000, gain = 1.0, lensPosition = 3.25 }, red = new { exposureUs = 4000, gain = 1.0, lensPosition = 3.25 } },
        doorClosed = door,
    };

    private async Task<long> QcStationSiteAsync(Br15Fixture.Farmer farmer)
    {
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var site = new Infrastructure.Persistence.Entities.PartySite
        {
            PartyId = farmer.PartyId, SiteCode = $"TKP-{f.Next()}", SiteType = "QcStation", Name = "Trạm kiểm phẩm", AddressLine = "Năm Căn",
            Latitude = 8.76m, Longitude = 105.05m, Status = "Active", CreatedAt = now, UpdatedAt = now,
        };
        db.PartySites.Add(site);
        await db.SaveChangesAsync();
        return site.SiteId;
    }

    [Fact]
    public async Task Unknown_key_is_rejected_and_logged_and_heartbeat_marks_device_active()
    {
        var set = await Br15Scenario.CrabsAsync(f, 2);
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station", operatorId = set.Batch.Farmer.OperatorId,
            siteId = await QcStationSiteAsync(set.Batch.Farmer) });
        using var wrong = Device("dk_wrong");
        var denied = await wrong.PostAsJsonAsync("/api/devices/heartbeat", new { deviceCode = code, firmwareVersion = "0.3.1", queueLength = 0 });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var device = Device(key);
        var beat = await Br15Fixture.Body(await device.PostAsJsonAsync("/api/devices/heartbeat", new { deviceCode = code, firmwareVersion = "0.3.1", queueLength = 2 }));
        Assert.Equal("Active", beat.GetProperty("status").GetString());
        Assert.True(beat.GetProperty("calibrationDue").GetBoolean());
        await using var db = f.OpenDb();
        Assert.True(await db.DeviceMessages.AnyAsync(m => m.DeviceCode == code && m.Status == "Rejected"));
        var saved = await db.Devices.SingleAsync(d => d.DeviceCode == code);
        Assert.Equal("0.3.1", saved.FirmwareVersion);
        Assert.NotEqual(key, saved.KeyHash);
    }

    [Fact]
    public async Task Station_measurement_attaches_to_the_open_session_once_and_enforces_door_and_calibration()
    {
        var set = await Br15Scenario.CrabsAsync(f, 3);
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station", operatorId = set.Batch.Farmer.OperatorId,
            siteId = await QcStationSiteAsync(set.Batch.Farmer), cameraHeightMm = 370 });
        using var device = Device(key);
        var noSession = await device.GetAsync($"/api/devices/{code}/open-session");
        Assert.Equal(HttpStatusCode.NotFound, noSession.StatusCode);
        var early = await device.PostAsync("/api/devices/ingest/measurements", Multipart(StationMeta(Guid.NewGuid(), code), ("white", Br15Scenario.Jpeg()), ("red", Br15Scenario.Jpeg("red"))));
        Assert.Equal(HttpStatusCode.NotFound, early.StatusCode);

        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions", new { crabCode = set.CrabCodes[0], stationCode = code }));
        var busy = await Br15Fixture.PostJson(farmer, "/api/measurement-sessions", new { crabCode = set.CrabCodes[1], stationCode = code });
        Assert.Equal(HttpStatusCode.Conflict, busy.StatusCode);
        var open = await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/open-session"));
        Assert.Equal(set.CrabCodes[0], open.GetProperty("crabTag").GetString());

        var door = await device.PostAsync("/api/devices/ingest/measurements", Multipart(StationMeta(Guid.NewGuid(), code, door: false), ("white", Br15Scenario.Jpeg()), ("red", Br15Scenario.Jpeg("r"))));
        Assert.Equal("device.door_open", await Br15Fixture.ErrorCode(door));
        var stale = await device.PostAsync("/api/devices/ingest/measurements",
            Multipart(StationMeta(Guid.NewGuid(), code, calibrated: DateTimeOffset.UtcNow.AddDays(-31)), ("white", Br15Scenario.Jpeg()), ("red", Br15Scenario.Jpeg("r"))));
        Assert.Equal("device.calibration_expired", await Br15Fixture.ErrorCode(stale));
        var unstable = await device.PostAsync("/api/devices/ingest/measurements", Multipart(StationMeta(Guid.NewGuid(), code, range: 0.4m), ("white", Br15Scenario.Jpeg()), ("red", Br15Scenario.Jpeg("r"))));
        Assert.Equal("device.scale_unstable", await Br15Fixture.ErrorCode(unstable));

        var messageId = Guid.NewGuid();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/devices/ingest/measurements")
        { Content = Multipart(StationMeta(messageId, code), ("white", Br15Scenario.Jpeg("w")), ("red", Br15Scenario.Jpeg("rr"))) };
        request.Headers.Add("Idempotency-Key", messageId.ToString());
        var accepted = await device.SendAsync(request);
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
        var body = await Br15Fixture.Body(accepted);
        Assert.Equal(session.GetProperty("sessionNo").GetString(), body.GetProperty("sessionNo").GetString());
        var again = await device.PostAsync("/api/devices/ingest/measurements", Multipart(StationMeta(messageId, code), ("white", Br15Scenario.Jpeg()), ("red", Br15Scenario.Jpeg("r"))));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);

        var detail = await Br15Fixture.Body(await farmer.GetAsync($"/api/measurement-sessions/{body.GetProperty("sessionNo").GetString()}"));
        // G5: trạm gửi xong thì hệ thống ghi số đo và đề xuất hạng ngay (BR-151).
        Assert.Equal("Measured", detail.GetProperty("status").GetString());
        Assert.Equal(412.3m, detail.GetProperty("weightG").GetDecimal());
        Assert.True(detail.GetProperty("hasWhiteImage").GetBoolean() && detail.GetProperty("hasRedImage").GetBoolean());
        await using var db = f.OpenDb();
        Assert.Equal(1, await db.DeviceMessages.CountAsync(m => m.MessageId == messageId && m.Status == "Accepted"));
    }

    [Fact]
    public async Task Rail_camera_image_must_be_in_its_rack_and_missing_crab_raises_alert_and_capture_request()
    {
        var set = await Br15Scenario.CrabsAsync(f, 2);
        var (code, key) = await RegisterAsync(new { deviceCode = $"RC-{f.Next()}", deviceType = "RailCamera", operatorId = set.Batch.Farmer.OperatorId, rackCode = "R01" });
        using var device = Device(key);
        object Meta(Guid id, string box, int tier, int column) => new
        {
            messageId = id, deviceCode = code, deviceType = "RailCamera", rackCode = "R01", boxCode = box, tier, column,
            runId = "2026-11-20T06:00+07:00#R01", capturedAt = DateTimeOffset.UtcNow, tofMm = 55, illumination = "IR850", exposureUs = 30000, gain = 6.0,
        };
        // Hộp 0001 ở tầng 1 cột 1 theo bản đồ của fixture.
        var wrongPosition = await device.PostAsync("/api/devices/ingest/box-images", Multipart(Meta(Guid.NewGuid(), "0001", 2, 1), ("image", Br15Scenario.Jpeg())));
        Assert.Equal("device.box_position_mismatch", await Br15Fixture.ErrorCode(wrongPosition));
        var accepted = await device.PostAsync("/api/devices/ingest/box-images", Multipart(Meta(Guid.NewGuid(), "0001", 1, 1), ("image", Br15Scenario.Jpeg())));
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);

        await using var db = f.OpenDb();
        var image = await db.DeviceImages.SingleAsync(i => i.BatchId == set.Batch.BatchId);
        Assert.False(image.CrabDetected);
        Assert.NotNull(image.CrabUnitId);
        Assert.True(await db.Alerts.AnyAsync(a => a.BatchId == set.Batch.BatchId && a.AlertType == "NoCrabDetected"));
        Assert.True(await db.CaptureRequests.AnyAsync(r => r.BatchId == set.Batch.BatchId && r.SlotId == image.SlotId && r.Status == "Open"));

        // Hộp của hộ nuôi khác không thuộc phạm vi.
        var other = await f.CreateFarmerAsync(5);
        var outside = await device.PostAsync("/api/devices/ingest/box-images", Multipart(Meta(Guid.NewGuid(), "9999", 1, 1), ("image", Br15Scenario.Jpeg())));
        Assert.Equal(HttpStatusCode.Forbidden, outside.StatusCode);
        _ = other;

        using var investor = f.Client(await db.CapitalShares.Where(s => s.BatchId == set.Batch.BatchId).Select(s => s.InvestorId).FirstAsync(), Roles.Investor);
        var images = await Br15Fixture.Body(await investor.GetAsync($"/api/batches/{set.Batch.Code}/device-images?slotCode=0001"));
        Assert.Single(images.EnumerateArray());
    }

    [Fact]
    public async Task Water_readings_are_flagged_uncalibrated_until_calibration_message()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var (code, key) = await RegisterAsync(new { deviceCode = $"WS-{f.Next()}", deviceType = "WaterSensor", operatorId = set.Batch.Farmer.OperatorId, batchCode = set.Batch.Code });
        using var device = Device(key);
        object Reading(Guid id) => new { messageId = id, deviceCode = code, measuredAt = DateTimeOffset.UtcNow, temperatureC = 28.4m, salinityPpt = 15.2m, ph = 7.8m, qualityFlag = "ok" };
        Assert.Equal(HttpStatusCode.Accepted, (await device.PostAsJsonAsync("/api/devices/ingest/water-readings", Reading(Guid.NewGuid()))).StatusCode);
        var calibration = await device.PostAsJsonAsync("/api/devices/calibration", new
        {
            messageId = Guid.NewGuid(), deviceCode = code, kind = "ph", performedAt = DateTimeOffset.UtcNow.AddMinutes(-1), details = new { buffers = new[] { 4, 7, 10 } },
        });
        Assert.Equal(HttpStatusCode.Accepted, calibration.StatusCode);
        var dup = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Accepted, (await device.PostAsJsonAsync("/api/devices/ingest/water-readings", Reading(dup))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await device.PostAsJsonAsync("/api/devices/ingest/water-readings", Reading(dup))).StatusCode);

        using var farmer = set.Batch.Farmer.Client(f);
        var chart = await Br15Fixture.Body(await farmer.GetAsync($"/api/batches/{set.Batch.Code}/water-readings"));
        Assert.Equal(["Uncalibrated", "Calibrated"], chart.EnumerateArray().Select(r => r.GetProperty("quality").GetString()));
        await using var db = f.OpenDb();
        Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityType == "device_calibration"));
    }

    [Fact]
    public async Task Offline_device_raises_alert_and_heartbeat_closes_it()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var (code, key) = await RegisterAsync(new { deviceCode = $"WS-{f.Next()}", deviceType = "WaterSensor", operatorId = set.Batch.Farmer.OperatorId, batchCode = set.Batch.Code });
        await using (var db = f.OpenDb())
            await db.Devices.Where(d => d.DeviceCode == code).ExecuteUpdateAsync(s => s.SetProperty(d => d.LastSeenAt, DateTimeOffset.UtcNow.AddHours(-2)));
        await using (var scope = f.Factory.Services.CreateAsyncScope())
            Assert.True(await scope.ServiceProvider.GetRequiredService<DeviceOfflineService>().RunAsync(CancellationToken.None) >= 1);
        await using (var db = f.OpenDb())
        {
            Assert.Equal("Offline", await db.Devices.Where(d => d.DeviceCode == code).Select(d => d.Status).SingleAsync());
            Assert.True(await db.Alerts.AnyAsync(a => a.BatchId == set.Batch.BatchId && a.AlertType == "DeviceOffline" && a.Status == "Open"));
        }
        using var device = Device(key);
        await Br15Fixture.Body(await device.PostAsJsonAsync("/api/devices/heartbeat", new { deviceCode = code }));
        await using (var db = f.OpenDb())
            Assert.False(await db.Alerts.AnyAsync(a => a.BatchId == set.Batch.BatchId && a.AlertType == "DeviceOffline" && a.Status != "Resolved"));
    }

    [Fact]
    public async Task Rail_camera_commands_and_removed_device_is_refused()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var (code, key) = await RegisterAsync(new { deviceCode = $"RC-{f.Next()}", deviceType = "RailCamera", operatorId = set.Batch.Farmer.OperatorId, rackCode = "R01" });
        using var farmer = set.Batch.Farmer.Client(f);
        var command = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, $"/api/devices/{code}/commands", new { commandType = "ScanBox", boxCode = "0001" }));
        using var device = Device(key);
        var pending = await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/commands"));
        Assert.Equal("ScanBox", pending[0].GetProperty("commandType").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await device.PostAsync($"/api/devices/commands/{command.GetProperty("commandId").GetInt64()}/ack", null)).StatusCode);
        Assert.Equal(0, (await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/commands"))).GetArrayLength());

        using var admin = f.Admin();
        await Br15Fixture.Body(await admin.PostAsync($"/api/admin/devices/{code}/remove", null));
        var refused = await device.PostAsJsonAsync("/api/devices/heartbeat", new { deviceCode = code });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("device.removed", await Br15Fixture.ErrorCode(refused));
    }
}
