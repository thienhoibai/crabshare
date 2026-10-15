using CrabShare.Api.Common.Paging;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Batches;

[ApiController, Authorize, Route("api/batches")]
public sealed class BatchesController(BatchService batches, BatchExploreService explore, ICurrentUser me) : ControllerBase
{
    [HttpPost]
    [EndpointSummary("UC07 — Tạo lô nháp")]
    public async Task<ActionResult<BatchResponse>> Create(BatchRequest req, CancellationToken ct)
    {
        var batch = await batches.CreateAsync(req, ct);
        return CreatedAtAction(nameof(MineByCode), new { code = batch.BatchCode }, batch);
    }
    [HttpGet("{code}")]
    public async Task<IActionResult> Get(string code, CancellationToken ct)
        => me.IsInRole(Roles.Investor) ? Ok(await explore.GetAsync(code, ct)) : Ok(await batches.GetAsync(code, ct));
    [HttpGet, Authorize(Policy = Policies.Investor)]
    [EndpointSummary("UC09 — Khám phá lô đã công bố")]
    public async Task<ActionResult<PagedResult<ExploreBatchResponse>>> List([FromQuery] ExploreBatchQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await explore.ListAsync(query, paging, ct));
    [HttpPut("{code}")]
    public async Task<ActionResult<BatchResponse>> Update(string code, BatchRequest req, CancellationToken ct) => Ok(await batches.UpdateAsync(code, req, ct));
    [HttpPut("{code}/standard-cost")]
    public async Task<ActionResult<BatchResponse>> SaveCost(string code, StandardCostRequest req, CancellationToken ct) => Ok(await batches.SaveCostAsync(code, req, ct));
    [HttpPost("{code}/submit")]
    public async Task<ActionResult<BatchResponse>> Submit(string code, CancellationToken ct) => Ok(await batches.SubmitAsync(code, ct));
    [HttpGet("/api/operators/me/batches")]
    public async Task<ActionResult<PagedResult<BatchResponse>>> Mine([FromQuery] BatchListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await batches.ListMineAsync(query, paging, ct));
    // Explicit authoring read for accounts holding both Investor and OperatorMember roles.
    [HttpGet("/api/operators/me/batches/{code}")]
    public async Task<ActionResult<BatchResponse>> MineByCode(string code, CancellationToken ct)
        => Ok(await batches.GetAsync(code, ct));
}
