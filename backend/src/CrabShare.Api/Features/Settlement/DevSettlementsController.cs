using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Settlement;

/// <summary>Chỉ môi trường Development (giống /api/dev/payments/simulate): rút ngắn thời gian để chạy demo đầu-cuối trong một buổi.</summary>
[ApiController]
[Route("api/dev/settlements")]
[Authorize(Policy = Policies.Admin)]
public sealed class DevSettlementsController(SettlementPayoutService payouts, IHostEnvironment env) : ControllerBase
{
    [HttpPost("{id:long}/end-feedback-window")]
    [EndpointSummary("Chỉ Development — kết thúc hạn góp ý ngay (dời mốc công bố về quá khứ, giữ cửa sổ ≥ 7 ngày) để duyệt được")]
    public async Task<ActionResult<SettlementResponse>> EndFeedbackWindow(long id, CancellationToken ct)
        => env.IsDevelopment() ? Ok(await payouts.EndFeedbackWindowForDemoAsync(id, ct)) : NotFound();
}
