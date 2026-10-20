using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Detection;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Evidence;

public sealed class EvidenceService(AppDbContext db, ICurrentUser me, EvidenceAccess access,
    EvidenceImageProcessor images, IFileStorage storage, ICrabDetector detector, IOptions<EvidenceOptions> options,
    TimeProvider clock, ILogger<EvidenceService> logger)
{
    private sealed record CaptureContext(long BatchId, long SlotId, string BatchCode, string SlotCode);

    public async Task<EvidenceResponse> UploadAsync(UploadEvidenceRequest request, CancellationToken ct)
    {
        Validate(request);
        var receivedAt = Now();
        var capturedAt = AuditChain.Timestamp(request.CapturedAt!.Value.ToUniversalTime());
        if (capturedAt > receivedAt.AddMinutes(5))
            throw new AppException(400, "evidence.capture_in_future", "Giờ chụp đang ở tương lai. Vui lòng kiểm tra đồng hồ điện thoại.");
        // Kiểm tra quyền trước khi giải mã, chạy detector hoặc lưu bất kỳ file nào.
        var initialContext = await RequireContextAsync(request, receivedAt, ct);
        var image = await images.ReadAsync(request.Image!, ct);
        var detection = await DetectAsync(image.Bytes, ct);
        await using var stream = new MemoryStream(image.Bytes, writable: false);
        var stored = await storage.SaveAsync(stream, "capture" + image.Extension, image.ContentType,
            $"evidence/{receivedAt:yyyy/MM}", ct);
        try
        {
            if (stored.Sha256 != image.Sha256 || stored.SizeBytes != image.Bytes.Length)
                throw new IOException("Storage content does not match the uploaded evidence.");
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                var previous = await AuditChain.LockAndReadTailAsync(db, ct);
                // Mỗi retry của cùng lần xử lý dùng một file_uri riêng. Nếu commit đã thành công
                // nhưng mất phản hồi DB, không thêm hàng/audit thứ hai hoặc xoá file đã được tham chiếu.
                var operatorId = await access.RequireOperatorAsync(ct);
                var committed = await db.Evidences.AsNoTracking().Include(e => e.EvidenceDetections).Include(e => e.CaptureRequest)
                    .SingleOrDefaultAsync(e => e.FileUri == stored.Uri && e.Batch.OperatorId == operatorId, ct);
                if (committed is not null)
                {
                    var actualDetection = committed.EvidenceDetections.Single();
                    var persistedDetection = new CrabDetectionResult(actualDetection.CrabDetected, actualDetection.Confidence, actualDetection.ModelVersion);
                    var originalAudit = await db.AuditLogs.AsNoTracking().Where(a => a.EntityType == "Evidence" && a.EntityId == committed.EvidenceId && a.ActionType == "UploadEvidence")
                        .Select(a => a.NewValue).FirstAsync(ct);
                    using var content = System.Text.Json.JsonDocument.Parse(originalAudit!);
                    await transaction.CommitAsync(ct);
                    return Response(committed, initialContext, persistedDetection, content.RootElement.GetProperty("duplicateMatch").GetString()!);
                }

                var context = await RequireContextAsync(request, receivedAt, ct);

                var match = await DuplicateAsync(image, ct);
                decimal risk = match == "Exact" ? 100 : match == "Similar" ? 80 : 0;
                if (receivedAt - capturedAt > TimeSpan.FromHours(options.Value.StaleCaptureHours)) risk = Math.Max(risk, 40);
                // Nhận diện chỉ là tín hiệu yếu cho đến khi TSK-13 có mô hình đã đánh giá.
                if (detection.CrabDetected == false) risk = Math.Max(risk, (detection.Confidence ?? 0) * 15);
                var status = risk >= 70 ? "Flagged" : risk >= 20 ? "Watch" : "Accepted";
                var evidence = new Infrastructure.Persistence.Entities.Evidence
                {
                    BatchId = context.BatchId, SlotId = context.SlotId, CaptureRequestId = request.CaptureRequestId,
                    MediaType = "Photo", Source = "InAppCapture", FileUri = stored.Uri, Sha256 = image.Sha256,
                    PerceptualHash = image.PerceptualHash, CapturedAt = capturedAt, ReceivedAt = receivedAt,
                    Latitude = Math.Round(request.Latitude!.Value, 6), Longitude = Math.Round(request.Longitude!.Value, 6),
                    RiskScore = Math.Round(risk, 2), ReviewStatus = status, CreatedAt = receivedAt,
                };
                evidence.EvidenceDetections.Add(new EvidenceDetection
                {
                    CrabDetected = detection.CrabDetected, Confidence = detection.Confidence,
                    ModelVersion = detection.ModelVersion, DetectedAt = receivedAt,
                });
                db.Evidences.Add(evidence);
                string? requestOld = null;
                if (request.CaptureRequestId is { } requestId)
                {
                    var capture = await db.CaptureRequests.SingleAsync(r => r.CaptureRequestId == requestId, ct);
                    evidence.CaptureRequest = capture;
                    if (status != "Flagged")
                    {
                        requestOld = AuditChain.Snapshot(new { capture.Status, capture.FulfilledAt });
                        capture.Status = "Fulfilled"; capture.FulfilledAt = receivedAt;
                    }
                }
                await db.SaveChangesAsync(ct);
                AppendAudit("Evidence", evidence.EvidenceId, "UploadEvidence", null,
                    AuditChain.Snapshot(new { evidence.BatchId, evidence.SlotId, evidence.CaptureRequestId, evidence.Source,
                        evidence.Sha256, evidence.PerceptualHash, evidence.CapturedAt, evidence.ReceivedAt,
                        evidence.Latitude, evidence.Longitude, evidence.RiskScore, evidence.ReviewStatus,
                        DuplicateMatch = match, Detection = detection }), previous, receivedAt);
                await db.SaveChangesAsync(ct);
                if (requestOld is not null)
                {
                    previous = await AuditChain.LockAndReadTailAsync(db, ct);
                    var capture = evidence.CaptureRequest!;
                    AppendAudit("CaptureRequest", capture.CaptureRequestId, "FulfillCaptureRequest", requestOld,
                        AuditChain.Snapshot(new { capture.Status, capture.FulfilledAt, evidence.EvidenceId }), previous, receivedAt);
                    await db.SaveChangesAsync(ct);
                }
                await transaction.CommitAsync(ct);
                return Response(evidence, context, detection, match);
            });
        }
        catch
        {
            // File ở ngoài SQL transaction: chỉ xoá sau khi xác nhận không có hàng đã commit.
            // Nếu DB không truy cập được, giữ file để không làm hỏng một commit chưa xác định.
            try
            {
                db.ChangeTracker.Clear();
                if (!await db.Evidences.AsNoTracking().AnyAsync(e => e.FileUri == stored.Uri, CancellationToken.None))
                    await storage.DeleteAsync(stored.Uri, CancellationToken.None);
            }
            catch (Exception cleanupError)
            { logger.LogWarning("Evidence cleanup deferred for {File}: {ErrorType}", stored.Uri, cleanupError.GetType().Name); }
            throw;
        }
    }

    private async Task<CaptureContext> RequireContextAsync(UploadEvidenceRequest request, DateTimeOffset receivedAt, CancellationToken ct)
    {
        var operatorId = await access.RequireOperatorAsync(ct);
        var batch = await db.Batches.AsNoTracking().Include(b => b.Operator)
            .SingleOrDefaultAsync(b => b.BatchCode == request.BatchCode.Trim() && b.OperatorId == operatorId, ct)
            ?? throw new NotFoundException("evidence.batch_not_found", "Không tìm thấy lô của hộ nuôi.");
        if (batch.Status is not ("Stocked" or "InProduction" or "Harvesting") || batch.Operator.Status != "Approved")
            throw new BusinessRuleException("evidence.batch_inactive", "Chỉ gửi bằng chứng cho lô đang nuôi của hộ nuôi đã được duyệt.");
        var slot = await db.PhysicalSlots.AsNoTracking().SingleOrDefaultAsync(s => s.OperatorId == operatorId && s.SlotCode == request.SlotCode.Trim(), ct)
            ?? throw new NotFoundException("evidence.slot_not_found", "Không tìm thấy hộp nuôi của bạn.");
        if (request.SlotEventType == "Restocked")
        {
            var lastAllocation = await db.SlotAllocations.AsNoTracking().Where(a => a.SlotId == slot.SlotId)
                .OrderByDescending(a => a.AllocatedAt).ThenByDescending(a => a.SlotAllocationId).FirstOrDefaultAsync(ct);
            if (request.CaptureRequestId is not null || slot.Status != "Available" || lastAllocation is null
                || lastAllocation.BatchId != batch.BatchId || lastAllocation.ReleasedAt is null
                || request.CapturedAt < lastAllocation.ReleasedAt
                || !await db.CrabItems.AnyAsync(c => c.SlotAllocationId == lastAllocation.SlotAllocationId && c.BatchId == batch.BatchId
                    && c.Status == "Dead" && !db.CrabItems.Any(n => n.ReplacesCrabItemId == c.CrabItemId), ct)
                || await db.SlotAllocations.AnyAsync(a => a.SlotId == slot.SlotId && a.ReleasedAt == null, ct))
                throw new BusinessRuleException("evidence.restock_slot_invalid", "Chỉ chụp thả bù cho hộp trống của lô vừa ghi nhận cua chết, chưa được thả bù hoặc tái sử dụng.");
        }
        else if (slot.Status != "Occupied" || !await db.SlotAllocations.AnyAsync(a => a.BatchId == batch.BatchId && a.SlotId == slot.SlotId && a.ReleasedAt == null, ct))
            throw new BusinessRuleException("evidence.slot_not_allocated", "Hộp không còn được gán cho lô này. Vui lòng tải lại danh sách hộp.");
        if (request.CaptureRequestId is { } id)
        {
            var capture = await db.CaptureRequests.AsNoTracking().SingleOrDefaultAsync(r => r.CaptureRequestId == id && r.BatchId == batch.BatchId && r.SlotId == slot.SlotId, ct)
                ?? throw new NotFoundException("evidence.capture_request_not_found", "Yêu cầu chụp không thuộc hộp và lô đã chọn.");
            if (capture.Status != "Open" || capture.DueAt < receivedAt || request.CapturedAt < capture.RequestedAt || request.CapturedAt > capture.DueAt)
                throw new BusinessRuleException("evidence.capture_request_invalid", "Yêu cầu đã hết hạn, hoàn thành hoặc ảnh được chụp ngoài thời hạn yêu cầu.");
        }
        return new(batch.BatchId, slot.SlotId, batch.BatchCode, slot.SlotCode);
    }

    private async Task<string> DuplicateAsync(EvidenceImage image, CancellationToken ct)
    {
        if (await db.Evidences.AsNoTracking().AnyAsync(e => e.Sha256 == image.Sha256, ct)) return "Exact";
        var hashes = await db.Evidences.AsNoTracking().Where(e => e.MediaType == "Photo" && e.PerceptualHash != null)
            .Select(e => e.PerceptualHash!).ToListAsync(ct);
        return hashes.Any(hash => EvidenceImageProcessor.Distance(hash, image.PerceptualHash) <= options.Value.SimilarityDistance) ? "Similar" : "None";
    }

    private async Task<CrabDetectionResult> DetectAsync(byte[] bytes, CancellationToken ct)
    {
        try
        {
            await using var stream = new MemoryStream(bytes, writable: false);
            var result = await detector.DetectAsync(stream, ct);
            if (string.IsNullOrWhiteSpace(result.ModelVersion) || result.ModelVersion.Length > 50
                || result.Confidence is < 0 or > 1 || (result.CrabDetected is null) != (result.Confidence is null))
                throw new InvalidOperationException("Invalid detector result");
            return result with { Confidence = result.Confidence is { } value ? Math.Round(value, 4) : null };
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error)
        {
            logger.LogWarning("Crab detection unavailable: {ErrorType}", error.GetType().Name);
            return new(null, null, "unavailable");
        }
    }

    private void AppendAudit(string type, long id, string action, string? old, string next, string? previous, DateTimeOffset now)
    {
        var audit = new AuditLog { EntityType = type, EntityId = id, ActionType = action, OldValue = old, NewValue = next,
            ActorUserId = me.UserId, OccurredAt = now, PrevHash = previous };
        audit.RowHash = AuditChain.Hash(audit); db.AuditLogs.Add(audit);
    }
    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
    private static EvidenceResponse Response(Infrastructure.Persistence.Entities.Evidence e, CaptureContext context, CrabDetectionResult detection, string match)
        => new(e.EvidenceId, context.BatchCode, context.SlotCode, e.CapturedAt!.Value, e.ReceivedAt, e.Latitude!.Value, e.Longitude!.Value,
            e.Sha256, e.PerceptualHash!, e.RiskScore!.Value, e.ReviewStatus, match,
            new(detection.CrabDetected, detection.Confidence, detection.ModelVersion), e.CaptureRequestId, e.CaptureRequest?.Status);
    private static void Validate(UploadEvidenceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.BatchCode) || string.IsNullOrWhiteSpace(request.SlotCode) || request.Image is null
            || request.CapturedAt is null || request.Latitude is null || request.Longitude is null
            || request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180)
            throw new AppException(400, "evidence.metadata_required", "Cần có lô, hộp, ảnh, thời gian chụp và vị trí hợp lệ.");
    }
}
