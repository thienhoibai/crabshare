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

    [HttpPost("contracts/{id:long}/offline-upload")]
    [Authorize(Policy = Policies.Admin)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ContractService.MaxOfflineFileBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = ContractService.MaxOfflineFileBytes)]
    [EndpointSummary("UC15 — Tải bản hợp đồng đã ký ngoài hệ thống (PDF ≤ 10 MB, confirmedBothSigned = true) → FullySigned, OfflineUpload")]
    public async Task<ActionResult<ContractResponse>> OfflineUpload(long id, IFormFile file, [FromForm] bool confirmedBothSigned, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return Ok(await contracts.UploadOfflineAsync(id, stream, file.Length, file.ContentType, confirmedBothSigned, ct));
    }

    [HttpGet("me/contracts")]
    [Authorize(Policy = Policies.Investor)]
    [EndpointSummary("Hợp đồng của các khoản góp của tôi (tab Hợp đồng trong cổng nhà đầu tư)")]
    public async Task<ActionResult<IReadOnlyList<ContractSummary>>> Mine(CancellationToken ct) => Ok(await contracts.ListMineAsync(ct));

    [HttpGet("admin/batches/{code}/contracts")]
    [Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Kho hợp đồng của một lô (admin xem / tải)")]
    public async Task<ActionResult<IReadOnlyList<ContractSummary>>> BatchContracts(string code, CancellationToken ct)
        => Ok(await contracts.ListForBatchAsync(code, ct));

    [HttpGet("operator/contracts")]
    [Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Hợp đồng các lô của hộ nuôi tôi: chờ ký trước")]
    public async Task<ActionResult<IReadOnlyList<ContractSummary>>> OperatorContracts(CancellationToken ct)
        => Ok(await contracts.ListForOperatorAsync(ct));
}
