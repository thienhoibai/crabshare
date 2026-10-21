using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Payments;

/// <summary>Đối soát chi trả cho admin (UC40): lệnh chi theo loại và trạng thái.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = Policies.Admin)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminPaymentsController(PaymentInstructionQueryService instructions) : ControllerBase
{
    [HttpGet("payment-instructions")]
    [EndpointSummary("UC40 — Lệnh chi (giải ngân, chi trả, hoàn tiền), lọc theo type, status, batchCode; mới nhất trước, tối đa 200 dòng")]
    public async Task<ActionResult<IReadOnlyList<PaymentInstructionResponse>>> Instructions([FromQuery] PaymentInstructionQuery query, CancellationToken ct)
        => Ok(await instructions.ListAsync(query, ct));
}
