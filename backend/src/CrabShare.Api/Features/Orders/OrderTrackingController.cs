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
public sealed class OrderTrackingController(
    OrderQueryService queries,
    OrderCancellationService cancellations,
    OrderFulfilmentService fulfilment,
    OrderRatingService ratings,
    OrderReturnService returns) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("UC28 — Lịch sử đơn của tôi, mới nhất trước; lọc ?status=A,B; phân trang ?page=&pageSize=")]
    public async Task<ActionResult<PagedResult<OrderSummaryResponse>>> List(
        [FromQuery] OrderListQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await queries.ListMineAsync(filter, paging, ct));

    [HttpGet("{orderNo}")]
    [EndpointSummary("UC28 — Chi tiết đơn: dòng hàng, khoản thu VietQR, dòng thời gian. Đơn người khác → 403")]
    public async Task<ActionResult<OrderTrackingResponse>> Get(string orderNo, CancellationToken ct)
    {
        var code = orderNo.Trim().ToUpperInvariant();
        var body = await queries.GetMineAsync(code, ct);
        var (canReturn, returnRequest) = await returns.GetStateAsync(code, ct);
        return Ok(body with { CanReturn = canReturn, ReturnRequest = returnRequest });
    }

    [HttpPost("{orderNo}/cancel")]
    [EndpointSummary("NH-07 — Huỷ đơn khi chưa đóng gói: trả tồn, huỷ mã QR; đơn đã trả tiền thì lập lệnh hoàn")]
    public async Task<ActionResult<CancelOrderResponse>> Cancel(string orderNo, CancelOrderRequest req, CancellationToken ct)
        => Ok(await cancellations.CancelAsync(orderNo.Trim().ToUpperInvariant(), req, ct));

    [HttpPost("{orderNo}/receive")]
    [EndpointSummary("UC30 — Khách xác nhận đã nhận hàng; đơn hoàn tất sau khi hết cửa sổ đổi trả")]
    public async Task<ActionResult<OrderTrackingResponse>> Receive(string orderNo, CancellationToken ct)
    {
        var code = orderNo.Trim().ToUpperInvariant();
        var body = await fulfilment.ReceiveAsync(code, ct);
        var (canReturn, returnRequest) = await returns.GetStateAsync(code, ct);
        return Ok(body with { CanReturn = canReturn, ReturnRequest = returnRequest });
    }

    [HttpGet("{orderNo}/rating")]
    [EndpointSummary("UC34 — Xem đánh giá của đơn và có được gửi không")]
    public async Task<ActionResult<OrderRatingView>> GetRating(string orderNo, CancellationToken ct)
        => Ok(await ratings.GetAsync(orderNo.Trim().ToUpperInvariant(), ct));

    [HttpPost("{orderNo}/rating")]
    [EndpointSummary("UC34 — Đánh giá một lần đơn đã hoàn tất, 1–5 sao")]
    public async Task<ActionResult<RatingResponse>> Rate(string orderNo, RateOrderRequest req, CancellationToken ct)
    {
        var body = await ratings.RateAsync(orderNo.Trim().ToUpperInvariant(), req, ct);
        return Created($"/api/orders/{body.OrderNo}/rating", body);
    }

    [HttpPost("{orderNo}/return")]
    [EndpointSummary("NH-12 — Trả cả đơn trong hạn đổi trả, lập lệnh hoàn, không nhập lại kho")]
    public async Task<ActionResult<ReturnOrderResponse>> Return(string orderNo, ReturnOrderRequest req, CancellationToken ct)
        => Ok(await returns.ReturnAsync(orderNo.Trim().ToUpperInvariant(), req, ct));
}
