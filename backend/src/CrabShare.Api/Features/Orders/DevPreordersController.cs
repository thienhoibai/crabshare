using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

[ApiController]
[Route("api/dev/preorders")]
[Authorize]
public sealed class DevPreordersController(PreorderBalanceService balances, IHostEnvironment env) : ControllerBase
{
    [HttpPost("issue-balances/{batchCode}")]
    [EndpointSummary("Chỉ Development — phát PreOrderBalance cho đơn DepositPaid của lô đã Harvesting")]
    public async Task<ActionResult<IssueBalancesResponse>> Issue(string batchCode, CancellationToken ct)
    {
        if (!env.IsDevelopment()) return NotFound();
        return Ok(await balances.IssueForBatchCodeAsync(batchCode, ct));
    }
}
