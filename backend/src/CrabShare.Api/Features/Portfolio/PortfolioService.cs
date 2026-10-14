using System.Data;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Portfolio;

public sealed class PortfolioService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private sealed record Position(long BatchId, string Code, string Status, decimal Amount, decimal? Ratio,
        string Basis, PortfolioSettlement? Settlement);
    private sealed record BatchRow(long Id, string Code, string Title, string Farm, string CrabType, string Status,
        decimal Target, decimal Raised, decimal Minimum, int Cycle, int Seed, DateTimeOffset? Deadline,
        DateTimeOffset? StockedAt, DateTimeOffset? ClosedAt, DateOnly? HarvestDate, int? Alive, int Alerts, DateTimeOffset? ConfirmedAt);

    // Freeze/confirmation can run while the page is read: a read-only serializable transaction keeps
    // amounts, ratios, totals and metadata consistent. The configured execution strategy retries deadlocks.
    private Task<T> ReadAsync<T>(Func<Task<T>> read, CancellationToken ct) => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await RequireInvestorAsync(ct);
        var result = await read();
        await transaction.CommitAsync(ct);
        return result;
    });

    public Task<PortfolioPage> ListAsync(PortfolioQuery filter, PageQuery paging, CancellationToken ct) => ReadAsync(async () =>
    {
        var positions = await PositionsAsync(null, ct);
        var ids = positions.Keys.ToList();
        var query = db.Batches.AsNoTracking().Where(b => ids.Contains(b.BatchId));
        if (filter.Status is not null) query = query.Where(b => b.Status == filter.Status);
        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var text = filter.Q.Trim();
            query = query.Where(b => b.BatchCode.Contains(text) || b.Title.Contains(text) || b.Operator.LegalName.Contains(text));
        }
        var page = await Rows(query.OrderByDescending(b => b.CreatedAt).ThenByDescending(b => b.BatchId)).ToPagedAsync(paging, ct);
        var now = clock.GetUtcNow();
        var active = positions.Values.Where(p => p.Status is not ("Closed" or "Cancelled")).ToList();
        var summary = new PortfolioSummary(Money(positions.Values.Sum(p => p.Amount)), Money(active.Sum(p => p.Amount)), positions.Count,
            active.Count, positions.Values.Sum(p => p.Settlement?.NetPayout ?? 0));
        return new PortfolioPage(page.Items.Select(b => Item(b, positions[b.Id], now)).ToList(), page.Page, page.PageSize, page.Total, summary);
    }, ct);

    public Task<PortfolioDetail> GetAsync(string code, CancellationToken ct) => ReadAsync(async () =>
    {
        var positions = await PositionsAsync(code, ct);
        var position = positions.Values.SingleOrDefault() ?? throw Missing();
        var row = await Rows(db.Batches.AsNoTracking().Where(b => b.BatchId == position.BatchId)).SingleAsync(ct);
        var now = clock.GetUtcNow();
        var contributions = await db.Contributions.AsNoTracking().Where(c => c.BatchId == row.Id && c.InvestorId == me.UserId)
            .OrderByDescending(c => c.ReservedAt).ThenByDescending(c => c.ContributionId)
            .Select(c => new PortfolioContribution(c.ContributionId, (long)c.Amount, c.Status, c.ReservedAt, c.ConfirmedAt,
                c.InvestmentContract == null ? null : c.InvestmentContract.ContractNo,
                c.InvestmentContract == null ? null : c.InvestmentContract.Status,
                c.InvestmentContract == null ? null : c.InvestmentContract.FullySignedAt)).ToListAsync(ct);
        var timeline = new List<PortfolioTimelineEvent>();
        void Add(string type, string label, DateTimeOffset? at) { if (at is { } time && time <= now) timeline.Add(new(type, label, time)); }
        var dates = await db.Batches.AsNoTracking().Where(b => b.BatchId == row.Id)
            .Select(b => new { b.FundingOpenAt, b.CapitalClosedAt, b.StockedAt, b.HarvestStartedAt, b.ClosedAt }).SingleAsync(ct);
        Add("Funding", "Mở gọi vốn", dates.FundingOpenAt); Add("CapitalClosed", "Chốt vốn lô", dates.CapitalClosedAt);
        Add("Stocked", "Thả giống", dates.StockedAt); Add("Harvesting", "Bắt đầu thu hoạch", dates.HarvestStartedAt); Add("Closed", "Đóng lô", dates.ClosedAt);
        foreach (var c in contributions) { Add("Contribution", $"Xác nhận khoản góp #{c.Id}", c.ConfirmedAt); Add("Contract", $"Hợp đồng {c.ContractNo} đã đủ chữ ký", c.FullySignedAt); }
        var logs = await db.ProductionLogs.AsNoTracking().Where(l => l.BatchId == row.Id && l.ReceivedAt <= now)
            .OrderByDescending(l => l.ReceivedAt).ThenByDescending(l => l.ProductionLogId).Take(20).ToListAsync(ct);
        foreach (var log in logs) Add("Production", "Nhận nhật ký nuôi", log.ReceivedAt);
        var evidence = await db.Evidences.AsNoTracking().Where(e => e.BatchId == row.Id && e.ReviewStatus == "Accepted" && e.ReceivedAt <= now)
            .OrderByDescending(e => e.ReceivedAt).ThenByDescending(e => e.EvidenceId).Take(20)
            .Select(e => new { e.ReceivedAt, Slot = e.Slot == null ? null : e.Slot.SlotCode }).ToListAsync(ct);
        foreach (var e in evidence) Add("Evidence", e.Slot == null ? "Nhận bằng chứng đã chấp nhận" : $"Nhận bằng chứng hộp {e.Slot} đã chấp nhận", e.ReceivedAt);
        var latest = logs.FirstOrDefault();
        return new PortfolioDetail(Item(row, position, now), contributions,
            timeline.OrderByDescending(e => e.At).ThenBy(e => e.Type).Take(30).ToList(),
            latest == null ? null : new PortfolioProduction(latest.LogDate, latest.Ph, latest.WaterTempC, latest.SalinityPpt,
                latest.FeedKg, latest.Source, latest.PlausibilityFlag, latest.VerifiedAt));
    }, ct);

    private async Task<Dictionary<long, Position>> PositionsAsync(string? code, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        // This view is authoritative once capital is snapshotted. Never replace its amounts/ratio
        // with later contribution sums or expose unpublished settlement lines.
        var snapshots = await db.VInvestorPortfolios.AsNoTracking().Where(v => v.InvestorId == me.UserId && (code == null || v.BatchCode == code))
            .Select(v => new { Row = v, Published = db.Settlements.Any(s => s.BatchId == v.BatchId && s.ApprovedAt != null && s.ApprovedAt <= now
                && (s.Status == "Approved" || s.Status == "PaidOut" || s.Status == "Closed")) }).ToListAsync(ct);
        var positions = snapshots.ToDictionary(v => v.Row.BatchId, v => new Position(v.Row.BatchId, v.Row.BatchCode, v.Row.BatchStatus,
            v.Row.ConfirmedAmount, v.Row.CapitalRatio, "Frozen", !v.Published || v.Row.NetPayout == null ? null : new PortfolioSettlement(
                v.Row.SettlementStatus!, Money(v.Row.CapitalReturn!.Value), Money(v.Row.ProfitShare!.Value), Money(v.Row.TaxWithheld!.Value),
                Money(v.Row.NetPayout.Value), v.Row.InKindQtyKg!.Value)));
        var live = await db.Contributions.AsNoTracking().Where(c => c.InvestorId == me.UserId && c.Status == "Confirmed"
                && c.Batch.CapitalClosedAt == null && !c.Batch.CapitalShares.Any() && (code == null || c.Batch.BatchCode == code))
            .GroupBy(c => new { c.BatchId, c.Batch.BatchCode, c.Batch.Status })
            .Select(g => new { g.Key.BatchId, g.Key.BatchCode, g.Key.Status, Amount = g.Sum(c => c.Amount) }).ToListAsync(ct);
        var ids = live.Select(p => p.BatchId).ToList();
        var totals = await db.Contributions.AsNoTracking().Where(c => ids.Contains(c.BatchId) && c.Status == "Confirmed")
            .GroupBy(c => c.BatchId).Select(g => new { Id = g.Key, Total = g.Sum(c => c.Amount) }).ToDictionaryAsync(t => t.Id, t => t.Total, ct);
        foreach (var p in live)
        {
            var total = totals.GetValueOrDefault(p.BatchId);
            positions.Add(p.BatchId, new(p.BatchId, p.BatchCode, p.Status, p.Amount,
                total <= 0 ? null : decimal.Round(p.Amount / total, 6, MidpointRounding.AwayFromZero), "LiveConfirmed", null));
        }
        return positions;
    }
    private IQueryable<BatchRow> Rows(IQueryable<Infrastructure.Persistence.Entities.Batch> batches) => batches.Select(b => new BatchRow(
        b.BatchId, b.BatchCode, b.Title, b.Operator.LegalName, b.CrabType, b.Status, b.TargetCapital,
        b.TotalConfirmedCapital ?? (b.Contributions.Where(c => c.Status == "Confirmed").Sum(c => (decimal?)c.Amount) ?? 0),
        b.MinContribution, b.CycleDays, b.SeedQuantity, b.FundingDeadline, b.StockedAt, b.ClosedAt, b.ExpectedHarvestDate,
        b.CrabItems.Any() ? b.CrabItems.Count(c => c.Status == "Growing") : null,
        b.Alerts.Count(a => a.Status == "Open" || a.Status == "Escalated"),
        b.Contributions.Where(c => c.InvestorId == me.UserId && c.Status == "Confirmed" && c.ConfirmedAt != null).Max(c => c.ConfirmedAt)));
    private static PortfolioItem Item(BatchRow b, Position p, DateTimeOffset now)
    {
        int? day = null;
        var end = b.ClosedAt is { } closed && closed < now ? closed : now;
        if (b.StockedAt is { } stocked && stocked <= end)
            day = (end.ToOffset(TimeSpan.FromHours(7)).Date - stocked.ToOffset(TimeSpan.FromHours(7)).Date).Days + 1;
        return new(new(b.Code, b.Title, b.Farm, b.CrabType, b.Status, Money(b.Target), Money(b.Raised), Money(b.Minimum),
            b.Cycle, b.Seed, b.Deadline, b.StockedAt, b.HarvestDate, day, b.Alive, b.Alerts), Money(p.Amount), p.Ratio, p.Basis, b.ConfirmedAt, p.Settlement);
    }
    private async Task RequireInvestorAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.Investor) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active"
            && u.Investor != null && u.AppUserRoles.Any(r => r.RoleCode == Roles.Investor), ct))
            throw new ForbiddenException("portfolio.investor_required", "Chỉ nhà đầu tư đang có quyền mới được xem danh mục.");
    }
    private static long Money(decimal value) => checked((long)value);
    private static NotFoundException Missing() => new("portfolio.not_found", "Không tìm thấy lô trong danh mục của bạn.");
}
