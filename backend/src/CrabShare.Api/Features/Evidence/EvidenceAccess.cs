using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Evidence;

public sealed class EvidenceAccess(AppDbContext db, ICurrentUser me)
{
    public async Task<long> RequireOperatorAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.OperatorMember) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active", ct)
            || !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == Roles.OperatorMember, ct)) throw Denied();
        var member = await db.OperatorMembers.AsNoTracking().SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);
        if (member is null || (me.OperatorId is { } claimed && claimed != member.OperatorId)) throw Denied();
        return member.OperatorId;
    }
    private static ForbiddenException Denied() => new("evidence.access_denied", "Bạn không có quyền gửi bằng chứng cho hộ nuôi này.");
}
