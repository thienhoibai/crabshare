using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Production;

[ApiController, Authorize]
public sealed class ProductionLogsController(ProductionLogService production) : ControllerBase
{
    [HttpPost("api/batches/{code}/production-logs"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<ProductionLogResponse>> Record(string code, ProductionLogRequest request, CancellationToken ct)
    {
        var result = await production.RecordAsync(code, request, ct);
        return Created($"/api/batches/{Uri.EscapeDataString(code)}/production-logs", result);
    }

    [HttpGet("api/batches/{code}/production-logs")]
    public async Task<ActionResult<PagedResult<ProductionLogResponse>>> List(string code, [FromQuery] ProductionLogFilter filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await production.ListAsync(code, filter, paging, ct));

    [HttpGet("api/operators/me/production-logs"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<PagedResult<ProductionLogResponse>>> Mine([FromQuery] ProductionLogFilter filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await production.ListMineAsync(filter, paging, ct));

    [HttpGet("api/batches/{code}/production-thresholds")]
    public async Task<ActionResult<ProductionThresholdState>> Thresholds(string code, CancellationToken ct)
        => Ok(await production.ThresholdsAsync(code, ct));

    [HttpPut("api/batches/{code}/production-thresholds"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<ProductionThresholdResponse>> Configure(string code, ProductionThresholdRequest request, CancellationToken ct)
        => Ok(await production.ConfigureAsync(code, request, ct));

    [HttpGet("api/operators/me/production-batches"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<PagedResult<ProductionBatchResponse>>> Batches([FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await production.BatchesAsync(paging, ct));
}
