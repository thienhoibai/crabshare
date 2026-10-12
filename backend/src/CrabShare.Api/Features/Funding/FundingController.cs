using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Funding;

/// <summary>Luồng góp vốn màn 1–2: xác nhận rủi ro (UC11) → số tiền và giữ chỗ (UC10).</summary>
[ApiController]
[Route("api")]
[Authorize(Policy = Policies.Investor)]
public sealed class FundingController(FundingService funding) : ControllerBase
{
    [HttpGet("risk-disclosures/active")]
    [EndpointSummary("UC11 — Bản công bố rủi ro đang hiệu lực (kèm thời điểm tôi đã xác nhận, nếu có)")]
    public async Task<ActionResult<RiskDisclosureResponse>> ActiveDisclosure(CancellationToken ct)
        => Ok(await funding.GetActiveDisclosureAsync(ct));

    [HttpPost("risk-acknowledgements")]
    [EndpointSummary("UC11 — Xác nhận đã đọc hết bản công bố rủi ro (scrolledToEnd phải là true)")]
    public async Task<ActionResult<RiskAcknowledgementResponse>> Acknowledge(AcknowledgeRiskRequest req, CancellationToken ct)
        => Ok(await funding.AcknowledgeAsync(req, ct));

    [HttpGet("funding/batches")]
    [EndpointSummary("Các lô đang mở gọi vốn")]
    public async Task<ActionResult<IReadOnlyList<FundingBatchSummary>>> OpenBatches(CancellationToken ct)
        => Ok(await funding.ListOpenAsync(ct));

    [HttpGet("funding/batches/{code}")]
    [EndpointSummary("Số liệu gọi vốn của một lô + điều kiện của tôi + khoản tôi đang giữ chỗ")]
    public async Task<ActionResult<FundingBatchResponse>> Batch(string code, CancellationToken ct)
        => Ok(await funding.GetBatchAsync(code, ct));

    [HttpPost("batches/{code}/contributions")]
    [EndpointSummary("UC10 — Giữ chỗ góp vốn: cần đã eKYC + đã xác nhận rủi ro; không vượt max_capital")]
    public async Task<ActionResult<ContributionResponse>> Reserve(string code, ReserveContributionRequest req, CancellationToken ct)
    {
        var contribution = await funding.ReserveAsync(code, req, ct);
        return Created($"/api/me/contributions#{contribution.ContributionId}", contribution);
    }

    [HttpDelete("contributions/{id:long}")]
    [EndpointSummary("Huỷ khoản đang giữ chỗ (chưa thanh toán)")]
    public async Task<IActionResult> Cancel(long id, CancellationToken ct)
    {
        await funding.CancelAsync(id, ct);
        return NoContent();
    }

    [HttpGet("me/contributions")]
    [EndpointSummary("Các khoản góp của tôi")]
    public async Task<ActionResult<IReadOnlyList<ContributionResponse>>> Mine(CancellationToken ct)
        => Ok(await funding.MineAsync(ct));
}
