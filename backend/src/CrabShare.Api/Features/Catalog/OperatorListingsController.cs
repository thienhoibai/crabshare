using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Catalog;

/// <summary>Niêm yết của hộ nuôi đang đăng nhập (cả chủ và nhân viên xem được; chỉ chủ được sửa).</summary>
[ApiController]
[Route("api/operators/me/listings")]
[Authorize(Policy = Policies.Operator)]
public sealed class OperatorListingsController(CatalogService catalog) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("UC24 — Danh sách niêm yết của hộ nuôi (kèm 5 lần đổi giá gần nhất)")]
    public async Task<ActionResult<IReadOnlyList<ListingResponse>>> List(CancellationToken ct)
        => Ok(await catalog.ListMineAsync(ct));

    [HttpGet("{id:long}")]
    [EndpointSummary("UC24 — Chi tiết niêm yết kèm toàn bộ lịch sử giá")]
    public async Task<ActionResult<ListingResponse>> Get(long id, CancellationToken ct)
        => Ok(await catalog.GetMineAsync(id, ct));

    [HttpGet("options")]
    [EndpointSummary("UC24 — Các hạng còn tồn của lô đang thu hoạch, để chọn khi tạo niêm yết")]
    public async Task<ActionResult<IReadOnlyList<ListingOptionResponse>>> Options(CancellationToken ct)
        => Ok(await catalog.ListOptionsAsync(ct));
}
