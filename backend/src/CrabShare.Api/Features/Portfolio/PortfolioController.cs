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
    [HttpGet]
    public async Task<ActionResult<PortfolioPage>> List([FromQuery] PortfolioQuery filter, [FromQuery] PageQuery paging,
        CancellationToken ct) => Ok(await portfolio.ListAsync(filter, paging, ct));
    [HttpGet("{batchCode}")]
    public async Task<ActionResult<PortfolioDetail>> Get([StringLength(20)] string batchCode, CancellationToken ct)
        => Ok(await portfolio.GetAsync(batchCode, ct));
}
