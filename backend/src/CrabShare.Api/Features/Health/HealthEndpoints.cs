using CrabShare.Api.Infrastructure.Persistence;

namespace CrabShare.Api.Features.Health;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/health").WithTags("Health");

        // API còn sống không (không chạm CSDL) — dùng cho kiểm tra triển khai
        group.MapGet("/live", () => TypedResults.Ok(new { status = "ok" }));

        // API có kết nối được CSDL không
        group.MapGet("/ready", async (AppDbContext db, CancellationToken ct) =>
            await db.Database.CanConnectAsync(ct)
                ? Results.Ok(new { status = "ok", database = "connected" })
                : Results.Problem("Không kết nối được CSDL", statusCode: StatusCodes.Status503ServiceUnavailable));

        return app;
    }
}
