using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

[ApiController]
public sealed class ComplaintsController(ComplaintService complaints) : ControllerBase
{
    [HttpPost("api/orders/{orderNo}/complaints")]
    [Authorize(Policy = Policies.Customer)]
    [EndpointSummary("UC31 — Khách gửi khiếu nại đơn hàng (loại, mô tả, ảnh bằng chứng).")]
    public async Task<ActionResult<ComplaintDetailResponse>> Create(
        string orderNo, [FromBody] CreateComplaintRequest req, CancellationToken ct)
        => Ok(await complaints.SubmitAsync(orderNo.Trim().ToUpperInvariant(), req, ct));

    [HttpGet("api/orders/{orderNo}/complaints")]
    [Authorize]
    [EndpointSummary("Xem khiếu nại của một đơn hàng (Khách hàng, Hộ nuôi hoặc Admin).")]
    public async Task<ActionResult<ComplaintDetailResponse?>> GetByOrderNo(string orderNo, CancellationToken ct)
    {
        var result = await complaints.GetByOrderNoAsync(orderNo.Trim().ToUpperInvariant(), ct);
        return result == null ? NoContent() : Ok(result);
    }

    [HttpPost("api/complaints/{id:long}/respond")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Hộ nuôi phản hồi giải trình khiếu nại.")]
    public async Task<ActionResult<ComplaintDetailResponse>> Respond(
        long id, [FromBody] RespondComplaintRequest req, CancellationToken ct)
        => Ok(await complaints.RespondAsync(id, req, ct));

    [HttpGet("api/complaints/{id:long}")]
    [Authorize]
    [EndpointSummary("Chi tiết khiếu nại (Khách hàng, Hộ nuôi hoặc Admin).")]
    public async Task<ActionResult<ComplaintDetailResponse>> Get(long id, CancellationToken ct)
        => Ok(await complaints.GetByIdAsync(id, ct));

    [HttpGet("api/operators/me/complaints")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Danh sách khiếu nại liên quan đến các lô của Hộ nuôi.")]
    public async Task<ActionResult<List<ComplaintSummaryResponse>>> ListForOperator(CancellationToken ct)
        => Ok(await complaints.ListForOperatorAsync(ct));

    [HttpGet("api/orders/mine/complaints")]
    [Authorize(Policy = Policies.Customer)]
    [EndpointSummary("Danh sách khiếu nại của Khách hàng hiện tại.")]
    public async Task<ActionResult<List<ComplaintSummaryResponse>>> ListForCustomer(CancellationToken ct)
        => Ok(await complaints.ListForCustomerAsync(ct));
}
