using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CrabShare.Api.Features.Operators;

public sealed class OperatorReviewService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    public async Task<PagedResult<AdminOperatorResponse>> ListAsync(OperatorListQuery filter, PageQuery paging, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var query = db.Operators.AsNoTracking();
        if (filter.Status is not null) query = query.Where(o => o.Status == filter.Status);
        return await query.OrderBy(o => o.SubmittedAt).ThenBy(o => o.OperatorId)
            .Select(o => new AdminOperatorResponse(o.OperatorId, o.LegalName, o.TaxCode, o.BusinessRegNo,
                o.FarmAddress, o.Status, o.ApprovedSlotCapacity, o.SubmittedAt, o.ApprovedAt, o.ApprovedBy))
            .ToPagedAsync(paging, ct);
    }

    public Task<AdminOperatorResponse> DecideAsync(long id, string action, int? capacity, string? reason, CancellationToken ct)
        => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            return await DecideInTransactionAsync(id, action, capacity, reason, ct);
        });

    private async Task<AdminOperatorResponse> DecideInTransactionAsync(long id, string action, int? capacity, string? reason, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var (source, target) = action switch
        {
            "approve" => ("Submitted", "Approved"),
            "reject" => ("Submitted", "Rejected"),
            "suspend" => ("Approved", "Suspended"),
            _ => throw new ArgumentOutOfRangeException(nameof(action)),
        };
        if (action == "approve" && (capacity is null || capacity < 0))
            throw new BusinessRuleException("operator.invalid_capacity", "Sức chứa phải là số nguyên không âm.");
        if (action != "approve" && string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("operator.reason_required", "Vui lòng nhập lý do.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Điểm tích hợp TH-02: tái sử dụng audit_log. Khoá bảng trước khi đọc đầu chuỗi,
        // kể cả chuỗi rỗng; giữ tới commit để các quyết định đồng thời không tạo nhánh hash.
        // Mọi writer TH-02 sau này phải tuân theo cùng giao thức chuỗi và transaction.
        var previous = await db.AuditLogs.FromSqlRaw(
            "SELECT TOP (1) * FROM dbo.audit_log WITH (TABLOCKX, HOLDLOCK) ORDER BY audit_id DESC")
            .AsNoTracking().ToListAsync(ct);
        var op = await db.Operators.SingleOrDefaultAsync(o => o.OperatorId == id, ct)
            ?? throw new NotFoundException("operator.not_found", "Không tìm thấy hộ nuôi.");
        if (op.Status != source)
            throw new BusinessRuleException("operator.invalid_transition", $"Chỉ được thực hiện {action} khi hộ nuôi ở trạng thái {source}.");

        var oldValue = Snapshot(op, null);
        // DATETIMEOFFSET(3): chuẩn hoá millisecond trước khi băm để đọc lại DB vẫn xác minh được.
        var instant = clock.GetUtcNow();
        var now = new DateTimeOffset(instant.Ticks - instant.Ticks % TimeSpan.TicksPerMillisecond, TimeSpan.Zero);
        op.Status = target;
        op.UpdatedAt = now;
        if (action == "approve")
        {
            op.ApprovedSlotCapacity = capacity!.Value;
            op.ApprovedAt = now;
            op.ApprovedBy = me.UserId;
        }
        var audit = new AuditLog
        {
            EntityType = "operator", EntityId = id, ActionType = action,
            OldValue = oldValue, NewValue = Snapshot(op, reason?.Trim()),
            ActorUserId = me.UserId, OccurredAt = now, PrevHash = previous.SingleOrDefault()?.RowHash,
        };
        var content = JsonSerializer.Serialize(new
        {
            entityType = audit.EntityType, entityId = audit.EntityId, actionType = audit.ActionType,
            oldValue = audit.OldValue, newValue = audit.NewValue,
            actorUserId = audit.ActorUserId, occurredAt = audit.OccurredAt,
        });
        audit.RowHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((audit.PrevHash ?? "") + content)));
        db.AuditLogs.Add(audit);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(op.OperatorId, op.LegalName, op.TaxCode, op.BusinessRegNo, op.FarmAddress,
            op.Status, op.ApprovedSlotCapacity, op.SubmittedAt, op.ApprovedAt, op.ApprovedBy);
    }

    private static string Snapshot(Operator op, string? reason) => JsonSerializer.Serialize(new
    { status = op.Status, approvedSlotCapacity = op.ApprovedSlotCapacity, approvedBy = op.ApprovedBy, approvedAt = op.ApprovedAt, reason });

    private async Task RequireAdminAsync(CancellationToken ct)
    {
        var userId = me.UserId;
        if (!await db.AppUsers.AnyAsync(u => u.UserId == userId && u.Status == "Active" &&
                u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct))
            throw new ForbiddenException("operator.admin_required", "Chỉ quản trị viên đang có quyền mới được xét duyệt hộ nuôi.");
    }
}
