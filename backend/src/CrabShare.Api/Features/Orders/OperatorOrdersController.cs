using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

/// <summary>Đơn của hộ nuôi đang đăng nhập (UC29). Pack để ở /api/orders/... vì đây là thao tác trên đơn, không sửa OrdersController của khách.</summary>
[ApiController]
[Authorize(Policy = Policies.Operator)]
public sealed class OperatorOrdersController(
    OrderPackingService packing,
    OrderFulfilmentService fulfilment,
    OrderReturnService returns) : ControllerBase
{
    [HttpGet("api/operators/me/orders")]
    [EndpointSummary("UC29 — Danh sách đơn của hộ nuôi (Paid cần đóng gói, Packed đã đóng)")]
    public async Task<ActionResult<IReadOnlyList<OperatorOrderSummaryResponse>>> List([FromQuery] string? status, CancellationToken ct)
        => Ok(await packing.ListMineAsync(status, ct));

    [HttpGet("api/operators/me/orders/counts")]
    [EndpointSummary("CS-64 — Số lượng đơn theo từng trạng thái để hiển thị badge số lượng")]
    public async Task<ActionResult<OperatorOrderCountsResponse>> GetCounts(CancellationToken ct)
        => Ok(await packing.GetCountsAsync(ct));

    [HttpGet("api/operators/me/orders/{orderNo}")]
    [EndpointSummary("UC29 — Chi tiết đơn của hộ nuôi kèm kg đã gán và tem đã quét")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> Get(string orderNo, CancellationToken ct)
        => Ok(await packing.GetMineAsync(orderNo.Trim().ToUpperInvariant(), ct));

    [HttpPost("api/orders/{orderNo}/pack")]
    [EndpointSummary("UC29 — Đóng gói đơn bằng danh sách mã tem đã quét")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> Pack(string orderNo, PackOrderRequest req, CancellationToken ct)
        => Ok(await packing.PackAsync(orderNo, req, ct));

    [HttpPost("api/orders/{orderNo}/ship")]
    [EndpointSummary("UC30 — Hộ nuôi giao đơn Packed cho nhà xe: khai nhà xe, biển số, SĐT tài xế, giờ dự kiến đến (không có phí ship)")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> Ship(string orderNo, ShipOrderRequest req, CancellationToken ct)
        => Ok(await fulfilment.ShipAsync(orderNo.Trim().ToUpperInvariant(), req, ct));

    [HttpPost("api/orders/{orderNo}/deliver")]
    [EndpointSummary("UC30 — Hộ nuôi báo đã giao: Shipping → Delivered, bắt đầu cửa sổ đổi trả")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> Deliver(string orderNo, CancellationToken ct)
        => Ok(await fulfilment.DeliverAsync(orderNo.Trim().ToUpperInvariant(), ct));

    [HttpPost("api/orders/{orderNo}/return/approve")]
    [EndpointSummary("CS-64 — Hộ nuôi xác nhận đồng ý yêu cầu trả hàng của khách, chuyển đơn sang Returned và lập lệnh hoàn tiền")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> ApproveReturn(
        string orderNo, ApproveReturnRequest req, CancellationToken ct)
    {
        var code = orderNo.Trim().ToUpperInvariant();
        await returns.ApproveByOperatorAsync(code, req, ct);
        return Ok(await packing.GetMineAsync(code, ct));
    }

    [HttpPost("api/orders/{orderNo}/return/reject")]
    [EndpointSummary("CS-64 — Hộ nuôi từ chối yêu cầu trả hàng kèm lý do và bằng chứng đối chứng")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> RejectReturn(
        string orderNo, RejectReturnRequest req, CancellationToken ct)
    {
        var code = orderNo.Trim().ToUpperInvariant();
        await returns.RejectByOperatorAsync(code, req, ct);
        return Ok(await packing.GetMineAsync(code, ct));
    }
}
