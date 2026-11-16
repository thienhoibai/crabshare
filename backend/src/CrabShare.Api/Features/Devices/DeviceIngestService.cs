using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Detection;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Devices;

/// <summary>Xử lý lượt đo sau khi trạm gửi bản tin (AI tìm mốc, tính C, đề xuất hạng). Nhóm G5 cài đặt; mặc định không làm gì.</summary>
public interface IStationMeasurementProcessor
{
    Task ProcessAsync(long measurementSessionId, CancellationToken ct);
}

public sealed class NoStationMeasurementProcessor : IStationMeasurementProcessor
{
    public Task ProcessAsync(long measurementSessionId, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>Khoá thiết bị: chỉ lưu mã băm SHA-256, cấp một lần khi đăng ký hoặc đổi khoá.</summary>
public static class DeviceKeys
{
    public static string New() => "dk_" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static string Hash(string key) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
    public static bool Matches(string key, string hash)
        => CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Hash(key)), Encoding.ASCII.GetBytes(hash));
}

/// <summary>
/// API nhận dữ liệu chung cho thiết bị thật và tool giả lập (BR-112, BR-113, BR-230): kiểm khoá và trạng thái thiết bị, kiểm trùng mã bản tin,
/// lưu tệp ảnh kèm SHA-256, gắn vào lượt đo đang mở (trạm đo), tạo ảnh thiết bị và chạy nhận diện (camera), ghi chỉ số nước có cờ hiệu chuẩn.
/// Bản tin bị từ chối được ghi nhật ký.
/// </summary>
public sealed class DeviceIngestService(AppDbContext db, IFileStorage files, ICrabDetector detector, TimeProvider clock, IAuditLog audit,
    PlatformParameters parameters, IAlertRaiser alerts, IStationMeasurementProcessor processor, IServiceScopeFactory scopes,
    ILogger<DeviceIngestService> log)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const long MaxImageBytes = 15 * 1024 * 1024;

    // ---------- khung xử lý chung ----------
    private async Task<T> HandleAsync<T>(string kind, string deviceCode, string? key, Guid messageId, string? idempotencyKey, DateTimeOffset? capturedAt,
        string? payloadHash, Func<Device, DateTimeOffset, Task<T>> work, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        Device? device = null;
        try
        {
            if (messageId == Guid.Empty)
                throw new BusinessRuleException("device.message_id_required", "Thiếu mã bản tin (messageId).");
            if (idempotencyKey is not null && (!Guid.TryParse(idempotencyKey, out var idem) || idem != messageId))
                throw new BusinessRuleException("device.idempotency_mismatch", "Idempotency-Key phải bằng mã bản tin.");
            device = await AuthenticateAsync(deviceCode, key, ct);
            if (await db.DeviceMessages.AnyAsync(m => m.MessageId == messageId && m.Status == "Accepted", ct))
                throw new ConflictException("device.duplicate_message", "Bản tin này đã được ghi (BR-113).");
            var deviceId = device.DeviceId;
            T result;
            try
            {
                result = await db.InTransactionAsync(async () =>
                {
                    var tracked = await db.Devices.SingleAsync(d => d.DeviceId == deviceId, ct);
                    var value = await work(tracked, now);
                    var recovered = tracked.Status == "Offline";
                    tracked.LastSeenAt = now;
                    tracked.Status = "Active";
                    tracked.UpdatedAt = now;
                    db.DeviceMessages.Add(new DeviceMessage
                    {
                        MessageId = messageId, DeviceId = tracked.DeviceId, DeviceCode = tracked.DeviceCode, Kind = kind, CapturedAt = capturedAt,
                        ReceivedAt = now, Status = "Accepted", PayloadSha256 = payloadHash,
                    });
                    await db.SaveChangesAsync(ct);
                    if (recovered) await ResolveOfflineAlertsAsync(tracked, now, ct);
                    return value;
                }, ct);
            }
            catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 } sql &&
                                               (sql.Message.Contains("ux_device_message_accepted") || sql.Message.Contains("ux_measurement_session_message") ||
                                                sql.Message.Contains("ux_device_image_message") || sql.Message.Contains("ux_water_reading_message")))
            {
                throw new ConflictException("device.duplicate_message", "Bản tin này đã được ghi (BR-113).");
            }
            return result;
        }
        catch (AppException ex) when (ex is not ConflictException)
        {
            await LogRejectedAsync(kind, deviceCode, device?.DeviceId, messageId, capturedAt, now, ex.Message, payloadHash);
            throw;
        }
    }

    /// <summary>BR-230: bản tin từ mã thiết bị chưa đăng ký, đã gỡ hoặc sai khoá bị từ chối và ghi nhật ký.</summary>
    private async Task<Device> AuthenticateAsync(string deviceCode, string? key, CancellationToken ct)
    {
        var device = await db.Devices.AsNoTracking().SingleOrDefaultAsync(d => d.DeviceCode == deviceCode, ct);
        if (device is null || string.IsNullOrEmpty(key) || !DeviceKeys.Matches(key, device.KeyHash))
            throw new ForbiddenException("device.unauthorized", "Thiết bị chưa đăng ký hoặc khoá thiết bị không đúng.");
        if (device.Status == "Removed")
            throw new ForbiddenException("device.removed", "Thiết bị đã bị gỡ.");
        return device;
    }

    private async Task LogRejectedAsync(string kind, string deviceCode, long? deviceId, Guid messageId, DateTimeOffset? capturedAt, DateTimeOffset now,
        string reason, string? payloadHash)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var other = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            other.DeviceMessages.Add(new DeviceMessage
            {
                MessageId = messageId, DeviceId = deviceId, DeviceCode = deviceCode.Length > 40 ? deviceCode[..40] : deviceCode, Kind = kind,
                CapturedAt = capturedAt, ReceivedAt = now, Status = "Rejected", RejectReason = reason.Length > 300 ? reason[..300] : reason,
                PayloadSha256 = payloadHash,
            });
            await other.SaveChangesAsync();
        }
        catch (Exception e)
        {
            log.LogWarning(e, "Không ghi được nhật ký bản tin bị từ chối của {DeviceCode}", deviceCode);
        }
    }

    // ---------- heartbeat (BR-231) ----------
    public Task<HeartbeatResponse> HeartbeatAsync(HeartbeatMessage msg, string? key, CancellationToken ct)
    {
        BatchService.Validate(msg);
        // Heartbeat không có mã bản tin riêng trong đặc tả: dùng mã mới mỗi lần, không kiểm trùng.
        return HandleAsync("Heartbeat", msg.DeviceCode, key, Guid.NewGuid(), null, null, null, async (device, now) =>
        {
            device.FirmwareVersion = msg.FirmwareVersion ?? device.FirmwareVersion;
            device.QueueLength = msg.QueueLength;
            await Task.CompletedTask;
            return new HeartbeatResponse(now, "Active", device.LastCalibratedAt, await CalibrationDueAsync(device, ct));
        }, ct);
    }

    // ---------- trạm đo ----------
    /// <summary>GET open-session: trạm hỏi lượt đo đang mở của chính nó (BR-224).</summary>
    public async Task<OpenSessionResponse> OpenSessionAsync(string deviceCode, string? key, CancellationToken ct)
    {
        var device = await AuthenticateAsync(deviceCode, key, ct);
        if (device.DeviceType != "Station") throw new ForbiddenException("device.not_station", "Thiết bị không phải trạm đo.");
        var session = await db.MeasurementSessions.AsNoTracking().Where(s => s.StationDeviceId == device.DeviceId && s.Status == "Open")
                          .Join(db.CrabUnits, s => s.CrabUnitId, c => c.CrabUnitId, (s, c) => new { s.SessionNo, c.CrabCode, s.OpenedAt })
                          .SingleOrDefaultAsync(ct)
                      ?? throw new NotFoundException("measurement.no_open_session", "Chưa mở lượt đo cho trạm này (BR-224).");
        return new OpenSessionResponse(session.SessionNo, session.CrabCode, session.OpenedAt);
    }

    public async Task<IngestAccepted> MeasurementAsync(string metaJson, IFormFile? white, IFormFile? red, string? key, string? idempotencyKey, CancellationToken ct)
    {
        var meta = Parse<StationMeta>(metaJson);
        var hash = Sha(metaJson);
        long sessionId = 0;
        var result = await HandleAsync("Measurement", meta.DeviceCode, key, meta.MessageId, idempotencyKey, meta.CapturedAt, hash, async (device, now) =>
        {
            if (device.DeviceType != "Station") throw new ForbiddenException("device.not_station", "Thiết bị không phải trạm đo.");
            if (meta.WeightG is null || meta.CapturedAt is null || white is null || red is null)
                throw new BusinessRuleException("device.missing_fields", "Bản tin trạm đo thiếu khối lượng, thời điểm chụp hoặc một trong hai ảnh.");
            // BR-225: cửa chưa đóng hoặc quá kỳ hiệu chuẩn thì trạm từ chối đo; máy chủ kiểm lại.
            if (meta.DoorClosed != true)
                throw new BusinessRuleException("device.door_open", "Cửa trạm chưa đóng; không nhận số đo (BR-225).");
            var calibratedAt = Max(device.LastCalibratedAt, meta.LastCalibratedAt);
            var period = await PeriodDaysAsync(device, ct);
            if (calibratedAt is null || now - calibratedAt > TimeSpan.FromDays(period))
                throw new BusinessRuleException("device.calibration_expired", $"Cân quá {period} ngày chưa hiệu chuẩn; không nhận số đo (BR-225).");
            // BR-231: 10 lần đọc lệch quá 0,2 g là cân không ổn định.
            if (meta.WeightRangeG is > 0.2m)
                throw new BusinessRuleException("device.scale_unstable", "Cân không ổn định (dao động quá 0,2 g); trạm phải đo lại (BR-231).");
            var session = await db.MeasurementSessions.FromSqlInterpolated(
                                  $"SELECT * FROM dbo.measurement_session WITH (UPDLOCK, HOLDLOCK) WHERE station_device_id = {device.DeviceId} AND status = 'Open'")
                              .SingleOrDefaultAsync(ct)
                          ?? throw new NotFoundException("measurement.no_open_session", "Chưa mở lượt đo cho trạm này (BR-224).");
            var whiteFile = await SaveImageAsync(white, $"stations/{device.DeviceCode}/{now:yyyy/MM}", ct);
            var redFile = await SaveImageAsync(red, $"stations/{device.DeviceCode}/{now:yyyy/MM}", ct);
            session.Status = "Received";
            session.MessageId = meta.MessageId;
            session.CapturedAt = meta.CapturedAt;
            session.ReceivedAt = now;
            session.FirmwareVersion = meta.FirmwareVersion;
            session.WeightG = meta.WeightG;
            session.WeightSamples = (short?)meta.WeightSamples;
            session.WeightRangeG = meta.WeightRangeG;
            session.TofMm = meta.TofMm;
            session.CameraHeightMm = meta.CameraHeightMm ?? device.CameraHeightMm;
            session.DoorClosed = true;
            session.ScaleCalibratedAt = calibratedAt;
            session.ScaleCalibrationOk = true;
            session.WhiteImageUri = whiteFile.Uri;
            session.WhiteSha256 = whiteFile.Sha256;
            session.RedImageUri = redFile.Uri;
            session.RedSha256 = redFile.Sha256;
            session.PresetsJson = meta.Presets is null ? null : JsonSerializer.Serialize(meta.Presets, Json);
            session.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            sessionId = session.MeasurementSessionId;
            return new IngestAccepted("Received", session.SessionNo, session.MeasurementSessionId);
        }, ct);
        // Xử lý ảnh (G5) chạy sau khi bản tin đã ghi; lỗi xử lý không làm mất bản tin.
        try { await processor.ProcessAsync(sessionId, ct); }
        catch (Exception e) { log.LogError(e, "Xử lý lượt đo {SessionId} lỗi; bản tin vẫn được giữ", sessionId); }
        return result;
    }

    // ---------- ảnh hộp (BR-114, BR-117, BR-119, BR-228) ----------
    public async Task<IngestAccepted> BoxImageAsync(string metaJson, IFormFile? image, string? key, string? idempotencyKey, CancellationToken ct)
    {
        var meta = Parse<BoxImageMeta>(metaJson);
        var hash = Sha(metaJson);
        long? alertBatch = null;
        string? alertBox = null;
        long? alertSlot = null;
        var result = await HandleAsync("BoxImage", meta.DeviceCode, key, meta.MessageId, idempotencyKey, meta.CapturedAt, hash, async (device, now) =>
        {
            if (device.DeviceType is not ("Camera" or "RailCamera")) throw new ForbiddenException("device.not_camera", "Thiết bị không phải camera hộp.");
            if (image is null || meta.CapturedAt is null)
                throw new BusinessRuleException("device.missing_fields", "Bản tin ảnh hộp thiếu ảnh hoặc thời điểm chụp.");
            var slot = await db.PhysicalSlots.SingleOrDefaultAsync(s => s.OperatorId == device.OperatorId && s.SlotCode == meta.BoxCode, ct);
            // Mã hộp phải thuộc phạm vi của thiết bị: đúng hộp với camera cố định, đúng dàn với camera chạy dàn.
            var inScope = slot is not null && (device.DeviceType == "Camera"
                ? slot.SlotId == device.ScopeSlotId
                : string.Equals(meta.RackCode ?? device.ScopeRackCode, device.ScopeRackCode, StringComparison.OrdinalIgnoreCase) &&
                  RackCodeOf(slot) == device.ScopeRackCode?.ToUpperInvariant());
            if (!inScope) throw new ForbiddenException("device.box_out_of_scope", $"Hộp {meta.BoxCode} không thuộc phạm vi của thiết bị (BR-230).");
            if (device.DeviceType == "RailCamera" && ((meta.Tier is { } tier && slot!.TierNo is { } t && tier != t) ||
                                                      (meta.Column is { } col && slot!.ColumnNo is { } c && col != c)))
                throw new BusinessRuleException("device.box_position_mismatch", "Tầng, cột trong bản tin không khớp bản đồ hộp của dàn (BR-228).");
            var allocation = await db.SlotAllocations.AsNoTracking().Where(a => a.SlotId == slot!.SlotId && a.ReleasedAt == null)
                .Select(a => (long?)a.BatchId).SingleOrDefaultAsync(ct);
            var crab = await db.BoxAssignments.AsNoTracking().Where(a => a.SlotId == slot!.SlotId && a.LeftAt == null)
                .Select(a => (long?)a.CrabUnitId).SingleOrDefaultAsync(ct);
            await using var buffer = new MemoryStream();
            await image.CopyToAsync(buffer, ct);
            RequireJpeg(buffer, image);
            buffer.Position = 0;
            var detection = await detector.DetectAsync(buffer, ct);
            buffer.Position = 0;
            var stored = await files.SaveAsync(buffer, $"{meta.MessageId:N}.jpg", "image/jpeg", $"devices/{device.DeviceCode}/{now:yyyy/MM}", ct);
            var row = new DeviceImage
            {
                DeviceId = device.DeviceId, BatchId = allocation, SlotId = slot!.SlotId, CrabUnitId = crab, MessageId = meta.MessageId,
                CapturedAt = meta.CapturedAt.Value, ReceivedAt = now, FileUri = stored.Uri, Sha256 = stored.Sha256, RunId = meta.RunId,
                TofMm = meta.TofMm, Illumination = meta.Illumination, CrabDetected = detection.CrabDetected,
                DetectionConfidence = detection.Confidence is { } conf ? (decimal)conf : null, DetectionModel = detection.ModelVersion, CreatedAt = now,
            };
            db.DeviceImages.Add(row);
            await db.SaveChangesAsync(ct);
            if (detection.CrabDetected == false && crab is not null && allocation is { } batchId)
            {
                alertBatch = batchId;
                alertBox = slot.SlotCode;
                alertSlot = slot.SlotId;
            }
            return new IngestAccepted("Received", Id: row.DeviceImageId);
        }, ct);
        // BR-119, BR-134: ảnh không thấy cua trong khi hộp đang có cua sống → cảnh báo và yêu cầu chụp hộp đó.
        if (alertBatch is { } b)
        {
            await alerts.RaiseAsync(b, AlertType.NoCrabDetected, AlertSeverity.High,
                $"Ảnh camera hộp {alertBox} không thấy cua trong khi hộp đang có cua sống; hãy tới kiểm tra.", TimeSpan.FromHours(4), ct);
            await CreateCaptureRequestAsync(b, alertSlot!.Value, ct);
        }
        return result;
    }

    private async Task CreateCaptureRequestAsync(long batchId, long slotId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (await db.CaptureRequests.AnyAsync(r => r.SlotId == slotId && r.Status == "Open", ct)) return;
        var hours = await parameters.GetIntAsync(ParamKeys.CaptureRequestHours, null, ct);
        db.CaptureRequests.Add(new CaptureRequest { BatchId = batchId, SlotId = slotId, RequestedAt = now, DueAt = now.AddHours(hours), Status = "Open", CreatedAt = now });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Mã dàn của hộp: "R" + số kệ hai chữ số (kệ 1 → R01).</summary>
    public static string? RackCodeOf(PhysicalSlot slot) => slot.RackNo is { } rack ? $"R{rack:D2}" : null;

    // ---------- chỉ số nước (BR-115, BR-229) ----------
    public Task<IngestAccepted> WaterReadingAsync(WaterReadingMessage msg, string? key, string? idempotencyKey, CancellationToken ct)
    {
        BatchService.Validate(msg);
        return HandleAsync("WaterReading", msg.DeviceCode, key, msg.MessageId, idempotencyKey, msg.MeasuredAt, null, async (device, now) =>
        {
            if (device.DeviceType != "WaterSensor") throw new ForbiddenException("device.not_water_sensor", "Thiết bị không phải cụm cảm biến nước.");
            if (msg.MeasuredAt is null || (msg.TemperatureC is null && msg.Ph is null && msg.SalinityPpt is null))
                throw new BusinessRuleException("device.missing_fields", "Bản tin chỉ số nước thiếu thời điểm đo hoặc mọi chỉ số.");
            var holding = await db.HoldingOperations.AsNoTracking().SingleOrDefaultAsync(h => h.HoldingId == device.ScopeHoldingId, ct)
                          ?? throw new ForbiddenException("device.scope_missing", "Cụm cảm biến chưa gắn đợt lưu nuôi.");
            var calibratedAt = Max(device.LastCalibratedAt, msg.LastCalibratedAt);
            var period = await PeriodDaysAsync(device, ct);
            var quality = msg.QualityFlag is { } flag && !flag.Equals("ok", StringComparison.OrdinalIgnoreCase) && !flag.Equals("Calibrated", StringComparison.OrdinalIgnoreCase)
                ? "Suspect"
                : calibratedAt is null || now - calibratedAt > TimeSpan.FromDays(period) ? "Uncalibrated" : "Calibrated";
            var row = new WaterReading
            {
                DeviceId = device.DeviceId, HoldingId = holding.HoldingId, BatchId = holding.BatchId, MessageId = msg.MessageId,
                MeasuredAt = msg.MeasuredAt.Value, ReceivedAt = now, TemperatureC = msg.TemperatureC, SalinityPpt = msg.SalinityPpt, Ph = msg.Ph,
                DeviceQualityFlag = msg.QualityFlag, Quality = quality,
            };
            db.WaterReadings.Add(row);
            await db.SaveChangesAsync(ct);
            return new IngestAccepted("Received", Id: row.WaterReadingId);
        }, ct);
    }

    // ---------- hiệu chuẩn (BR-225) ----------
    public Task<IngestAccepted> CalibrationAsync(CalibrationMessage msg, string? key, string? idempotencyKey, CancellationToken ct)
    {
        BatchService.Validate(msg);
        return HandleAsync("Calibration", msg.DeviceCode, key, msg.MessageId, idempotencyKey, msg.PerformedAt, null, async (device, now) =>
        {
            var performed = msg.PerformedAt is { } p && p <= now.AddMinutes(5) ? p : now;
            var details = msg.Details?.GetRawText();
            decimal? error = null;
            if (msg.Details is { ValueKind: JsonValueKind.Object } d && d.TryGetProperty("errorG", out var e) && e.TryGetDecimal(out var v)) error = v;
            // Cân sai quá 0,5 g sau hiệu chuẩn thì không tính là đã hiệu chuẩn (BR-225).
            var passed = msg.Kind != "scale" || error is null || error <= 0.5m;
            var row = new DeviceCalibration
            {
                DeviceId = device.DeviceId, MessageId = msg.MessageId, Kind = msg.Kind, PerformedAt = performed,
                DetailsJson = details is { Length: > 2000 } ? details[..2000] : details, ErrorG = error, Passed = passed, ReceivedAt = now,
            };
            db.DeviceCalibrations.Add(row);
            if (passed && RelevantKind(device.DeviceType, msg.Kind)) device.LastCalibratedAt = Max(device.LastCalibratedAt, performed);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("device_calibration", row.DeviceCalibrationId, "record", null,
                new { device.DeviceCode, msg.Kind, performed, errorG = error, passed }, ct);
            return new IngestAccepted(passed ? "Received" : "Rejected", Id: row.DeviceCalibrationId);
        }, ct);
    }

    internal static bool RelevantKind(string deviceType, string kind) => deviceType switch
    {
        "Station" => kind == "scale",
        "WaterSensor" => kind is "ph" or "ec",
        "RailCamera" => kind is "position" or "camera",
        _ => kind == "camera",
    };

    // ---------- lệnh cho camera chạy dàn ----------
    public async Task<IReadOnlyList<DeviceCommandResponse>> CommandsAsync(string deviceCode, string? key, CancellationToken ct)
    {
        var device = await AuthenticateAsync(deviceCode, key, ct);
        return await db.DeviceCommands.AsNoTracking().Where(c => c.DeviceId == device.DeviceId && c.Status == "Pending").OrderBy(c => c.DeviceCommandId)
            .Select(c => new DeviceCommandResponse(c.DeviceCommandId, c.CommandType, c.BoxCode, c.CreatedAt)).ToListAsync(ct);
    }

    public async Task AckCommandAsync(long commandId, string? deviceCode, string? key, CancellationToken ct)
    {
        var command = await db.DeviceCommands.SingleOrDefaultAsync(c => c.DeviceCommandId == commandId, ct)
                      ?? throw new NotFoundException("device.command_not_found", "Không tìm thấy lệnh.");
        var device = await db.Devices.AsNoTracking().SingleAsync(d => d.DeviceId == command.DeviceId, ct);
        await AuthenticateAsync(deviceCode ?? device.DeviceCode, key, ct);
        if (deviceCode is not null && deviceCode != device.DeviceCode)
            throw new ForbiddenException("device.command_other_device", "Lệnh không thuộc thiết bị này.");
        if (command.Status != "Pending") return;
        command.Status = "Acked";
        command.AckedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    // ---------- tiện ích ----------
    private async Task<int> PeriodDaysAsync(Device device, CancellationToken ct)
    {
        var platform = await parameters.GetIntAsync(ParamKeys.CalibrationPeriodDays, null, ct);
        return Math.Min(platform, device.CalibrationPeriodDays);
    }

    private async Task<bool> CalibrationDueAsync(Device device, CancellationToken ct)
        => device.LastCalibratedAt is not { } at || clock.GetUtcNow() - at > TimeSpan.FromDays(await PeriodDaysAsync(device, ct));

    /// <summary>Khi thiết bị gửi lại, cảnh báo mất kết nối của Lô tự đóng nếu không còn thiết bị nào khác của Lô mất kết nối.</summary>
    private async Task ResolveOfflineAlertsAsync(Device device, DateTimeOffset now, CancellationToken ct)
    {
        foreach (var batchId in await DeviceScope.BatchIdsAsync(db, device, ct))
        {
            var stillOffline = false;
            foreach (var other in await db.Devices.Where(d => d.OperatorId == device.OperatorId && d.Status == "Offline" && d.DeviceId != device.DeviceId).ToListAsync(ct))
                if ((await DeviceScope.BatchIdsAsync(db, other, ct)).Contains(batchId)) stillOffline = true;
            if (stillOffline) continue;
            foreach (var alert in await db.Alerts.Where(a => a.BatchId == batchId && a.AlertType == "DeviceOffline" && a.Status != "Resolved").ToListAsync(ct))
            {
                alert.Status = "Resolved";
                alert.ResponseNote ??= "Thiết bị đã gửi lại dữ liệu; cảnh báo tự đóng.";
                alert.UpdatedAt = now;
            }
        }
        await db.SaveChangesAsync(ct);
    }

    private static T Parse<T>(string json) where T : class
    {
        try
        {
            var value = JsonSerializer.Deserialize<T>(json, Json) ?? throw new BusinessRuleException("device.missing_fields", "Phần meta trống.");
            BatchService.Validate(value);
            return value;
        }
        catch (JsonException)
        {
            throw new BusinessRuleException("device.invalid_meta", "Phần meta không phải JSON hợp lệ.");
        }
    }

    private static string Sha(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    private static DateTimeOffset? Max(DateTimeOffset? a, DateTimeOffset? b) => a is null ? b : b is null ? a : a > b ? a : b;

    private async Task<StoredFile> SaveImageAsync(IFormFile file, string folder, CancellationToken ct)
    {
        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        RequireJpeg(buffer, file);
        buffer.Position = 0;
        return await files.SaveAsync(buffer, $"{Guid.NewGuid():N}.jpg", "image/jpeg", folder, ct);
    }

    private static void RequireJpeg(MemoryStream buffer, IFormFile file)
    {
        if (file.Length == 0 || file.Length > MaxImageBytes)
            throw new BusinessRuleException("device.image_size", "Ảnh rỗng hoặc lớn hơn 15 MB.");
        var bytes = buffer.GetBuffer();
        if (buffer.Length < 3 || bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[2] != 0xFF)
            throw new BusinessRuleException("device.image_not_jpeg", "Ảnh phải là JPEG.");
    }
}

/// <summary>Lô mà một thiết bị đang phục vụ, suy từ phạm vi của thiết bị.</summary>
public static class DeviceScope
{
    public static async Task<IReadOnlyList<long>> BatchIdsAsync(AppDbContext db, Device device, CancellationToken ct)
    {
        switch (device.DeviceType)
        {
            case "Camera":
                return await db.SlotAllocations.Where(a => a.SlotId == device.ScopeSlotId && a.ReleasedAt == null).Select(a => a.BatchId).ToListAsync(ct);
            case "RailCamera":
                var rack = device.ScopeRackCode is { Length: > 1 } code && short.TryParse(code[1..], out var r) ? r : (short)-1;
                return await db.SlotAllocations.Where(a => a.ReleasedAt == null && a.Slot.OperatorId == device.OperatorId && a.Slot.RackNo == rack)
                    .Select(a => a.BatchId).Distinct().ToListAsync(ct);
            case "WaterSensor":
                return await db.HoldingOperations.Where(h => h.HoldingId == device.ScopeHoldingId).Select(h => h.BatchId).ToListAsync(ct);
            default:
                return [];
        }
    }
}
