using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Operators;

[ApiController]
[Authorize(Policy = Policies.Admin)]
[Route("api/admin/operators")]
public sealed class AdminOperatorsController(OperatorReviewService operators) : ControllerBase
{
    [EndpointSummary("Liệt kê hồ sơ hộ nuôi")]
    [HttpGet]
    public async Task<ActionResult<PagedResult<AdminOperatorResponse>>> List(
        [FromQuery] OperatorListQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await operators.ListAsync(filter, paging, ct));

    [EndpointSummary("Phê duyệt hồ sơ hộ nuôi")]
    [HttpPost("{id:long}/approve")]
    public async Task<ActionResult<AdminOperatorResponse>> Approve(long id, ApproveOperatorRequest req, CancellationToken ct)
        => Ok(await operators.DecideAsync(id, "approve", req.ApprovedSlotCapacity, null, ct));

    [EndpointSummary("Từ chối hồ sơ hộ nuôi")]
    [HttpPost("{id:long}/reject")]
    public async Task<ActionResult<AdminOperatorResponse>> Reject(long id, OperatorDecisionRequest req, CancellationToken ct)
        => Ok(await operators.DecideAsync(id, "reject", null, req.Reason, ct));

    [EndpointSummary("Đình chỉ hộ nuôi")]
    [HttpPost("{id:long}/suspend")]
    public async Task<ActionResult<AdminOperatorResponse>> Suspend(long id, OperatorDecisionRequest req, CancellationToken ct)
        => Ok(await operators.DecideAsync(id, "suspend", null, req.Reason, ct));
}
