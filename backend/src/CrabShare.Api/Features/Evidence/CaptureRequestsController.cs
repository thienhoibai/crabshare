using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Evidence;

public sealed class CaptureRequestQuery
{
    [RegularExpression("^(Open|Fulfilled|Expired)$")] public string? Status { get; set; } = "Open";
}
public sealed record CaptureRequestResponse(long Id, string BatchCode, string SlotCode,
    DateTimeOffset RequestedAt, DateTimeOffset DueAt, string Status, DateTimeOffset? FulfilledAt);

[ApiController, Route("api/operators/me/capture-requests"), Authorize(Policy = Policies.Operator)]
public sealed class CaptureRequestsController(CaptureRequestService requests) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<CaptureRequestResponse>>> List([FromQuery] CaptureRequestQuery query,
        [FromQuery] PageQuery paging, CancellationToken ct) => Ok(await requests.ListAsync(query, paging, ct));
}
