using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Evidence;

[ApiController, Route("api/evidence"), Authorize(Policy = Policies.Operator)]
public sealed class EvidenceController(EvidenceService evidence) : ControllerBase
{
    [HttpPost, Consumes("multipart/form-data")]
    [RequestSizeLimit(EvidenceUploadLimits.MaxRequestBytes)]
    [RequestFormLimits(MemoryBufferThreshold = EvidenceUploadLimits.MaxRequestBytes, MultipartBodyLengthLimit = EvidenceUploadLimits.MaxImageBytes)]
    public async Task<ActionResult<EvidenceResponse>> Upload([FromForm] UploadEvidenceRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await evidence.UploadAsync(request, ct));
}
