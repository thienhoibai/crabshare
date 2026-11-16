using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Funding;

/// <summary>Bảng vốn vào theo lô cho AdminFinance (TH-07): đã giữ chỗ / đã xác nhận / mục tiêu, trạng thái chốt vốn, số lệnh hoàn.</summary>
public sealed class FundingAdminService(AppDbContext db, TimeProvider clock)
{
    private static readonly string[] StageOrder = ["AwaitingClose", "Open", "Scheduled", "CapitalClosed", "Cancelled"];

    public async Task<IReadOnlyList<AdminFundingBatch>> ListAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rows = await db.Batches.AsNoTracking()
            .Where(b => b.Status == "Funding" || b.Status == "Cancelled")
            .Select(b => new
            {
                b.BatchCode, b.Title, OperatorName = b.Operator.LegalName, b.Status,
                b.MinViableCapital, b.TargetCapital, b.MaxCapital, b.FundingOpenAt, b.FundingDeadline, b.CapitalClosedAt, b.TotalConfirmedCapital,
                Confirmed = b.Contributions.Where(c => c.Status == "Confirmed").Sum(c => (decimal?)c.Amount) ?? 0,
                Reserved = b.Contributions.Where(c => c.Status == "Reserved" && c.ExpiresAt > now).Sum(c => (decimal?)c.Amount) ?? 0,
                Investors = b.Contributions.Where(c => c.Status == "Confirmed").Select(c => c.InvestorId).Distinct().Count(),
                Refunds = db.PaymentInstructions.Count(i => i.BatchAccount.BatchId == b.BatchId && i.InstructionType == "Refund"),
                RefundsOpen = db.PaymentInstructions.Count(i => i.BatchAccount.BatchId == b.BatchId && i.InstructionType == "Refund" && i.Status != "Succeeded"),
            })
            .ToListAsync(ct);

        return rows
            .Select(r => new AdminFundingBatch(
                r.BatchCode, r.Title, r.OperatorName, r.Status,
                Stage(r.Status, r.CapitalClosedAt, r.FundingOpenAt, r.FundingDeadline, now),
                (long)r.MinViableCapital, (long)r.TargetCapital, (long)r.MaxCapital, (long)r.Confirmed, (long)r.Reserved, r.Investors,
                r.FundingOpenAt, r.FundingDeadline, r.CapitalClosedAt, r.TotalConfirmedCapital is { } total ? (long)total : null,
                r.Refunds, r.RefundsOpen))
            .OrderBy(b => Array.IndexOf(StageOrder, b.Stage))
            .ThenBy(b => b.FundingDeadline)
            .ToList();
    }

    private static string Stage(string status, DateTimeOffset? capitalClosedAt, DateTimeOffset? openAt, DateTimeOffset? deadline, DateTimeOffset now)
    {
        if (status == "Cancelled") return "Cancelled";
        if (capitalClosedAt is not null) return "CapitalClosed";
        if (deadline <= now) return "AwaitingClose";
        return openAt > now ? "Scheduled" : "Open";
    }
}

/// <param name="Stage">
/// <c>Scheduled</c> chưa tới giờ mở · <c>Open</c> đang nhận góp · <c>AwaitingClose</c> đã qua hạn, chờ job chốt ·
/// <c>CapitalClosed</c> đã chốt vốn · <c>Cancelled</c> huỷ vì thiếu vốn.
/// </param>
/// <param name="RefundOpenCount">Lệnh hoàn chưa được trung gian báo thành công.</param>
public sealed record AdminFundingBatch(
    string BatchCode, string Title, string OperatorName, string Status, string Stage,
    long MinViableCapital, long TargetCapital, long MaxCapital, long ConfirmedCapital, long ReservedCapital, int InvestorCount,
    DateTimeOffset? FundingOpenAt, DateTimeOffset? FundingDeadline, DateTimeOffset? CapitalClosedAt, long? TotalConfirmedCapital,
    int RefundCount, int RefundOpenCount);
