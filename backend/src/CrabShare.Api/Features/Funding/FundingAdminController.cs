using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Funding;

/// <summary>AdminFinance — vốn vào theo lô và chạy chốt vốn ngay (TH-07).</summary>
[ApiController]
[Route("api/admin/funding")]
[Authorize(Policy = Policies.Admin)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class FundingAdminController(FundingAdminService funding, FundingCloseService close) : ControllerBase
{
    [HttpGet("batches")]
    [EndpointSummary("Vốn vào theo lô: đã giữ chỗ / đã xác nhận / mục tiêu, trạng thái chốt vốn, số lệnh hoàn")]
    public async Task<ActionResult<IReadOnlyList<AdminFundingBatch>>> Batches(CancellationToken ct)
        => Ok(await funding.ListAsync(ct));

    [HttpPost("close-due")]
    [EndpointSummary("Chạy ngay việc của job chốt vốn (job tự chạy mỗi phút): hết hạn giữ chỗ, chốt hoặc huỷ các lô tới hạn")]
    public async Task<ActionResult<FundingCloseResult>> CloseDue(CancellationToken ct)
        => Ok(await close.RunAsync(ct));
}
