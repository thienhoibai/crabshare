using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Offtake;

[ApiController]
[Route("api")]
[Authorize(Policy = Policies.Investor)]
public sealed class OfftakeController(OfftakeService offtake) : ControllerBase
{
    [HttpPost("batches/{code}/offtake-commitments")]
    [EndpointSummary("UC13 — Đăng ký cam kết bao tiêu + QR cọc OfftakeDeposit (BT)")]
    public async Task<ActionResult<OfftakeCommitmentResponse>> Create(string code, CreateOfftakeCommitmentRequest req, CancellationToken ct)
    {
        var created = await offtake.CreateAsync(code, req, ct);
        return Created($"/api/me/offtake-commitments#{created.OfftakeId}", created);
    }

    [HttpGet("me/offtake-commitments")]
    [EndpointSummary("Các cam kết bao tiêu của tôi")]
    public async Task<ActionResult<IReadOnlyList<OfftakeCommitmentResponse>>> Mine(CancellationToken ct)
        => Ok(await offtake.ListMineAsync(ct));

    [HttpGet("batches/{code}/offtake-cap")]
    [EndpointSummary("Trần bao tiêu + đặt trước còn lại của lô (đọc view)")]
    public async Task<ActionResult<OfftakeCapResponse>> Cap(string code, CancellationToken ct)
        => Ok(await offtake.GetCapAsync(code, ct));
}
