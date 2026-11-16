using CrabShare.Api.Common;
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
/// (Dtos → Service chứa nghiệp vụ → Controller chỉ nhận/trả HTTP).
/// </summary>
public sealed class AuthService(AppDbContext db, TokenService tokens, TimeProvider clock, LoginAttemptLimiter limiter)
{
    private static readonly PasswordHasher<AppUser> Hasher = new();
    private static readonly AppUser DummyUser = new();
    private static readonly string DummyHash = Hasher.HashPassword(DummyUser, Guid.NewGuid().ToString());

    public async Task<AuthResponse> RegisterAsync(RegisterRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.AppUsers.AnyAsync(u => u.Email == email, ct))
            throw new ConflictException("auth.email_taken", "Email này đã được đăng ký.");

        // Mỗi số điện thoại chỉ gắn với một tài khoản; "0767…" và "+84767…" là cùng một số.
        var phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim();
        if (phone is not null)
        {
            var variants = PhoneNumbers.Variants(phone);
            if (await db.AppUsers.AnyAsync(u => u.Phone != null && variants.Contains(u.Phone), ct))
                throw new ConflictException("auth.phone_taken", "Số điện thoại này đã được dùng cho một tài khoản khác.");
        }

        var now = clock.GetUtcNow();
        var user = new AppUser
        {
            Email = email,
            FullName = req.FullName.Trim(),
            Phone = phone,
            Status = "Active",
            CreatedAt = now,
            UpdatedAt = now,
        };
        user.PasswordHash = Hasher.HashPassword(user, req.Password);

        var organization = req.PartyType != "Individual";
        if (organization && string.IsNullOrWhiteSpace(req.LegalName))
            throw new BusinessRuleException("auth.legal_name_required", "Đối tác tổ chức phải khai tên pháp lý.");
        var legalName = organization ? req.LegalName!.Trim() : user.FullName;
        var registrationNo = string.IsNullOrWhiteSpace(req.RegistrationNo) ? null : req.RegistrationNo.Trim();
        if (registrationNo is not null && await db.Parties.AnyAsync(p => p.RegistrationNo == registrationNo, ct))
            throw new ConflictException("auth.registration_taken", "Số đăng ký này đã có đối tác trên nền tảng.");

        // Ai cũng mua hàng được (khách B2B, BR-014); nhà đầu tư có thêm vai trò Investor và phải eKYC trước khi góp vốn (BR-009)
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Customer, GrantedAt = now, CreatedAt = now });
        user.Customer = new Customer { DisplayName = legalName, CustomerType = req.CustomerType, CreatedAt = now };
        if (req.Role == SelfRegisterRole.Investor)
        {
            user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.Investor, GrantedAt = now, CreatedAt = now });
            user.Investor = new Investor
            {
                InvestorKind = organization ? "Organization" : "Individual", OrganizationName = organization ? legalName : null,
                TaxCode = organization ? registrationNo : null, VerificationStatus = "Unverified", CreatedAt = now,
            };
        }

        // Mỗi tài khoản thuộc đúng một đối tác (BR-001, BR-003); tổ chức dùng tài khoản do người đại diện đứng tên.
        await db.InTransactionAsync(async () =>
        {
            var party = new Party
            {
                LegalName = legalName, PartyType = req.PartyType, RegistrationNo = registrationNo,
                Representative = organization ? user.FullName : null, Phone = user.Phone,
                VerificationStatus = "Unverified", RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
            };
            party.Roles.Add(new PartnerRole { RoleType = "Customer", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
            if (req.Role == SelfRegisterRole.Investor)
                party.Roles.Add(new PartnerRole { RoleType = "Investor", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
            db.Parties.Add(party);
            await db.SaveChangesAsync(ct);
            user.PartyId = party.PartyId;
            db.AppUsers.Add(user);
        }, ct);
        return await IssueTokenAsync(user, ct);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        limiter.Begin(email);
        var user = await db.AppUsers.Include(u => u.AppUserRoles).FirstOrDefaultAsync(u => u.Email == email, ct);

        // Cùng một thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã đăng ký
        var verification = Hasher.VerifyHashedPassword(user ?? DummyUser, user?.PasswordHash ?? DummyHash, req.Password);
        if (user is null || verification == PasswordVerificationResult.Failed)
            throw new AppException(StatusCodes.Status401Unauthorized, "auth.invalid_credentials", "Email hoặc mật khẩu không đúng.");
        if (user.Status == "Locked")
            throw new ForbiddenException("auth.locked", "Tài khoản đã bị khoá.");

        limiter.Success(email);

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
