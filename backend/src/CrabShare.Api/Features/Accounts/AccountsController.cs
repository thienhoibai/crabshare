using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Accounts;

[ApiController]
[Route("api")]
[Authorize(Policy = Policies.Investor)]
public sealed class AccountsController(AccountService accounts) : ControllerBase
{
    [HttpPost("kyc/ekyc")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(EkycUploadLimits.MaxRequestBytes)]
    // ASP.NET mặc định ghi file >64 KB ra temp. Giữ toàn bộ request đã giới hạn trong RAM.
    [RequestFormLimits(MemoryBufferThreshold = EkycUploadLimits.MaxRequestBytes,
        MultipartBodyLengthLimit = EkycUploadLimits.MaxImageBytes)]
    [EndpointSummary("UC02 — Xác minh danh tính bằng CCCD và ảnh khuôn mặt")]
    public async Task<ActionResult<KycStatusResponse>> Verify([FromForm] EkycRequest req, CancellationToken ct)
        => Ok(await accounts.VerifyIdentityAsync(req, ct));

    [HttpGet("me/kyc")]
    [EndpointSummary("Trạng thái xác minh và lần eKYC gần nhất của nhà đầu tư đang đăng nhập")]
    public async Task<ActionResult<KycStatusResponse>> Kyc(CancellationToken ct)
        => Ok(await accounts.GetKycAsync(ct));
}
