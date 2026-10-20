using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Production;

[ApiController, Authorize(Policy = Policies.Operator)]
public sealed class SlotEventsController(SlotEventService events) : ControllerBase
{
    [HttpPost("api/batches/{code}/slot-events")]
    public async Task<ActionResult<SlotEventResponse>> Record(string code, SlotEventRequest request, CancellationToken ct)
        => Created($"/api/batches/{Uri.EscapeDataString(code)}/slot-events", await events.RecordAsync(code, request, ct));

    [HttpGet("api/batches/{code}/slot-events")]
    public async Task<ActionResult<PagedResult<SlotEventResponse>>> List(string code, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await events.ListAsync(code, paging, ct));

    [HttpGet("api/batches/{code}/slot-event-context")]
    public async Task<ActionResult<SlotEventContext>> Context(string code, [FromQuery, Required, StringLength(30)] string slotCode, CancellationToken ct)
        => Ok(await events.ContextAsync(code, slotCode, ct));

    [HttpGet("api/batches/{code}/slot-event-policy")]
    public async Task<ActionResult<SlotEventPolicyState>> Policy(string code, CancellationToken ct)
        => Ok(await events.PolicyAsync(code, ct));

    [HttpPut("api/batches/{code}/slot-event-policy")]
    public async Task<ActionResult<SlotEventPolicyResponse>> Configure(string code, SlotEventPolicyRequest request, CancellationToken ct)
        => Ok(await events.ConfigureAsync(code, request, ct));
}
