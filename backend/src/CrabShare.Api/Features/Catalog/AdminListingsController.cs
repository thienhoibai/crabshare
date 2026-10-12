using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Catalog;

[ApiController]
[Authorize(Policy = Policies.Admin)]
[Route("api/admin/listings")]
public sealed class AdminListingsController(ListingModerationService moderation) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("UC24 — Kiểm duyệt niêm yết (lọc theo cờ giá bất thường, trạng thái ẩn)")]
    public async Task<ActionResult<PagedResult<AdminListingResponse>>> List(
        [FromQuery] AdminListingQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await moderation.ListAsync(filter, paging, ct));

    [HttpPost("{id:long}/hide")]
    [EndpointSummary("UC24 — Ẩn niêm yết vi phạm khỏi cửa hàng")]
    public async Task<ActionResult<AdminListingResponse>> Hide(long id, HideListingRequest req, CancellationToken ct)
        => Ok(await moderation.HideAsync(id, req, ct));
}
