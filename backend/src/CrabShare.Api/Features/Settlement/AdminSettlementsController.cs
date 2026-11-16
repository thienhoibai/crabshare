using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Settlement;

/// <summary>Quyết toán phía admin (TH-12): danh sách lô chờ quyết toán, tính bảng nháp, xem đủ mọi dòng.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = Policies.Admin)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminSettlementsController(SettlementService settlements, SettlementPayoutService payouts) : ControllerBase
{
    [HttpPost("settlements/{id:long}/approve")]
    [EndpointSummary("UC39 — Duyệt (hết hạn góp ý, không còn góp ý mở) → khoá số liệu, lập lệnh chi: thuế khai thay, người nuôi, từng nhà đầu tư")]
    public async Task<ActionResult<SettlementResponse>> Approve(long id, CancellationToken ct) => Ok(await payouts.ApproveAsync(id, ct));

    [HttpPost("settlements/{id:long}/send-payouts")]
    [EndpointSummary("UC39 — Gửi mọi lệnh chi quyết toán còn chờ; nhà đầu tư nhận đủ → bảng PaidOut, lô Closed")]
    public async Task<ActionResult<SettlementResponse>> SendPayouts(long id, CancellationToken ct) => Ok(await payouts.SendPayoutsAsync(id, ct));

    [HttpGet("settlements")]
    [EndpointSummary("Lô đang thu hoạch / chờ quyết toán / đã đóng, kèm bảng quyết toán nếu đã tính")]
    public async Task<ActionResult<IReadOnlyList<AdminSettlementSummary>>> List(CancellationToken ct) => Ok(await settlements.ListForAdminAsync(ct));

    [HttpPost("batches/{code}/settlements")]
    [EndpointSummary("UC38 — Tính bảng quyết toán nháp (201); tính lại trước khi duyệt thì tăng revision_no (200); đã duyệt → 409 settlement.locked")]
    public async Task<ActionResult<SettlementResponse>> Calculate(string code, CalculateSettlementRequest req, CancellationToken ct)
    {
        var (settlement, created) = await settlements.CalculateAsync(code, req, ct);
        return created ? Created($"/api/admin/settlements/{settlement.SettlementId}", settlement) : Ok(settlement);
    }

    [HttpGet("settlements/{id:long}")]
    [EndpointSummary("Bảng quyết toán đầy đủ cho admin: doanh thu, chi phí khoá, Pool, thù lao, từng dòng nhà đầu tư, góp ý")]
    public async Task<ActionResult<SettlementResponse>> Get(long id, CancellationToken ct) => Ok(await settlements.GetForAdminAsync(id, ct));
}
