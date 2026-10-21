using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Harvest;

[ApiController, Route("api/trace")]
public sealed class TraceController(TraceService trace) : ControllerBase
{
    [HttpGet("{tag}")]
    public async Task<ActionResult<TraceResponse>> Get(string tag, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        Response.Headers.Expires = "0";
        return Ok(await trace.GetAsync(tag, ct));
    }
}
