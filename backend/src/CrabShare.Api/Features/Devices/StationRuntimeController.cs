using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Devices;

public sealed class StationRuntimeState
{
    public bool HardwareOnline { get; set; }
    [RegularExpression("^(wifi|ethernet|unknown)$")] public string? ConnectionType { get; set; }
    [StringLength(32)] public string? NetworkInterface { get; set; }
    [StringLength(45)] public string? NetworkIp { get; set; }
    [StringLength(32)] public string? NetworkSsid { get; set; }
    public bool Busy { get; set; }
    public bool? DoorClosed { get; set; }
    public bool? ButtonPressed { get; set; }
    public bool CalibrationValid { get; set; }
    [StringLength(40)] public string? CrabTag { get; set; }
    [StringLength(64)] public string? SessionNo { get; set; }
    [Required, StringLength(40)] public string Phase { get; set; } = "";
    [StringLength(500)] public string? Note { get; set; }
    [RegularExpression("^(off|cyan|yellow|purple|blue|red|green)$")] public string? Rgb { get; set; }
    public bool Blinking { get; set; }
    public bool WhiteOn { get; set; }
    public bool RedOn { get; set; }
    public decimal? WeightG { get; set; }
    public decimal? InstantG { get; set; }
    public decimal? RawSpreadG { get; set; }
    public decimal? FilteredSpreadG { get; set; }
    public int? SampleCount { get; set; }
    public int? OutlierCount { get; set; }
    public bool? ScaleStable { get; set; }
    [StringLength(120)] public string? ScaleReason { get; set; }
    [Range(1, 2000)] public int? TofMm { get; set; }
    [StringLength(30)] public string? CameraStatus { get; set; }
    [StringLength(80)] public string? RunId { get; set; }
    [StringLength(30)] public string? RunStatus { get; set; }
    [StringLength(40)] public string? Step { get; set; }
    [Required, MaxLength(6)] public List<string> Completed { get; set; } = [];
    [StringLength(500)] public string? SensorError { get; set; }
    public bool WebStartReady { get; set; }
    public StationStartOutcome? StartOutcome { get; set; }
    public bool WifiConfigReady { get; set; }
    public WifiOutcome? WifiOutcome { get; set; }
}

public sealed record StationStartOutcome([Range(1, long.MaxValue)] long Id, bool Accepted,
    [StringLength(300)] string? Message);

public sealed record StationRuntimeResponse(DateTimeOffset? ReceivedAt, StationRuntimeState? State, bool Fresh);

[ApiController]
public sealed class StationRuntimeController(AppDbContext db, ICurrentUser me, TimeProvider clock, IDataProtectionProvider protection) : ControllerBase
{
    [AllowAnonymous, HttpPost("api/devices/{code}/station-state"), RequestSizeLimit(16 * 1024)]
    public async Task<IActionResult> Publish(string code, StationRuntimeState state, [FromHeader(Name = "X-Device-Key")] string? key,
        CancellationToken ct)
    {
        var device = await db.Devices.AsNoTracking().SingleOrDefaultAsync(d => d.DeviceCode == code, ct);
        if (device is null || string.IsNullOrEmpty(key) || !DeviceKeys.Matches(key, device.KeyHash) ||
            device.Status == "Removed" || device.DeviceType != "Station")
            throw new ForbiddenException("device.unauthorized", "Trạm chưa đăng ký hoặc khóa không hợp lệ.");
        var json = JsonSerializer.Serialize(state, DeviceIngestService.Json);
        if (json.Length > 4000 || state.Completed.Any(s => s is null || s.Length > 40))
            throw new BusinessRuleException("device.state_too_large", "Trạng thái trạm không hợp lệ.");
        var now = clock.GetUtcNow();
        var changed = await db.Devices.Where(d => d.DeviceId == device.DeviceId && d.Status != "Removed")
            .ExecuteUpdateAsync(set => set.SetProperty(d => d.StationStateJson, json)
                .SetProperty(d => d.StationStateReceivedAt, now).SetProperty(d => d.LastSeenAt, now)
                .SetProperty(d => d.Status, "Active").SetProperty(d => d.UpdatedAt, now), ct);
        if (changed == 0) throw new ForbiddenException("device.removed", "Thiết bị đã được gỡ.");
        var start = await StationStartCommands.Poll(db, device, state, clock, ct);
        var wifi = start is null ? await WifiCommands.Poll(db, device, state, protection, clock, ct) : null;
        return Ok(new { receivedAt = now, start, wifi });
    }

    [Authorize(Policy = Policies.Operator), HttpGet("api/operators/me/devices/{code}/station-state")]
    public async Task<ActionResult<StationRuntimeResponse>> Read(string code, CancellationToken ct)
    {
        var owner = me.RequireOperatorId();
        var device = await db.Devices.AsNoTracking().SingleOrDefaultAsync(d => d.DeviceCode == code && d.OperatorId == owner &&
            d.DeviceType == "Station" && d.Status != "Removed", ct)
            ?? throw new NotFoundException("device.not_found", "Không tìm thấy trạm của đơn vị.");
        var state = device.StationStateJson is null ? null :
            JsonSerializer.Deserialize<StationRuntimeState>(device.StationStateJson, DeviceIngestService.Json);
        var fresh = device.StationStateReceivedAt is { } received && clock.GetUtcNow() - received < TimeSpan.FromSeconds(12);
        return new StationRuntimeResponse(device.StationStateReceivedAt, state, fresh);
    }
}
