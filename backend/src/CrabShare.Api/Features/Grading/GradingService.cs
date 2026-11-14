using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Devices;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Features.Quality;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Grading;

/// <summary>
/// Điểm nối cho nhóm G6: phân bổ cua vừa duyệt cho đợt giao sớm nhất (BR-152, BR-160), giải phóng khi loại,
/// phân bổ lại khi đổi hạng, và chặn đổi hạng khi đơn đang có khiếu nại (BR-157).
/// </summary>
public interface IGradingHooks
{
    Task OnApprovedAsync(GradeDecision decision, CancellationToken ct);
    Task OnRejectedAsync(GradeDecision decision, CancellationToken ct);
    Task OnRevisedAsync(GradeDecision previous, GradeDecision current, CancellationToken ct);
    Task<bool> HasOpenClaimAsync(long crabUnitId, CancellationToken ct);
}

public sealed class NoGradingHooks : IGradingHooks
{
    public Task OnApprovedAsync(GradeDecision decision, CancellationToken ct) => Task.CompletedTask;
    public Task OnRejectedAsync(GradeDecision decision, CancellationToken ct) => Task.CompletedTask;
    public Task OnRevisedAsync(GradeDecision previous, GradeDecision current, CancellationToken ct) => Task.CompletedTask;
    public Task<bool> HasOpenClaimAsync(long crabUnitId, CancellationToken ct) => Task.FromResult(false);
}

/// <summary>Trạm gửi bản tin xong thì chạy AI và đề xuất hạng (BR-151, BR-226).</summary>
public sealed class GradingStationProcessor(GradingService grading) : IStationMeasurementProcessor
{
    public Task ProcessAsync(long measurementSessionId, CancellationToken ct) => grading.ProcessStationAsync(measurementSessionId, ct);
}

/// <summary>
/// Phân hạng từng con (BR-151 – BR-159, BR-226, BR-227): số đo từ cân của trạm và từ AI hoặc thước kẹp; hệ thống đề xuất size, mức C,
/// cảm quan; Nhân viên kiểm phẩm được phân ngẫu nhiên kiểm cảm quan rồi duyệt hoặc loại. AI không tự duyệt hạng.
/// </summary>
public sealed partial class GradingService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    QcAssignmentService qc, PlatformParameters parameters, IFileStorage files, ICarapaceAi ai, EvidenceImageProcessor images,
    IGradingHooks hooks)
{
    // ---------- Số đo và đề xuất ----------

    /// <summary>Lượt đo bằng trạm vừa nhận bản tin (Received): ghi khối lượng từ cân, chạy AI trên hai ảnh, đề xuất hạng.</summary>
    public async Task ProcessStationAsync(long sessionId, CancellationToken ct)
    {
        var s = await db.MeasurementSessions.AsNoTracking().SingleOrDefaultAsync(x => x.MeasurementSessionId == sessionId, ct);
        if (s is not { Status: "Received", WeightG: not null, WhiteImageUri: not null }) return;
        var crabType = await db.Batches.Where(b => b.BatchId == s.BatchId).Select(b => b.CrabType).SingleAsync(ct);
        var white = await ReadAllAsync(s.WhiteImageUri, ct);
        var red = s.RedImageUri is null ? null : await ReadAllAsync(s.RedImageUri, ct);
        var result = await ai.InferAsync(new CarapaceAiRequest(s.SessionNo, crabType, s.WeightG.Value, s.CameraHeightMm, white, red), ct);

        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var session = await db.MeasurementSessions.SingleAsync(x => x.MeasurementSessionId == sessionId, ct);
            if (session.Status != "Received") return; // lần xử lý khác đã làm xong
            var now = clock.GetUtcNow();
            db.MeasurementValues.Add(new MeasurementValue
            {
                MeasurementSessionId = sessionId, Metric = "WeightG", Value = session.WeightG!.Value, Unit = "g", Method = "Scale",
                VerificationStatus = session.ScaleCalibrationOk == true ? "Verified" : "Unverified", RecordedAt = now,
            });
            await AddInferenceAsync(sessionId, result, result.White, "White", now, ct);
            if (result.Red is { } r) await AddInferenceAsync(sessionId, result, r, "Red", now, ct);
            session.Status = "Measured";
            session.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            var decision = await ProposeAsync(session, now, ct);
            await audit.WriteAsync("measurement_session", sessionId, "measure", new { status = "Received" },
                new { session.Status, decision.DecisionNo, decisionStatus = decision.Status, decision.HoldReasons, ai = result.ModelName, result.Simulated }, ct);
        }, ct, IsolationLevel.Serializable);
    }

    /// <summary>Chạy lại xử lý cho lượt đo đã nhận bản tin nhưng chưa xử lý xong (ví dụ pool kiểm phẩm trống lúc nhận).</summary>
    public async Task<SessionMeasurementsResponse> ReprocessAsync(string sessionNo, CancellationToken ct)
    {
        var session = await db.MeasurementSessions.AsNoTracking().SingleOrDefaultAsync(s => s.SessionNo == sessionNo, ct)
                      ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo.");
        await access.RequireOperatorAsync(await db.Batches.SingleAsync(b => b.BatchId == session.BatchId, ct), ct);
        if (session.Status != "Received")
            throw new BusinessRuleException("grading.session_not_received", "Chỉ xử lý lại lượt đo đã nhận bản tin mà chưa có số đo.");
        await ProcessStationAsync(session.MeasurementSessionId, ct);
        return await MeasurementsAsync(sessionNo, ct);
    }

    /// <summary>
    /// Số đo nhập tay: lượt đo Manual (cân tay và thước kẹp, dự phòng khi trạm lỗi) hoặc bổ sung thước kẹp cho lượt đo bằng trạm
    /// khi ảnh lỗi hay AI không chắc (BR-151, BR-153, BR-226). Mỗi lần nhập tạo phiên bản đề xuất mới.
    /// </summary>
    public async Task<SessionMeasurementsResponse> RecordValuesAsync(string sessionNo, MeasurementValuesRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        if (req is { WeightG: null, CarapaceLengthCm: null, CarapaceWidthCm: null, EdgeBandMm: null })
            throw new BusinessRuleException("grading.values_required", "Nhập ít nhất một số đo.");
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var session = await db.MeasurementSessions.FromSqlInterpolated(
                    $"SELECT * FROM dbo.measurement_session WITH (UPDLOCK, HOLDLOCK) WHERE session_no = {sessionNo}").SingleOrDefaultAsync(ct)
                          ?? throw new NotFoundException("grading.session_not_found", "Không tìm thấy lượt đo.");
            var batch = await db.Batches.SingleAsync(b => b.BatchId == session.BatchId, ct);
            await RequireMeasurerAsync(batch, ct);
            if (session.Status is "Cancelled" or "Failed")
                throw new BusinessRuleException("grading.session_closed", "Lượt đo đã huỷ hoặc lỗi; mở lượt đo mới.");
            if (session.Procedure == "Station")
            {
                if (session.Status is "Open" or "Received")
                    throw new BusinessRuleException("grading.session_waiting_station", "Lượt đo đang chờ bản tin hoặc kết quả xử lý của trạm.");
                if (req.WeightG is not null)
                    throw new BusinessRuleException("grading.weight_from_station", "Khối lượng của lượt đo bằng trạm lấy từ cân của trạm (BR-153).");
            }
            else if (session.Status == "Open" && req.WeightG is null)
                throw new BusinessRuleException("grading.weight_required", "Lượt đo thủ công cần khối lượng cân tay trước (BR-153).");

            var now = clock.GetUtcNow();
            void Add(string metric, decimal? value, string unit, string method)
            {
                if (value is { } v)
                    db.MeasurementValues.Add(new MeasurementValue
                    {
                        MeasurementSessionId = session.MeasurementSessionId, Metric = metric, Value = decimal.Round(v, 2), Unit = unit, Method = method,
                        RecordedBy = me.UserId, RecordedAt = now,
                    });
            }
            Add("WeightG", req.WeightG, "g", "ManualScale");
            Add("CarapaceLengthCm", req.CarapaceLengthCm, "cm", "Caliper");
            Add("CarapaceWidthCm", req.CarapaceWidthCm, "cm", "Caliper");
            Add("EdgeBandMm", req.EdgeBandMm, "mm", "Caliper");
            if (session.Procedure == "Manual")
            {
                if (req.WeightG is { } w) session.WeightG = decimal.Round(w, 1);
                if (session.Status == "Open")
                {
                    session.Status = "Measured";
                    session.CapturedAt = session.ReceivedAt = now;
                }
            }
            session.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            var decision = await ProposeAsync(session, now, ct);
            await audit.WriteAsync("measurement_session", session.MeasurementSessionId, "record_values", null,
                new { req.WeightG, req.CarapaceLengthCm, req.CarapaceWidthCm, req.EdgeBandMm, decision.DecisionNo, decision.Status, decision.HoldReasons }, ct);
        }, ct, IsolationLevel.Serializable);
        return await MeasurementsAsync(sessionNo, ct);
    }

    private async Task AddInferenceAsync(long sessionId, CarapaceAiResult result, CarapaceImageResult image, string kind, DateTimeOffset now,
        CancellationToken ct)
    {
        var inference = new AiInference
        {
            MeasurementSessionId = sessionId, ImageKind = kind, ModelName = result.ModelName, ModelVersion = result.ModelVersion,
            IsSimulated = result.Simulated, Status = image.Status, ImageQuality = image.ImageQuality, LandmarksJson = image.LandmarksJson,
            CarapaceLengthCm = image.CarapaceLengthCm, CarapaceWidthCm = image.CarapaceWidthCm, CarapaceAreaCm2 = image.CarapaceAreaCm2,
            EdgeBandMm = image.EdgeBandMm, Confidence = image.Confidence, ErrorReason = image.Error, CreatedAt = now,
        };
        db.AiInferences.Add(inference);
        await db.SaveChangesAsync(ct);
        if (image.Status == "Failed") return;
        void Add(string metric, decimal? value, string unit)
        {
            if (value is { } v)
                db.MeasurementValues.Add(new MeasurementValue
                {
                    MeasurementSessionId = sessionId, Metric = metric, Value = v, Unit = unit, Method = "AI", Confidence = image.Confidence,
                    AiInferenceId = inference.AiInferenceId, RecordedAt = now,
                });
        }
        Add("CarapaceLengthCm", image.CarapaceLengthCm, "cm");
        Add("CarapaceWidthCm", image.CarapaceWidthCm, "cm");
        Add("CarapaceAreaCm2", image.CarapaceAreaCm2, "cm2");
        Add("EdgeBandMm", image.EdgeBandMm, "mm");
    }

    /// <summary>Đề xuất từ số đo mới nhất của lượt đo; thay phiên bản đề xuất còn chờ (Draft, Hold) của con cua bằng phiên bản mới.</summary>
    private async Task<GradeDecision> ProposeAsync(MeasurementSession session, DateTimeOffset now, CancellationToken ct)
    {
        var batch = await db.Batches.SingleAsync(b => b.BatchId == session.BatchId, ct);
        var ruleSet = await RuleSetForAsync(batch, ct);
        var values = await db.MeasurementValues.AsNoTracking().Where(v => v.MeasurementSessionId == session.MeasurementSessionId)
            .OrderBy(v => v.RecordedAt).ThenBy(v => v.MeasurementValueId).ToListAsync(ct);
        var weight = values.LastOrDefault(v => v.Metric == "WeightG")?.Value
                     ?? throw new BusinessRuleException("grading.weight_required", "Lượt đo chưa có khối lượng từ cân (BR-153).");
        var caliper = values.LastOrDefault(v => v.Metric == "CarapaceLengthCm" && v.Method == "Caliper");
        var aiLength = values.LastOrDefault(v => v.Metric == "CarapaceLengthCm" && v.Method == "AI");
        var edge = values.LastOrDefault(v => v.Metric == "EdgeBandMm");
        var white = await db.AiInferences.AsNoTracking().Where(i => i.MeasurementSessionId == session.MeasurementSessionId && i.ImageKind == "White")
            .OrderByDescending(i => i.AiInferenceId).FirstOrDefaultAsync(ct);
        var threshold = await parameters.GetAsync(ParamKeys.AiConfidenceThreshold, now, ct);
        var length = caliper ?? aiLength;
        var input = new GradeInput(weight, length?.Value, edge?.Value, caliper is null ? white?.Confidence : null,
            caliper is null ? white?.ImageQuality : null, caliper is not null, threshold);
        var proposal = GradeEngine.Propose(ruleSet.Rules, ruleSet.NearThresholdPct, input);

        var current = await db.GradeDecisions.SingleOrDefaultAsync(d => d.CrabUnitId == session.CrabUnitId && d.IsCurrent, ct);
        if (current is { Status: "Approved" or "Rejected" })
            throw new ConflictException("grading.already_decided", "Con cua đã có quyết định phân hạng; đổi hạng thì sửa quyết định (BR-157).");
        var holds = proposal.HoldReasons.ToList();
        var carryHold = current is not null && HoldReasons.Parse(current.HoldReasons).Contains(HoldReasons.QcHold);
        if (carryHold) holds.Add(HoldReasons.QcHold);
        if (current is not null)
        {
            current.Status = "Superseded";
            current.IsCurrent = false;
            current.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
        }
        var version = await db.GradeDecisions.Where(d => d.CrabUnitId == session.CrabUnitId).MaxAsync(d => (int?)d.VersionNo, ct) ?? 0;
        var usedLength = proposal.CIndex is not null ? length?.Value : caliper?.Value;
        var decision = new GradeDecision
        {
            DecisionNo = Codes.New("GD", 10), CrabUnitId = session.CrabUnitId, BatchId = batch.BatchId,
            MeasurementSessionId = session.MeasurementSessionId, RuleSetId = ruleSet.RuleSetId, VersionNo = version + 1,
            Status = holds.Count == 0 ? "Draft" : "Hold", WeightG = decimal.Round(weight, 1),
            CarapaceLengthCm = usedLength is { } l ? decimal.Round(l, 2) : null, CIndex = proposal.CIndex,
            EdgeBandMm = proposal.Sensory is null ? null : edge?.Value is { } e ? decimal.Round(e, 2) : null,
            ProposedSize = proposal.Size, ProposedCLevel = proposal.CLevel, ProposedSensory = proposal.Sensory, ProposedGrade = proposal.Grade,
            HoldReasons = HoldReasons.Join(holds),
            HeldBy = carryHold ? current!.HeldBy : null, HeldAt = carryHold ? current!.HeldAt : null,
            SecondQcId = carryHold ? current!.SecondQcId : null, SecondConfirmedAt = carryHold ? current!.SecondConfirmedAt : null,
            SupersedesDecisionId = current?.GradeDecisionId, IsCurrent = true, CreatedAt = now, UpdatedAt = now,
        };
        db.GradeDecisions.Add(decision);
        await db.SaveChangesAsync(ct);
        await EnsureGradingQcAsync(batch.BatchId, ct);
        return decision;
    }

    /// <summary>
    /// BR-017: phân ngẫu nhiên một Nhân viên kiểm phẩm cho buổi đo của Lô. Pool trống thì vẫn giữ số đo và đề xuất;
    /// Admin bổ sung pool rồi gọi phân công lại.
    /// </summary>
    private async Task<bool> EnsureGradingQcAsync(long batchId, CancellationToken ct)
    {
        try
        {
            await qc.AssignAsync(QcAssignmentKinds.GradingSession, batchId, "Batch", batchId, null, ct);
            return true;
        }
        catch (BusinessRuleException e) when (e.Code == "qc.pool_empty")
        {
            return false;
        }
    }

    /// <summary>Admin phân công (lại) Nhân viên kiểm phẩm cho buổi đo của Lô khi lúc đo pool còn trống.</summary>
    public async Task<BatchGradingSummary> AssignGradingQcAsync(string batchCode, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await db.Batches.SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                        ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
            if (!await db.GradeDecisions.AnyAsync(d => d.BatchId == batch.BatchId && d.IsCurrent && (d.Status == "Draft" || d.Status == "Hold"), ct))
                throw new BusinessRuleException("grading.nothing_to_review", "Lô không có quyết định phân hạng nào đang chờ duyệt.");
            var assignment = await qc.AssignAsync(QcAssignmentKinds.GradingSession, batch.BatchId, "Batch", batch.BatchId, null, ct);
            await audit.WriteAsync("qc_assignment", assignment.QcAssignmentId, "assign_grading", null, new { batch.BatchCode, assignment.QcUserId }, ct);
        }, ct);
        return await BatchSummaryAsync(batchCode, ct);
    }

    /// <summary>Bộ quy tắc khoá lúc duyệt Lô; Lô cũ chưa khoá thì lấy bộ đang áp dụng cho loại cua và khoá luôn (BR-038).</summary>
    private async Task<GradeRuleSet> RuleSetForAsync(Batch batch, CancellationToken ct)
    {
        if (batch.GradeRuleSetId is { } id)
            return await db.GradeRuleSets.AsNoTracking().Include(s => s.Rules).SingleAsync(s => s.RuleSetId == id, ct);
        var active = await db.GradeRuleSets.AsNoTracking().Include(s => s.Rules).SingleOrDefaultAsync(s => s.CrabType == batch.CrabType && s.Status == "Active", ct)
                     ?? throw new BusinessRuleException("grading.no_rule_set", "Chưa có bộ quy tắc phân hạng áp dụng cho loại cua này (BR-038).");
        await db.Batches.Where(b => b.BatchId == batch.BatchId).ExecuteUpdateAsync(u => u.SetProperty(b => b.GradeRuleSetId, active.RuleSetId), ct);
        return active;
    }

    private async Task<byte[]> ReadAllAsync(string uri, CancellationToken ct)
    {
        await using var stream = await files.OpenReadAsync(uri, ct);
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct);
        return buffer.ToArray();
    }

    // ---------- Quyền ----------

    /// <summary>Người đo: chủ hộ nuôi vận hành Lô (hoặc Admin) hoặc Nhân viên kiểm phẩm được phân cho buổi đo của Lô.</summary>
    private async Task RequireMeasurerAsync(Batch batch, CancellationToken ct)
    {
        if (me.IsInRole(Roles.QcInspector) && await db.QcAssignments.AnyAsync(a => a.AssignmentKind == QcAssignmentKinds.GradingSession &&
                a.TargetType == "Batch" && a.TargetId == batch.BatchId && a.Status == "Assigned" && a.QcUserId == me.UserId, ct))
            return;
        await access.RequireOperatorAsync(batch, ct);
    }

    /// <summary>
    /// Người duyệt: Nhân viên kiểm phẩm được phân cho buổi đo của Lô; quyết định QC giữ lại thì chỉ Nhân viên kiểm phẩm thứ hai
    /// (được phân ngẫu nhiên khi giữ lại) duyệt hoặc loại (BR-017, BR-155).
    /// </summary>
    private async Task RequireDeciderAsync(GradeDecision d, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.QcInspector))
            throw new ForbiddenException("grading.qc_only", "Chỉ Nhân viên kiểm phẩm được duyệt hạng (BR-155).");
        if (HoldReasons.Parse(d.HoldReasons).Contains(HoldReasons.QcHold))
            await qc.RequireAssignedAsync(me.UserId, QcAssignmentKinds.SecondReview, "CrabUnit", d.CrabUnitId, ct);
        else
            await qc.RequireAssignedAsync(me.UserId, QcAssignmentKinds.GradingSession, "Batch", d.BatchId, ct);
    }

    /// <summary>Sửa quyết định đã duyệt: Nhân viên kiểm phẩm không có quan hệ với Lô (BR-017, BR-157).</summary>
    private async Task RequireReviserAsync(GradeDecision d, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.QcInspector))
            throw new ForbiddenException("grading.qc_only", "Chỉ Nhân viên kiểm phẩm được sửa quyết định phân hạng (BR-157).");
        if (!(await qc.EligibleAsync(d.BatchId, null, ct)).Contains(me.UserId))
            throw new ForbiddenException("qc.not_eligible", "Bạn có quan hệ với Lô này nên không được kiểm (BR-017).");
    }
}
