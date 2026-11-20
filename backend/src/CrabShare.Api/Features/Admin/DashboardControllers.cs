using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Admin;

[ApiController, Route("api/admin"), Authorize(Policy = Policies.Admin), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminDashboardController(DashboardService dashboard) : ControllerBase
{
    [EndpointSummary("Xem số liệu tổng hợp dành cho quản trị viên")]
    [HttpGet("dashboard")]
    public async Task<ActionResult<AdminDashboardResponse>> Get([FromQuery] DashboardQuery query, CancellationToken ct) => Ok(await dashboard.AdminAsync(query, ct));
    [EndpointSummary("Tải báo cáo theo tên dưới dạng CSV")]
    [HttpGet("reports/{name}.csv")]
    public async Task<FileContentResult> Report(string name, [FromQuery] DashboardQuery query, CancellationToken ct) => File(await dashboard.ReportAsync(name, query, ct), "text/csv; charset=utf-8", $"crabshare-{name}.csv");
}

[ApiController, Route("api/operators/me/dashboard"), Authorize(Policy = Policies.Operator), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class OperatorDashboardController(DashboardService dashboard) : ControllerBase
{
    [EndpointSummary("Xem số liệu hoạt động của hộ nuôi")]
    [HttpGet]
    public async Task<ActionResult<OperatorDashboardResponse>> Get([FromQuery] DashboardQuery query, CancellationToken ct) => Ok(await dashboard.OperatorAsync(query, ct));
}
