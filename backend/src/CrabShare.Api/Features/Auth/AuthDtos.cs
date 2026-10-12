using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Auth;

/// <summary>Vai trò được tự đăng ký. Người nuôi đăng ký tài khoản Customer trước rồi nộp hồ sơ ở Features/Operators (UC04).</summary>
public enum SelfRegisterRole { Customer, Investor }

public sealed record RegisterRequest(
    [property: Required, EmailAddress, MaxLength(254)] string Email,
    [property: Required, MinLength(8), MaxLength(100)] string Password,
    [property: Required, MaxLength(150)] string FullName,
    [property: Phone, MaxLength(15)] string? Phone,
    SelfRegisterRole Role = SelfRegisterRole.Customer);

public sealed record LoginRequest(
    [property: Required, EmailAddress] string Email,
    [property: Required] string Password);

public sealed record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt, MeResponse User);

public sealed record MeResponse(long UserId, string Email, string FullName, string? Phone, string Status, IReadOnlyList<string> Roles, long? OperatorId);
