using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Orders;

[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/preorders")]
public sealed class PreordersController(PreorderService preorders) : ControllerBase
{
    [HttpPost]
    [EndpointSummary("UC27 — Đặt trước lô đang nuôi, thu cọc PreOrderDeposit, trần v_batch_commitment_cap")]
    public async Task<ActionResult<PreorderResponse>> Place(PlacePreorderRequest req, CancellationToken ct)
    {
        var body = await preorders.PlaceAsync(req, ct);
        return Created($"/api/orders/{body.OrderNo}", body);
    }
}
