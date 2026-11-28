using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Grading;

public sealed class OpenSessionRequest
{
    [StringLength(12)] public string? CrabCode { get; set; }
    [StringLength(20)] public string? BatchCode { get; set; }
    [RegularExpression("^[A-Za-z][A-Za-z0-9-]{0,15}$")] public string? GradeAiPrefix { get; set; }
    [Range(1, 999999)] public int? CrabNumber { get; set; }
    /// <summary>Mã trạm đo. Bỏ trống khi đo bằng thước kẹp và cân tay (procedure = Manual).</summary>
    [StringLength(40)] public string? StationCode { get; set; }
    [RegularExpression("^(Station|Manual)$")] public string Procedure { get; set; } = "Station";
}

public sealed record SessionResponse(string SessionNo, string BatchCode, string CrabCode, string Procedure, string? StationCode, string Status,
    DateTimeOffset OpenedAt, DateTimeOffset? CapturedAt, DateTimeOffset? ReceivedAt, decimal? WeightG, int? TofMm, int? CameraHeightMm,
    bool HasWhiteImage, bool HasRedImage, string? FailReason, string? GradeAiTag = null);

public sealed class RemeasureSessionRequest
{
    [Required, StringLength(40)] public string StationCode { get; set; } = "";
}

public sealed record GradeAiLabel(string CrabCode, int CrabNumber);
public sealed class GradeAiLabelsRequest
{
    [Required, RegularExpression("^[A-Za-z][A-Za-z0-9-]{0,15}$")] public string Prefix { get; set; } = "";
    [Required, MinLength(1), MaxLength(2000)] public List<GradeAiLabel> Labels { get; set; } = [];
}
public sealed record GradeAiLabelsResponse(string Prefix, int Assigned);

/// <summary>
/// Lượt đo (BR-150, BR-151, BR-224): người nuôi bắt đầu thu hoạch, rồi mở lượt đo với mã cua nội bộ trước khi đặt cua vào trạm;
/// trạm gắn bản tin vào lượt đo đang mở của chính nó; mỗi lượt đo nhận đúng một bản tin.
/// </summary>
public sealed class MeasurementSessionService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    PartyDirectory parties)
{
    public async Task<PagedResult<SessionResponse>> HistoryAsync(string batchCode, PageQuery paging, string? search, string? status,
        string? stationCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var query = from session in db.MeasurementSessions.AsNoTracking()
                    join crab in db.CrabUnits on session.CrabUnitId equals crab.CrabUnitId
                    join device in db.Devices on session.StationDeviceId equals (long?)device.DeviceId into stations
                    from station in stations.DefaultIfEmpty()
                    where session.BatchId == batch.BatchId
                    select new { session, crab, stationCode = station == null ? null : station.DeviceCode };
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.crab.CrabCode.Contains(term) || x.session.SessionNo.Contains(term) ||
                x.crab.GradeAiTag != null && x.crab.GradeAiTag.Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.session.Status == status);
        if (!string.IsNullOrWhiteSpace(stationCode)) query = query.Where(x => x.stationCode == stationCode);
        return await query
            .OrderByDescending(x => x.session.OpenedAt)
            .ThenByDescending(x => x.session.SessionNo)
            .Select(x => new SessionResponse(x.session.SessionNo, batch.BatchCode, x.crab.CrabCode, x.session.Procedure,
                x.stationCode, x.session.Status, x.session.OpenedAt, x.session.CapturedAt, x.session.ReceivedAt,
                x.session.WeightG, x.session.TofMm, x.session.CameraHeightMm,
                x.session.WhiteImageUri != null, x.session.RedImageUri != null, x.session.FailReason, x.crab.GradeAiTag))
            .ToPagedAsync(paging, ct);
    }

    public Task<GradeAiLabelsResponse> AssignLabelsAsync(string batchCode, GradeAiLabelsRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        if (req.Labels.Any(l => l is null || string.IsNullOrWhiteSpace(l.CrabCode) || l.CrabCode.Length > 12 ||
                l.CrabNumber is < 1 or > 999999) ||
            req.Labels.Select(l => l.CrabNumber).Distinct().Count() != req.Labels.Count ||
            req.Labels.Select(l => l.CrabCode).Distinct(StringComparer.OrdinalIgnoreCase).Count() != req.Labels.Count)
            throw new BusinessRuleException("grading.gradeai_invalid_labels", "Danh sách phải có mã kiểm kê và số khác nhau cho từng con cua.");
        var prefix = req.Prefix.ToUpperInvariant();
        var labels = req.Labels.ToDictionary(l => l.CrabCode.ToUpperInvariant(), l => $"{prefix}-{l.CrabNumber:D3}");
        return db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(batchCode, ct, lockRow: true);
            if (batch.GradeAiPrefix is not null && batch.GradeAiPrefix != prefix)
                throw new ConflictException("grading.gradeai_prefix_fixed", $"Lô đã dùng mã đầu {batch.GradeAiPrefix}.");
            if (await db.Batches.AnyAsync(b => b.GradeAiPrefix == prefix && b.BatchId != batch.BatchId, ct))
                throw new ConflictException("grading.gradeai_prefix_used", "Mã đầu đã thuộc lô khác.");
            var codes = labels.Keys.ToArray();
            var units = await db.CrabUnits.Where(c => c.BatchId == batch.BatchId && codes.Contains(c.CrabCode)).ToListAsync(ct);
            if (units.Count != labels.Count)
                throw new BusinessRuleException("grading.crab_other_batch", "Có mã kiểm kê không thuộc lô này.");
            var tags = labels.Values.ToArray();
            var existing = await db.CrabUnits.Where(c => c.GradeAiTag != null && tags.Contains(c.GradeAiTag))
                .ToDictionaryAsync(c => c.GradeAiTag!, c => c.CrabUnitId, ct);
            foreach (var unit in units)
            {
                var tag = labels[unit.CrabCode.ToUpperInvariant()];
                if (unit.GradeAiTag is not null && unit.GradeAiTag != tag ||
                    existing.TryGetValue(tag, out var owner) && owner != unit.CrabUnitId)
                    throw new ConflictException("grading.gradeai_duplicate_tag", $"Mã {tag} đã được dùng hoặc con cua đã có mã khác.");
                unit.GradeAiTag = tag;
            }
            if (await db.MeasurementSessions.AnyAsync(s => s.BatchId == batch.BatchId && s.Status == "Open" &&
                db.CrabUnits.Any(c => c.CrabUnitId == s.CrabUnitId && codes.Contains(c.CrabCode)), ct))
                throw new ConflictException("grading.crab_session_open", "Đóng các lượt đang mở của cua trong danh sách trước khi gắn mã.");
            batch.GradeAiPrefix = prefix;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("batch", batch.BatchId, "gradeai_label", null, new { prefix, labels }, ct);
            return new GradeAiLabelsResponse(prefix, units.Count);
        }, ct, IsolationLevel.Serializable);
    }

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

    public Task<SessionResponse> OpenAsync(OpenSessionRequest req, CancellationToken ct)
        => OpenCoreAsync(req, null, ct);

    public Task<SessionResponse> RemeasureAsync(string sourceSessionNo, RemeasureSessionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        return OpenCoreAsync(new OpenSessionRequest { StationCode = req.StationCode }, sourceSessionNo, ct);
    }

    private async Task<SessionResponse> OpenCoreAsync(OpenSessionRequest req, string? sourceSessionNo, CancellationToken ct)
    {
        BatchService.Validate(req);
        var numbered = req.GradeAiPrefix is not null || req.CrabNumber is not null;
        if (numbered && (req.Procedure != "Station" || req.CrabNumber is null ||
                         string.IsNullOrWhiteSpace(req.GradeAiPrefix) || string.IsNullOrWhiteSpace(req.BatchCode)))
            throw new BusinessRuleException("grading.gradeai_identity_required", "Chọn lô, mã đầu lô và số cua để đo tại trạm.");
        var prefix = req.GradeAiPrefix?.ToUpperInvariant();
        var tag = numbered ? $"{prefix}-{req.CrabNumber!.Value:D3}" : null;
        var code = req.CrabCode?.Trim().ToUpperInvariant();
        string sessionNo;
        try
        {
            sessionNo = await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var source = sourceSessionNo is null ? null :
                    await db.MeasurementSessions.SingleOrDefaultAsync(s => s.SessionNo == sourceSessionNo, ct)
                    ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo cũ.");
                var crab = source is not null
                    ? await db.CrabUnits.SingleAsync(c => c.CrabUnitId == source.CrabUnitId, ct)
                    : code is not null
                    ? await db.CrabUnits.SingleOrDefaultAsync(c => c.CrabCode == code, ct)
                    : tag is not null
                        ? await db.CrabUnits.SingleOrDefaultAsync(c => c.GradeAiTag == tag, ct)
                        : null;
                if (crab is null)
                    throw new NotFoundException("grading.crab_not_found", "Mã chưa gắn với cua. Chọn mã kiểm kê của đúng con cua để gắn lần đầu.");
                var batch = await db.Batches.SingleAsync(b => b.BatchId == crab.BatchId, ct);
                await access.RequireOperatorAsync(batch, ct);
                if (source is not null)
                {
                    if (source.Procedure != "Station" || source.Status != "Measured" || source.MessageId is null)
                        throw new BusinessRuleException("grading.remeasure_not_ready", "Chỉ cân lại lượt trạm đã xử lý xong. Chờ lượt hiện tại hoàn tất.");
                    if (await db.GradeDecisions.AnyAsync(d => d.CrabUnitId == crab.CrabUnitId && d.IsCurrent &&
                        (d.Status == "Approved" || d.Status == "Rejected"), ct))
                        throw new ConflictException("grading.already_decided", "Cua đã được QC chốt hạng. Liên hệ QC để xử lý trước khi cân lại.");
                }
                if (numbered && !string.Equals(batch.BatchCode, req.BatchCode, StringComparison.OrdinalIgnoreCase))
                    throw new BusinessRuleException("grading.crab_other_batch", "Mã cua thuộc lô khác.");
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
                        !await db.PartySites.AnyAsync(s => s.PartyRecordId == station.ScopeSiteId && (s.PartyId == partyOfFarm || s.PartyId == batch.ExecutorPartyId), ct))
                        throw new ForbiddenException("grading.station_other_farm", "Trạm đo không thuộc đơn vị thực hiện của Lô.");
                }
                if (await db.MeasurementSessions.AnyAsync(s => s.CrabUnitId == crab.CrabUnitId && s.Status == "Open", ct))
                    throw new ConflictException("grading.crab_session_open", "Con cua này đang có lượt đo mở.");
                if (source is null && req.Procedure == "Station" && (numbered || crab.GradeAiTag is not null) &&
                    await db.MeasurementSessions.AnyAsync(s => s.CrabUnitId == crab.CrabUnitId && s.MessageId != null, ct))
                    throw new ConflictException("grading.gradeai_already_measured", "Mã cua đã có kết quả trạm.");
                if (tag is not null)
                {
                    if (batch.GradeAiPrefix is not null && batch.GradeAiPrefix != prefix)
                        throw new ConflictException("grading.gradeai_prefix_fixed", $"Lô đã dùng mã đầu {batch.GradeAiPrefix}.");
                    if (crab.GradeAiTag is not null && crab.GradeAiTag != tag ||
                        await db.CrabUnits.AnyAsync(c => c.GradeAiTag == tag && c.CrabUnitId != crab.CrabUnitId, ct))
                        throw new ConflictException("grading.gradeai_duplicate_tag", "Mã đã gắn với con cua khác hoặc cua đã có mã khác.");
                    if (await db.Batches.AnyAsync(b => b.GradeAiPrefix == prefix && b.BatchId != batch.BatchId, ct))
                        throw new ConflictException("grading.gradeai_prefix_used", "Mã đầu đã thuộc lô khác.");
                    batch.GradeAiPrefix = prefix;
                    crab.GradeAiTag = tag;
                }
                var now = clock.GetUtcNow();
                var session = new MeasurementSession
                {
                    SessionNo = Codes.New("MS", 10), BatchId = batch.BatchId, CrabUnitId = crab.CrabUnitId, StationDeviceId = station?.DeviceId,
                    Procedure = req.Procedure, OpenedBy = me.UserId, OpenedAt = now, Status = "Open", CreatedAt = now, UpdatedAt = now,
                };
                db.MeasurementSessions.Add(session);
                await db.SaveChangesAsync(ct);
                await audit.WriteAsync("measurement_session", session.MeasurementRecordId, "open", null,
                    new { session.SessionNo, crab.CrabCode, crab.GradeAiTag, req.StationCode, req.Procedure, RemeasureOf = sourceSessionNo }, ct);
                return session.SessionNo;
            }, ct, IsolationLevel.Serializable);
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 } sql && sql.Message.Contains("ux_measurement_session_open_station"))
        {
            throw new ConflictException("grading.station_busy", "Trạm đo đang có lượt đo khác mở; đo xong hoặc huỷ lượt đó trước (BR-224).");
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 } sql &&
            (sql.Message.Contains("ux_batch_gradeai_prefix") || sql.Message.Contains("ux_crab_unit_gradeai_tag")))
        {
            throw new ConflictException("grading.gradeai_duplicate_tag", "Mã đầu lô hoặc mã cua đã được dùng.");
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
        var crab = await db.CrabUnits.Where(c => c.CrabUnitId == s.CrabUnitId).Select(c => new { c.CrabCode, c.GradeAiTag }).SingleAsync(ct);
        var station = s.StationDeviceId is { } id ? await db.Devices.Where(d => d.DeviceId == id).Select(d => d.DeviceCode).SingleAsync(ct) : null;
        return new SessionResponse(s.SessionNo, batch.BatchCode, crab.CrabCode, s.Procedure, station, s.Status, s.OpenedAt, s.CapturedAt, s.ReceivedAt, s.WeightG,
            s.TofMm, s.CameraHeightMm, s.WhiteImageUri is not null, s.RedImageUri is not null, s.FailReason, crab.GradeAiTag);
    }
}
