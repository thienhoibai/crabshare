using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Operators;

[ApiController]
[Authorize]
[Route("api/operators")]
public sealed class OperatorsController(OperatorService operators) : ControllerBase
{
    [HttpPost]
    [EndpointSummary("UC04 — Tạo hồ sơ hộ nuôi nháp")]
    public async Task<ActionResult<OperatorResponse>> Create(OperatorProfileRequest req, CancellationToken ct)
        => CreatedAtAction(nameof(Me), await operators.CreateAsync(req, ct));

    // Xác minh role/membership từ DB trong service: token trước khi đăng ký vẫn dùng được cho UC04.
    [HttpGet("me")]
    public async Task<ActionResult<OperatorResponse>> Me(CancellationToken ct)
        => Ok(await operators.GetMeAsync(ct));

    [HttpPut("me")]
    public async Task<ActionResult<OperatorResponse>> Update(OperatorProfileRequest req, CancellationToken ct)
        => Ok(await operators.UpdateAsync(req, ct));

    [HttpPost("me/submit")]
    [EndpointSummary("UC04 — Gửi hồ sơ hộ nuôi xét duyệt")]
    public async Task<ActionResult<OperatorResponse>> Submit(CancellationToken ct)
        => Ok(await operators.SubmitAsync(ct));

    [HttpGet("me/members")]
    public async Task<ActionResult<IReadOnlyList<OperatorMemberResponse>>> Members(CancellationToken ct)
        => Ok(await operators.ListMembersAsync(ct));

    [HttpPost("me/members")]
    public async Task<ActionResult<OperatorMemberResponse>> AddMember(AddOperatorMemberRequest req, CancellationToken ct)
        => CreatedAtAction(nameof(Members), await operators.AddMemberAsync(req, ct));

    [HttpDelete("me/members/{userId:long}")]
    public async Task<IActionResult> RemoveMember(long userId, CancellationToken ct)
    {
        await operators.RemoveMemberAsync(userId, ct);
        return NoContent();
    }
}
