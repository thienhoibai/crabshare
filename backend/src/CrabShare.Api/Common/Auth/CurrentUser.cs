using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Common.Auth;

/// <summary>Người đang gọi API. Inject ICurrentUser vào service thay vì đọc HttpContext trực tiếp.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>user_id của người đang đăng nhập; ném 401 nếu chưa đăng nhập.</summary>
    long UserId { get; }

    /// <summary>operator_id nếu người dùng là nhân viên người nuôi; null nếu không phải.</summary>
    long? OperatorId { get; }

    bool IsInRole(string role);

    /// <summary>operator_id của người đang đăng nhập; ném 403 nếu không phải người nuôi.</summary>
    long RequireOperatorId();
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public const string OperatorIdClaim = "operator_id";

    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public long UserId =>
        long.TryParse(Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id)
            ? id
            : throw new AppException(StatusCodes.Status401Unauthorized, "auth.required", "Bạn cần đăng nhập.");

    public long? OperatorId =>
        long.TryParse(Principal?.FindFirstValue(OperatorIdClaim), out var id) ? id : null;

    public bool IsInRole(string role) => Principal?.IsInRole(role) == true;

    public long RequireOperatorId() =>
        OperatorId ?? throw new ForbiddenException("auth.operator_only", "Chỉ nhân viên của người nuôi mới làm được thao tác này.");
}
