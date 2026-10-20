using System.Data;
using System.Globalization;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed partial class ProductionLogService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, AlertService alerts)
{
    private static readonly TimeSpan VietnamOffset = TimeSpan.FromHours(7);
    private DateOnly Today() => DateOnly.FromDateTime(clock.GetUtcNow().ToOffset(VietnamOffset).DateTime);
    private static bool IsRecordingState(string status) => status is "InProduction" or "Harvesting";
    private static bool IsConfigurationState(string status) => status is "Draft" or "PendingApproval" or "Funding" or "Stocked" or "InProduction" or "Harvesting";
    private static ConflictException Duplicate() => new("production.log_exists", "Lô này đã có nhật ký thủ công cho hôm nay.");
    private static ForbiddenException Denied() => new("production.access_denied", "Bạn không có quyền truy cập dữ liệu nuôi của lô này.");

    public Task<ProductionThresholdResponse> ConfigureAsync(string code, ProductionThresholdRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        return WriteAsync(async () =>
        {
            var member = await MemberAsync(true, ct);
            var batch = await LockBatchAsync(code, member.OperatorId, ct);
            if (!IsConfigurationState(batch.Status))
                throw new BusinessRuleException("production.invalid_state", "Trạng thái lô hiện tại không cho phép thay đổi ngưỡng.");
            var current = await CurrentThresholdAsync(batch.BatchId, ct);
            if ((current?.VersionNo ?? 0) != request.ExpectedVersionNo)
                throw new ConflictException("production.thresholds_changed", "Ngưỡng của lô vừa được thay đổi. Vui lòng tải lại trước khi lưu.");
            if (current is not null && current.PhMin == request.PhMin && current.PhMax == request.PhMax
                && current.WaterTempMinC == request.WaterTempMinC && current.WaterTempMaxC == request.WaterTempMaxC
                && current.SalinityMinPpt == request.SalinityMinPpt && current.SalinityMaxPpt == request.SalinityMaxPpt)
                return ThresholdResponse(current);
            var version = new ProductionThresholdVersion
            {
                BatchId = batch.BatchId, VersionNo = checked((current?.VersionNo ?? 0) + 1),
                PhMin = request.PhMin!.Value, PhMax = request.PhMax!.Value,
                WaterTempMinC = request.WaterTempMinC!.Value, WaterTempMaxC = request.WaterTempMaxC!.Value,
                SalinityMinPpt = request.SalinityMinPpt!.Value, SalinityMaxPpt = request.SalinityMaxPpt!.Value,
                CreatedBy = me.UserId, CreatedAt = clock.GetUtcNow(),
            };
            db.ProductionThresholdVersions.Add(version);
            await db.SaveChangesAsync(ct);
            var result = ThresholdResponse(version);
            await audit.WriteAsync("production_threshold", version.ThresholdVersionId, "configure",
                current is null ? null : ThresholdResponse(current), result, version.CreatedAt, ct);
            return result;
        }, ct);
    }

    public async Task<ProductionLogResponse> RecordAsync(string code, ProductionLogRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        try
        {
            return await WriteAsync(async () =>
            {
                var member = await MemberAsync(false, ct);
                var batch = await LockBatchAsync(code, member.OperatorId, ct);
                if (!IsRecordingState(batch.Status))
                    throw new BusinessRuleException("production.invalid_state", "Chỉ ghi nhật ký cho lô đang nuôi hoặc đang thu hoạch.");
                var now = clock.GetUtcNow();
                var day = DateOnly.FromDateTime(now.ToOffset(VietnamOffset).DateTime);
                if (await db.ProductionLogs.AnyAsync(l => l.BatchId == batch.BatchId && l.LogDate == day && l.Source == "Manual", ct))
                    throw Duplicate();
                var threshold = await CurrentThresholdAsync(batch.BatchId, ct)
                    ?? throw new BusinessRuleException("production.thresholds_required", "Owner của Operator cần cấu hình ngưỡng cho lô trước khi ghi nhật ký.");
                var violations = Violations(request, threshold);
                var log = new ProductionLog
                {
                    Batch = batch, BatchId = batch.BatchId, LogDate = day, Source = "Manual",
                    Ph = request.Ph, WaterTempC = request.WaterTempC, SalinityPpt = request.SalinityPpt, FeedKg = request.FeedKg,
                    Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
                    PlausibilityFlag = violations.Count == 0 ? "Ok" : "OutOfRange",
                    ThresholdVersion = threshold, ThresholdVersionId = threshold.ThresholdVersionId,
                    RecordedBy = me.UserId, ReceivedAt = now, CreatedAt = now,
                };
                db.ProductionLogs.Add(log);
                // DB unique constraint is the final guard; do not raise an alert before insert succeeds.
                await db.SaveChangesAsync(ct);
                var result = LogResponse(log);
                await audit.WriteAsync("production_log", log.ProductionLogId, "record", null, result, now, ct);
                if (violations.Count > 0)
                    await alerts.RaiseAsync(batch.BatchId, AlertType.WaterQuality, AlertSeverity.Medium,
                        "Ngoài ngưỡng Operator cấu hình: " + string.Join("; ", violations), TimeSpan.FromHours(24), ct);
                return result;
            }, ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 } sql
            && sql.Message.Contains("ux_production_log_day", StringComparison.OrdinalIgnoreCase))
        {
            throw Duplicate();
        }
    }

    private async Task<T> WriteAsync<T>(Func<Task<T>> work, CancellationToken ct)
    {
        try
        {
            return await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                return await work();
            }, ct, IsolationLevel.Serializable);
        }
        catch { db.ChangeTracker.Clear(); throw; }
    }

    private async Task<OperatorMember> MemberAsync(bool owner, CancellationToken ct)
    {
        await RequireRoleAsync(Roles.OperatorMember, ct);
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User).SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);
        if (member is null || member.MemberRole is not ("Owner" or "Staff") || (me.OperatorId is { } claim && claim != member.OperatorId)) throw Denied();
        if (owner && member.MemberRole != "Owner")
            throw new ForbiddenException("production.owner_required", "Chỉ Owner của Operator được cấu hình ngưỡng.");
        return member;
    }

    private async Task<Batch> LockBatchAsync(string code, long operatorId, CancellationToken ct)
    {
        var farm = await db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {operatorId}")
            .AsNoTracking().SingleAsync(ct);
        if (farm.Status != "Approved")
            throw new BusinessRuleException("production.operator_not_approved", "Operator cần ở trạng thái Approved để ghi dữ liệu nuôi.");
        var batch = await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {code}").SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.OperatorId != operatorId) throw Denied();
        return batch;
    }

    private Task<ProductionThresholdVersion?> CurrentThresholdAsync(long batchId, CancellationToken ct)
        => db.ProductionThresholdVersions.Where(v => v.BatchId == batchId).OrderByDescending(v => v.VersionNo).FirstOrDefaultAsync(ct);

    private static List<string> Violations(ProductionLogRequest r, ProductionThresholdVersion v)
    {
        var messages = new List<string>();
        Check("pH", r.Ph!.Value, v.PhMin, v.PhMax, "");
        Check("Nhiệt độ", r.WaterTempC!.Value, v.WaterTempMinC, v.WaterTempMaxC, " °C");
        Check("Độ mặn", r.SalinityPpt!.Value, v.SalinityMinPpt, v.SalinityMaxPpt, " ppt");
        return messages;
        void Check(string label, decimal value, decimal min, decimal max, string unit)
        {
            if (value < min || value > max)
                messages.Add($"{label} {F(value)}{unit} (ngưỡng {F(min)}–{F(max)}{unit})");
        }
        static string F(decimal value) => value.ToString("0.#", CultureInfo.InvariantCulture);
    }

    private static ProductionThresholdResponse ThresholdResponse(ProductionThresholdVersion v)
        => new(v.ThresholdVersionId, v.VersionNo, v.PhMin, v.PhMax, v.WaterTempMinC, v.WaterTempMaxC, v.SalinityMinPpt, v.SalinityMaxPpt, v.CreatedBy, v.CreatedAt);
    private static ProductionLogResponse LogResponse(ProductionLog l)
        => new(l.ProductionLogId, l.Batch.BatchCode, l.LogDate, l.Ph, l.WaterTempC, l.SalinityPpt, l.FeedKg, l.Note, l.Source,
            l.PlausibilityFlag, l.RecordedBy, l.CreatedAt, l.ThresholdVersion?.VersionNo,
            l.ThresholdVersion is null ? null : ThresholdResponse(l.ThresholdVersion));
}
