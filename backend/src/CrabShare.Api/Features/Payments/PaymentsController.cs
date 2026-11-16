using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Payments;

/// <summary>Yêu cầu chuyển khoản VietQR dùng chung cho góp vốn, đơn hàng, cọc (UC12, TL-10).</summary>
[ApiController]
[Route("api/payment-requests")]
[Authorize]
public sealed class PaymentsController(PaymentRequestService payments) : ControllerBase
{
    [HttpGet("{id:long}")]
    [EndpointSummary("UC12 — Một yêu cầu chuyển khoản của tôi: trạng thái, và mã QR khi còn chờ thanh toán (màn hình hỏi lại vài giây một lần để biết tiền đã về)")]
    public async Task<ActionResult<PaymentRequestResponse>> Get(long id, CancellationToken ct)
        => Ok(await payments.GetMineAsync(id, ct));
}
