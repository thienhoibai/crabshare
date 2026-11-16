using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Boxes;

[ApiController, Authorize, Route("api/boxes")]
public sealed class BoxesController(BoxService boxes) : ControllerBase
{
    [HttpGet, Authorize(Policy = Policies.Operator)]
    public async Task<IActionResult> List([FromQuery] BoxListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await boxes.ListAsync(query, paging, ct));

    [HttpPost("range")]
    public async Task<IActionResult> Range(BoxRangeRequest request, CancellationToken ct)
        => StatusCode(201, await boxes.CreateRangeAsync(request, ct));

    [HttpPost]
    public async Task<IActionResult> Create(CreateBoxRequest request, CancellationToken ct)
        => StatusCode(201, await boxes.CreateAsync(request, ct));

    [HttpPatch("{slotCode}")]
    public async Task<IActionResult> Update(string slotCode, UpdateBoxRequest request, CancellationToken ct)
        => Ok(await boxes.UpdateAsync(slotCode, request, ct));
}
