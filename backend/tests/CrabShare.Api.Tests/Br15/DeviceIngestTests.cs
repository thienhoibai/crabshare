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
        return site.PartyRecordId;
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
    public async Task Remeasure_preserves_old_result_and_keeps_duplicate_guards()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var prefix = $"RM{f.Next()}";
        var tag = prefix + "-001";
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station",
            operatorId = set.Batch.Farmer.OperatorId, siteId = await QcStationSiteAsync(set.Batch.Farmer), cameraHeightMm = 370 });
        using var farmer = set.Batch.Farmer.Client(f);
        using var device = Device(key);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var first = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions",
            new { crabCode = set.CrabCodes[0], stationCode = code, batchCode = set.Batch.Code, gradeAiPrefix = prefix, crabNumber = 1 }));
        var oldNo = first.GetProperty("sessionNo").GetString();
        var path = $"/api/measurement-sessions/{oldNo}/remeasure";
        Assert.Equal("grading.remeasure_not_ready", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(farmer, path, new { stationCode = code })));
        var meta = new { messageId = Guid.NewGuid(), deviceCode = code, sessionNo = oldNo, crabTag = tag,
            capturedAt = DateTimeOffset.UtcNow, doorClosed = true, lastCalibratedAt = DateTimeOffset.UtcNow,
            weightG = 412.3m, weightSamples = 10, weightRangeG = 0.12m, tofMm = 318, cameraHeightMm = 370 };
        Assert.Equal(HttpStatusCode.Accepted, (await device.PostAsync("/api/devices/ingest/measurements",
            Multipart(meta, ("white", Br15Scenario.Jpeg("old-white")), ("red", Br15Scenario.Jpeg("old-red"))))).StatusCode);
        Assert.Equal("grading.gradeai_already_measured", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(farmer,
            "/api/measurement-sessions", new { crabCode = set.CrabCodes[0], stationCode = code })));
        var next = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, path, new { stationCode = code }));
        Assert.NotEqual(oldNo, next.GetProperty("sessionNo").GetString());
        Assert.Equal(tag, next.GetProperty("gradeAiTag").GetString());
        Assert.Equal(set.CrabCodes[0], next.GetProperty("crabCode").GetString());
        Assert.Equal("Open", next.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, next.GetProperty("weightG").ValueKind);
        Assert.False(next.GetProperty("hasWhiteImage").GetBoolean());
        Assert.Equal("grading.crab_session_open", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(farmer, path, new { stationCode = code })));
        var old = await Br15Fixture.Body(await farmer.GetAsync($"/api/measurement-sessions/{oldNo}"));
        Assert.Equal(412.3m, old.GetProperty("weightG").GetDecimal());
        Assert.True(old.GetProperty("hasWhiteImage").GetBoolean());
        Assert.True(old.GetProperty("hasRedImage").GetBoolean());
    }

    [Fact]
    public async Task Numbered_station_result_cannot_move_to_another_crab_and_exact_retry_keeps_its_first_session()
    {
        var set = await Br15Scenario.CrabsAsync(f, 3);
        var prefix = $"LA{f.Next()}";
        var tag = prefix + "-001";
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station",
            operatorId = set.Batch.Farmer.OperatorId, siteId = await QcStationSiteAsync(set.Batch.Farmer), cameraHeightMm = 370 });
        using var device = Device(key);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var initial = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions",
            new { crabCode = set.CrabCodes[0], stationCode = code, batchCode = set.Batch.Code, gradeAiPrefix = prefix, crabNumber = 1 }));
        var initialNo = initial.GetProperty("sessionNo").GetString();
        var open = await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/open-session"));
        Assert.Equal(tag, open.GetProperty("crabTag").GetString());
        Assert.Equal(1, open.GetProperty("bindingVersion").GetInt32());
        var binding = new
        {
            messageId = Guid.NewGuid(), deviceCode = code, sessionNo = initialNo, crabTag = tag, capturedAt = DateTimeOffset.UtcNow,
            doorClosed = true, lastCalibratedAt = DateTimeOffset.UtcNow, weightG = 412.3m, weightSamples = 10, weightRangeG = 0.12m,
            tofMm = 318, cameraHeightMm = 370,
        };
        Task<HttpResponseMessage> Upload(object meta, string red = "r") => device.PostAsync("/api/devices/ingest/measurements",
            Multipart(meta, ("white", Br15Scenario.Jpeg("w")), ("red", Br15Scenario.Jpeg(red))));
        Assert.Equal("device.session_mismatch", await Br15Fixture.ErrorCode(await Upload(binding with { crabTag = prefix + "-002" })));
        Assert.Equal("device.session_mismatch", await Br15Fixture.ErrorCode(await Upload(StationMeta(Guid.NewGuid(), code))));
        Assert.Equal(HttpStatusCode.Accepted, (await Upload(binding)).StatusCode);
        var duplicateTag = await Br15Fixture.PostJson(farmer, "/api/measurement-sessions",
            new { crabCode = set.CrabCodes[1], stationCode = code, batchCode = set.Batch.Code, gradeAiPrefix = prefix, crabNumber = 1 });
        Assert.Equal("grading.gradeai_duplicate_tag", await Br15Fixture.ErrorCode(duplicateTag));
        var next = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions",
            new { crabCode = set.CrabCodes[1], stationCode = code, batchCode = set.Batch.Code, gradeAiPrefix = prefix, crabNumber = 2 }));
        Assert.Equal("device.session_mismatch", await Br15Fixture.ErrorCode(await Upload(binding with { messageId = Guid.NewGuid() })));
        var retry = await Br15Fixture.Body(await Upload(binding));
        Assert.Equal(initialNo, retry.GetProperty("sessionNo").GetString());
        Assert.Equal("device.duplicate_message", await Br15Fixture.ErrorCode(await Upload(binding, "changed")));
        var stillOpen = await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/open-session"));
        Assert.Equal(next.GetProperty("sessionNo").GetString(), stillOpen.GetProperty("sessionNo").GetString());
        var history = await Br15Fixture.Body(await farmer.GetAsync($"/api/batches/{set.Batch.Code}/measurement-sessions?pageSize=1"));
        Assert.Equal(2, history.GetProperty("total").GetInt32());
        Assert.Single(history.GetProperty("items").EnumerateArray());
        var filtered = await Br15Fixture.Body(await farmer.GetAsync($"/api/batches/{set.Batch.Code}/measurement-sessions?search={prefix}-001"));
        Assert.Equal(1, filtered.GetProperty("total").GetInt32());
        Assert.Equal(initialNo, filtered.GetProperty("items")[0].GetProperty("sessionNo").GetString());
    }

    [Fact]
    public async Task Lot_labels_are_assigned_in_one_request_and_open_by_number()
    {
        var set = await Br15Scenario.CrabsAsync(f, 3);
        var prefix = $"LB{f.Next()}";
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station",
            operatorId = set.Batch.Farmer.OperatorId, siteId = await QcStationSiteAsync(set.Batch.Farmer) });
        using var device = Device(key);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var path = $"/api/batches/{set.Batch.Code}/gradeai-labels";
        var duplicate = await Br15Fixture.PostJson(farmer, path,
            new { prefix, labels = set.CrabCodes.Select(c => new { crabCode = c, crabNumber = 1 }) });
        Assert.Equal("grading.gradeai_invalid_labels", await Br15Fixture.ErrorCode(duplicate));
        var assigned = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, path,
            new { prefix, labels = set.CrabCodes.Select((c, i) => new { crabCode = c, crabNumber = i + 1 }) }));
        Assert.Equal(3, assigned.GetProperty("assigned").GetInt32());
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions",
            new { stationCode = code, batchCode = set.Batch.Code, gradeAiPrefix = prefix, crabNumber = 2 }));
        Assert.Equal(set.CrabCodes[1], session.GetProperty("crabCode").GetString());
        var open = await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/open-session"));
        Assert.Equal(prefix + "-002", open.GetProperty("crabTag").GetString());
    }

    [Fact]
    public async Task Station_runtime_is_authenticated_scoped_and_marks_stale_samples()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station",
            operatorId = set.Batch.Farmer.OperatorId, siteId = await QcStationSiteAsync(set.Batch.Farmer) });
        using var farmer = set.Batch.Farmer.Client(f);
        using var anonymous = f.Factory.CreateClient();
        var path = $"/api/operators/me/devices/{code}/station-state";
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
        var empty = await Br15Fixture.Body(await farmer.GetAsync(path));
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("state").ValueKind);
        var message = new { hardwareOnline = true, busy = false, doorClosed = true, phase = "ready",
            rgb = "blue", blinking = true, crabTag = "LA-001", weightG = 227.6m, completed = Array.Empty<string>(),
            connectionType = "wifi", networkSsid = "HieuNhan Café" };
        Assert.Equal(HttpStatusCode.Forbidden, (await Br15Fixture.PostJson(anonymous, $"/api/devices/{code}/station-state", message)).StatusCode);
        using var device = Device(key);
        await Br15Fixture.Body(await Br15Fixture.PostJson(device, $"/api/devices/{code}/station-state", message));
        var current = await Br15Fixture.Body(await farmer.GetAsync(path));
        Assert.True(current.GetProperty("fresh").GetBoolean());
        Assert.Equal("LA-001", current.GetProperty("state").GetProperty("crabTag").GetString());
        Assert.Equal("HieuNhan Café", current.GetProperty("state").GetProperty("networkSsid").GetString());
        var other = await Br15Scenario.CrabsAsync(f, 1);
        using var outsider = other.Batch.Farmer.Client(f);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync($"/api/batches/{set.Batch.Code}/measurement-sessions")).StatusCode);
        await using var db = f.OpenDb();
        var row = await db.Devices.SingleAsync(d => d.DeviceCode == code);
        row.StationStateReceivedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        var stale = await Br15Fixture.Body(await farmer.GetAsync(path));
        Assert.False(stale.GetProperty("fresh").GetBoolean());
    }

    [Fact]
    public async Task Web_start_is_delivered_once_to_its_open_station_session_and_acknowledged_by_pi()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var prefix = $"WEB{f.Next()}";
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station",
            operatorId = set.Batch.Farmer.OperatorId, siteId = await QcStationSiteAsync(set.Batch.Farmer) });
        using var farmer = set.Batch.Farmer.Client(f);
        using var device = Device(key);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions",
            new { crabCode = set.CrabCodes[0], stationCode = code, batchCode = set.Batch.Code, gradeAiPrefix = prefix, crabNumber = 1 }));
        var sessionNo = session.GetProperty("sessionNo").GetString();
        var tag = prefix + "-001";
        var path = $"/api/operators/me/devices/{code}/measurement-sessions/{sessionNo}/start";
        var reportPath = $"/api/devices/{code}/station-state";
        var state = new { hardwareOnline = true, calibrationValid = true, busy = false, doorClosed = true,
            phase = "ready", rgb = "blue", blinking = true, webStartReady = true, sessionNo, crabTag = tag, startOutcome = (object?)null };
        async Task<JsonElement> Report(object report) => await Br15Fixture.Body(await Br15Fixture.PostJson(device, reportPath, report));

        await Report(state with { doorClosed = false });
        Assert.Equal(HttpStatusCode.Conflict, (await farmer.PostAsync(path, null)).StatusCode);
        await Report(state);
        var issued = await Br15Fixture.Body(await farmer.PostAsync(path, null));
        var id = issued.GetProperty("id").GetInt64();
        Assert.Equal("Pending", issued.GetProperty("status").GetString());
        Assert.Equal(id, (await Br15Fixture.Body(await farmer.PostAsync(path, null))).GetProperty("id").GetInt64());
        Assert.Equal(JsonValueKind.Null, (await Report(state with { crabTag = prefix + "-002" })).GetProperty("start").ValueKind);
        var claimed = (await Report(state)).GetProperty("start");
        Assert.Equal(id, claimed.GetProperty("id").GetInt64());
        Assert.Equal(sessionNo, claimed.GetProperty("sessionNo").GetString());
        Assert.Equal(tag, claimed.GetProperty("crabTag").GetString());
        Assert.Equal(JsonValueKind.Null, (await Report(state)).GetProperty("start").ValueKind);
        await Report(state with { busy = true, webStartReady = false, startOutcome = new { id, accepted = true } });
        Assert.Equal("Accepted", (await Br15Fixture.Body(await farmer.GetAsync(path))).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Wifi_credentials_are_protected_delivered_once_and_not_returned_to_the_operator()
    {
        var set = await Br15Scenario.CrabsAsync(f, 1);
        var (code, key) = await RegisterAsync(new { deviceCode = $"ST-{f.Next()}", deviceType = "Station",
            operatorId = set.Batch.Farmer.OperatorId, siteId = await QcStationSiteAsync(set.Batch.Farmer) });
        using var farmer = set.Batch.Farmer.Client(f);
        using var device = Device(key);
        var path = $"/api/operators/me/devices/{code}/wifi";
        var reportPath = $"/api/devices/{code}/station-state";
        const string password = "only-a-fixture-password";
        var state = new { hardwareOnline = true, busy = false, phase = "ready", wifiConfigReady = true,
            wifiOutcome = (object?)null };
        await Br15Fixture.Body(await Br15Fixture.PostJson(device, reportPath, state with { busy = true }));
        Assert.Equal(HttpStatusCode.Conflict, (await Br15Fixture.PostJson(farmer, path, new { ssid = "Farm wifi", password })).StatusCode);
        await Br15Fixture.Body(await Br15Fixture.PostJson(device, reportPath, state));
        var queued = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, path, new { ssid = "Farm wifi", password }));
        var id = queued.GetProperty("id").GetInt64();
        Assert.DoesNotContain(password, queued.ToString());
        await using (var db = f.OpenDb())
        {
            var stored = await db.DeviceCommands.SingleAsync(c => c.DeviceRecordId == id);
            Assert.NotNull(stored.ProtectedPayload);
            Assert.DoesNotContain(password, stored.ProtectedPayload!);
        }
        var oldPoll = await Br15Fixture.Body(await device.GetAsync($"/api/devices/{code}/commands"));
        Assert.Empty(oldPoll.EnumerateArray());
        var delivered = await Br15Fixture.Body(await Br15Fixture.PostJson(device, reportPath, state));
        Assert.Equal(password, delivered.GetProperty("wifi").GetProperty("password").GetString());
        var repeated = await Br15Fixture.Body(await Br15Fixture.PostJson(device, reportPath, state));
        Assert.Equal(JsonValueKind.Null, repeated.GetProperty("wifi").ValueKind);
        await using (var db = f.OpenDb()) Assert.Null((await db.DeviceCommands.SingleAsync(c => c.DeviceRecordId == id)).ProtectedPayload);
        await Br15Fixture.Body(await Br15Fixture.PostJson(device, reportPath,
            state with { wifiOutcome = new { id, connected = true, message = "Đã kết nối" } }));
        var status = await Br15Fixture.Body(await farmer.GetAsync(path));
        Assert.Equal("Accepted", status.GetProperty("status").GetString());
        Assert.DoesNotContain(password, status.ToString());
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
