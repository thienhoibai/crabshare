using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Auth;

/// <summary>
/// Controller chỉ nhận request, gọi service, trả kết quả. Không viết nghiệp vụ ở đây.
/// [ApiController] tự trả 400 khi DTO sai DataAnnotations, nên không cần kiểm tra ModelState.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AuthController(AuthService auth, ICurrentUser me) : ControllerBase
{
    [HttpPost("register")]
    [EndpointSummary("UC01 — Đăng ký tài khoản khách hàng hoặc nhà đầu tư")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req, CancellationToken ct)
        => Ok(await auth.RegisterAsync(req, ct));

    [HttpPost("login")]
    [EndpointSummary("Đăng nhập, nhận JWT")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req, CancellationToken ct)
        => Ok(await auth.LoginAsync(req, ct));

    [Authorize]
    [HttpGet("me")]
    [EndpointSummary("Thông tin người đang đăng nhập")]
    public async Task<ActionResult<MeResponse>> Me(CancellationToken ct)
        => Ok(await auth.GetMeAsync(me.UserId, ct));
}
