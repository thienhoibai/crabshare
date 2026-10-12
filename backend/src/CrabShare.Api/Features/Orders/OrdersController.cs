using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/orders")]
public sealed class OrdersController(OrderService orders) : ControllerBase
{
    [HttpPost("checkout")]
    [EndpointSummary("UC26 — Đặt hàng: giữ tồn nguyên tử, tách đơn theo lô, sinh mã VietQR cho từng đơn")]
    public async Task<ActionResult<CheckoutResponse>> Checkout(CheckoutRequest req, CancellationToken ct)
        => Ok(await orders.CheckoutAsync(req, ct));
}
