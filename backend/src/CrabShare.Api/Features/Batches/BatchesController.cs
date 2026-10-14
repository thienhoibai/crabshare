using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Batches;

[ApiController, Authorize, Route("api/batches")]
public sealed class BatchesController(BatchService batches) : ControllerBase
{
    [HttpPost]
    [EndpointSummary("UC07 — Tạo lô nháp")]
    public async Task<ActionResult<BatchResponse>> Create(BatchRequest req, CancellationToken ct)
    {
        var batch = await batches.CreateAsync(req, ct);
        return CreatedAtAction(nameof(Get), new { code = batch.BatchCode }, batch);
    }
    [HttpGet("{code}")]
    public async Task<ActionResult<BatchResponse>> Get(string code, CancellationToken ct) => Ok(await batches.GetAsync(code, ct));
    [HttpPut("{code}")]
    public async Task<ActionResult<BatchResponse>> Update(string code, BatchRequest req, CancellationToken ct) => Ok(await batches.UpdateAsync(code, req, ct));
    [HttpPut("{code}/standard-cost")]
    public async Task<ActionResult<BatchResponse>> SaveCost(string code, StandardCostRequest req, CancellationToken ct) => Ok(await batches.SaveCostAsync(code, req, ct));
    [HttpPost("{code}/submit")]
    public async Task<ActionResult<BatchResponse>> Submit(string code, CancellationToken ct) => Ok(await batches.SubmitAsync(code, ct));
    [HttpGet("/api/operators/me/batches")]
    public async Task<ActionResult<PagedResult<BatchResponse>>> Mine([FromQuery] BatchListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await batches.ListMineAsync(query, paging, ct));
}
