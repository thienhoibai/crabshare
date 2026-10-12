using CrabShare.Api.Common.Auth;

namespace CrabShare.Api.Features.Auth;

/// <summary>Endpoint chỉ nhận request, gọi service, trả kết quả. Không viết nghiệp vụ ở đây.</summary>
public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", async (RegisterRequest req, AuthService svc, CancellationToken ct) =>
                TypedResults.Ok(await svc.RegisterAsync(req, ct)))
            .WithSummary("UC01 — Đăng ký tài khoản khách hàng hoặc nhà đầu tư");

        group.MapPost("/login", async (LoginRequest req, AuthService svc, CancellationToken ct) =>
                TypedResults.Ok(await svc.LoginAsync(req, ct)))
            .WithSummary("Đăng nhập, nhận JWT");

        group.MapGet("/me", async (ICurrentUser me, AuthService svc, CancellationToken ct) =>
                TypedResults.Ok(await svc.GetMeAsync(me.UserId, ct)))
            .RequireAuthorization()
            .WithSummary("Thông tin người đang đăng nhập");

        return app;
    }
}
