using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Quality;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Grading;

public sealed partial class GradingService
{
    public async Task<GradeDecisionResponse> DecisionAsync(string decisionNo, CancellationToken ct)
    {
        var d = await db.GradeDecisions.AsNoTracking().SingleOrDefaultAsync(x => x.DecisionNo == decisionNo, ct)
                ?? throw new NotFoundException("grading.decision_not_found", "Không tìm thấy quyết định phân hạng.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == d.BatchId, ct);
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        return (await ResponsesAsync([d], ct)).Single();
    }

    /// <summary>Số đo, kết quả AI và quyết định hiện hành của một lượt đo.</summary>
    public async Task<SessionMeasurementsResponse> MeasurementsAsync(string sessionNo, CancellationToken ct)
    {
        var session = await db.MeasurementSessions.AsNoTracking().SingleOrDefaultAsync(s => s.SessionNo == sessionNo, ct)
                      ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == session.BatchId, ct);
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var crab = await db.CrabUnits.Where(c => c.CrabUnitId == session.CrabUnitId).Select(c => c.CrabCode).SingleAsync(ct);
        var station = session.StationDeviceId is { } id ? await db.Devices.Where(x => x.DeviceId == id).Select(x => x.DeviceCode).SingleAsync(ct) : null;
        var sessionResponse = new SessionResponse(session.SessionNo, batch.BatchCode, crab, session.Procedure, station, session.Status, session.OpenedAt,
            session.CapturedAt, session.ReceivedAt, session.WeightG, session.TofMm, session.CameraHeightMm, session.WhiteImageUri is not null,
            session.RedImageUri is not null, session.FailReason);
        var values = await db.MeasurementValues.AsNoTracking().Where(v => v.MeasurementSessionId == session.MeasurementSessionId)
            .OrderBy(v => v.RecordedAt).ThenBy(v => v.MeasurementValueId)
            .Select(v => new MeasurementValueResponse(v.Metric, v.Value, v.Unit, v.Method, v.Confidence, v.VerificationStatus, v.RecordedAt)).ToListAsync(ct);
        var inferences = await db.AiInferences.AsNoTracking().Where(i => i.MeasurementSessionId == session.MeasurementSessionId).OrderBy(i => i.AiInferenceId)
            .Select(i => new AiInferenceResponse(i.ImageKind, i.ModelName, i.ModelVersion, i.IsSimulated, i.Status, i.ImageQuality, i.CarapaceLengthCm,
                i.CarapaceWidthCm, i.CarapaceAreaCm2, i.EdgeBandMm, i.Confidence, i.ErrorReason, i.CreatedAt)).ToListAsync(ct);
        var decision = await db.GradeDecisions.AsNoTracking().Where(d => d.MeasurementSessionId == session.MeasurementSessionId)
            .OrderByDescending(d => d.VersionNo).FirstOrDefaultAsync(ct);
        return new SessionMeasurementsResponse(sessionResponse, values, inferences, decision is null ? null : (await ResponsesAsync([decision], ct)).Single());
    }

    /// <summary>Lịch sử quyết định của một con cua, cũ trước mới sau (BR-157: quyết định cũ được giữ).</summary>
    public async Task<IReadOnlyList<GradeDecisionResponse>> CrabHistoryAsync(string crabCode, CancellationToken ct)
    {
        var crab = await db.CrabUnits.AsNoTracking().SingleOrDefaultAsync(c => c.CrabCode == crabCode.Trim().ToUpperInvariant(), ct)
                   ?? throw new NotFoundException("grading.crab_not_found", "Không tìm thấy mã cua.");
        await access.RequireOperatorOrAdminReadAsync(await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == crab.BatchId, ct), ct);
        var list = await db.GradeDecisions.AsNoTracking().Where(d => d.CrabUnitId == crab.CrabUnitId).OrderBy(d => d.VersionNo).ToListAsync(ct);
        return await ResponsesAsync(list, ct);
    }

    /// <summary>Danh sách quyết định hiện hành của Lô; lọc theo trạng thái (Draft, Hold, Approved, Rejected).</summary>
    public async Task<IReadOnlyList<GradeDecisionResponse>> BatchDecisionsAsync(string batchCode, string? status, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var query = db.GradeDecisions.AsNoTracking().Where(d => d.BatchId == batch.BatchId && d.IsCurrent);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(d => d.Status == status);
        return await ResponsesAsync(await query.OrderBy(d => d.CreatedAt).Take(1000).ToListAsync(ct), ct);
    }

    /// <summary>Tổng hợp phân hạng của Lô cho người nuôi, Admin và Nhân viên kiểm phẩm.</summary>
    public async Task<BatchGradingSummary> BatchSummaryAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var received = await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId, ct);
        var current = await db.GradeDecisions.AsNoTracking().Where(d => d.BatchId == batch.BatchId && d.IsCurrent)
            .Select(d => new { d.CrabUnitId, d.Status, d.IsSubstandard, d.SpecId, d.FinalSize, d.FinalGrade }).ToListAsync(ct);
        var decided = current.Select(c => c.CrabUnitId).ToHashSet();
        var notMeasured = await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId && (c.InventoryStatus == "Received" || c.InventoryStatus == "Holding")
                                                             && !db.GradeDecisions.Any(d => d.CrabUnitId == c.CrabUnitId && d.IsCurrent), ct);
        var specIds = current.Where(c => c.Status == "Approved" && c.SpecId != null).Select(c => c.SpecId!.Value).Distinct().ToList();
        var specCodes = await db.ProductSpecifications.Where(s => specIds.Contains(s.SpecId)).ToDictionaryAsync(s => s.SpecId, s => s.SpecCode, ct);
        var bySpec = current.Where(c => c.Status == "Approved")
            .GroupBy(c => new { Code = c.SpecId is { } id ? specCodes[id] : "SUBSTANDARD", c.FinalSize, c.FinalGrade })
            .Select(g => new SpecCount(g.Key.Code, g.Key.FinalSize ?? "", g.Key.FinalGrade ?? "", g.Count()))
            .OrderBy(s => s.SpecCode).ToList();
        var ruleVersion = batch.GradeRuleSetId is { } rs ? await db.GradeRuleSets.Where(s => s.RuleSetId == rs).Select(s => (int?)s.VersionNo).SingleAsync(ct) : null;
        var qcUser = await db.QcAssignments.Where(a => a.AssignmentKind == QcAssignmentKinds.GradingSession && a.TargetType == "Batch" &&
                a.TargetId == batch.BatchId).OrderByDescending(a => a.AssignedAt).Select(a => (long?)a.QcUserId).FirstOrDefaultAsync(ct);
        return new BatchGradingSummary(batch.BatchCode, batch.Status, batch.CrabType, ruleVersion, received, notMeasured,
            current.Count(c => c.Status == "Draft"), current.Count(c => c.Status == "Hold"), current.Count(c => c.Status == "Approved"),
            current.Count(c => c.Status == "Rejected"), current.Count(c => c.Status == "Approved" && c.IsSubstandard), bySpec,
            me.IsInRole(Roles.PlatformAdmin) || me.IsInRole(Roles.QcInspector) ? qcUser : null);
    }

    /// <summary>Ảnh lượt đo (White hoặc Red) cho người nuôi, Admin và Nhân viên kiểm phẩm.</summary>
    public async Task<(Stream Content, string ContentType)> SessionImageAsync(string sessionNo, string kind, CancellationToken ct)
    {
        var session = await db.MeasurementSessions.AsNoTracking().SingleOrDefaultAsync(s => s.SessionNo == sessionNo, ct)
                      ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo.");
        await access.RequireOperatorOrAdminReadAsync(await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == session.BatchId, ct), ct);
        var uri = kind.ToLowerInvariant() switch { "white" => session.WhiteImageUri, "red" => session.RedImageUri, _ => null }
                  ?? throw new NotFoundException("grading.image_not_found", "Lượt đo không có ảnh này.");
        return (await files.OpenReadAsync(uri, ct), "image/jpeg");
    }

    public async Task<(Stream Content, string ContentType)> DecisionPhotoAsync(string decisionNo, CancellationToken ct)
    {
        var d = await db.GradeDecisions.AsNoTracking().SingleOrDefaultAsync(x => x.DecisionNo == decisionNo, ct)
                ?? throw new NotFoundException("grading.decision_not_found", "Không tìm thấy quyết định phân hạng.");
        await access.RequireOperatorOrAdminReadAsync(await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == d.BatchId, ct), ct);
        if (d.PhotoUri is null) throw new NotFoundException("grading.photo_not_found", "Quyết định này không có ảnh.");
        var type = Path.GetExtension(d.PhotoUri).ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
        return (await files.OpenReadAsync(d.PhotoUri, ct), type);
    }

    private async Task<IReadOnlyList<GradeDecisionResponse>> ResponsesAsync(IReadOnlyList<GradeDecision> list, CancellationToken ct)
    {
        if (list.Count == 0) return [];
        var batchIds = list.Select(d => d.BatchId).Distinct().ToList();
        var crabIds = list.Select(d => d.CrabUnitId).Distinct().ToList();
        var sessionIds = list.Select(d => d.MeasurementSessionId).Distinct().ToList();
        var ruleIds = list.Select(d => d.RuleSetId).Distinct().ToList();
        var specIds = list.Where(d => d.SpecId != null).Select(d => d.SpecId!.Value).Distinct().ToList();
        var batches = await db.Batches.Where(b => batchIds.Contains(b.BatchId)).ToDictionaryAsync(b => b.BatchId, b => b.BatchCode, ct);
        var crabs = await db.CrabUnits.Where(c => crabIds.Contains(c.CrabUnitId)).ToDictionaryAsync(c => c.CrabUnitId, c => c.CrabCode, ct);
        var sessions = await db.MeasurementSessions.Where(s => sessionIds.Contains(s.MeasurementSessionId)).ToDictionaryAsync(s => s.MeasurementSessionId, s => s.SessionNo, ct);
        var rules = await db.GradeRuleSets.Where(s => ruleIds.Contains(s.RuleSetId)).ToDictionaryAsync(s => s.RuleSetId, s => s.VersionNo, ct);
        var specs = await db.ProductSpecifications.Where(s => specIds.Contains(s.SpecId)).ToDictionaryAsync(s => s.SpecId, s => s.SpecCode, ct);
        return list.Select(d => new GradeDecisionResponse(d.DecisionNo, batches[d.BatchId], crabs[d.CrabUnitId], sessions[d.MeasurementSessionId],
            rules[d.RuleSetId], d.VersionNo, d.Status, d.IsCurrent, d.WeightG, d.CarapaceLengthCm, d.CIndex, d.EdgeBandMm, d.ProposedSize,
            d.ProposedCLevel, d.ProposedSensory, d.ProposedGrade, HoldReasons.Parse(d.HoldReasons), d.FinalSize, d.FinalGrade,
            d.SpecId is { } sid ? specs[sid] : null, d.IsSubstandard, d.LiveStatus, d.FoodSafety, d.SensoryNote, d.Reason, d.PhotoUri is not null,
            d.DecidedBy, d.DecidedAt, d.HeldBy, d.SecondQcId, d.SecondConfirmedAt, d.CreatedAt)).ToList();
    }
}
