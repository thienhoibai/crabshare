using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Contracts;

/// <summary>UC14 hợp đồng góp vốn: sinh từ mẫu, xem, tải PDF, ký số theo thứ tự chủ hộ nuôi → nhà đầu tư (TH-08).</summary>
[ApiController]
[Route("api")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ContractsController(ContractService contracts) : ControllerBase
{
    [HttpPost("contributions/{id:long}/contract")]
    [Authorize(Policy = Policies.Investor)]
    [EndpointSummary("UC14 — Lập hợp đồng từ mẫu đang hiệu lực cho khoản góp của tôi (201); đã có thì trả lại đúng hợp đồng đó (200)")]
    public async Task<ActionResult<ContractResponse>> Create(long id, CancellationToken ct)
    {
        var (contract, created) = await contracts.CreateForContributionAsync(id, ct);
        return created ? Created($"/api/contracts/{contract.ContractId}", contract) : Ok(contract);
    }

    [HttpGet("contracts/{id:long}")]
    [EndpointSummary("Thông tin hợp đồng + chữ ký; nhà đầu tư của khoản góp, hộ nuôi của lô hoặc admin")]
    public async Task<ActionResult<ContractResponse>> Get(long id, CancellationToken ct) => Ok(await contracts.GetAsync(id, ct));

    [HttpGet("contracts/{id:long}/file")]
    [EndpointSummary("Tải file PDF hiện hành của hợp đồng (bản cuối khi đã đủ chữ ký); mã băm được kiểm tra lại trước khi trả")]
    public async Task<FileContentResult> Download(long id, CancellationToken ct)
    {
        var (pdf, fileName) = await contracts.GetFileAsync(id, ct);
        return File(pdf, "application/pdf", fileName);
    }

    [HttpPost("contracts/{id:long}/sign")]
    [EndpointSummary("UC14 — Ký phần của tôi: chủ hộ nuôi ký trước, nhà đầu tư ký sau (sai thứ tự → 422 contract.wrong_signing_order)")]
    public async Task<ActionResult<ContractResponse>> Sign(long id, CancellationToken ct) => Ok(await contracts.SignAsync(id, ct));

    [HttpGet("operator/contracts")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Hợp đồng các lô của hộ nuôi tôi: chờ ký trước")]
    public async Task<ActionResult<IReadOnlyList<ContractSummary>>> OperatorContracts(CancellationToken ct)
        => Ok(await contracts.ListForOperatorAsync(ct));
}
