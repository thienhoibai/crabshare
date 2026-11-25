using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Accounts;

[ApiController]
[Route("api")]
public sealed class KycHandoffsController(KycHandoffService handoffs) : ControllerBase
{
    [Authorize(Policy = Policies.Investor)]
    [HttpPost("me/kyc/handoffs")]
    public async Task<ActionResult<KycHandoffCreatedResponse>> Create(CancellationToken ct)
    {
        var handoff = await handoffs.CreateAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = handoff.Id }, handoff);
    }

    [Authorize(Policy = Policies.Investor)]
    [HttpGet("me/kyc/handoffs/{id:long}")]
    public async Task<ActionResult<KycHandoffStatusResponse>> Get(long id, CancellationToken ct)
        => Ok(await handoffs.GetAsync(id, ct));

    [Authorize(Policy = Policies.Investor)]
    [HttpPost("me/kyc/handoffs/{id:long}/cancel")]
    public async Task<ActionResult<KycHandoffStatusResponse>> Cancel(long id, CancellationToken ct)
        => Ok(await handoffs.CancelAsync(id, ct));

    // Cho phép mọi tài khoản đã đăng nhập gọi để backend trả được lỗi sai tài khoản cụ thể.
    [Authorize]
    [HttpPost("me/kyc/handoffs/claim")]
    public async Task<ActionResult<KycHandoffStatusResponse>> Claim(KycHandoffClaimRequest request, CancellationToken ct)
        => Ok(await handoffs.ClaimAsync(request.Token, ct));
}
