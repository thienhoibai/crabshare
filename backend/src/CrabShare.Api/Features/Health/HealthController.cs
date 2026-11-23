using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using System.Reflection;

namespace CrabShare.Api.Features.Health;

[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    /// <summary>API còn sống không (không chạm CSDL) — dùng cho kiểm tra triển khai.</summary>
    [EndpointSummary("Kiểm tra API đang hoạt động")]
    [HttpGet("live")]
    public IActionResult Live() => Ok(new { status = "ok" });

    [EndpointSummary("Xem phiên bản API")]
    [HttpGet("version")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public IActionResult Version() => Ok(new {
        version = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown"
    });

    /// <summary>API có kết nối được CSDL không.</summary>
    [EndpointSummary("Kiểm tra trạng thái sẵn sàng của dịch vụ")]
    [HttpGet("ready")]
    public async Task<IActionResult> Ready([FromServices] AppDbContext db, CancellationToken ct) =>
        await db.Database.CanConnectAsync(ct)
            ? Ok(new { status = "ok", database = "connected" })
            : Problem("Không kết nối được CSDL", statusCode: StatusCodes.Status503ServiceUnavailable);
}
