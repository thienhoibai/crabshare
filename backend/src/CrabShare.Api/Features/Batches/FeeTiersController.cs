using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

[ApiController, Route("api/admin/fee-tiers"), Authorize(Policy = Policies.Admin)]
public sealed class FeeTiersController(FeeTierService fees) : ControllerBase
{
    [HttpGet] public async Task<ActionResult<IReadOnlyList<FeeTierResponse>>> List(CancellationToken ct) => Ok(await fees.ListAsync(ct));
    [HttpPost] public async Task<ActionResult<FeeTierResponse>> Create(FeeTierRequest req, CancellationToken ct) => Ok(await fees.SaveAsync(null, req, ct));
    [HttpPut("{id:long}")] public async Task<ActionResult<FeeTierResponse>> Update(long id, FeeTierRequest req, CancellationToken ct) => Ok(await fees.SaveAsync(id, req, ct));
}
