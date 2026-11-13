using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Parties;

/// <summary>Đối tác của người đang đăng nhập: hồ sơ, địa điểm, bên liên quan (BR-001, 003, 008, 015).</summary>
[ApiController]
[Authorize]
[Route("api/me")]
public sealed class MyPartyController(PartyService parties) : ControllerBase
{
    [HttpGet("party")]
    [EndpointSummary("Hồ sơ đối tác của tôi, các vai trò và địa điểm")]
    public async Task<ActionResult<PartyResponse>> Get(CancellationToken ct) => Ok(await parties.GetMineAsync(ct));

    [HttpPut("party")]
    [EndpointSummary("Sửa hồ sơ đối tác; đổi tên pháp lý thì phải xác minh lại")]
    public async Task<ActionResult<PartyResponse>> Update(UpdatePartyRequest req, CancellationToken ct) => Ok(await parties.UpdateMineAsync(req, ct));

    [HttpGet("sites")]
    [EndpointSummary("Địa điểm của tôi: trại, trạm kiểm phẩm, kho, địa chỉ giao")]
    public async Task<ActionResult<IReadOnlyList<PartySiteResponse>>> Sites([FromQuery] string? siteType, CancellationToken ct)
        => Ok(await parties.ListMySitesAsync(siteType, ct));

    [HttpPost("sites")]
    public async Task<ActionResult<PartySiteResponse>> AddSite(SiteRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await parties.AddMySiteAsync(req, ct));

    [HttpPut("sites/{siteId:long}")]
    public async Task<ActionResult<PartySiteResponse>> UpdateSite(long siteId, SiteRequest req, CancellationToken ct)
        => Ok(await parties.UpdateMySiteAsync(siteId, req, ct));

    [HttpDelete("sites/{siteId:long}")]
    public async Task<IActionResult> RemoveSite(long siteId, CancellationToken ct)
    {
        await parties.RemoveMySiteAsync(siteId, ct);
        return NoContent();
    }

    [Authorize(Policy = Policies.Operator)]
    [HttpGet("related-parties")]
    [EndpointSummary("Bên liên quan của người nuôi (BR-008)")]
    public async Task<ActionResult<IReadOnlyList<RelatedPartyResponse>>> Related(CancellationToken ct) => Ok(await parties.ListRelatedAsync(ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpPost("related-parties")]
    public async Task<ActionResult<RelatedPartyResponse>> AddRelated(RelatedPartyRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await parties.AddRelatedAsync(req, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpDelete("related-parties/{id:long}")]
    public async Task<IActionResult> RemoveRelated(long id, CancellationToken ct)
    {
        await parties.RemoveRelatedAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Nhà cung cấp và bên cam kết thu mua (BR-016): người nuôi ghi nhận và tra cứu đối tác đã xác minh.</summary>
[ApiController]
[Route("api/parties")]
public sealed class PartiesController(PartyService parties) : ControllerBase
{
    [Authorize(Policy = Policies.Operator)]
    [HttpPost("external")]
    [EndpointSummary("Người nuôi ghi nhận nhà cung cấp hoặc bên cam kết thu mua; chờ Admin xác minh")]
    public async Task<ActionResult<PartyResponse>> RecordExternal(ExternalPartyRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await parties.RecordExternalAsync(req, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpGet("directory")]
    [EndpointSummary("Tra cứu nhà cung cấp hoặc bên cam kết thu mua đã xác minh")]
    public async Task<ActionResult<IReadOnlyList<PartySummaryResponse>>> Directory([FromQuery] string roleType, [FromQuery] string? search, CancellationToken ct)
        => Ok(await parties.DirectoryAsync(roleType, search, ct));
}

[ApiController]
[Authorize(Policy = Policies.Admin)]
[Route("api/admin/parties")]
public sealed class AdminPartiesController(PartyService parties) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<PartySummaryResponse>>> List([FromQuery] PartyListQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await parties.ListAsync(filter, paging, ct));

    [HttpGet("{partyId:long}")]
    public async Task<ActionResult<PartyResponse>> Get(long partyId, CancellationToken ct) => Ok(await parties.GetAsync(partyId, ct));

    [HttpPost]
    [EndpointSummary("Admin ghi nhận nhà cung cấp hoặc bên cam kết thu mua (đã xác minh)")]
    public async Task<ActionResult<PartyResponse>> RecordExternal(ExternalPartyRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await parties.RecordExternalAsync(req, ct));

    [HttpPost("{partyId:long}/verify")]
    public async Task<ActionResult<PartyResponse>> Verify(long partyId, CancellationToken ct)
        => Ok(await parties.DecideAsync(partyId, true, new PartyDecisionRequest(), ct));

    [HttpPost("{partyId:long}/reject")]
    public async Task<ActionResult<PartyResponse>> Reject(long partyId, PartyDecisionRequest req, CancellationToken ct)
        => Ok(await parties.DecideAsync(partyId, false, req, ct));

    [HttpPost("{partyId:long}/roles")]
    [EndpointSummary("Thêm vai trò hoặc đổi trạng thái vai trò của đối tác (tạm dừng, thu hồi)")]
    public async Task<ActionResult<PartyResponse>> ChangeRole(long partyId, RoleChangeRequest req, CancellationToken ct)
        => Ok(await parties.ChangeRoleAsync(partyId, req, ct));
}

[ApiController]
[Authorize(Policy = Policies.Admin)]
[Route("api/admin/qc-inspectors")]
public sealed class AdminQcController(PartyService parties) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("Pool Nhân viên kiểm phẩm kèm thống kê uy tín (BR-017)")]
    public async Task<ActionResult<IReadOnlyList<QcInspectorResponse>>> List(CancellationToken ct) => Ok(await parties.ListQcAsync(ct));

    [HttpPost]
    public async Task<IActionResult> Grant(GrantQcRequest req, CancellationToken ct)
    {
        await parties.GrantQcAsync(req.UserId, ct);
        return NoContent();
    }

    [HttpDelete("{userId:long}")]
    public async Task<IActionResult> Revoke(long userId, CancellationToken ct)
    {
        await parties.RevokeQcAsync(userId, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api")]
public sealed class ParametersController(ParameterAdminService parameters) : ControllerBase
{
    [HttpGet("parameters")]
    [EndpointSummary("Tham số nền tảng web và mobile cần hiển thị")]
    public async Task<ActionResult<IReadOnlyDictionary<string, decimal>>> Public(CancellationToken ct) => Ok(await parameters.PublicAsync(ct));

    [Authorize(Policy = Policies.Admin)]
    [HttpGet("admin/parameters")]
    [EndpointSummary("Tham số nền tảng đang hiệu lực (BR-217); history=true để xem cả giá trị cũ")]
    public async Task<ActionResult<IReadOnlyList<ParameterValueResponse>>> List([FromQuery] bool history, CancellationToken ct)
        => Ok(await parameters.ListAsync(history, ct));

    [Authorize(Policy = Policies.Admin)]
    [HttpPost("admin/parameters")]
    [EndpointSummary("Đặt giá trị mới cho một tham số, có ngày hiệu lực (BR-218)")]
    public async Task<ActionResult<ParameterValueResponse>> Set(ParameterChangeRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await parameters.SetAsync(req, ct));
}
