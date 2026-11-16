using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Payments;

/// <summary>Đối soát chi trả cho admin (UC40): lệnh chi theo loại và trạng thái, gửi lệnh, giao dịch chưa khớp.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = Policies.Admin)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminPaymentsController(PaymentInstructionQueryService instructions, PayoutSendService payouts) : ControllerBase
{
    [HttpGet("payment-instructions")]
    [EndpointSummary("UC40 — Lệnh chi (giải ngân, chi trả, hoàn tiền), lọc theo type, status, batchCode; mới nhất trước, tối đa 200 dòng")]
    public async Task<ActionResult<IReadOnlyList<PaymentInstructionResponse>>> Instructions([FromQuery] PaymentInstructionQuery query, CancellationToken ct)
        => Ok(await instructions.ListAsync(query, ct));

    [HttpPost("payment-instructions/{id:long}/send")]
    [EndpointSummary("UC40 — Gửi lệnh chi qua cổng thanh toán (sandbox xác nhận ngay → Succeeded; bị từ chối → Failed, gửi lại được)")]
    public async Task<ActionResult<PaymentInstructionResponse>> Send(long id, CancellationToken ct) => Ok(await payouts.SendAsync(id, ct));

    [HttpGet("payments/unmatched")]
    [EndpointSummary("UC40 — Giao dịch tiền vào chưa khớp khoản thu hoặc đến trễ, chờ đối soát tay")]
    public async Task<ActionResult<IReadOnlyList<UnmatchedTransactionResponse>>> Unmatched(CancellationToken ct)
        => Ok(await payouts.ListUnmatchedAsync(ct));
}
