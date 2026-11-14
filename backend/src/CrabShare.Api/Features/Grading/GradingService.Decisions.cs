using System.Data;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Quality;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Grading;

public sealed partial class GradingService
{
    /// <summary>
    /// Nhân viên kiểm phẩm duyệt hạng cuối sau kiểm cảm quan (BR-154, BR-155). Size lấy từ cân; hạng cuối chỉ được bằng hoặc thấp hơn
    /// hạng đề xuất từ số đo, hạ hạng phải ghi lý do. Ngoài quy cách hoặc mức C dưới ngưỡng là dưới chuẩn (BR-158).
    /// </summary>
    public async Task<GradeDecisionResponse> ApproveAsync(string decisionNo, ApproveDecisionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (d, batch) = await LoadCurrentAsync(decisionNo, ct);
            await RequireDeciderAsync(d, ct);
            if (d.Status is not ("Draft" or "Hold"))
                throw new BusinessRuleException("grading.not_pending", "Chỉ duyệt quyết định đang chờ (Draft hoặc Hold).");
            var reasons = HoldReasons.Parse(d.HoldReasons);
            if (reasons.Contains(HoldReasons.CaliperRequired))
                throw new BusinessRuleException("grading.caliper_required", "Cần đo chiều dài mai bằng thước kẹp trước khi duyệt (BR-226).");
            var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == d.CrabUnitId, ct);
            if (crab.InventoryStatus is not ("Received" or "Holding"))
                throw new BusinessRuleException("grading.crab_closed", "Con cua không còn chờ phân hạng.");
            string final;
            if (d.ProposedGrade is { } proposed)
            {
                final = req.FinalGrade ?? proposed;
                if (GradeLabels.GradeRank(final) > GradeLabels.GradeRank(proposed))
                    throw new BusinessRuleException("grading.upgrade_not_allowed", "Hạng cuối không được cao hơn hạng đề xuất từ số đo; muốn đổi thì đo lại.");
                if (final != proposed && string.IsNullOrWhiteSpace(req.Reason))
                    throw new BusinessRuleException("grading.reason_required", "Hạ hạng so với đề xuất phải ghi lý do.");
            }
            else
                final = req.FinalGrade ?? throw new BusinessRuleException("grading.final_grade_required",
                    "Chưa có hạng đề xuất từ số đo; Nhân viên kiểm phẩm chọn hạng cuối sau kiểm cảm quan.");

            var now = clock.GetUtcNow();
            var previous = d.Status;
            var size = d.ProposedSize!;
            var inspection = Inspection(batch, crab, d, "Accepted", req.SensoryNote, null, now);
            db.QcInspections.Add(inspection);
            await db.SaveChangesAsync(ct);
            await ApplyFinalAsync(d, batch, size, final, ct);
            d.Status = "Approved";
            d.LiveStatus = "Alive";
            d.FoodSafety = "Pass";
            d.SensoryNote = Clean(req.SensoryNote);
            d.Reason = Clean(req.Reason);
            d.DecidedBy = me.UserId;
            d.DecidedAt = d.UpdatedAt = now;
            d.QcInspectionId = inspection.QcInspectionId;
            crab.InventoryStatus = "Graded";
            crab.UpdatedAt = now;
            await LeaveBoxAsync(crab, "Harvested", now, ct);
            db.InventoryEvents.Add(Event(crab, "Graded", now, $"{size} {final}"));
            await db.SaveChangesAsync(ct);
            if (reasons.Contains(HoldReasons.QcHold))
                await qc.CompleteAsync(QcAssignmentKinds.SecondReview, "CrabUnit", crab.CrabUnitId, ct);
            await hooks.OnApprovedAsync(d, ct);
            await audit.WriteAsync("grade_decision", d.GradeDecisionId, "approve", new { status = previous, d.ProposedSize, d.ProposedGrade },
                new { d.Status, d.FinalSize, d.FinalGrade, d.SpecId, d.IsSubstandard, d.Reason }, ct);
            await TryStartSellingAsync(batch, now, ct);
        }, ct, IsolationLevel.Serializable);
        return await DecisionAsync(decisionNo, ct);
    }

    /// <summary>
    /// Loại bỏ (BR-156): cua chết, yếu nặng hoặc không an toàn thực phẩm có quyết định Rejected, ảnh chụp trong app và lý do; cua bị tiêu huỷ,
    /// không bán ở bất kỳ giá nào. Loại cua đã duyệt tạo phiên bản quyết định mới (BR-157).
    /// </summary>
    public async Task<GradeDecisionResponse> RejectAsync(string decisionNo, RejectDecisionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        if (req.LiveStatus == "Alive" && req.FoodSafety == "Pass")
            throw new BusinessRuleException("grading.reject_reason_invalid", "Chỉ loại bỏ cua chết, yếu nặng hoặc không an toàn thực phẩm (BR-156).");
        var photo = await StorePhotoAsync(req.Photo!, ct);
        string resultNo = decisionNo;
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (d, batch) = await LoadCurrentAsync(decisionNo, ct);
            if (d.Status is "Draft" or "Hold") await RequireDeciderAsync(d, ct);
            else if (d.Status == "Approved")
            {
                await RequireReviserAsync(d, ct);
                if (await hooks.HasOpenClaimAsync(d.CrabUnitId, ct))
                    throw new BusinessRuleException("grading.claim_open", "Cua thuộc đơn đang có khiếu nại; chờ xử lý khiếu nại (BR-157).");
            }
            else throw new BusinessRuleException("grading.not_pending", "Quyết định này không loại được nữa.");
            var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == d.CrabUnitId, ct);
            if (crab.InventoryStatus is "Shipped" or "Delivered" or "Sold" or "Destroyed" or "Dead" or "Returned")
                throw new BusinessRuleException("grading.crab_closed", "Con cua đã ra khỏi tồn.");
            var now = clock.GetUtcNow();
            var inspection = Inspection(batch, crab, d, "Rejected", null, req.Reason.Trim(), now);
            inspection.Alive = req.LiveStatus != "Dead";
            inspection.Healthy = req.LiveStatus == "Alive";
            inspection.FoodSafe = req.FoodSafety == "Pass";
            db.QcInspections.Add(inspection);
            await db.SaveChangesAsync(ct);
            var target = d;
            GradeDecision? previous = null;
            if (d.Status == "Approved")
            {
                previous = d;
                target = await NewVersionAsync(d, now, ct);
            }
            target.Status = "Rejected";
            target.FinalSize = target.FinalGrade = null;
            target.SpecId = null;
            target.IsSubstandard = false;
            target.LiveStatus = req.LiveStatus;
            target.FoodSafety = req.FoodSafety;
            target.Reason = req.Reason.Trim();
            target.PhotoUri = photo.Uri;
            target.PhotoSha256 = photo.Sha256;
            target.DecidedBy = me.UserId;
            target.DecidedAt = target.UpdatedAt = now;
            target.QcInspectionId = inspection.QcInspectionId;
            crab.InventoryStatus = "Destroyed";
            crab.Condition = req.LiveStatus == "Dead" ? "Dead" : req.LiveStatus == "Weak" ? "Weak" : crab.Condition;
            crab.UpdatedAt = now;
            await LeaveBoxAsync(crab, "Destroyed", now, ct);
            db.InventoryEvents.Add(Event(crab, "Destroyed", now, req.Reason.Trim()));
            await db.SaveChangesAsync(ct);
            if (HoldReasons.Parse(d.HoldReasons).Contains(HoldReasons.QcHold))
                await qc.CompleteAsync(QcAssignmentKinds.SecondReview, "CrabUnit", crab.CrabUnitId, ct);
            if (previous is not null) await hooks.OnRevisedAsync(previous, target, ct);
            await hooks.OnRejectedAsync(target, ct);
            await audit.WriteAsync("grade_decision", target.GradeDecisionId, "reject", previous is null ? null : new { previous.DecisionNo, previous.FinalSize, previous.FinalGrade },
                new { target.Status, target.LiveStatus, target.FoodSafety, target.Reason, photo.Sha256 }, ct);
            resultNo = target.DecisionNo;
            await TryStartSellingAsync(batch, now, ct);
        }, ct, IsolationLevel.Serializable);
        return await DecisionAsync(resultNo, ct);
    }

    /// <summary>Nhân viên kiểm phẩm giữ lại con cua để kiểm thêm; cần Nhân viên kiểm phẩm thứ hai (phân ngẫu nhiên) xác nhận (BR-017).</summary>
    public async Task<GradeDecisionResponse> HoldAsync(string decisionNo, HoldDecisionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (d, _) = await LoadCurrentAsync(decisionNo, ct);
            var reasons = HoldReasons.Parse(d.HoldReasons).ToList();
            if (reasons.Contains(HoldReasons.QcHold))
                throw new ConflictException("grading.already_held", "Quyết định đã được giữ lại.");
            await RequireDeciderAsync(d, ct);
            if (d.Status is not ("Draft" or "Hold"))
                throw new BusinessRuleException("grading.not_pending", "Chỉ giữ lại quyết định đang chờ.");
            var now = clock.GetUtcNow();
            reasons.Add(HoldReasons.QcHold);
            d.Status = "Hold";
            d.HoldReasons = HoldReasons.Join(reasons);
            d.HeldBy = me.UserId;
            d.HeldAt = d.UpdatedAt = now;
            d.Reason = req.Reason.Trim();
            await db.SaveChangesAsync(ct);
            await qc.AssignAsync(QcAssignmentKinds.SecondReview, d.BatchId, "CrabUnit", d.CrabUnitId, [me.UserId], ct);
            await audit.WriteAsync("grade_decision", d.GradeDecisionId, "hold", null, new { d.HoldReasons, d.Reason }, ct);
        }, ct, IsolationLevel.Serializable);
        return await DecisionAsync(decisionNo, ct);
    }

    /// <summary>Nhân viên kiểm phẩm thứ hai xác nhận giữ lại (BR-017); sau đó chính người này duyệt hoặc loại.</summary>
    public async Task<GradeDecisionResponse> ConfirmHoldAsync(string decisionNo, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (d, _) = await LoadCurrentAsync(decisionNo, ct);
            if (!HoldReasons.Parse(d.HoldReasons).Contains(HoldReasons.QcHold) || d.Status != "Hold")
                throw new BusinessRuleException("grading.not_held", "Quyết định chưa được giữ lại.");
            if (d.SecondConfirmedAt is not null)
                throw new ConflictException("grading.hold_confirmed", "Giữ lại đã được xác nhận.");
            await RequireDeciderAsync(d, ct);
            var now = clock.GetUtcNow();
            d.SecondQcId = me.UserId;
            d.SecondConfirmedAt = d.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("grade_decision", d.GradeDecisionId, "confirm_hold", null, new { d.SecondQcId, d.SecondConfirmedAt }, ct);
        }, ct, IsolationLevel.Serializable);
        return await DecisionAsync(decisionNo, ct);
    }

    /// <summary>
    /// Đổi size hoặc hạng cuối (BR-157): tạo phiên bản quyết định mới kèm ảnh và lý do; quyết định cũ được giữ. Không đổi hạng cua thuộc đơn
    /// đang có khiếu nại. Không nâng quá số đo: size không lớn hơn size theo cân, hạng không cao hơn hạng đề xuất.
    /// </summary>
    public async Task<GradeDecisionResponse> ReviseAsync(string decisionNo, ReviseDecisionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var photo = await StorePhotoAsync(req.Photo!, ct);
        string resultNo = decisionNo;
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (d, batch) = await LoadCurrentAsync(decisionNo, ct);
            if (d.Status != "Approved")
                throw new BusinessRuleException("grading.not_approved", "Chỉ sửa quyết định đã duyệt.");
            await RequireReviserAsync(d, ct);
            if (await hooks.HasOpenClaimAsync(d.CrabUnitId, ct))
                throw new BusinessRuleException("grading.claim_open", "Cua thuộc đơn đang có khiếu nại; không đổi hạng (BR-157).");
            var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == d.CrabUnitId, ct);
            if (crab.InventoryStatus is not ("Graded" or "Allocated"))
                throw new BusinessRuleException("grading.crab_shipped", "Cua đã xuất kho hoặc ra khỏi tồn; không đổi hạng.");
            if (GradeLabels.SizeRank(req.FinalSize) > GradeLabels.SizeRank(d.ProposedSize))
                throw new BusinessRuleException("grading.upsize_not_allowed", "Size không được lớn hơn size theo khối lượng cân.");
            if (d.ProposedGrade is { } proposed && GradeLabels.GradeRank(req.FinalGrade) > GradeLabels.GradeRank(proposed))
                throw new BusinessRuleException("grading.upgrade_not_allowed", "Hạng cuối không được cao hơn hạng đề xuất từ số đo.");
            if (req.FinalSize == d.FinalSize && req.FinalGrade == d.FinalGrade)
                throw new BusinessRuleException("grading.no_change", "Size và hạng cuối không đổi.");
            var now = clock.GetUtcNow();
            var inspection = Inspection(batch, crab, d, "Accepted", $"Sửa hạng: {req.Reason.Trim()}", null, now);
            db.QcInspections.Add(inspection);
            await db.SaveChangesAsync(ct);
            var next = await NewVersionAsync(d, now, ct);
            await ApplyFinalAsync(next, batch, req.FinalSize, req.FinalGrade, ct);
            next.Status = "Approved";
            next.LiveStatus = "Alive";
            next.FoodSafety = "Pass";
            next.Reason = req.Reason.Trim();
            next.PhotoUri = photo.Uri;
            next.PhotoSha256 = photo.Sha256;
            next.DecidedBy = me.UserId;
            next.DecidedAt = next.UpdatedAt = now;
            next.QcInspectionId = inspection.QcInspectionId;
            var lowered = GradeLabels.GradeRank(req.FinalGrade) < GradeLabels.GradeRank(d.FinalGrade) ||
                          GradeLabels.SizeRank(req.FinalSize) < GradeLabels.SizeRank(d.FinalSize);
            db.InventoryEvents.Add(Event(crab, lowered ? "Downgraded" : "Graded", now, $"{d.FinalSize} {d.FinalGrade} → {req.FinalSize} {req.FinalGrade}: {req.Reason.Trim()}"));
            await db.SaveChangesAsync(ct);
            await hooks.OnRevisedAsync(d, next, ct);
            await audit.WriteAsync("grade_decision", next.GradeDecisionId, "revise", new { d.DecisionNo, d.FinalSize, d.FinalGrade, d.SpecId },
                new { next.DecisionNo, next.FinalSize, next.FinalGrade, next.SpecId, next.IsSubstandard, next.Reason, photo.Sha256 }, ct);
            resultNo = next.DecisionNo;
        }, ct, IsolationLevel.Serializable);
        return await DecisionAsync(resultNo, ct);
    }

    // ---------- Phần dùng chung ----------

    private async Task<(GradeDecision Decision, Batch Batch)> LoadCurrentAsync(string decisionNo, CancellationToken ct)
    {
        var d = await db.GradeDecisions.FromSqlInterpolated(
                    $"SELECT * FROM dbo.grade_decision WITH (UPDLOCK, HOLDLOCK) WHERE decision_no = {decisionNo}").SingleOrDefaultAsync(ct)
                ?? throw new NotFoundException("grading.decision_not_found", "Không tìm thấy quyết định phân hạng.");
        if (!d.IsCurrent)
            throw new ConflictException("grading.decision_not_current", "Quyết định này đã có phiên bản mới hơn.");
        var batch = await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_id = {d.BatchId}").SingleAsync(ct);
        return (d, batch);
    }

    /// <summary>Phiên bản mới của một quyết định đã chốt (BR-157): chép số đo và đề xuất, giữ quyết định cũ (bỏ cờ hiện hành).</summary>
    private async Task<GradeDecision> NewVersionAsync(GradeDecision d, DateTimeOffset now, CancellationToken ct)
    {
        d.IsCurrent = false;
        d.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        var next = new GradeDecision
        {
            DecisionNo = Codes.New("GD", 10), CrabUnitId = d.CrabUnitId, BatchId = d.BatchId, MeasurementSessionId = d.MeasurementSessionId,
            RuleSetId = d.RuleSetId, VersionNo = d.VersionNo + 1, Status = "Draft", WeightG = d.WeightG, CarapaceLengthCm = d.CarapaceLengthCm,
            CIndex = d.CIndex, EdgeBandMm = d.EdgeBandMm, ProposedSize = d.ProposedSize, ProposedCLevel = d.ProposedCLevel,
            ProposedSensory = d.ProposedSensory, ProposedGrade = d.ProposedGrade, SupersedesDecisionId = d.GradeDecisionId, IsCurrent = true,
            CreatedAt = now, UpdatedAt = now,
        };
        db.GradeDecisions.Add(next);
        await db.SaveChangesAsync(ct);
        return next;
    }

    /// <summary>Gắn size, hạng cuối, quy cách hàng và cờ dưới chuẩn (BR-043, BR-158).</summary>
    private async Task ApplyFinalAsync(GradeDecision d, Batch batch, string size, string grade, CancellationToken ct)
    {
        d.FinalSize = size;
        d.FinalGrade = grade;
        d.IsSubstandard = GradeLabels.IsSubstandard(size, grade);
        var code = GradeLabels.SpecCode(batch.CrabType, size, grade);
        d.SpecId = code is null ? null : await db.ProductSpecifications.Where(s => s.SpecCode == code).Select(s => (long?)s.SpecId).SingleOrDefaultAsync(ct);
    }

    private QcInspection Inspection(Batch batch, CrabUnit crab, GradeDecision d, string conclusion, string? sensory, string? rejectReason, DateTimeOffset now) => new()
    {
        InspectionNo = Codes.New("QC", 10), InspectionKind = "Grading", BatchId = batch.BatchId, CrabUnitId = crab.CrabUnitId, InspectorId = me.UserId,
        InspectedAt = now, Species = crab.Species, Sex = crab.Sex, Maturity = crab.Maturity, SpeciesOk = true,
        Alive = conclusion == "Accepted" ? true : null, Healthy = conclusion == "Accepted" ? true : null, FoodSafe = conclusion == "Accepted" ? true : null,
        WeightG = d.WeightG, SensoryResult = Clean(sensory), Conclusion = conclusion, RejectReason = rejectReason, CreatedAt = now,
    };

    private InventoryEvent Event(CrabUnit crab, string type, DateTimeOffset at, string? reason) => new()
    {
        CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = type, OccurredAt = at, Source = "Qc", ActorId = me.UserId,
        Reason = reason is { Length: > 300 } ? reason[..300] : reason, CreatedAt = at,
    };

    /// <summary>Thu hoạch xong hoặc tiêu huỷ thì con cua rời hộp (BR-150).</summary>
    private async Task LeaveBoxAsync(CrabUnit crab, string reason, DateTimeOffset now, CancellationToken ct)
    {
        var box = await db.BoxAssignments.SingleOrDefaultAsync(a => a.CrabUnitId == crab.CrabUnitId && a.LeftAt == null, ct);
        if (box is null) return;
        box.LeftAt = now;
        box.LeaveReason = reason;
    }

    /// <summary>
    /// BR-152: mọi con cua đã nhận có quyết định đã chốt (duyệt hoặc loại) hoặc đã chết thì Lô chuyển Selling. Lô có lưu nuôi đi từ Harvesting;
    /// lô không lưu nuôi đi từ Sourcing khi không còn phiếu nhận đang kiểm.
    /// </summary>
    private async Task TryStartSellingAsync(Batch batch, DateTimeOffset now, CancellationToken ct)
    {
        if (!(batch.HasHolding ? batch.Status == "Harvesting" : batch.Status == "Sourcing")) return;
        if (await db.CrabUnits.AnyAsync(c => c.BatchId == batch.BatchId && (c.InventoryStatus == "Received" || c.InventoryStatus == "Holding"), ct)) return;
        if (await db.GoodsReceipts.AnyAsync(r => r.BatchId == batch.BatchId && r.Status == "Inspecting", ct)) return;
        if (!await db.GradeDecisions.AnyAsync(d => d.BatchId == batch.BatchId && d.IsCurrent && d.Status == "Approved", ct)) return;
        var previous = batch.Status;
        batch.Status = "Selling";
        batch.SellingStartedAt = batch.UpdatedAt = now;
        var holding = await db.HoldingOperations.SingleOrDefaultAsync(h => h.BatchId == batch.BatchId, ct);
        if (holding is not null) holding.Status = "Closed";
        await db.SaveChangesAsync(ct);
        await qc.CompleteAsync(QcAssignmentKinds.GradingSession, "Batch", batch.BatchId, ct);
        await audit.WriteAsync("batch", batch.BatchId, "start_selling", new { status = previous }, new { batch.Status, sellingStartedAt = now }, ct);
    }

    private async Task<Infrastructure.Storage.StoredFile> StorePhotoAsync(IFormFile photo, CancellationToken ct)
    {
        var image = await images.ReadAsync(photo, ct);
        await using var stream = new MemoryStream(image.Bytes, writable: false);
        return await files.SaveAsync(stream, "grade" + image.Extension, image.ContentType, $"grading/{clock.GetUtcNow():yyyy/MM}", ct);
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
