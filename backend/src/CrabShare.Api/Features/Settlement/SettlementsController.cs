using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Settlement;

/// <summary>UC37 công bố · UC35 sao kê · UC36 góp ý trong hạn (TH-13, TL-14).</summary>
[ApiController]
[Route("api")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class SettlementsController(SettlementReviewService review) : ControllerBase
{
    [HttpPost("admin/settlements/{id:long}/propose")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("UC37 — Công bố bảng nháp cho nhà đầu tư và người nuôi, mở cửa sổ góp ý (mặc định 7 ngày, tối đa 14)")]
    public async Task<ActionResult<SettlementResponse>> Propose(long id, ProposeSettlementRequest req, CancellationToken ct)
        => Ok(await review.ProposeAsync(id, req, ct));

    [HttpPost("admin/settlement-feedback/{id:long}/answer")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Trả lời góp ý; unresolved = true khi hai bên chưa thống nhất (vẫn chốt được, kèm ghi chú công khai)")]
    public async Task<ActionResult<SettlementResponse>> Answer(long id, AnswerFeedbackRequest req, CancellationToken ct)
        => Ok(await review.AnswerAsync(id, req, ct));

    [HttpGet("settlements/{id:long}")]
    [EndpointSummary("UC35 — Sao kê quyết toán: nhà đầu tư thấy tổng + dòng của mình; người nuôi, admin thấy đủ")]
    public async Task<ActionResult<SettlementResponse>> Get(long id, CancellationToken ct) => Ok(await review.GetForPartyAsync(id, ct));

    [HttpPost("settlements/{id:long}/feedback")]
    [Authorize(Policy = Policies.Investor)]
    [EndpointSummary("UC36 — Góp ý bảng quyết toán trong hạn, kèm căn cứ; sau hạn → 422 settlement.feedback_closed")]
    public async Task<ActionResult<SettlementResponse>> Feedback(long id, SettlementFeedbackRequest req, CancellationToken ct)
        => Ok(await review.FeedbackAsync(id, req, ct));

    [HttpGet("me/settlements")]
    [Authorize(Policy = Policies.Investor)]
    [EndpointSummary("Bảng quyết toán đã công bố của các lô tôi góp vốn (tab Quyết toán của cổng nhà đầu tư)")]
    public async Task<ActionResult<IReadOnlyList<SettlementSummary>>> Mine(CancellationToken ct) => Ok(await review.ListMineAsync(ct));

    [HttpGet("operator/settlements")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Bảng quyết toán đã công bố của các lô thuộc hộ nuôi tôi")]
    public async Task<ActionResult<IReadOnlyList<SettlementSummary>>> OperatorSettlements(CancellationToken ct)
        => Ok(await review.ListForOperatorAsync(ct));
}
