using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Sales;

/// <summary>WF-04 đặt trước sỉ và đặt cọc. Khách hàng và nhà đầu tư (đặt như khách hàng, BR-094) dùng chung.</summary>
[ApiController]
[Route("api/preorders")]
[Authorize(Policy = Policies.Customer)]
public sealed class PreordersController(PreorderService preorders) : ControllerBase
{
    [HttpPost]
    [EndpointSummary("Đặt trước theo quy cách, theo số con hoặc kg; giữ đơn chờ cọc (BR-087…092, BR-234)")]
    public async Task<ActionResult<PreorderResponse>> Create(PreorderRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await preorders.CreateAsync(req, ct));

    [HttpGet]
    public async Task<ActionResult<PagedResult<PreorderResponse>>> Mine([FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await preorders.MineAsync(paging, ct));

    [HttpGet("{orderNo}")]
    [Authorize]
    public async Task<ActionResult<PreorderResponse>> Get(string orderNo, CancellationToken ct) => Ok(await preorders.GetAsync(orderNo, ct));

    [HttpPost("{orderNo}/cancel")]
    [EndpointSummary("Huỷ đơn: chưa cọc không mất gì; đã cọc khi Lô còn gọi vốn thì cọc giữ tới khi đóng gọi vốn; Lô đã mở thì mất cọc (BR-096, BR-097)")]
    public async Task<ActionResult<PreorderResponse>> Cancel(string orderNo, CancelPreorderRequest req, CancellationToken ct)
        => Ok(await preorders.CancelAsync(orderNo, req, ct));

    [HttpPut("{orderNo}/tranches")]
    [EndpointSummary("Chia đơn thành các đợt giao trước khi Lô chuyển Selling (BR-234)")]
    public async Task<ActionResult<PreorderResponse>> SplitTranches(string orderNo, SplitTranchesRequest req, CancellationToken ct)
        => Ok(await preorders.SplitTranchesAsync(orderNo, req, ct));
}

[ApiController]
public sealed class PreorderQueriesController(PreorderService preorders) : ControllerBase
{
    [HttpGet("api/batches/{code}/availability"), AllowAnonymous]
    [EndpointSummary("Số con còn đặt trước được của Lô, chung và theo quy cách (BR-055, BR-089)")]
    public async Task<ActionResult<AvailabilityResponse>> Availability(string code, CancellationToken ct)
        => Ok(await preorders.AvailabilityAsync(code, ct));

    [HttpGet("api/operators/me/preorders"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<PagedResult<PreorderResponse>>> ForOperator([FromQuery] string? batchCode, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await preorders.ForOperatorAsync(batchCode, paging, ct));
}
