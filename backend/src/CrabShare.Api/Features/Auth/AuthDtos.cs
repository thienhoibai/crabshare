using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Auth;

/// <summary>Vai trò được tự đăng ký. Người nuôi đăng ký tài khoản Customer trước rồi nộp hồ sơ ở Features/Operators (UC04).</summary>
public enum SelfRegisterRole { Customer, Investor }

// Request: class có { get; set; } + DataAnnotations → [ApiController] tự trả 400 nếu sai.
// Response: record (chỉ trả ra, không cần kiểm tra).

public sealed class RegisterRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = "";

    [Required, MinLength(8), MaxLength(100)]
    public string Password { get; set; } = "";

    [Required, MaxLength(150)]
    public string FullName { get; set; } = "";

    [Phone, MaxLength(15)]
    public string? Phone { get; set; }

    /// <summary>Gửi dạng chữ: "Customer" hoặc "Investor".</summary>
    public SelfRegisterRole Role { get; set; } = SelfRegisterRole.Customer;
}

public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = "";

    [Required, MaxLength(100)]
    public string Password { get; set; } = "";
}

public sealed record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt, MeResponse User);

public sealed record MeResponse(long UserId, string Email, string FullName, string? Phone, string Status, IReadOnlyList<string> Roles, long? OperatorId);
