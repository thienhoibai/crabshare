using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using HarvestSession = CrabShare.Api.Infrastructure.Persistence.Entities.Harvest;

namespace CrabShare.Api.Features.Harvest;

public sealed partial class HarvestService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit,
    IHarvestTagCodeGenerator tagCodes)
{
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string Hash(object value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value))));
    private static bool RecordingState(string status) => status == "Harvesting";
    private static BusinessRuleException Rule(string suffix, string message) => new("harvest." + suffix, message);
    private static ConflictException Conflict(string suffix = "concurrent_change", string message = "Dữ liệu thu hoạch vừa thay đổi. Vui lòng tải lại.") => new("harvest." + suffix, message);
    private static ForbiddenException Denied() => new("harvest.access_denied", "Bạn không có quyền trên hộ nuôi/lô này.");

    private async Task<OperatorMember> MemberAsync(bool owner, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.OperatorMember)) throw Denied();
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User).SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);
        if (member is null || member.User.Status != "Active" || member.MemberRole is not ("Owner" or "Staff")
            || (me.OperatorId is { } claimed && claimed != member.OperatorId)
            || !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == Roles.OperatorMember, ct)) throw Denied();
        if (owner && member.MemberRole != "Owner") throw new ForbiddenException("harvest.owner_required", "Chỉ chủ hộ nuôi được mở, sửa hoặc chốt đợt thu hoạch.");
        return member;
    }

    private async Task<Batch> BatchAsync(string code, long operatorId, bool write, CancellationToken ct)
    {
        if (write)
        {
            var farm = await db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH (UPDLOCK,HOLDLOCK) WHERE operator_id = {operatorId}")
                .AsNoTracking().SingleAsync(ct);
            if (farm.Status != "Approved") throw Rule("operator_not_approved", "Hộ nuôi cần được duyệt để thu hoạch.");
        }
        var batch = write
            ? await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK,HOLDLOCK) WHERE batch_code = {code}").SingleOrDefaultAsync(ct)
            : await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct);
        if (batch is null) throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.OperatorId != operatorId) throw Denied();
        return batch;
    }

    private async Task<(HarvestSession Session, Batch Batch)> SessionAsync(long id, long operatorId, bool write, CancellationToken ct)
    {
        var code = await db.Harvests.Where(h => h.HarvestId == id).Select(h => h.Batch.BatchCode).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("harvest.not_found", "Không tìm thấy đợt thu hoạch.");
        var batch = await BatchAsync(code, operatorId, write, ct);
        var session = write
            ? await db.Harvests.FromSqlInterpolated($"SELECT * FROM dbo.harvest WITH (UPDLOCK,HOLDLOCK) WHERE harvest_id = {id}").SingleAsync(ct)
            : await db.Harvests.AsNoTracking().SingleAsync(h => h.HarvestId == id, ct);
        return (session, batch);
    }

    private async Task<T> WriteAsync<T>(Func<Task<T>> action, CancellationToken ct)
    {
        try { return await db.InTransactionAsync(async () => { await audit.LockAsync(ct); return await action(); }, ct, IsolationLevel.Serializable); }
        catch (Exception ex) when (SqlNumber(ex) is 2601 or 2627 or 1205 or 1222 || ex is DbUpdateConcurrencyException)
        { db.ChangeTracker.Clear(); throw Conflict(); }
        catch { db.ChangeTracker.Clear(); throw; }
    }
    private static int? SqlNumber(Exception ex)
    {
        for (Exception? inner = ex; inner is not null; inner = inner.InnerException) if (inner is SqlException sql) return sql.Number;
        return null;
    }
    private static bool TagCollision(Exception ex) => SqlNumber(ex) is 2601 or 2627 && ex.ToString().Contains("uq_crab_tag_tag_code", StringComparison.Ordinal);
    private static void EnsureOpen(HarvestSession session, Batch batch)
    {
        if (session.LifecycleStatus != "Open" || !RecordingState(batch.Status))
            throw Rule("invalid_state", "Chỉ ghi nhận vào đợt đang mở của lô Harvesting. Đợt lịch sử hoặc đã chốt chỉ được xem.");
    }

    public Task<HarvestWriteResult<HarvestResponse>> StartAsync(string code, StartHarvestRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        var name = Clean(request.Name); var note = Clean(request.Note);
        var hash = Hash(new { name, note });
        return WriteAsync(async () =>
        {
            var member = await MemberAsync(true, ct);
            var batch = await BatchAsync(code, member.OperatorId, true, ct);
            var previous = await db.HarvestStartRequests.AsNoTracking().SingleOrDefaultAsync(r => r.RequestId == request.RequestId, ct);
            if (previous is not null)
            {
                if (previous.BatchId != batch.BatchId || previous.ActorId != me.UserId || previous.RequestHash != hash) throw Conflict("request_reused", "Mã yêu cầu đã được dùng với nội dung khác.");
                var replay = await db.Harvests.SingleAsync(h => h.HarvestId == previous.HarvestId, ct);
                return new HarvestWriteResult<HarvestResponse>(Response(replay, batch, member, true), false);
            }
            if (batch.Status is not ("InProduction" or "Harvesting")) throw Rule("invalid_state", "Chỉ bắt đầu thu hoạch lô đang nuôi hoặc đang thu hoạch.");
            var session = await db.Harvests.SingleOrDefaultAsync(h => h.BatchId == batch.BatchId && h.LifecycleStatus == "Open", ct);
            var created = session is null;
            var now = AuditChain.Timestamp(clock.GetUtcNow());
            if (session is null)
            {
                session = new HarvestSession { BatchId = batch.BatchId, Name = name, Note = note, LifecycleStatus = "Open", RevisionNo = 1,
                    HarvestedAt = now, CreatedAt = now, DeclaredBy = me.UserId };
                db.Harvests.Add(session);
                if (batch.Status == "InProduction")
                {
                    batch.Status = "Harvesting"; batch.HarvestStartedAt ??= now; batch.UpdatedAt = now;
                    await audit.WriteAsync("batch", batch.BatchId, "start_harvest", new { status = "InProduction" }, new { status = "Harvesting", batch.HarvestStartedAt }, now, ct);
                }
                else if (batch.HarvestStartedAt is null)
                {
                    // Legacy Harvesting rows have no reliable first-start timestamp. Preserve unknown rather than invent history.
                    batch.UpdatedAt = now;
                }
                await db.SaveChangesAsync(ct);
            }
            db.HarvestStartRequests.Add(new HarvestStartRequestLog { RequestId = request.RequestId, HarvestId = session.HarvestId,
                BatchId = batch.BatchId, ActorId = me.UserId, RequestHash = hash, CreatedAt = now });
            var response = Response(session, batch, member, true);
            await audit.WriteAsync("harvest", session.HarvestId, created ? "start" : "continue", null, response, now, ct);
            return new HarvestWriteResult<HarvestResponse>(response, created);
        }, ct);
    }

    public Task<HarvestResponse> UpdateAsync(long id, UpdateHarvestRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        return WriteAsync(async () =>
        {
            var member = await MemberAsync(true, ct); var (session, batch) = await SessionAsync(id, member.OperatorId, true, ct);
            EnsureOpen(session, batch);
            if (session.RevisionNo != request.ExpectedRevision) throw Conflict("harvest_changed");
            var before = Response(session, batch, member, true);
            session.Name = Clean(request.Name); session.Note = Clean(request.Note); session.RevisionNo = checked(session.RevisionNo + 1);
            var response = Response(session, batch, member, true);
            await audit.WriteAsync("harvest", id, "update", before, response, ct); return response;
        }, ct);
    }

    public Task<HarvestResponse> CompleteAsync(long id, CompleteHarvestRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        return WriteAsync(async () =>
        {
            var member = await MemberAsync(true, ct); var (session, batch) = await SessionAsync(id, member.OperatorId, true, ct);
            if (session.LifecycleStatus == "Completed") return Response(session, batch, member, true);
            EnsureOpen(session, batch);
            if (session.RevisionNo != request.ExpectedRevision) throw Conflict("harvest_changed");
            var before = Response(session, batch, member, true);
            session.LifecycleStatus = "Completed"; session.CompletedAt = AuditChain.Timestamp(clock.GetUtcNow()); session.CompletedBy = me.UserId;
            session.RevisionNo = checked(session.RevisionNo + 1);
            var response = Response(session, batch, member, true);
            await audit.WriteAsync("harvest", id, "complete", before, response, ct); return response;
        }, ct);
    }
}
