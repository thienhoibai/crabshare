using System.Data;
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

public sealed partial class SlotEventService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, AlertService alerts)
{
    private static readonly TimeSpan Vietnam = TimeSpan.FromHours(7);
    private DateOnly BusinessDate(DateTimeOffset value) => DateOnly.FromDateTime(value.ToOffset(Vietnam).DateTime);
    private static bool RecordingState(string state) => state is "Stocked" or "InProduction" or "Harvesting";
    private static bool ConfigurationState(string state) => state is "Draft" or "PendingApproval" or "Funding" or "Stocked" or "InProduction" or "Harvesting";
    private static ForbiddenException Denied() => new("slot_events.access_denied", "Bạn không có quyền ghi sự kiện cho hộ nuôi/lô này.");
    private static BusinessRuleException Rule(string suffix, string message) => new("slot_events." + suffix, message);
    private static ConflictException Changed(string message = "Hộp hoặc cá thể vừa thay đổi. Vui lòng tải lại trước khi ghi sự kiện.") => new("slot_events.conflict", message);

    private async Task<OperatorMember> MemberAsync(bool owner, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.OperatorMember)) throw Denied();
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User).SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);
        if (member is null || member.User.Status != "Active" || member.MemberRole is not ("Owner" or "Staff")
            || (me.OperatorId is { } claimed && claimed != member.OperatorId)
            || !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == Roles.OperatorMember, ct)) throw Denied();
        if (owner && member.MemberRole != "Owner") throw new ForbiddenException("slot_events.owner_required", "Chỉ chủ hộ nuôi được cấu hình quy tắc cho lô.");
        return member;
    }

    private async Task<Batch> BatchAsync(string code, long operatorId, bool write, CancellationToken ct)
    {
        if (write)
        {
            var farm = await db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH (UPDLOCK,HOLDLOCK) WHERE operator_id = {operatorId}")
                .AsNoTracking().SingleAsync(ct);
            if (farm.Status != "Approved") throw Rule("operator_not_approved", "Hộ nuôi cần được duyệt để ghi dữ liệu.");
        }
        var batch = write
            ? await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK,HOLDLOCK) WHERE batch_code = {code}").SingleOrDefaultAsync(ct)
            : await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct);
        if (batch is null) throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.OperatorId != operatorId) throw Denied();
        return batch;
    }

    private async Task<T> WriteAsync<T>(Func<Task<T>> work, CancellationToken ct)
    {
        try
        {
            return await db.InTransactionAsync(async () => { await audit.LockAsync(ct); return await work(); }, ct, IsolationLevel.Serializable);
        }
        catch (Exception ex) when (SqlConflict(ex))
        { db.ChangeTracker.Clear(); throw Changed(); }
        catch { db.ChangeTracker.Clear(); throw; }
    }
    private static bool SqlConflict(Exception ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
            if (current is SqlException { Number: 2601 or 2627 or 1205 or 1222 }) return true;
        return ex is DbUpdateConcurrencyException;
    }

    private Task<SlotEventPolicyVersion?> CurrentPolicyAsync(long batchId, CancellationToken ct)
        => db.SlotEventPolicies.Where(p => p.BatchId == batchId).OrderByDescending(p => p.VersionNo).FirstOrDefaultAsync(ct);

    private DateOnly? Deadline(Batch batch, SlotEventPolicyVersion? policy)
    {
        if (batch.StockedAt is null || policy is null) return null;
        var stocked = BusinessDate(batch.StockedAt.Value);
        // Use the declared cycle, rather than an editable/unset estimated date, for a reproducible cutoff.
        return policy.RestockCutoffBasis == "AfterStocking"
            ? stocked.AddDays(policy.RestockCutoffDays)
            : stocked.AddDays(batch.CycleDays - policy.RestockCutoffDays);
    }
    private static SlotEventPolicyResponse PolicyResponse(SlotEventPolicyVersion p)
        => new(p.PolicyVersionId, p.VersionNo, p.RestockCutoffBasis, p.RestockCutoffDays, p.MortalityWindowHours,
            p.MortalityThresholdPercent, p.MortalitySeverity, p.MortalityAckWithinHours, p.CreatedBy, p.CreatedAt);

    public async Task<SlotEventPolicyState> PolicyAsync(string code, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var batch = await BatchAsync(code, member.OperatorId, false, ct);
        var policy = await CurrentPolicyAsync(batch.BatchId, ct);
        var approved = await db.Operators.AnyAsync(o => o.OperatorId == member.OperatorId && o.Status == "Approved", ct);
        return new(batch.BatchCode, approved && member.MemberRole == "Owner" && ConfigurationState(batch.Status),
            policy is null ? null : PolicyResponse(policy), Deadline(batch, policy), batch.RestockCutoffDays, BusinessDate(clock.GetUtcNow()));
    }

    public Task<SlotEventPolicyResponse> ConfigureAsync(string code, SlotEventPolicyRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        return WriteAsync(async () =>
        {
            var member = await MemberAsync(true, ct);
            var batch = await BatchAsync(code, member.OperatorId, true, ct);
            if (!ConfigurationState(batch.Status)) throw Rule("invalid_state", "Trạng thái lô không cho phép cấu hình quy tắc.");
            if (request.RestockCutoffBasis == "BeforeHarvest" && request.RestockCutoffDays > batch.CycleDays)
                throw Rule("invalid_cutoff", "Số ngày tối thiểu trước thu hoạch không được lớn hơn chu kỳ lô.");
            var current = await CurrentPolicyAsync(batch.BatchId, ct);
            if (request.ExpectedVersionNo != (current?.VersionNo ?? 0))
                throw new ConflictException("slot_events.policy_changed", "Quy tắc vừa được thay đổi. Vui lòng tải lại trước khi lưu.");
            if (current?.VersionNo == int.MaxValue) throw Rule("version_limit", "Đã đạt giới hạn phiên bản quy tắc.");
            var policy = new SlotEventPolicyVersion
            {
                BatchId = batch.BatchId, VersionNo = (current?.VersionNo ?? 0) + 1,
                RestockCutoffBasis = request.RestockCutoffBasis, RestockCutoffDays = request.RestockCutoffDays,
                MortalityWindowHours = request.MortalityWindowHours, MortalityThresholdPercent = request.MortalityThresholdPercent,
                MortalitySeverity = request.MortalitySeverity, MortalityAckWithinHours = request.MortalityAckWithinHours,
                CreatedBy = me.UserId, CreatedAt = clock.GetUtcNow(),
            };
            db.SlotEventPolicies.Add(policy);
            await db.SaveChangesAsync(ct);
            var response = PolicyResponse(policy);
            await audit.WriteAsync("slot_event_policy", policy.PolicyVersionId, "configure", current is null ? null : PolicyResponse(current), response, ct);
            return response;
        }, ct);
    }
}
