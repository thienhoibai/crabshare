using System.Data;
using System.Globalization;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Portfolio;

public sealed class NotificationService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private sealed record EventRow(int Kind, long Id, DateTimeOffset At, long BatchId, string Code, decimal? Amount);

    public Task<NotificationPage> ListAsync(NotificationQuery filter, PageQuery paging, CancellationToken ct)
    {
        // The server's millisecond boundary is reused for every page; clients never acknowledge their device clock.
        var now = DateTimeOffset.FromUnixTimeMilliseconds(clock.GetUtcNow().ToUnixTimeMilliseconds());
        var asOf = filter.Until ?? now;
        if (asOf > now || filter.After > asOf)
            throw new AppException(StatusCodes.Status400BadRequest, "notifications.invalid_window", "Mốc thời gian thông báo không hợp lệ.");
        return db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            if (!await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active" && u.Investor != null
                && u.AppUserRoles.Any(r => r.RoleCode == Roles.Investor), ct))
                throw new ForbiddenException("notifications.investor_required", "Bạn cần quyền nhà đầu tư để xem thông báo.");

            // Match CS-61 access: frozen shares are authoritative; live confirmed capital only before freezing.
            var owned = db.Batches.Where(b => b.CapitalShares.Any(s => s.InvestorId == me.UserId)
                || (b.CapitalClosedAt == null && !b.CapitalShares.Any() && b.Contributions.Any(c => c.InvestorId == me.UserId && c.Status == "Confirmed")));
            var ids = owned.Select(b => b.BatchId);
            var payments = db.Contributions.Where(c => c.InvestorId == me.UserId && c.ConfirmedAt != null
                && (c.Status == "Confirmed" || c.Status == "Refunded"))
                .Select(c => new { Kind = 1, Id = c.ContributionId, At = c.ConfirmedAt!.Value, c.BatchId, Code = c.Batch.BatchCode, Amount = (decimal?)c.Amount });
            var contracts = db.InvestmentContracts.Where(c => c.Contribution.InvestorId == me.UserId && c.FullySignedAt != null
                && (c.Status == "FullySigned" || c.Status == "Void"))
                .Select(c => new { Kind = 2, Id = c.ContractId, At = c.FullySignedAt!.Value, c.Contribution.BatchId, Code = c.Contribution.Batch.BatchCode, Amount = (decimal?)null });
            var production = db.ProductionLogs.Where(l => ids.Contains(l.BatchId))
                .Select(l => new { Kind = 3, Id = l.ProductionLogId, At = l.ReceivedAt, l.BatchId, Code = l.Batch.BatchCode, Amount = (decimal?)null });
            var alerts = db.Alerts.Where(a => ids.Contains(a.BatchId))
                .Select(a => new { Kind = 4, Id = a.AlertId, At = a.RaisedAt, a.BatchId, Code = a.Batch.BatchCode, Amount = (decimal?)null });
            // Publication starts at ProposedAt, so investors can see that a statement was published for review.
            // Do not expose unpublished draft amounts or pretend approval is an executed payout.
            var published = db.SettlementLines.Where(l => l.InvestorId == me.UserId
                && (l.Settlement.Status == "Proposed" || l.Settlement.Status == "Disputed" || l.Settlement.Status == "Approved" || l.Settlement.Status == "PaidOut" || l.Settlement.Status == "Closed")
                && (l.Settlement.ProposedAt != null || l.Settlement.ApprovedAt != null))
                .Select(l => new { Kind = 5, Id = l.SettlementId, At = (l.Settlement.ProposedAt ?? l.Settlement.ApprovedAt)!.Value, l.BatchId, Code = l.Batch.BatchCode, Amount = (decimal?)null });
            var payouts = db.PaymentInstructions.Where(p => p.InstructionType == "Payout" && p.Status == "Succeeded" && p.CompletedAt != null
                && p.SettlementLine != null && p.SettlementLine.InvestorId == me.UserId && p.SettlementLine.Settlement.ApprovedAt != null
                && p.SettlementLine.Settlement.ApprovedAt <= asOf
                && (p.SettlementLine.Settlement.Status == "Approved" || p.SettlementLine.Settlement.Status == "PaidOut" || p.SettlementLine.Settlement.Status == "Closed"))
                .Select(p => new { Kind = 6, Id = p.InstructionId, At = p.CompletedAt!.Value, p.SettlementLine!.BatchId, Code = p.SettlementLine.Batch.BatchCode, Amount = (decimal?)p.Amount });
            var events = payments.Concat(contracts).Concat(production).Concat(alerts).Concat(published).Concat(payouts)
                .Where(e => e.At <= asOf && (filter.After == null || e.At > filter.After));
            var page = await events.OrderByDescending(e => e.At).ThenBy(e => e.Kind).ThenByDescending(e => e.Id).ToPagedAsync(paging, ct);
            var pageBatchIds = page.Items.Select(e => e.BatchId).Distinct().ToList();
            var accessible = (await owned.Where(b => pageBatchIds.Contains(b.BatchId)).Select(b => b.BatchId).ToListAsync(ct)).ToHashSet();
            await transaction.CommitAsync(ct);
            return new NotificationPage(page.Items.Select(e => Describe(new(e.Kind, e.Id, e.At, e.BatchId, e.Code, e.Amount), accessible.Contains(e.BatchId))).ToList(), page.Page, page.PageSize, page.Total, asOf);
        });
    }

    private static InvestorNotification Describe(EventRow e, bool canOpen)
    {
        var amount = e.Amount is { } value ? checked((long)value) : (long?)null;
        var money = amount?.ToString("N0", CultureInfo.GetCultureInfo("vi-VN")) + " đ";
        var (type, title, body) = e.Kind switch
        {
            1 => ("PaymentConfirmed", "Đã nhận tiền", $"Khoản góp {money} cho lô {e.Code} đã được xác nhận."),
            2 => ("ContractSigned", "Hợp đồng đã đủ chữ ký", $"Hợp đồng góp vốn lô {e.Code} đã có đủ chữ ký."),
            3 => ("ProductionReceived", "Nhật ký nuôi mới", $"Đã nhận nhật ký nuôi mới của lô {e.Code}."),
            4 => ("AlertRaised", "Cảnh báo vận hành", $"Lô {e.Code} có cảnh báo mới. Mở danh mục để theo dõi lô."),
            5 => ("SettlementPublished", "Quyết toán đã công bố", $"Quyết toán lô {e.Code} đã được công bố. Thông báo này không xác nhận đã chi trả."),
            6 => ("PayoutSucceeded", "Đã chi trả", $"Lệnh chi trả {money} cho phần của bạn trong lô {e.Code} đã thành công."),
            _ => throw new InvalidOperationException("Unknown notification event")
        };
        return new($"{type}:{e.Id}", type, title, body, e.At, e.Code, canOpen, amount);
    }
}
