using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Devices;

public sealed class WifiRequest
{
    [Required, StringLength(32)] public string Ssid { get; set; } = "";
    [Required, StringLength(63, MinimumLength = 8)] public string Password { get; set; } = "";
}
public sealed record WifiStatus(long Id, string Status, string? Message);
public sealed record WifiDelivery(long Id, string Ssid, string Password, int ValidForMs);
public sealed record WifiOutcome([Range(1, long.MaxValue)] long Id, bool Connected, [StringLength(300)] string? Message);

[ApiController, Authorize(Policy = Policies.Operator)]
[Route("api/operators/me/devices/{code}/wifi")]
public sealed class StationWifiController(AppDbContext db, ICurrentUser me, IDataProtectionProvider protection, TimeProvider clock) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<WifiStatus?>> Read(string code, CancellationToken ct)
    {
        var device = await Device(code, ct);
        var latest = await db.DeviceCommands.AsNoTracking().Where(c => c.DeviceId == device.DeviceId && c.CommandType == "ConfigureWifi")
            .OrderByDescending(c => c.DeviceCommandId).FirstOrDefaultAsync(ct);
        return new JsonResult(latest is null ? null : WifiCommands.View(latest, clock.GetUtcNow()));
    }

    [HttpPost, RequestSizeLimit(2048)]
    public async Task<ActionResult<WifiStatus>> Configure(string code, WifiRequest request, CancellationToken ct)
    {
        if (Encoding.UTF8.GetByteCount(request.Ssid) > 32 || request.Ssid.Any(char.IsControl) ||
            request.Password.Any(c => c < 32 || c > 126))
            throw new BusinessRuleException("wifi.invalid", "Kiểm tra tên mạng và mật khẩu WPA2.");
        var owner = me.RequireOperatorId();
        var result = await db.InTransactionAsync(async () =>
        {
            var device = await db.Devices.FromSqlInterpolated($"SELECT * FROM dbo.device WITH (UPDLOCK, HOLDLOCK) WHERE device_code = {code}")
                .AsNoTracking().SingleOrDefaultAsync(d => d.OperatorId == owner && d.DeviceType == "Station" && d.Status != "Removed", ct)
                ?? throw new NotFoundException("device.not_found", "Không tìm thấy trạm.");
            var now = clock.GetUtcNow();
            var state = device.StationStateJson is null ? null : JsonSerializer.Deserialize<StationRuntimeState>(device.StationStateJson, DeviceIngestService.Json);
            if (device.StationStateReceivedAt is not { } arrived || now - arrived > TimeSpan.FromSeconds(12) ||
                state is null || !state.HardwareOnline || state.Busy || !state.WifiConfigReady || !string.IsNullOrEmpty(state.SessionNo) ||
                await db.MeasurementSessions.AnyAsync(s => s.StationDeviceId == device.DeviceId && s.Status == "Open", ct))
                throw new ConflictException("wifi.not_ready", "Trạm cần online và hoàn tất hoặc hủy lượt đo trước khi đổi mạng.");
            if (await db.DeviceCommands.AnyAsync(c => c.DeviceId == device.DeviceId && c.CommandType == "ConfigureWifi" &&
                (c.Status == "Pending" || c.Status == "Claimed") && c.CreatedAt > now.AddMinutes(-3), ct))
                throw new ConflictException("wifi.pending", "Trạm đang xử lý một yêu cầu đổi Wi-Fi.");
            var command = new DeviceCommand { DeviceId = device.DeviceId, CommandType = "ConfigureWifi", Status = "Pending",
                CreatedAt = now, CreatedBy = me.UserId, ProtectedPayload = WifiCommands.Protector(protection, device.DeviceId)
                    .Protect(JsonSerializer.Serialize(request, DeviceIngestService.Json)) };
            db.DeviceCommands.Add(command);
            await db.SaveChangesAsync(ct);
            return WifiCommands.View(command, now);
        }, ct);
        return Accepted(result);
    }

    private async Task<Device> Device(string code, CancellationToken ct)
    {
        var owner = me.RequireOperatorId();
        return await db.Devices.AsNoTracking().SingleOrDefaultAsync(d => d.DeviceCode == code && d.OperatorId == owner &&
            d.DeviceType == "Station" && d.Status != "Removed", ct) ?? throw new NotFoundException("device.not_found", "Không tìm thấy trạm.");
    }
}

internal static class WifiCommands
{
    internal static IDataProtector Protector(IDataProtectionProvider provider, long deviceId)
        => provider.CreateProtector("GradeAI.Wifi.v1", deviceId.ToString(System.Globalization.CultureInfo.InvariantCulture));

    internal static WifiStatus View(DeviceCommand job, DateTimeOffset now)
        => new(job.DeviceCommandId, job.Status is "Pending" or "Claimed" && now - job.CreatedAt > TimeSpan.FromMinutes(3)
            ? "Expired" : job.Status, job.Reason);

    internal static async Task<WifiDelivery?> Poll(AppDbContext db, Device device, StationRuntimeState state,
        IDataProtectionProvider protection, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.DeviceCommands.Where(c => c.DeviceId == device.DeviceId && c.CommandType == "ConfigureWifi" &&
            c.CreatedAt < now.AddMinutes(-2) && c.ProtectedPayload != null)
            .ExecuteUpdateAsync(set => set.SetProperty(c => c.ProtectedPayload, (string?)null).SetProperty(c => c.Status, "Cancelled"), ct);
        if (state.WifiOutcome is { } outcome)
            await db.DeviceCommands.Where(c => c.DeviceId == device.DeviceId && c.DeviceCommandId == outcome.Id && c.CommandType == "ConfigureWifi" && c.Status == "Claimed")
                .ExecuteUpdateAsync(set => set.SetProperty(c => c.Status, outcome.Connected ? "Accepted" : "Rejected")
                    .SetProperty(c => c.Reason, outcome.Message), ct);
        if (!state.WifiConfigReady || !state.HardwareOnline || state.Busy || !string.IsNullOrEmpty(state.SessionNo) ||
            await db.MeasurementSessions.AnyAsync(s => s.StationDeviceId == device.DeviceId && s.Status == "Open", ct)) return null;
        var job = await db.DeviceCommands.AsNoTracking().Where(c => c.DeviceId == device.DeviceId && c.CommandType == "ConfigureWifi" &&
            c.Status == "Pending" && c.CreatedAt > now.AddMinutes(-2) && c.ProtectedPayload != null)
            .OrderBy(c => c.DeviceCommandId).FirstOrDefaultAsync(ct);
        if (job is null) return null;
        WifiRequest request;
        try { request = JsonSerializer.Deserialize<WifiRequest>(Protector(protection, device.DeviceId).Unprotect(job.ProtectedPayload!), DeviceIngestService.Json)!; }
        catch (CryptographicException) { return null; }
        var changed = await db.DeviceCommands.Where(c => c.DeviceCommandId == job.DeviceCommandId && c.Status == "Pending")
            .ExecuteUpdateAsync(set => set.SetProperty(c => c.Status, "Claimed").SetProperty(c => c.ProtectedPayload, (string?)null)
                .SetProperty(c => c.AckedAt, now), ct);
        return changed == 1 ? new WifiDelivery(job.DeviceCommandId, request.Ssid, request.Password,
            Math.Max(0, (int)(job.CreatedAt.AddMinutes(2) - clock.GetUtcNow()).TotalMilliseconds)) : null;
    }
}
