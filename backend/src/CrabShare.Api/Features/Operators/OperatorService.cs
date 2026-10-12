using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Operators;

public sealed class OperatorService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    public async Task<OperatorResponse> CreateAsync(OperatorProfileRequest req, CancellationToken ct)
    {
        var userId = me.UserId;
        await RequireActiveUserAsync(userId, ct);
        if (await db.OperatorMembers.AnyAsync(m => m.UserId == userId, ct))
            throw new ConflictException("operator.already_member", "Bạn đã thuộc một hộ nuôi.");

        var now = clock.GetUtcNow();
        var op = new Operator
        {
            LegalName = req.LegalName.Trim(), TaxCode = req.TaxCode.Trim(),
            BusinessRegNo = req.BusinessRegNo.Trim(), FarmAddress = req.FarmAddress.Trim(),
            Status = "Draft", CreatedAt = now, UpdatedAt = now,
        };
        op.OperatorMembers.Add(new OperatorMember
        {
            UserId = userId, MemberRole = "Owner", JoinedAt = now, CreatedAt = now,
        });
        db.Operators.Add(op);
        if (!await HasOperatorRoleAsync(userId, ct))
            db.AppUserRoles.Add(new AppUserRole
            {
                UserId = userId, RoleCode = Roles.OperatorMember, GrantedAt = now, CreatedAt = now,
            });

        // Một SaveChanges: EF Core bọc toàn bộ INSERT operator/member/role trong cùng transaction.
        // PK operator_member(user_id) chặn hai request tạo đồng thời; lỗi unique rollback cả ba bảng.
        await db.SaveChangesAsync(ct);
        return ToResponse(op, "Owner");
    }

    public async Task<OperatorResponse> GetMeAsync(CancellationToken ct)
    {
        var member = await RequireMembershipAsync(false, ct);
        return ToResponse(member.Operator, member.MemberRole);
    }

    public async Task<OperatorResponse> UpdateAsync(OperatorProfileRequest req, CancellationToken ct)
    {
        var member = await RequireMembershipAsync(true, ct);
        var now = clock.GetUtcNow();
        // Kiểm tra trạng thái ngay trong UPDATE để không sửa được hồ sơ vừa được request khác gửi.
        var changed = await db.Operators.Where(o => o.OperatorId == member.OperatorId &&
                (o.Status == "Draft" || o.Status == "Rejected"))
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.LegalName, req.LegalName.Trim())
                .SetProperty(o => o.TaxCode, req.TaxCode.Trim())
                .SetProperty(o => o.BusinessRegNo, req.BusinessRegNo.Trim())
                .SetProperty(o => o.FarmAddress, req.FarmAddress.Trim())
                .SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0)
            throw new BusinessRuleException("operator.not_editable", "Chỉ được sửa hồ sơ ở trạng thái Draft hoặc Rejected.");
        return await GetMeAsync(ct);
    }

    public async Task<OperatorResponse> SubmitAsync(CancellationToken ct)
    {
        var member = await RequireMembershipAsync(true, ct);
        if (member.MemberRole != "Owner")
            throw new ForbiddenException("operator.owner_required", "Chỉ chủ hộ nuôi được gửi hồ sơ.");
        if (member.Operator.Status != "Draft")
            throw new BusinessRuleException("operator.invalid_transition", "Chỉ được gửi hồ sơ ở trạng thái Draft.");

        var now = clock.GetUtcNow();
        // Điều kiện dữ liệu nằm trong cùng câu UPDATE, tránh gửi dữ liệu bị thay đổi giữa kiểm tra và lưu.
        var changed = await db.Operators.Where(o => o.OperatorId == member.OperatorId && o.Status == "Draft" &&
                o.LegalName.Trim() != "" && o.TaxCode.Trim() != "" && o.BusinessRegNo.Trim() != "" && o.FarmAddress.Trim() != "")
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Submitted")
                .SetProperty(o => o.SubmittedAt, now).SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0)
            throw new BusinessRuleException("operator.cannot_submit", "Hồ sơ phải ở trạng thái Draft và có đủ tên pháp nhân, mã số thuế, số đăng ký kinh doanh, địa chỉ trại.");
        return await GetMeAsync(ct);
    }

    private async Task<OperatorMember> RequireMembershipAsync(bool forWrite, CancellationToken ct)
    {
        var userId = me.UserId;
        await RequireActiveUserAsync(userId, ct);
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.Operator)
            .SingleOrDefaultAsync(m => m.UserId == userId, ct);
        if (member is null)
        {
            if (forWrite) throw new ForbiddenException("operator.membership_required", "Bạn chưa thuộc hộ nuôi nào.");
            throw new NotFoundException("operator.not_found", "Bạn chưa đăng ký hồ sơ hộ nuôi.");
        }
        if (!await HasOperatorRoleAsync(userId, ct) || member.MemberRole is not ("Owner" or "Staff"))
            throw new ForbiddenException("operator.access_denied", "Bạn không có quyền truy cập hồ sơ hộ nuôi.");
        return member;
    }

    private async Task RequireActiveUserAsync(long userId, CancellationToken ct)
    {
        if (!await db.AppUsers.AnyAsync(u => u.UserId == userId && u.Status == "Active", ct))
            throw new ForbiddenException("operator.access_denied", "Tài khoản không có quyền thao tác.");
    }

    private Task<bool> HasOperatorRoleAsync(long userId, CancellationToken ct)
        => db.AppUserRoles.AnyAsync(r => r.UserId == userId && r.RoleCode == Roles.OperatorMember, ct);

    private static OperatorResponse ToResponse(Operator op, string memberRole)
        => new(op.OperatorId, op.LegalName, op.TaxCode, op.BusinessRegNo, op.FarmAddress, op.Status,
            op.SubmittedAt, memberRole, op.Status is "Draft" or "Rejected", memberRole == "Owner" && op.Status == "Draft");
}
