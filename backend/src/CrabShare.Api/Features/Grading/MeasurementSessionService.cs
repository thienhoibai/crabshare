using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Grading;

public sealed class OpenSessionRequest
{
    [Required, StringLength(12)] public string CrabCode { get; set; } = "";
    /// <summary>Mã trạm đo. Bỏ trống khi đo bằng thước kẹp và cân tay (procedure = Manual).</summary>
    [StringLength(40)] public string? StationCode { get; set; }
    [RegularExpression("^(Station|Manual)$")] public string Procedure { get; set; } = "Station";
}

public sealed record SessionResponse(string SessionNo, string BatchCode, string CrabCode, string Procedure, string? StationCode, string Status,
    DateTimeOffset OpenedAt, DateTimeOffset? CapturedAt, DateTimeOffset? ReceivedAt, decimal? WeightG, int? TofMm, int? CameraHeightMm,
    bool HasWhiteImage, bool HasRedImage, string? FailReason);

/// <summary>
/// Lượt đo (BR-150, BR-151, BR-224): người nuôi bắt đầu thu hoạch, rồi mở lượt đo với mã cua nội bộ trước khi đặt cua vào trạm;
/// trạm gắn bản tin vào lượt đo đang mở của chính nó; mỗi lượt đo nhận đúng một bản tin.
/// </summary>
public sealed class MeasurementSessionService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    PartyDirectory parties)
{
    /// <summary>BR-150: Lô có lưu nuôi chuyển Harvesting khi người nuôi bắt đầu thu hoạch; từ lúc này từng con được đưa qua trạm đo.</summary>
    public async Task<string> StartHarvestAsync(string code, CancellationToken ct)
        => await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(code, ct, lockRow: true);
            if (!batch.HasHolding || batch.Status != "InProduction")
                throw new BusinessRuleException("grading.harvest_not_allowed", "Chỉ Lô có lưu nuôi đang nuôi mới bắt đầu thu hoạch.");
            var now = clock.GetUtcNow();
            batch.Status = "Harvesting";
            batch.HarvestStartedAt = now;
            batch.UpdatedAt = now;
            var holding = await db.HoldingOperations.SingleOrDefaultAsync(h => h.BatchId == batch.BatchId, ct);
            if (holding is not null) holding.Status = "Harvesting";
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("batch", batch.BatchId, "start_harvest", new { status = "InProduction" }, new { batch.Status, harvestStartedAt = now }, ct);
            return batch.Status;
        }, ct);

    public async Task<SessionResponse> OpenAsync(OpenSessionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        string sessionNo;
        try
        {
            sessionNo = await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var crab = await db.CrabUnits.SingleOrDefaultAsync(c => c.CrabCode == req.CrabCode.Trim().ToUpperInvariant(), ct)
                           ?? throw new NotFoundException("grading.crab_not_found", "Không tìm thấy mã cua.");
                var batch = await db.Batches.SingleAsync(b => b.BatchId == crab.BatchId, ct);
                await access.RequireOperatorAsync(batch, ct);
                // Lô có lưu nuôi đo khi thu hoạch; lô không lưu nuôi đo sau khi nhận (BR-151).
                var ready = batch.HasHolding
                    ? batch.Status == "Harvesting" && crab.InventoryStatus == "Holding"
                    : batch.Status is "Sourcing" or "Selling" && crab.InventoryStatus == "Received";
                if (!ready)
                    throw new BusinessRuleException("grading.crab_not_ready", batch.HasHolding
                        ? "Lô phải đang thu hoạch và con cua phải đang ở hộp."
                        : "Con cua phải vừa nhận, chưa phân hạng.");
                Device? station = null;
                if (req.Procedure == "Station")
                {
                    station = await db.Devices.SingleOrDefaultAsync(d => d.DeviceCode == req.StationCode && d.DeviceType == "Station" && d.Status != "Removed", ct)
                              ?? throw new NotFoundException("grading.station_not_found", "Không tìm thấy trạm đo.");
                    var partyOfFarm = await parties.PartyIdOfOperatorAsync(batch.OperatorId, ct);
                    if (station.OperatorId != batch.OperatorId &&
                        !await db.PartySites.AnyAsync(s => s.SiteId == station.ScopeSiteId && (s.PartyId == partyOfFarm || s.PartyId == batch.ExecutorPartyId), ct))
                        throw new ForbiddenException("grading.station_other_farm", "Trạm đo không thuộc đơn vị thực hiện của Lô.");
                }
                if (await db.MeasurementSessions.AnyAsync(s => s.CrabUnitId == crab.CrabUnitId && s.Status == "Open", ct))
                    throw new ConflictException("grading.crab_session_open", "Con cua này đang có lượt đo mở.");
                var now = clock.GetUtcNow();
                var session = new MeasurementSession
                {
                    SessionNo = Codes.New("MS", 10), BatchId = batch.BatchId, CrabUnitId = crab.CrabUnitId, StationDeviceId = station?.DeviceId,
                    Procedure = req.Procedure, OpenedBy = me.UserId, OpenedAt = now, Status = "Open", CreatedAt = now, UpdatedAt = now,
                };
                db.MeasurementSessions.Add(session);
                await db.SaveChangesAsync(ct);
                await audit.WriteAsync("measurement_session", session.MeasurementSessionId, "open", null,
                    new { session.SessionNo, crab.CrabCode, req.StationCode, req.Procedure }, ct);
                return session.SessionNo;
            }, ct, IsolationLevel.Serializable);
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 } sql && sql.Message.Contains("ux_measurement_session_open_station"))
        {
            throw new ConflictException("grading.station_busy", "Trạm đo đang có lượt đo khác mở; đo xong hoặc huỷ lượt đó trước (BR-224).");
        }
        return await GetAsync(sessionNo, ct);
    }

    public async Task<SessionResponse> CancelAsync(string sessionNo, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            var session = await db.MeasurementSessions.SingleOrDefaultAsync(s => s.SessionNo == sessionNo, ct)
                          ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo.");
            await access.RequireOperatorAsync(await db.Batches.SingleAsync(b => b.BatchId == session.BatchId, ct), ct);
            if (session.Status != "Open") throw new BusinessRuleException("grading.session_not_open", "Chỉ huỷ được lượt đo đang mở.");
            session.Status = "Cancelled";
            session.UpdatedAt = clock.GetUtcNow();
        }, ct);
        return await GetAsync(sessionNo, ct);
    }

    public async Task<SessionResponse> GetAsync(string sessionNo, CancellationToken ct)
    {
        var s = await db.MeasurementSessions.AsNoTracking().SingleOrDefaultAsync(x => x.SessionNo == sessionNo, ct)
                ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == s.BatchId, ct);
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var crab = await db.CrabUnits.Where(c => c.CrabUnitId == s.CrabUnitId).Select(c => c.CrabCode).SingleAsync(ct);
        var station = s.StationDeviceId is { } id ? await db.Devices.Where(d => d.DeviceId == id).Select(d => d.DeviceCode).SingleAsync(ct) : null;
        return new SessionResponse(s.SessionNo, batch.BatchCode, crab, s.Procedure, station, s.Status, s.OpenedAt, s.CapturedAt, s.ReceivedAt, s.WeightG,
            s.TofMm, s.CameraHeightMm, s.WhiteImageUri is not null, s.RedImageUri is not null, s.FailReason);
    }
}
