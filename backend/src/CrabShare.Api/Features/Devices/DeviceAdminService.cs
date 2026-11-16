using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Jobs;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Devices;

/// <summary>Admin đăng ký thiết bị, gắn phạm vi, đổi khoá, gỡ (BR-116, BR-230); người nuôi và Admin ghi hiệu chuẩn tay, ra lệnh cho camera chạy dàn.</summary>
public sealed class DeviceAdminService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, PartyDirectory parties,
    PlatformParameters parameters, BatchAccess access)
{
    public async Task<DeviceRegisteredResponse> RegisterAsync(RegisterDeviceRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var key = DeviceKeys.New();
        var device = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            if (await db.Devices.AnyAsync(d => d.DeviceCode == req.DeviceCode, ct))
                throw new ConflictException("device.code_taken", "Mã thiết bị đã đăng ký.");
            var farm = await db.Operators.SingleOrDefaultAsync(o => o.OperatorId == req.OperatorId, ct)
                       ?? throw new NotFoundException("operator.not_found", "Không tìm thấy hộ nuôi.");
            var now = clock.GetUtcNow();
            var device = new Device
            {
                DeviceCode = req.DeviceCode, DeviceType = req.DeviceType, OperatorId = farm.OperatorId, KeyHash = DeviceKeys.Hash(key), KeyPrefix = key[..8],
                Source = req.Source, Status = "Active", CalibrationPeriodDays = req.CalibrationPeriodDays ?? (short)await parameters.GetIntAsync(ParamKeys.CalibrationPeriodDays, null, ct),
                CameraHeightMm = req.CameraHeightMm, RegisteredBy = me.UserId, CreatedAt = now, UpdatedAt = now,
            };
            await ApplyScopeAsync(device, req, ct);
            db.Devices.Add(device);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("device", device.DeviceId, "register", null,
                new { device.DeviceCode, device.DeviceType, device.ScopeType, device.ScopeSlotId, device.ScopeRackCode, device.ScopeHoldingId, device.ScopeSiteId, device.Source }, ct);
            return device;
        }, ct);
        return new DeviceRegisteredResponse(await ResponseAsync(device, ct), key);
    }

    private async Task ApplyScopeAsync(Device device, RegisterDeviceRequest req, CancellationToken ct)
    {
        switch (req.DeviceType)
        {
            case "Camera":
                device.ScopeType = "Box";
                device.ScopeSlotId = await db.PhysicalSlots.Where(s => s.OperatorId == device.OperatorId && s.SlotCode == req.SlotCode)
                                         .Select(s => (long?)s.SlotId).SingleOrDefaultAsync(ct)
                                     ?? throw new NotFoundException("device.slot_not_found", "Không tìm thấy hộp của hộ nuôi.");
                break;
            case "RailCamera":
                var rack = req.RackCode?.Trim().ToUpperInvariant();
                if (rack is null || !System.Text.RegularExpressions.Regex.IsMatch(rack, "^R[0-9]{2}$"))
                    throw new BusinessRuleException("device.rack_code", "Mã dàn có dạng R01 (kệ số 1).");
                var rackNo = short.Parse(rack[1..]);
                if (!await db.PhysicalSlots.AnyAsync(s => s.OperatorId == device.OperatorId && s.RackNo == rackNo, ct))
                    throw new NotFoundException("device.rack_not_found", "Hộ nuôi không có dàn này.");
                device.ScopeType = "Rack";
                device.ScopeRackCode = rack;
                break;
            case "WaterSensor":
                var holdingBatchId = await db.Batches.Where(b => b.BatchCode == req.BatchCode && b.OperatorId == device.OperatorId)
                    .Select(b => (long?)b.BatchId).SingleOrDefaultAsync(ct);
                var holding = await db.HoldingOperations.Where(h => h.BatchId == holdingBatchId).SingleOrDefaultAsync(ct);
                device.ScopeType = "Holding";
                device.ScopeHoldingId = holding?.HoldingId
                                        ?? throw new NotFoundException("device.holding_not_found", "Lô chưa có đợt lưu nuôi để gắn cụm cảm biến nước (BR-229).");
                break;
            default:
                if (req.SiteId is not { } siteId) throw new BusinessRuleException("device.site_required", "Trạm đo phải gắn một địa điểm trạm kiểm phẩm.");
                var partyId = await parties.PartyIdOfOperatorAsync(device.OperatorId, ct);
                if (!await db.PartySites.AnyAsync(s => s.SiteId == siteId && s.PartyId == partyId && (s.SiteType == "QcStation" || s.SiteType == "Farm"), ct))
                    throw new NotFoundException("device.site_not_found", "Địa điểm không phải trạm kiểm phẩm hay trại của hộ nuôi.");
                device.ScopeType = "QcStation";
                device.ScopeSiteId = siteId;
                break;
        }
    }

    public async Task<string> RotateKeyAsync(string code, CancellationToken ct)
    {
        var key = DeviceKeys.New();
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var device = await DeviceAsync(code, ct);
            device.KeyHash = DeviceKeys.Hash(key);
            device.KeyPrefix = key[..8];
            device.UpdatedAt = clock.GetUtcNow();
            await audit.WriteAsync("device", device.DeviceId, "rotate_key", null, new { device.DeviceCode, device.KeyPrefix }, ct);
        }, ct);
        return key;
    }

    public async Task<DeviceResponse> RemoveAsync(string code, CancellationToken ct)
    {
        var device = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var device = await DeviceAsync(code, ct);
            device.Status = "Removed";
            device.RemovedAt = device.UpdatedAt = clock.GetUtcNow();
            await audit.WriteAsync("device", device.DeviceId, "remove", null, new { device.DeviceCode }, ct);
            return device;
        }, ct);
        return await ResponseAsync(device, ct);
    }

    public async Task<IReadOnlyList<DeviceResponse>> ListAsync(long? operatorId, CancellationToken ct)
    {
        var ownOperator = me.IsInRole(Roles.PlatformAdmin) ? operatorId : me.RequireOperatorId();
        var devices = await db.Devices.AsNoTracking().Where(d => ownOperator == null || d.OperatorId == ownOperator).OrderBy(d => d.DeviceCode).ToListAsync(ct);
        var result = new List<DeviceResponse>();
        foreach (var d in devices) result.Add(await ResponseAsync(d, ct));
        return result;
    }

    /// <summary>Hiệu chuẩn tay ghi trong ứng dụng (ví dụ cân bằng quả cân chuẩn khi trạm mất mạng); ghi nhật ký kiểm toán (BR-225).</summary>
    public async Task<DeviceResponse> RecordCalibrationAsync(string code, ManualCalibrationRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var device = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var device = await DeviceAsync(code, ct);
            await RequireOwnerAsync(device, ct);
            var now = clock.GetUtcNow();
            var performed = req.PerformedAt is { } p && p <= now ? p : now;
            var passed = req.Kind != "scale" || req.ErrorG is null || req.ErrorG <= 0.5m;
            var row = new DeviceCalibration
            {
                DeviceId = device.DeviceId, Kind = req.Kind, PerformedAt = performed, DetailsJson = req.Note, ErrorG = req.ErrorG, Passed = passed,
                RecordedBy = me.UserId, ReceivedAt = now,
            };
            db.DeviceCalibrations.Add(row);
            if (passed && DeviceIngestService.RelevantKind(device.DeviceType, req.Kind))
                device.LastCalibratedAt = device.LastCalibratedAt is { } last && last > performed ? last : performed;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("device_calibration", row.DeviceCalibrationId, "record_manual", null, new { device.DeviceCode, req.Kind, performed, req.ErrorG, passed }, ct);
            return device;
        }, ct);
        return await ResponseAsync(device, ct);
    }

    public async Task<DeviceCommandResponse> CommandAsync(string code, DeviceCommandRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var device = await DeviceAsync(code, ct);
        await RequireOwnerAsync(device, ct);
        if (device.DeviceType != "RailCamera")
            throw new BusinessRuleException("device.not_railcam", "Chỉ camera chạy dàn nhận lệnh.");
        if (req.CommandType == "ScanBox" && !await db.PhysicalSlots.AnyAsync(s => s.OperatorId == device.OperatorId && s.SlotCode == req.BoxCode, ct))
            throw new NotFoundException("device.slot_not_found", "Không tìm thấy hộp.");
        var command = new DeviceCommand
        {
            DeviceId = device.DeviceId, CommandType = req.CommandType, BoxCode = req.BoxCode, Status = "Pending", Reason = req.Reason,
            CreatedBy = me.UserId, CreatedAt = clock.GetUtcNow(),
        };
        db.DeviceCommands.Add(command);
        await db.SaveChangesAsync(ct);
        return new DeviceCommandResponse(command.DeviceCommandId, command.CommandType, command.BoxCode, command.CreatedAt);
    }

    private async Task<Device> DeviceAsync(string code, CancellationToken ct)
        => await db.Devices.SingleOrDefaultAsync(d => d.DeviceCode == code, ct)
           ?? throw new NotFoundException("device.not_found", "Không tìm thấy thiết bị.");

    private async Task RequireOwnerAsync(Device device, CancellationToken ct)
    {
        if (me.IsInRole(Roles.PlatformAdmin)) return;
        if (!await db.OperatorMembers.AnyAsync(m => m.UserId == me.UserId && m.OperatorId == device.OperatorId && m.MemberRole == "Owner", ct))
            throw new ForbiddenException("device.not_owner", "Thiết bị không thuộc hộ nuôi của bạn.");
    }

    public async Task<DeviceResponse> ResponseAsync(Device d, CancellationToken ct)
    {
        var scope = d.ScopeType switch
        {
            "Box" => await db.PhysicalSlots.Where(s => s.SlotId == d.ScopeSlotId).Select(s => s.SlotCode).SingleOrDefaultAsync(ct) ?? "",
            "Rack" => d.ScopeRackCode ?? "",
            "Holding" => await db.HoldingOperations.Where(h => h.HoldingId == d.ScopeHoldingId).Select(h => h.HoldingCode).SingleOrDefaultAsync(ct) ?? "",
            _ => await db.PartySites.Where(s => s.SiteId == d.ScopeSiteId).Select(s => s.SiteCode).SingleOrDefaultAsync(ct) ?? "",
        };
        var period = Math.Min(d.CalibrationPeriodDays, await parameters.GetIntAsync(ParamKeys.CalibrationPeriodDays, null, ct));
        var due = d.LastCalibratedAt is not { } at || clock.GetUtcNow() - at > TimeSpan.FromDays(period);
        return new DeviceResponse(d.DeviceCode, d.DeviceType, d.OperatorId, d.ScopeType, scope, d.Source, d.Status, d.FirmwareVersion, d.LastSeenAt,
            d.LastCalibratedAt, d.CalibrationPeriodDays, due, d.QueueLength, d.KeyPrefix);
    }
}

/// <summary>
/// BR-118, BR-231: thiết bị không gửi bản tin quá thời gian mất kết nối thì chuyển Offline và phát cảnh báo cho người nuôi;
/// nhiều thiết bị của một Lô cùng mất kết nối (ví dụ cúp điện) thì cảnh báo khẩn.
/// </summary>
public sealed class DeviceOfflineService(AppDbContext db, TimeProvider clock, PlatformParameters parameters, IAlertRaiser alerts, IAuditLog audit)
{
    public async Task<int> RunAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var minutes = await parameters.GetIntAsync(ParamKeys.DeviceOfflineMinutes, null, ct);
        var cutoff = now.AddMinutes(-minutes);
        var stale = await db.Devices.Where(d => d.Status == "Active" && ((d.LastSeenAt != null && d.LastSeenAt < cutoff) ||
                                                                         (d.LastSeenAt == null && d.CreatedAt < cutoff))).ToListAsync(ct);
        foreach (var d in stale)
        {
            d.Status = "Offline";
            d.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct);
        var byBatch = new Dictionary<long, List<Device>>();
        foreach (var d in stale)
        foreach (var batchId in await DeviceScope.BatchIdsAsync(db, d, ct))
            (byBatch.TryGetValue(batchId, out var list) ? list : byBatch[batchId] = []).Add(d);
        foreach (var (batchId, devices) in byBatch)
        {
            var offlineNow = 0;
            foreach (var d in await db.Devices.Where(x => x.Status == "Offline").ToListAsync(ct))
                if ((await DeviceScope.BatchIdsAsync(db, d, ct)).Contains(batchId)) offlineNow++;
            var critical = offlineNow >= 3;
            await alerts.RaiseAsync(batchId, AlertType.DeviceOffline, critical ? AlertSeverity.Critical : AlertSeverity.High,
                critical
                    ? $"Khẩn: {offlineNow} thiết bị của Lô cùng mất kết nối (có thể cúp điện)."
                    : $"Thiết bị {string.Join(", ", devices.Select(x => x.DeviceCode))} không gửi dữ liệu quá {minutes} phút.",
                critical ? TimeSpan.FromMinutes(30) : TimeSpan.FromHours(2), ct);
        }
        return stale.Count;
    }
}

public sealed class DeviceOfflineJob(IServiceScopeFactory scopes, ILogger<DeviceOfflineJob> logger, IConfiguration config) : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Devices:OfflineJob:Enabled";
    private readonly bool enabled = config.GetValue(EnabledKey, true);
    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);
    protected override Task ExecuteAsync(CancellationToken stoppingToken) => enabled ? base.ExecuteAsync(stoppingToken) : Task.CompletedTask;
    protected override Task RunAsync(IServiceProvider services, CancellationToken ct) => services.GetRequiredService<DeviceOfflineService>().RunAsync(ct);
}

/// <summary>Biểu đồ chỉ số nước (BR-115: chỉ biểu đồ, không ngưỡng) và ảnh thiết bị của hộp (BR-114, BR-142). Ảnh thiết bị không phải bằng chứng.</summary>
public sealed class DeviceDataService(AppDbContext db, ICurrentUser me, IFileStorage files)
{
    public async Task<IReadOnlyList<WaterReadingResponse>> WaterAsync(string code, DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct)
    {
        var batch = await ViewableBatchAsync(code, ct);
        var start = from ?? DateTimeOffset.UtcNow.AddDays(-7);
        var end = to ?? DateTimeOffset.UtcNow.AddMinutes(5);
        return await db.WaterReadings.AsNoTracking().Where(w => w.BatchId == batch.BatchId && w.MeasuredAt >= start && w.MeasuredAt <= end)
            .OrderBy(w => w.MeasuredAt).Take(5000)
            .Join(db.Devices, w => w.DeviceId, d => d.DeviceId, (w, d) => new WaterReadingResponse(w.MeasuredAt, w.TemperatureC, w.SalinityPpt, w.Ph, w.Quality, d.DeviceCode))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<DeviceImageResponse>> BoxImagesAsync(string code, string? slotCode, CancellationToken ct)
    {
        var batch = await ViewableBatchAsync(code, ct);
        var query = db.DeviceImages.AsNoTracking().Where(i => i.BatchId == batch.BatchId);
        if (slotCode is not null) query = query.Where(i => db.PhysicalSlots.Any(s => s.SlotId == i.SlotId && s.SlotCode == slotCode));
        return await query.OrderByDescending(i => i.CapturedAt).Take(200)
            .Select(i => new DeviceImageResponse(i.DeviceImageId, db.PhysicalSlots.Where(s => s.SlotId == i.SlotId).Select(s => s.SlotCode).First(),
                db.CrabUnits.Where(c => c.CrabUnitId == i.CrabUnitId).Select(c => c.CrabCode).FirstOrDefault(), i.CapturedAt, i.ReceivedAt, i.CrabDetected,
                i.DetectionConfidence, db.Devices.Where(d => d.DeviceId == i.DeviceId).Select(d => d.DeviceCode).First(), i.RunId))
            .ToListAsync(ct);
    }

    public async Task<(Stream Content, string ContentType)> BoxImageFileAsync(long imageId, CancellationToken ct)
    {
        var image = await db.DeviceImages.AsNoTracking().SingleOrDefaultAsync(i => i.DeviceImageId == imageId, ct)
                    ?? throw new NotFoundException("device.image_not_found", "Không tìm thấy ảnh.");
        if (image.BatchId is not { } batchId) throw new ForbiddenException("device.image_hidden", "Ảnh không thuộc Lô nào.");
        var code = await db.Batches.Where(b => b.BatchId == batchId).Select(b => b.BatchCode).SingleAsync(ct);
        await ViewableBatchAsync(code, ct);
        return (await files.OpenReadAsync(image.FileUri, ct), "image/jpeg");
    }

    /// <summary>BR-142, BR-143: nhà đầu tư của Lô, người nuôi và Admin xem chi tiết hộp; người khác chỉ thấy số liệu cấp Lô.</summary>
    private async Task<Batch> ViewableBatchAsync(string code, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        if (me.IsInRole(Roles.PlatformAdmin) || me.IsInRole(Roles.QcInspector) || me.OperatorId == batch.OperatorId) return batch;
        if (await db.OperatorMembers.AnyAsync(m => m.UserId == me.UserId && m.OperatorId == batch.OperatorId, ct)) return batch;
        if (await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId, ct)) return batch;
        if (await db.Contributions.AnyAsync(c => c.BatchId == batch.BatchId && c.InvestorId == me.UserId && c.Status == "Confirmed", ct)) return batch;
        throw new ForbiddenException("batch.participants_only", "Chỉ người tham gia Lô xem được chi tiết hộp (BR-142, BR-143).");
    }
}
