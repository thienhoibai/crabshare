using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Payments;

/// <summary>UC18 giải ngân theo mốc (TH-10, TL-03): người nuôi xin đợt, admin duyệt / yêu cầu giải trình / dừng chi.</summary>
[ApiController]
[Route("api")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class DisbursementsController(DisbursementService disbursements) : ControllerBase
{
    [HttpGet("operator/tranches")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Các đợt giải ngân của lô thuộc hộ nuôi tôi, kèm lý do chưa xin được")]
    public async Task<ActionResult<IReadOnlyList<TrancheResponse>>> OperatorTranches(CancellationToken ct)
        => Ok(await disbursements.ListForOperatorAsync(ct));

    [HttpPost("batches/{code}/tranches/{no:int}/request")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("UC18 — Chủ hộ nuôi xin giải ngân đợt no; điều kiện mốc chưa đạt → 422 tranche.not_eligible")]
    public async Task<ActionResult<TrancheResponse>> RequestTranche(string code, int no, CancellationToken ct)
        => no is < 1 or > 255 ? NotFound() : Ok(await disbursements.RequestAsync(code, (byte)no, ct));

    [HttpGet("admin/tranches")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Đợt giải ngân cho admin; mặc định các đợt đang chờ (Requested, NeedsExplanation)")]
    public async Task<ActionResult<IReadOnlyList<TrancheResponse>>> AdminTranches([FromQuery] string? status, CancellationToken ct)
        => Ok(await disbursements.ListForAdminAsync(status, ct));

    [HttpPost("admin/tranches/{id:long}/release")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Duyệt giải ngân → lệnh chi Disbursement (Created) tới tài khoản nhận tiền của hộ nuôi")]
    public async Task<ActionResult<TrancheResponse>> Release(long id, CancellationToken ct) => Ok(await disbursements.ReleaseAsync(id, ct));

    [HttpPost("admin/tranches/{id:long}/need-explanation")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Yêu cầu người nuôi giải trình trong 72 giờ (TL-03 §6.4)")]
    public async Task<ActionResult<TrancheResponse>> NeedExplanation(long id, TrancheDecisionRequest req, CancellationToken ct)
        => Ok(await disbursements.RequestExplanationAsync(id, req.Reason, ct));

    [HttpPost("admin/tranches/{id:long}/block")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Dừng chi đợt này")]
    public async Task<ActionResult<TrancheResponse>> Block(long id, TrancheDecisionRequest req, CancellationToken ct)
        => Ok(await disbursements.BlockAsync(id, req.Reason, ct));
}
