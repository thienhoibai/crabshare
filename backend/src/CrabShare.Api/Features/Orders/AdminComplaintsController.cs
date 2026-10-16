using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

[ApiController]
[Authorize(Policy = Policies.Admin)]
[Route("api/admin/complaints")]
public sealed class AdminComplaintsController(ComplaintService complaints) : ControllerBase
{
    [HttpGet]
    [EndpointSummary("Admin xem danh sách khiếu nại (lọc ?status=Open,Escalated...; phân trang ?page=1&pageSize=20).")]
    public async Task<ActionResult<PagedList<ComplaintSummaryResponse>>> List(
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await complaints.ListForAdminAsync(status, page, pageSize, ct));

    [HttpGet("{id:long}")]
    [EndpointSummary("Admin xem chi tiết khiếu nại và toàn bộ lịch sử trao đổi.")]
    public async Task<ActionResult<ComplaintDetailResponse>> Get(long id, CancellationToken ct)
        => Ok(await complaints.GetByIdAsync(id, ct));

    [HttpPost("{id:long}/resolve")]
    [EndpointSummary("UC32 — Admin phân xử khiếu nại: Hoàn tiền (Refund) hoặc Bác bỏ (Rejected) / Đền bù.")]
    public async Task<ActionResult<ComplaintDetailResponse>> Resolve(
        long id, [FromBody] ResolveComplaintRequest req, CancellationToken ct)
        => Ok(await complaints.ResolveAsync(id, req, ct));
}
