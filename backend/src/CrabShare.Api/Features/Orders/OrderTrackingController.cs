using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// UC28 Theo dõi đơn + huỷ đơn (NH-07). Tách khỏi <see cref="OrdersController"/> (checkout) để các nhánh không sửa cùng file;
/// cùng tiền tố <c>api/orders</c>, các route không trùng nhau.
/// </summary>
[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/orders")]
public sealed class OrderTrackingController(OrderQueryService queries, OrderCancellationService cancellations) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("UC28 — Lịch sử đơn của tôi, mới nhất trước; lọc ?status=A,B; phân trang ?page=&pageSize=")]
    public async Task<ActionResult<PagedResult<OrderSummaryResponse>>> List(
        [FromQuery] OrderListQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await queries.ListMineAsync(filter, paging, ct));

    [HttpGet("{orderNo}")]
    [EndpointSummary("UC28 — Chi tiết đơn: dòng hàng, khoản thu VietQR, dòng thời gian. Đơn người khác → 403")]
    public async Task<ActionResult<OrderTrackingResponse>> Get(string orderNo, CancellationToken ct)
        => Ok(await queries.GetMineAsync(orderNo.Trim().ToUpperInvariant(), ct));

    [HttpPost("{orderNo}/cancel")]
    [EndpointSummary("NH-07 — Huỷ đơn khi chưa đóng gói: trả tồn, huỷ mã QR; đơn đã trả tiền thì lập lệnh hoàn")]
    public async Task<ActionResult<CancelOrderResponse>> Cancel(string orderNo, CancelOrderRequest req, CancellationToken ct)
        => Ok(await cancellations.CancelAsync(orderNo.Trim().ToUpperInvariant(), req, ct));
}
