using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Alerts;

[ApiController, Authorize]
public sealed class AlertsController(AlertService alerts) : ControllerBase
{
    [HttpGet("api/operators/me/alerts"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<IReadOnlyList<AlertResponse>>> Mine([FromQuery] AlertFilter filter, CancellationToken ct)
        => Ok(await alerts.ListMineAsync(filter.Status, ct));

    [HttpGet("api/batches/{code}/alerts"), Authorize(Policy = Policies.Investor)]
    public async Task<ActionResult<IReadOnlyList<AlertResponse>>> Batch(string code, [FromQuery] AlertFilter filter, CancellationToken ct)
        => Ok(await alerts.ListInvestorAsync(code, filter.Status, ct));

    [HttpPost("api/alerts/{id:long}/acknowledge"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<AlertResponse>> Acknowledge(long id, AcknowledgeAlertRequest request, CancellationToken ct)
        => Ok(await alerts.AcknowledgeAsync(id, request.ResponseNote, ct));
}
