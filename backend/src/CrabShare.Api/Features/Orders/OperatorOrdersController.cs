using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

/// <summary>Đơn của hộ nuôi đang đăng nhập (UC29). Pack để ở /api/orders/... vì đây là thao tác trên đơn, không sửa OrdersController của khách.</summary>
[ApiController]
[Authorize(Policy = Policies.Operator)]
public sealed class OperatorOrdersController(OrderPackingService packing, OrderFulfilmentService fulfilment) : ControllerBase
{
    [HttpGet("api/operators/me/orders")]
    [EndpointSummary("UC29 — Danh sách đơn của hộ nuôi (Paid cần đóng gói, Packed đã đóng)")]
    public async Task<ActionResult<IReadOnlyList<OperatorOrderSummaryResponse>>> List([FromQuery] string? status, CancellationToken ct)
        => Ok(await packing.ListMineAsync(status, ct));

    [HttpGet("api/operators/me/orders/{orderNo}")]
    [EndpointSummary("UC29 — Chi tiết đơn của hộ nuôi kèm kg đã gán và tem đã quét")]
    public async Task<ActionResult<OperatorOrderDetailResponse>> Get(string orderNo, CancellationToken ct)
        => Ok(await packing.GetMineAsync(orderNo, ct));

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
}
