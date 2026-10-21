using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Harvest;

[ApiController, Authorize(Policy = Policies.Operator), Route("api/tags")]
public sealed class TagsController(TagsService tags) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<TagListItem>> List([FromQuery] TagListQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => tags.ListAsync(query, paging, ct);

    [HttpGet("{tag}/label")]
    public Task<TagLabelResponse> Label(string tag, CancellationToken ct) => tags.LabelAsync(tag, ct);

    [HttpPost("{tag}/activate")]
    public Task<TagLifecycleResponse> Activate(string tag, ActivateTagRequest request, CancellationToken ct)
        => tags.ActivateAsync(tag, request, ct);

    [HttpPost("{tag}/void")]
    public Task<TagVoidResponse> Void(string tag, VoidTagRequest request, CancellationToken ct)
        => tags.VoidAsync(tag, request, ct);
}
