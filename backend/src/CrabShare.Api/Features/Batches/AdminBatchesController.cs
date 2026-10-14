using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Batches;

[ApiController, Route("api/admin/batches"), Authorize(Policy = Policies.Admin)]
public sealed class AdminBatchesController(BatchReviewService batches) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AdminBatchResponse>>> List([FromQuery] BatchListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await batches.ListAsync(query, paging, ct));
    [HttpGet("{code}")]
    public async Task<ActionResult<AdminBatchResponse>> Get(string code, CancellationToken ct) => Ok(await batches.GetAsync(code, ct));
    [HttpPost("{code}/approve")]
    public async Task<ActionResult<AdminBatchResponse>> Approve(string code, ApproveBatchRequest req, CancellationToken ct) => Ok(await batches.ApproveAsync(code, req, ct));
    [HttpPost("{code}/reject")]
    public async Task<ActionResult<AdminBatchResponse>> Reject(string code, RejectBatchRequest req, CancellationToken ct) => Ok(await batches.RejectAsync(code, req, ct));
    [HttpPost("{code}/request-revision")]
    public async Task<ActionResult<AdminBatchResponse>> RequestRevision(string code,RejectBatchRequest req,CancellationToken ct) => Ok(await batches.RequestRevisionAsync(code,req,ct));
}
