using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Accounts;

[ApiController, Route("api/admin"), Authorize(Policy = Policies.Admin)]
public sealed class AdminAccountsController(AdminAccountService accounts) : ControllerBase
{
    [EndpointSummary("Liệt kê tài khoản người dùng")]
    [HttpGet("users")]
    public async Task<ActionResult<PagedResult<AdminUserResponse>>> Users([FromQuery] AdminUserQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await accounts.ListUsersAsync(filter, paging, ct));
    [EndpointSummary("Xem chi tiết tài khoản")]
    [HttpGet("users/{id:long}")]
    public async Task<ActionResult<AdminUserDetailResponse>> GetUser(long id, CancellationToken ct) => Ok(await accounts.GetUserAsync(id, ct));
    [EndpointSummary("Khóa tài khoản")]
    [HttpPost("users/{id:long}/lock")]
    public async Task<ActionResult<AdminUserResponse>> Lock(long id, AdminAccountDecisionRequest req, CancellationToken ct)
        => Ok(await accounts.SetLockedAsync(id, true, req.Reason, ct));
    [EndpointSummary("Mở khóa tài khoản")]
    [HttpPost("users/{id:long}/unlock")]
    public async Task<ActionResult<AdminUserResponse>> Unlock(long id, AdminAccountDecisionRequest req, CancellationToken ct)
        => Ok(await accounts.SetLockedAsync(id, false, req.Reason, ct));
    [EndpointSummary("Liệt kê hồ sơ xác minh danh tính")]
    [HttpGet("kyc-checks")]
    public async Task<ActionResult<PagedResult<AdminKycResponse>>> Checks([FromQuery] AdminKycQuery filter, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await accounts.ListChecksAsync(filter, paging, ct));
    [EndpointSummary("Phê duyệt ngoại lệ cho hồ sơ xác minh")]
    [HttpPost("kyc-checks/{id:long}/approve-exception")]
    public async Task<ActionResult<AdminKycResponse>> ApproveException(long id, AdminAccountDecisionRequest req, CancellationToken ct)
        => Ok(await accounts.ApproveExceptionAsync(id, req.Reason, ct));
}
