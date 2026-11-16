using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Portfolio;

public sealed class NotificationQuery
{
    public DateTimeOffset? After { get; set; }
    public DateTimeOffset? Until { get; set; }
}
public sealed record InvestorNotification(string Id, string Type, string Title, string Body,
    DateTimeOffset At, string BatchCode, bool CanOpenPortfolio, long? Amount);
public sealed record NotificationPage(IReadOnlyList<InvestorNotification> Items, int Page, int PageSize, int Total, DateTimeOffset AsOf);

[ApiController, Route("api/me/notifications"), Authorize(Policy = Policies.Investor)]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class NotificationsController(NotificationService notifications) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<NotificationPage>> List([FromQuery] NotificationQuery query, [FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await notifications.ListAsync(query, paging, ct));
}
