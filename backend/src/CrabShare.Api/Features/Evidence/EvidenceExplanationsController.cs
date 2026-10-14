using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Evidence;

[ApiController, Route("api/operators/me/evidence"), Authorize(Policy = Policies.Operator)]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class EvidenceExplanationsController(EvidenceExplanationService evidence) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<OperatorEvidenceItem>>> List([FromQuery] OperatorEvidenceQuery filter,
        [FromQuery] PageQuery paging, CancellationToken ct) => Ok(await evidence.ListAsync(filter, paging, ct));

    [HttpGet("{id:long:min(1)}")]
    public async Task<ActionResult<OperatorEvidenceItem>> Get(long id, CancellationToken ct) => Ok(await evidence.GetAsync(id, ct));

    [HttpGet("{id:long:min(1)}/image")]
    public async Task<IActionResult> Image(long id, CancellationToken ct)
    {
        var image = await evidence.OpenImageAsync(id, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(image.Stream, image.ContentType);
    }

    [HttpPost("/api/evidence/{id:long:min(1)}/explanation")]
    public async Task<ActionResult<OperatorEvidenceItem>> Explain(long id, EvidenceExplanationRequest request, CancellationToken ct)
        => Ok(await evidence.ExplainAsync(id, request, ct));
}
