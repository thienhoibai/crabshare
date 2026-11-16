using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Production;

[ApiController, Authorize, Route("api/batches/{code}/timeline")]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class TimelineController(TimelineService timeline) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("UC21 — Nhật trình sản xuất, phân trang trọn nhóm ngày UTC+7")]
    public async Task<ActionResult<TimelinePage>> Get(string code, [FromQuery] TimelineQuery query, CancellationToken ct)
        => Ok(await timeline.ReadAsync(code, query, ct));

    [HttpGet("evidence/{id:long:min(1)}/file")]
    public async Task<IActionResult> FileContent(string code, long id, CancellationToken ct)
    {
        var content = await timeline.OpenFileAsync(code, id, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return content.DownloadName is null
            ? File(content.Stream, content.ContentType)
            : File(content.Stream, content.ContentType, content.DownloadName);
    }
}
