using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Accounts;

public sealed class AdminAccountService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    public async Task<PagedResult<AdminUserResponse>> ListUsersAsync(AdminUserQuery filter, PageQuery paging, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var query = db.AppUsers.AsNoTracking();
        if (filter.Role is not null) query = query.Where(u => u.AppUserRoles.Any(r => r.RoleCode == filter.Role));
        if (filter.Status is not null) query = query.Where(u => u.Status == filter.Status);
        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var text = filter.Q.Trim();
            var id = long.TryParse(text, out var parsed) ? parsed : -1;
            query = query.Where(u => u.UserId == id || u.FullName.Contains(text) || u.Email.Contains(text) || (u.Phone != null && u.Phone.Contains(text)));
        }
        return await query.OrderByDescending(u => u.UserId).Select(u => new AdminUserResponse(u.UserId, u.FullName, u.Email, u.Phone,
            u.Status, u.AppUserRoles.OrderBy(r => r.RoleCode).Select(r => r.RoleCode).ToList(),
            u.Investor == null ? null : u.Investor.VerificationStatus, u.CreatedAt, u.LastLoginAt)).ToPagedAsync(paging, ct);
    }

    public async Task<AdminUserDetailResponse> GetUserAsync(long id, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var user = await db.AppUsers.AsNoTracking().Include(u => u.AppUserRoles).Include(u => u.Investor)
            .SingleOrDefaultAsync(u => u.UserId == id, ct) ?? throw MissingUser();
        var checks = await db.KycChecks.AsNoTracking().Include(c => c.User).ThenInclude(u => u.Investor)
            .Where(c => c.UserId == id).OrderByDescending(c => c.CheckedAt).ThenByDescending(c => c.KycCheckId).ToListAsync(ct);
        var latestId = checks.FirstOrDefault(c => c.CheckType == "EkycIdFace")?.KycCheckId;
        return new(User(user), user.Investor?.VerifiedAt, checks.Select(c => Check(c, latestId)).ToList());
    }

    public async Task<PagedResult<AdminKycResponse>> ListChecksAsync(AdminKycQuery filter, PageQuery paging, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var query = db.KycChecks.AsNoTracking();
        if (filter.Result is not null) query = query.Where(c => c.Result == filter.Result);
        if (filter.CheckType is not null) query = query.Where(c => c.CheckType == filter.CheckType);
        return await query.OrderByDescending(c => c.CheckedAt).ThenByDescending(c => c.KycCheckId)
            .Select(c => new AdminKycResponse(c.KycCheckId, c.UserId, c.User.FullName, c.User.Email, c.CheckType, c.Result,
                c.ProviderRef, c.ConsentAt, c.CheckedAt, c.FailureReason, c.ReviewedBy,
                c.UserId != me.UserId && c.CheckType == "EkycIdFace" && c.Result == "Failed" && c.ConsentAt != null && c.User.Status == "Active"
                && c.User.Investor != null && c.User.Investor.VerificationStatus != "Verified"
                && c.KycCheckId == db.KycChecks.Where(k => k.UserId == c.UserId && k.CheckType == "EkycIdFace")
                    .OrderByDescending(k => k.CheckedAt).ThenByDescending(k => k.KycCheckId).Select(k => k.KycCheckId).First()))
            .ToPagedAsync(paging, ct);
    }

    public Task<AdminUserResponse> SetLockedAsync(long id, bool locked, string reason, CancellationToken ct)
        => TransactionAsync(async () =>
        {
            await RequireAdminAsync(ct);
            if (id == me.UserId) throw new ForbiddenException("users.cannot_lock_self", "Không thể khoá hoặc mở khoá chính tài khoản đang quản trị.");
            var user = await db.AppUsers.FromSqlInterpolated($"SELECT * FROM dbo.app_user WITH (UPDLOCK, HOLDLOCK) WHERE user_id = {id}")
                .Include(u => u.AppUserRoles).Include(u => u.Investor).SingleOrDefaultAsync(ct) ?? throw MissingUser();
            if (locked == (user.Status == "Locked"))
                throw new ConflictException("users.status_changed", "Trạng thái tài khoản đã thay đổi. Vui lòng tải lại.");
            var old = JsonSerializer.Serialize(new { user.Status });
            var target = "Locked";
            if (!locked)
            {
                // Khôi phục PendingVerification nếu lần khoá trước bắt đầu từ trạng thái này.
                var previous = await db.AuditLogs.AsNoTracking().Where(a => a.EntityType == "AppUser" && a.EntityId == id && a.ActionType == "LockUser")
                    .OrderByDescending(a => a.AuditId).Select(a => a.OldValue).FirstOrDefaultAsync(ct);
                if (previous is not null)
                {
                    using var snapshot = JsonDocument.Parse(previous);
                    target = snapshot.RootElement.GetProperty("Status").GetString() == "PendingVerification" ? "PendingVerification" : "Active";
                }
                else target = "Active";
            }
            var now = Now();
            user.Status = target; user.UpdatedAt = now;
            await AppendAuditAsync("AppUser", id, locked ? "LockUser" : "UnlockUser", old, JsonSerializer.Serialize(new { user.Status, Reason = reason.Trim() }), now, ct);
            await db.SaveChangesAsync(ct);
            return User(user);
        }, ct);

    public Task<AdminKycResponse> ApproveExceptionAsync(long id, string reason, CancellationToken ct)
        => TransactionAsync(async () =>
        {
            await RequireAdminAsync(ct);
            var candidate = await db.KycChecks.AsNoTracking().SingleOrDefaultAsync(c => c.KycCheckId == id, ct)
                ?? throw new NotFoundException("kyc.check_not_found", "Không tìm thấy lần xác minh.");
            if (candidate.UserId == me.UserId) throw new ForbiddenException("kyc.cannot_approve_self", "Không được tự duyệt ngoại lệ danh tính của mình.");
            if (candidate.CheckType != "EkycIdFace") throw InvalidCheck();
            var investor = await db.Investors.FromSqlInterpolated($"SELECT * FROM dbo.investor WITH (UPDLOCK, HOLDLOCK) WHERE user_id = {candidate.UserId}")
                .Include(i => i.User).SingleOrDefaultAsync(ct) ?? throw InvalidCheck();
            var checks = await db.KycChecks.Include(c => c.User).Where(c => c.UserId == candidate.UserId && c.CheckType == "EkycIdFace")
                .OrderByDescending(c => c.CheckedAt).ThenByDescending(c => c.KycCheckId).ToListAsync(ct);
            var check = checks.First();
            if (check.KycCheckId != id || check.Result != "Failed" || check.ConsentAt is null || investor.VerificationStatus == "Verified" || investor.User.Status != "Active")
                throw InvalidCheck();
            var old = JsonSerializer.Serialize(new { check.Result, check.ReviewedBy, investor.VerificationStatus, investor.VerifiedAt });
            var now = Now();
            check.Result = "ExceptionApproved"; check.ReviewedBy = me.UserId;
            investor.VerificationStatus = "Verified"; investor.VerifiedAt = now;
            await AppendAuditAsync("KycCheck", id, "ApproveKycException", old,
                JsonSerializer.Serialize(new { check.Result, check.ReviewedBy, investor.VerificationStatus, investor.VerifiedAt, Reason = reason.Trim() }), now, ct);
            await db.SaveChangesAsync(ct);
            return Check(check, check.KycCheckId);
        }, ct);

    private async Task RequireAdminAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.PlatformAdmin) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active"
            && u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct))
            throw new ForbiddenException("users.admin_required", "Chỉ quản trị viên đang có quyền được quản lý người dùng và ngoại lệ KYC.");
    }
    private Task<T> TransactionAsync<T>(Func<Task<T>> action, CancellationToken ct) => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
    {
        db.ChangeTracker.Clear();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var value = await action(); await tx.CommitAsync(ct); return value;
    });
    private async Task AppendAuditAsync(string entityType, long entityId, string action, string old, string next, DateTimeOffset now, CancellationToken ct)
    {
        var previous = await db.AuditLogs.FromSqlRaw("SELECT * FROM dbo.audit_log WITH (UPDLOCK, HOLDLOCK)")
            .OrderByDescending(a => a.AuditId).Select(a => a.RowHash).FirstOrDefaultAsync(ct);
        var audit = new AuditLog { EntityType = entityType, EntityId = entityId, ActionType = action,
            OldValue = old, NewValue = next, ActorUserId = me.UserId, OccurredAt = now, PrevHash = previous };
        var content = JsonSerializer.Serialize(new { audit.EntityType, audit.EntityId, audit.ActionType, audit.OldValue,
            audit.NewValue, audit.ActorUserId, audit.OccurredAt });
        audit.RowHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previous ?? "") + content)));
        db.AuditLogs.Add(audit);
    }
    private DateTimeOffset Now() => DateTimeOffset.FromUnixTimeMilliseconds(clock.GetUtcNow().ToUnixTimeMilliseconds());
    private AdminKycResponse Check(KycCheck c, long? latestId) => new(c.KycCheckId, c.UserId, c.User.FullName, c.User.Email,
        c.CheckType, c.Result, c.ProviderRef, c.ConsentAt, c.CheckedAt, c.FailureReason, c.ReviewedBy,
        c.UserId != me.UserId && c.CheckType == "EkycIdFace" && c.Result == "Failed" && c.ConsentAt != null && c.KycCheckId == latestId
        && c.User.Status == "Active" && c.User.Investor is { VerificationStatus: not "Verified" });
    private static AdminUserResponse User(AppUser u) => new(u.UserId, u.FullName, u.Email, u.Phone, u.Status,
        u.AppUserRoles.Select(r => r.RoleCode).Order().ToList(), u.Investor?.VerificationStatus, u.CreatedAt, u.LastLoginAt);
    private static NotFoundException MissingUser() => new("users.not_found", "Không tìm thấy người dùng.");
    private static BusinessRuleException InvalidCheck() => new("kyc.exception_not_allowed", "Chỉ được duyệt lần eKYC thất bại mới nhất, có đồng ý điều khoản, của nhà đầu tư đang hoạt động và chưa Verified.");
}
