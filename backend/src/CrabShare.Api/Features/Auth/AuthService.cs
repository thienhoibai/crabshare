using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Auth;

/// <summary>
/// UC01 Đăng ký tài khoản, đăng nhập, xem thông tin bản thân.
/// Đây là TÍNH NĂNG MẪU: các tính năng khác làm theo cùng cấu trúc
/// (Dtos → Service chứa nghiệp vụ → Endpoints chỉ nhận/trả HTTP).
/// </summary>
public sealed class AuthService(AppDbContext db, TokenService tokens, TimeProvider clock)
{
    private static readonly PasswordHasher<AppUser> Hasher = new();

    public async Task<AuthResponse> RegisterAsync(RegisterRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.AppUsers.AnyAsync(u => u.Email == email, ct))
            throw new ConflictException("auth.email_taken", "Email này đã được đăng ký.");

        var now = clock.GetUtcNow();
        var user = new AppUser
        {
            Email = email,
            FullName = req.FullName.Trim(),
            Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim(),
            Status = "Active",
            CreatedAt = now,
            UpdatedAt = now,
        };
        user.PasswordHash = Hasher.HashPassword(user, req.Password);

        // Ai cũng mua hàng được; nhà đầu tư có thêm vai trò Investor và phải KYC trước khi góp vốn (UC02)
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Customer, GrantedAt = now, CreatedAt = now });
        user.Customer = new Customer { DisplayName = user.FullName, CreatedAt = now };
        if (req.Role == SelfRegisterRole.Investor)
        {
            user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Investor, GrantedAt = now, CreatedAt = now });
            user.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Unverified", CreatedAt = now };
        }

        db.AppUsers.Add(user);
        await db.SaveChangesAsync(ct);
        return await IssueTokenAsync(user, ct);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await db.AppUsers.Include(u => u.AppUserRoles).FirstOrDefaultAsync(u => u.Email == email, ct);

        // Cùng một thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã đăng ký
        if (user is null || Hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password) == PasswordVerificationResult.Failed)
            throw new AppException(StatusCodes.Status401Unauthorized, "auth.invalid_credentials", "Email hoặc mật khẩu không đúng.");
        if (user.Status == "Locked")
            throw new ForbiddenException("auth.locked", "Tài khoản đã bị khoá.");

        user.LastLoginAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return await IssueTokenAsync(user, ct);
    }

    public async Task<MeResponse> GetMeAsync(long userId, CancellationToken ct)
    {
        var user = await db.AppUsers.Include(u => u.AppUserRoles).FirstOrDefaultAsync(u => u.UserId == userId, ct)
                   ?? throw new NotFoundException("auth.user_not_found", "Không tìm thấy tài khoản.");
        return await ToMeAsync(user, ct);
    }

    private async Task<AuthResponse> IssueTokenAsync(AppUser user, CancellationToken ct)
    {
        var me = await ToMeAsync(user, ct);
        var (token, expires) = tokens.Create(user.UserId, user.Email, user.FullName, me.Roles, me.OperatorId);
        return new AuthResponse(token, expires, me);
    }

    private async Task<MeResponse> ToMeAsync(AppUser user, CancellationToken ct)
    {
        var roles = user.AppUserRoles.Select(r => r.RoleCode).OrderBy(r => r).ToList();
        var operatorId = await db.OperatorMembers.Where(m => m.UserId == user.UserId)
            .Select(m => (long?)m.OperatorId).FirstOrDefaultAsync(ct);
        return new MeResponse(user.UserId, user.Email, user.FullName, user.Phone, user.Status, roles, operatorId);
    }
}
