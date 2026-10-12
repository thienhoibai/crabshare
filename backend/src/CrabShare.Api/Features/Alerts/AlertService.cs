using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Alerts;

public sealed partial class AlertService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    /// <summary>Hàm nội bộ dùng chung; tham gia transaction của caller nếu có. Caller phải khóa
    /// AuditChain trước khi đọc/sửa nghiệp vụ để cùng thứ tự khóa với CS-25.</summary>
    public Task<AlertResponse> RaiseAsync(long batchId, AlertType type, AlertSeverity severity, string message,
        TimeSpan ackWithin, CancellationToken ct = default)
    {
        if (!Enum.IsDefined(type) || !Enum.IsDefined(severity) || string.IsNullOrWhiteSpace(message)
            || message.Trim().Length > 300 || ackWithin <= TimeSpan.Zero || ackWithin > TimeSpan.FromDays(30))
            throw new AppException(400, "alerts.invalid_input", "Loại, mức độ, nội dung hoặc hạn phản hồi cảnh báo không hợp lệ.");
        return TransactionAsync(async previous =>
        {
            var batch = await db.Batches.Include(b => b.Operator).SingleOrDefaultAsync(b => b.BatchId == batchId, ct)
                ?? throw new NotFoundException("alerts.batch_not_found", "Không tìm thấy lô nuôi.");
            var kind = type.ToString();
            var alert = await db.Alerts.Where(a => a.BatchId == batchId && a.AlertType == kind && (a.Status == "Open" || a.Status == "Escalated"))
                .OrderByDescending(a => a.AlertId).FirstOrDefaultAsync(ct);
            var old = alert is null ? null : Snapshot(alert);
            var now = Now();
            var deadline = now.Add(ackWithin);
            var action = alert is null ? "RaiseAlert" : "UpdateAlert";
            if (alert is null)
            {
                alert = new Alert { Batch = batch, BatchId = batchId, AlertType = kind, Severity = severity.ToString(),
                    Message = message.Trim(), Status = "Open", RaisedAt = now, AckDeadline = deadline, CreatedAt = now, UpdatedAt = now };
                db.Alerts.Add(alert);
            }
            else
            {
                // Không hạ mức độ hoặc kéo dài hạn: phát sinh lặp không được trì hoãn leo thang.
                alert.Message = message.Trim();
                if ((int)severity > (int)Enum.Parse<AlertSeverity>(alert.Severity)) alert.Severity = severity.ToString();
                if (deadline < alert.AckDeadline) alert.AckDeadline = deadline;
                if (old == Snapshot(alert)) return Response(alert);
                alert.UpdatedAt = now;
            }
            await db.SaveChangesAsync(ct);
            AppendAudit(alert, action, old, previous);
            await db.SaveChangesAsync(ct);
            return Response(alert);
        }, ct);
    }

    public async Task<IReadOnlyList<AlertResponse>> ListMineAsync(string? status, CancellationToken ct)
    {
        var operatorId = await RequireOperatorAsync(ct);
        return await ReadAsync(db.Alerts.Where(a => a.Batch.OperatorId == operatorId), status, ct);
    }

    public async Task<IReadOnlyList<AlertResponse>> ListInvestorAsync(string code, string? status, CancellationToken ct)
    {
        await RequireRoleAsync(Roles.Investor, ct);
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
            ?? throw new NotFoundException("alerts.batch_not_found", "Không tìm thấy lô nuôi.");
        if (!await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId, ct)
            && !await db.Contributions.AnyAsync(c => c.BatchId == batch.BatchId && c.InvestorId == me.UserId && c.Status == "Confirmed", ct))
            throw Denied();
        return await ReadAsync(db.Alerts.Where(a => a.BatchId == batch.BatchId), status, ct);
    }

    public Task<AlertResponse> AcknowledgeAsync(long id, string note, CancellationToken ct)
    {
        ValidateNote(note);
        return TransactionAsync(async previous =>
        {
            var operatorId = await RequireOperatorAsync(ct);
            var alert = await db.Alerts.Include(a => a.Batch).ThenInclude(b => b.Operator)
                .SingleOrDefaultAsync(a => a.AlertId == id && a.Batch.OperatorId == operatorId, ct) ?? throw Missing();
            if (alert.Status is not ("Open" or "Escalated") || alert.AcknowledgedAt is not null)
                throw new ConflictException("alerts.status_changed", "Cảnh báo đã được phản hồi hoặc đóng. Vui lòng tải lại.");
            var old = Snapshot(alert);
            var now = Now();
            // Phản hồi muộn vẫn phải được quản trị theo dõi, kể cả job chưa chạy.
            if (alert.Status == "Escalated" || alert.AckDeadline < now)
            { alert.Status = "Escalated"; alert.EscalatedAt ??= now; }
            else alert.Status = "Acknowledged";
            alert.ResponseNote = note.Trim(); alert.AcknowledgedAt = now; alert.AcknowledgedBy = me.UserId; alert.UpdatedAt = now;
            AppendAudit(alert, "AcknowledgeAlert", old, previous);
            await db.SaveChangesAsync(ct);
            return Response(alert);
        }, ct);
    }

    private async Task<IReadOnlyList<AlertResponse>> ReadAsync(IQueryable<Alert> query, string? status, CancellationToken ct)
    {
        if (status is not null) query = query.Where(a => a.Status == status);
        var list = await query.AsNoTracking().Include(a => a.Batch).ThenInclude(b => b.Operator)
            .OrderByDescending(a => a.RaisedAt).ThenByDescending(a => a.AlertId).ToListAsync(ct);
        return list.Select(Response).ToList();
    }

    private async Task<long> RequireOperatorAsync(CancellationToken ct)
    {
        await RequireRoleAsync(Roles.OperatorMember, ct);
        var member = await db.OperatorMembers.AsNoTracking().SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);
        if (member is null || (me.OperatorId is { } claimed && claimed != member.OperatorId)) throw Denied();
        return member.OperatorId;
    }

    private async Task RequireRoleAsync(string role, CancellationToken ct)
    {
        if (!me.IsInRole(role) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active", ct)
            || !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == role, ct)) throw Denied();
    }

    internal Task<T> TransactionAsync<T>(Func<string?, Task<T>> action, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null) return Participate();
        return db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            try
            {
                var value = await Participate();
                await transaction.CommitAsync(ct);
                return value;
            }
            catch { await transaction.RollbackAsync(CancellationToken.None); db.ChangeTracker.Clear(); throw; }
        });
        async Task<T> Participate() => await action(await AuditChain.LockAndReadTailAsync(db, ct));
    }

    private void AppendAudit(Alert alert, string action, string? old, string? previous, string? resolutionNote = null)
    {
        var audit = new AuditLog { EntityType = "Alert", EntityId = alert.AlertId, ActionType = action,
            OldValue = old, NewValue = resolutionNote is null ? Snapshot(alert) : AuditChain.Snapshot(new {
                alert.BatchId, alert.AlertType, alert.Severity, alert.Message, alert.Status, alert.RaisedAt,
                alert.AckDeadline, alert.AcknowledgedAt, alert.AcknowledgedBy, alert.ResponseNote, alert.EscalatedAt, ResolutionNote = resolutionNote }),
            ActorUserId = me.IsAuthenticated ? me.UserId : null,
            OccurredAt = Now(), PrevHash = previous };
        audit.RowHash = AuditChain.Hash(audit); db.AuditLogs.Add(audit);
    }
    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
    private static string Snapshot(Alert a) => AuditChain.Snapshot(new { a.BatchId, a.AlertType, a.Severity, a.Message, a.Status,
        a.RaisedAt, a.AckDeadline, a.AcknowledgedAt, a.AcknowledgedBy, a.ResponseNote, a.EscalatedAt });
    private static AlertResponse Response(Alert a) => new(a.AlertId, a.Batch.BatchCode, a.Batch.Operator.LegalName,
        a.AlertType, a.Severity, a.Message, a.RaisedAt, a.AckDeadline, a.Status, a.AcknowledgedAt, a.AcknowledgedBy, a.ResponseNote, a.EscalatedAt);
    private static ForbiddenException Denied() => new("alerts.access_denied", "Bạn không có quyền truy cập cảnh báo này.");
    private static NotFoundException Missing() => new("alerts.not_found", "Không tìm thấy cảnh báo của hộ nuôi.");
    private static void ValidateNote(string note)
    {
        if (string.IsNullOrWhiteSpace(note) || note.Length > 300)
            throw new AppException(400, "alerts.note_required", "Ghi chú xử lý phải có từ 1 đến 300 ký tự.");
    }
}
