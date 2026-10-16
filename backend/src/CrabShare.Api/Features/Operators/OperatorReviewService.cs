using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Operators;

public sealed class OperatorReviewService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit)
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
        => db.InTransactionAsync(() => DecideInTransactionAsync(id, action, capacity, reason, ct), ct);

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

        // Cùng thứ tự khoá với VI-04: audit trước, sau đó hộ nuôi; giữ tới commit/rollback.
        await audit.LockAsync(ct);
        var op = await db.Operators.SingleOrDefaultAsync(o => o.OperatorId == id, ct)
            ?? throw new NotFoundException("operator.not_found", "Không tìm thấy hộ nuôi.");
        if (op.Status != source)
            throw new BusinessRuleException("operator.invalid_transition", $"Chỉ được thực hiện {action} khi hộ nuôi ở trạng thái {source}.");

        var oldValue = Snapshot(op, null);
        // DATETIMEOFFSET(3): chuẩn hoá millisecond trước khi băm để đọc lại DB vẫn xác minh được.
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        op.Status = target;
        op.UpdatedAt = now;
        if (action == "approve")
        {
            op.ApprovedSlotCapacity = capacity!.Value;
            op.ApprovedAt = now;
            op.ApprovedBy = me.UserId;
        }
        await audit.WriteAsync("operator", id, action, oldValue, Snapshot(op, reason?.Trim()), now, ct);
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
