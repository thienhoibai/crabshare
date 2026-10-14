using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Evidence;

[ApiController, Route("api/review/evidence"), Authorize(Policy = Policies.Reviewer)]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class EvidenceReviewController(EvidenceReviewService reviews) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ReviewEvidenceSummary>>> List([FromQuery] EvidenceReviewQuery query,
        [FromQuery] PageQuery paging, CancellationToken ct) => Ok(await reviews.ListAsync(query, paging, ct));
    [HttpGet("{id:long:min(1)}")]
    public async Task<ActionResult<ReviewEvidenceDetail>> Get(long id, CancellationToken ct) => Ok(await reviews.GetAsync(id, ct));
    [HttpGet("{id:long:min(1)}/image")]
    public async Task<IActionResult> Image(long id, CancellationToken ct)
    {
        var image = await reviews.OpenImageAsync(id, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(image.Stream, image.ContentType);
    }
    [HttpPost("{id:long:min(1)}/verdict")]
    public async Task<ActionResult<ReviewEvidenceDetail>> Verdict(long id, EvidenceVerdictRequest request, CancellationToken ct)
        => Ok(await reviews.DecideAsync(id, request, ct));
}
