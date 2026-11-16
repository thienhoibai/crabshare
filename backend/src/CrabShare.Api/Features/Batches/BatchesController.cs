using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Batches;

[ApiController, Authorize, Route("api/batches")]
public sealed class BatchesController(BatchService batches, BatchExploreService explore, ICurrentUser me) : ControllerBase
{
    [HttpPost, Authorize(Policy = Policies.Operator)]
    [EndpointSummary("WF-02 — Người nuôi tạo lô P nháp (BR-018)")]
    public async Task<ActionResult<BatchResponse>> Create(BatchRequest req, CancellationToken ct)
    {
        var batch = await batches.CreateAsync(req, ct);
        return CreatedAtAction(nameof(MineByCode), new { code = batch.BatchCode }, batch);
    }

    /// <summary>Người nuôi và Admin xem bản soạn thảo; người khác xem trang gọi vốn hoặc đặt trước.</summary>
    [HttpGet("{code}"), AllowAnonymous]
    public async Task<IActionResult> Get(string code, CancellationToken ct)
        => me.IsAuthenticated && (me.IsInRole(Roles.OperatorMember) || me.IsInRole(Roles.PlatformAdmin))
            ? Ok(await batches.GetAsync(code, ct))
            : Ok(await explore.GetAsync(code, ct));

    [HttpGet, AllowAnonymous]
    [EndpointSummary("WF-03/04 — Lô đang gọi vốn hoặc nhận đặt trước (BR-056, BR-084)")]
    public async Task<ActionResult<PagedResult<ExploreBatchResponse>>> List([FromQuery] ExploreBatchQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await explore.ListAsync(query, paging, ct));

    [HttpPut("{code}")]
    public async Task<ActionResult<BatchResponse>> Update(string code, BatchRequest req, CancellationToken ct) => Ok(await batches.UpdateAsync(code, req, ct));

    [HttpPut("{code}/cost-plan")]
    [EndpointSummary("Kế hoạch chi phí và mốc giải ngân (BR-030…036, BR-145)")]
    public async Task<ActionResult<BatchResponse>> SaveCost(string code, CostPlanRequest req, CancellationToken ct) => Ok(await batches.SaveCostPlanAsync(code, req, ct));

    [HttpPost("{code}/submit")]
    public async Task<ActionResult<BatchResponse>> Submit(string code, CancellationToken ct) => Ok(await batches.SubmitAsync(code, ct));

    [HttpPost("{code}/cancel")]
    [EndpointSummary("Huỷ Lô trước khi mở, khi chưa có khoản góp được xác nhận (BR-054)")]
    public async Task<ActionResult<BatchResponse>> Cancel(string code, CancelBatchRequest req, CancellationToken ct) => Ok(await batches.CancelAsync(code, req, ct));

    [HttpPost("{code}/actual-costs")]
    [EndpointSummary("Ghi chi phí thực tế kèm chứng từ (BR-037)")]
    public async Task<IActionResult> RecordActualCost(string code, CostActualRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, new { costActualId = await batches.RecordActualCostAsync(code, req, ct) });

    [HttpGet("/api/specs"), AllowAnonymous]
    [EndpointSummary("Bảng quy cách hàng (SKU) dùng cho chào giá và đặt trước (BR-043)")]
    public async Task<ActionResult<IReadOnlyList<SpecResponse>>> Specs([FromQuery] string? crabType, CancellationToken ct)
        => Ok(await batches.SpecsAsync(crabType, ct));

    [HttpGet("/api/operators/me/batches")]
    public async Task<ActionResult<PagedResult<BatchResponse>>> Mine([FromQuery] BatchListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await batches.ListMineAsync(query, paging, ct));

    [HttpGet("/api/operators/me/batches/{code}")]
    public async Task<ActionResult<BatchResponse>> MineByCode(string code, CancellationToken ct)
        => Ok(await batches.GetAsync(code, ct));
}

[ApiController, Route("api/admin/batches"), Authorize(Policy = Policies.Admin)]
public sealed class AdminBatchesController(BatchReviewService reviews, BatchService batches) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AdminBatchResponse>>> List([FromQuery] BatchListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await reviews.ListAsync(query, paging, ct));

    [HttpPost]
    [EndpointSummary("Admin tạo lô T hoặc lô A (BR-018…020)")]
    public async Task<ActionResult<BatchResponse>> Create(AdminBatchRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await batches.CreateForAdminAsync(req, ct));

    [HttpGet("{code}")]
    public async Task<ActionResult<AdminBatchResponse>> Get(string code, CancellationToken ct) => Ok(await reviews.GetAsync(code, ct));

    [HttpPost("{code}/approve")]
    public async Task<ActionResult<AdminBatchResponse>> Approve(string code, ApproveBatchRequest req, CancellationToken ct) => Ok(await reviews.ApproveAsync(code, req, ct));

    [HttpPost("{code}/reject")]
    public async Task<ActionResult<AdminBatchResponse>> Reject(string code, RejectBatchRequest req, CancellationToken ct) => Ok(await reviews.RejectAsync(code, req, ct));

    [HttpPost("{code}/request-revision")]
    public async Task<ActionResult<AdminBatchResponse>> RequestRevision(string code, RejectBatchRequest req, CancellationToken ct) => Ok(await reviews.RequestRevisionAsync(code, req, ct));
}
