using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Alerts;

[ApiController, Route("api/admin/alerts"), Authorize(Policy = Policies.Admin)]
public sealed class AdminAlertsController(AlertService alerts) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AlertResponse>>> List([FromQuery] AdminAlertFilter filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await alerts.ListAdminAsync(filter, paging, ct));
    [HttpPost("{id:long}/resolve")]
    public async Task<ActionResult<AlertResponse>> Resolve(long id, ResolveAlertRequest request, CancellationToken ct)
        => Ok(await alerts.ResolveAsync(id, request.Note, ct));
}
