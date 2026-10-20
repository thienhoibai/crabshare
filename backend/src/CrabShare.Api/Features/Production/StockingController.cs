using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Production;

[ApiController, Authorize(Policy = Policies.Operator), Route("api/batches/{code}/stocking")]
public sealed class StockingController(StockingService stocking) : ControllerBase
{
    [HttpPost]
    [EndpointSummary("VI-07 — Ghi nhận thả giống: mỗi hộp một con cua")]
    public async Task<ActionResult<StockingResponse>> Stock(string code, StockingRequest request, CancellationToken ct)
        => Ok(await stocking.StockAsync(code, request, ct));
}
