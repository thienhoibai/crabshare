using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Portfolio;

[ApiController, Route("api/investor/portfolio"), Authorize(Policy = Policies.Investor)]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class PortfolioController(PortfolioService portfolio) : ControllerBase
{
    [EndpointSummary("Xem danh mục đầu tư của tôi")]
    [HttpGet]
    public async Task<ActionResult<PortfolioPage>> List([FromQuery] PortfolioQuery filter, [FromQuery] PageQuery paging,
        CancellationToken ct) => Ok(await portfolio.ListAsync(filter, paging, ct));
    [EndpointSummary("Xem chi tiết khoản đầu tư trong danh mục")]
    [HttpGet("{batchCode}")]
    public async Task<ActionResult<PortfolioDetail>> Get([StringLength(20)] string batchCode, CancellationToken ct)
        => Ok(await portfolio.GetAsync(batchCode, ct));
}
