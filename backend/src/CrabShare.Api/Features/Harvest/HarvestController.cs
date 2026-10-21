using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Harvest;

[ApiController, Authorize(Policy = Policies.Operator), Route("api")]
public sealed class HarvestController(HarvestService harvests) : ControllerBase
{
    [HttpPost("batches/{code}/harvests")]
    public async Task<IActionResult> Start(string code, StartHarvestRequest request, CancellationToken ct)
    {
        var result = await harvests.StartAsync(code, request, ct);
        return StatusCode(result.Created ? 201 : 200, result.Value);
    }
    [HttpGet("batches/{code}/harvests")]
    public async Task<IActionResult> List(string code, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await harvests.ListAsync(code, paging, ct));
    [HttpGet("batches/{code}/harvest-context")]
    public async Task<IActionResult> Context(string code, [FromQuery] string? slotCode, CancellationToken ct)
        => Ok(await harvests.ContextAsync(code, slotCode, ct));
    [HttpGet("harvests/{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct) => Ok(await harvests.GetAsync(id, ct));
    [HttpGet("harvests/{id:long}/crabs")]
    public async Task<IActionResult> Crabs(long id, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await harvests.CrabsAsync(id, paging, ct));
    [HttpPost("harvests/{id:long}/crabs")]
    public async Task<IActionResult> Record(long id, RecordHarvestCrabRequest request, CancellationToken ct)
    {
        var result = await harvests.RecordAsync(id, request, ct);
        return StatusCode(result.Created ? 201 : 200, result.Value);
    }
    [HttpPatch("harvests/{id:long}")]
    public async Task<IActionResult> Update(long id, UpdateHarvestRequest request, CancellationToken ct)
        => Ok(await harvests.UpdateAsync(id, request, ct));
    [HttpPost("harvests/{id:long}/complete")]
    public async Task<IActionResult> Complete(long id, CompleteHarvestRequest request, CancellationToken ct)
        => Ok(await harvests.CompleteAsync(id, request, ct));
}
