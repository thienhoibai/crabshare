using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Accounts;

[ApiController, Route("api/me"), Authorize]
public sealed class PaymentProfilesController(PaymentProfileService profiles) : ControllerBase
{
    [HttpGet("payout-account"), Authorize(Roles = "Investor,OperatorMember")]
    public async Task<ActionResult<PayoutProfileResponse>> Payout([FromQuery] string? ownerType, CancellationToken ct)
        => Ok(await profiles.GetPayoutAsync(ownerType, ct));

    [HttpPut("payout-account"), Authorize(Roles = "Investor,OperatorMember")]
    public async Task<ActionResult<PayoutProfileResponse>> SavePayout([FromQuery] string? ownerType, PayoutAccountRequest req, CancellationToken ct)
        => Ok(await profiles.SavePayoutAsync(ownerType, req, ct));

    [HttpGet("addresses"), Authorize(Policy = Policies.Customer)]
    public async Task<ActionResult<IReadOnlyList<AddressResponse>>> Addresses(CancellationToken ct)
        => Ok(await profiles.ListAddressesAsync(ct));

    [HttpGet("addresses/{id:long}"), Authorize(Policy = Policies.Customer)]
    public async Task<ActionResult<AddressResponse>> Address(long id, CancellationToken ct)
        => Ok(await profiles.GetAddressAsync(id, ct));

    [HttpPost("addresses"), Authorize(Policy = Policies.Customer)]
    public async Task<ActionResult<AddressResponse>> CreateAddress(AddressRequest req, CancellationToken ct)
    {
        var address = await profiles.SaveAddressAsync(null, req, ct);
        return CreatedAtAction(nameof(Address), new { id = address.AddressId }, address);
    }

    [HttpPut("addresses/{id:long}"), Authorize(Policy = Policies.Customer)]
    public async Task<ActionResult<AddressResponse>> UpdateAddress(long id, AddressRequest req, CancellationToken ct)
        => Ok(await profiles.SaveAddressAsync(id, req, ct));

    [HttpDelete("addresses/{id:long}"), Authorize(Policy = Policies.Customer)]
    public async Task<IActionResult> DeleteAddress(long id, CancellationToken ct)
    {
        await profiles.DeleteAddressAsync(id, ct);
        return NoContent();
    }
}
