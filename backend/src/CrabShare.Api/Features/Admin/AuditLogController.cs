using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Admin;

[ApiController, Route("api/admin/audit-log"), Authorize(Policy = Policies.Admin), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AuditLogController(AuditLogQueryService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AuditLogPage>> List([FromQuery] AuditLogQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await audit.ListAsync(query, paging, ct));
    [HttpGet("export")]
    public async Task<FileContentResult> Export([FromQuery] AuditLogQuery query, CancellationToken ct)
    {
        var result = await audit.ExportAsync(query, ct);
        return File(result.Bytes, "text/csv; charset=utf-8", $"crabshare-audit-through-{result.ThroughAuditId}.csv");
    }
}
