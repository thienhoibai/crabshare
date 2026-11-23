using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Devices;

public sealed record StationStartStatus(long Id, string Status, DateTimeOffset ExpiresAt, string? Message);
public sealed record StationStartDelivery(long Id, string SessionNo, string CrabTag, int ValidForMs);

[ApiController, Authorize(Policy = Policies.Operator)]
[Route("api/operators/me/devices/{code}/measurement-sessions/{sessionNo}/start")]
public sealed class StationControlController(AppDbContext db, ICurrentUser me, TimeProvider clock) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<StationStartStatus?>> Last(string code, string sessionNo, CancellationToken ct)
    {
        var owner = me.RequireOperatorId();
        var device = await db.Devices.AsNoTracking().SingleOrDefaultAsync(d => d.DeviceCode == code &&
            d.OperatorId == owner && d.DeviceType == "Station" && d.Status != "Removed", ct)
            ?? throw new NotFoundException("device.not_found", "Không tìm thấy trạm của đơn vị.");
        var session = await FindSession(device.DeviceId, sessionNo, ct);
        var command = await LastCommand(device.DeviceId, session.MeasurementSessionId, ct);
        return new JsonResult(command is null ? null : StationStartCommands.View(command, clock.GetUtcNow()));
    }

    [HttpPost]
    public async Task<ActionResult<StationStartStatus>> Start(string code, string sessionNo, CancellationToken ct)
    {
        var owner = me.RequireOperatorId();
        var command = await db.InTransactionAsync(async () =>
        {
            // Serialize submissions for one station, including submissions from different tabs.
            var device = await db.Devices.FromSqlInterpolated($"SELECT * FROM dbo.device WITH (UPDLOCK, HOLDLOCK) WHERE device_code = {code}")
                .AsNoTracking().SingleOrDefaultAsync(d => d.OperatorId == owner && d.DeviceType == "Station" && d.Status != "Removed", ct)
                ?? throw new NotFoundException("device.not_found", "Không tìm thấy trạm của đơn vị.");
            var session = await FindSession(device.DeviceId, sessionNo, ct);
            if (session.Status != "Open")
                throw new ConflictException("device.session_closed", "Phiên đo đã đóng. Chọn lượt đang mở.");
            var now = clock.GetUtcNow();
            var last = await LastCommand(device.DeviceId, session.MeasurementSessionId, ct);
            if (last is not null && StationStartCommands.Expires(last) > now && last.Status is "Pending" or "Claimed" or "Accepted")
                return StationStartCommands.View(last, now);

            var state = device.StationStateJson is null ? null :
                JsonSerializer.Deserialize<StationRuntimeState>(device.StationStateJson, DeviceIngestService.Json);
            var tag = await db.CrabUnits.Where(c => c.CrabUnitId == session.CrabUnitId).Select(c => c.GradeAiTag).SingleAsync(ct);
            if (tag is null || device.StationStateReceivedAt is not { } arrived || now - arrived >= TimeSpan.FromSeconds(12) ||
                state is null || !StationStartCommands.Ready(state) || state.SessionNo != session.SessionNo || state.CrabTag != tag)
                throw new ConflictException("device.station_not_ready", "Đợi Pi nhận đúng mã cua, đóng cửa và báo sẵn sàng rồi bấm lại.");

            var job = new DeviceCommand
            {
                DeviceId = device.DeviceId, CommandType = StationStartCommands.Type, MeasurementSessionId = session.MeasurementSessionId,
                Status = "Pending", CreatedAt = now, CreatedBy = me.UserId,
            };
            db.DeviceCommands.Add(job);
            await db.SaveChangesAsync(ct);
            return StationStartCommands.View(job, now);
        }, ct);
        return Accepted(command);
    }

    private async Task<MeasurementSession> FindSession(long device, string number, CancellationToken ct)
        => await db.MeasurementSessions.AsNoTracking().SingleOrDefaultAsync(s => s.StationDeviceId == device && s.SessionNo == number, ct)
           ?? throw new NotFoundException("device.session_not_found", "Không tìm thấy phiên đo tại trạm.");

    private Task<DeviceCommand?> LastCommand(long device, long session, CancellationToken ct)
        => db.DeviceCommands.AsNoTracking().Where(c => c.DeviceId == device && c.MeasurementSessionId == session &&
            c.CommandType == StationStartCommands.Type).OrderByDescending(c => c.DeviceCommandId).FirstOrDefaultAsync(ct);
}

internal static class StationStartCommands
{
    internal const string Type = "StartMeasurement";
    private static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(12);

    internal static DateTimeOffset Expires(DeviceCommand command) => command.CreatedAt + Lifetime;

    internal static StationStartStatus View(DeviceCommand command, DateTimeOffset now)
        => new(command.DeviceCommandId,
            command.Status is "Pending" or "Claimed" && Expires(command) <= now ? "Expired" : command.Status,
            Expires(command), command.Reason);

    internal static bool Ready(StationRuntimeState state) => state.WebStartReady && state.HardwareOnline && !state.Busy &&
        state.CalibrationValid && state.DoorClosed == true && state.Rgb == "blue" && state.Blinking &&
        !string.IsNullOrEmpty(state.CrabTag) && !string.IsNullOrEmpty(state.SessionNo);

    internal static async Task<StationStartDelivery?> Poll(AppDbContext db, Device device, StationRuntimeState state,
        TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (state.StartOutcome is { } outcome)
        {
            var status = outcome.Accepted ? "Accepted" : "Rejected";
            await db.DeviceCommands.Where(c => c.DeviceCommandId == outcome.Id && c.DeviceId == device.DeviceId &&
                c.CommandType == Type && c.Status == "Claimed").ExecuteUpdateAsync(set => set
                .SetProperty(c => c.Status, status).SetProperty(c => c.Reason, outcome.Message), ct);
        }
        if (!Ready(state)) return null;

        var open = from s in db.MeasurementSessions
                   join crab in db.CrabUnits on s.CrabUnitId equals crab.CrabUnitId
                   where s.StationDeviceId == device.DeviceId && s.Status == "Open" && s.SessionNo == state.SessionNo &&
                       crab.GradeAiTag == state.CrabTag
                   select s.MeasurementSessionId;
        var cutoff = now - Lifetime;
        var pending = db.DeviceCommands.Where(c => c.DeviceId == device.DeviceId && c.CommandType == Type &&
            c.Status == "Pending" && c.CreatedAt > cutoff && open.Contains(c.MeasurementSessionId!.Value));
        var command = await pending.AsNoTracking().OrderBy(c => c.DeviceCommandId).FirstOrDefaultAsync(ct);
        if (command is null) return null;
        var claimed = await pending.Where(c => c.DeviceCommandId == command.DeviceCommandId)
            .ExecuteUpdateAsync(set => set.SetProperty(c => c.Status, "Claimed").SetProperty(c => c.AckedAt, now), ct);
        if (claimed == 0) return null;
        var validForMs = (int)(Expires(command) - clock.GetUtcNow()).TotalMilliseconds;
        return validForMs > 0 ? new StationStartDelivery(command.DeviceCommandId, state.SessionNo!, state.CrabTag!, validForMs) : null;
    }
}
