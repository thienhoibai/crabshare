using System.Data;
using System.Globalization;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

/// <summary>UC09: authenticated investor reads of the terms published by UC08.</summary>
public sealed class BatchExploreService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private static readonly string[] PublishedStatuses = ["Funding", "Cancelled", "Stocked", "InProduction", "Harvesting", "Settlement", "Closed"];
    private sealed record Row(Batch Batch, string OperatorName, VBatchFundingProgress? Progress);

    // Keep publication, role checks and the returned detail in one consistent read, like PortfolioService.
    private Task<T> ReadAsync<T>(Func<Task<T>> read, CancellationToken ct) => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        if (!me.IsInRole(Roles.Investor) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active"
            && u.Investor != null && u.AppUserRoles.Any(r => r.RoleCode == Roles.Investor), ct))
            throw new ForbiddenException("batch.investor_required", "Chỉ nhà đầu tư đang có quyền mới được khám phá lô.");
        var result = await read();
        await transaction.CommitAsync(ct);
        return result;
    });

    private IQueryable<Batch> Published()
    {
        var now = clock.GetUtcNow();
        return db.Batches.AsNoTracking().Where(b => PublishedStatuses.Contains(b.Status)
            && b.ApprovedAt != null && b.ApprovedAt <= now && b.FundingOpenAt != null && b.FundingOpenAt <= now
            && db.StandardCostVersions.Any(v => v.BatchId == b.BatchId && v.Status == "Locked" && v.LockedAt != null && v.LockedAt <= now));
    }

    private IQueryable<Row> Rows(IQueryable<Batch> batches) =>
        from b in batches
        join progress in db.VBatchFundingProgresses.AsNoTracking().Where(p => p.TargetCapital > 0) on b.BatchId equals progress.BatchId into funding
        from p in funding.DefaultIfEmpty()
        select new Row(b, b.Operator.LegalName, p);

    public Task<PagedResult<ExploreBatchResponse>> ListAsync(ExploreBatchQuery query, PageQuery paging, CancellationToken ct) => ReadAsync(async () =>
    {
        var batches = Published();
        if (query.Status != null) batches = batches.Where(b => b.Status == query.Status);
        if (query.CrabType != null) batches = batches.Where(b => b.CrabType == query.CrabType);
        var page = await Rows(batches.OrderByDescending(b => b.CreatedAt).ThenByDescending(b => b.BatchId)).ToPagedAsync(paging, ct);
        return new PagedResult<ExploreBatchResponse>(page.Items.Select(row => Response(row, null)).ToList(), page.Page, page.PageSize, page.Total);
    }, ct);

    public Task<ExploreBatchResponse> GetAsync(string code, CancellationToken ct) => ReadAsync(async () =>
    {
        var row = await Rows(Published().Where(b => b.BatchCode == code)).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô đã công bố.");
        var cost = await db.StandardCostVersions.AsNoTracking().Include(v => v.StandardCostItems)
            .SingleAsync(v => v.BatchId == row.Batch.BatchId && v.Status == "Locked", ct);
        // Same per-line whole-VND rounding as the authoring/approval flow, before aggregating categories.
        var items = cost.StandardCostItems.GroupBy(i => i.Category).OrderBy(g => g.Key)
            .Select(g => new ExploreCostCategory(g.Key, checked((long)g.Sum(i => (decimal)BatchService.Amount(i.Quantity, i.UnitPrice))))).ToList();
        var summary = new ExploreStandardCost(cost.VersionNo, cost.Status, checked((long)items.Sum(i => (decimal)i.Amount)), items, cost.LockedAt);
        return Response(row, summary);
    }, ct);

    internal static ExploreFundingProgress Funding(VBatchFundingProgress? view, decimal target)
    {
        // SQL's positive-capital constraint prevents a zero divisor in the view. Keep the mapping safe
        // for absent/null rows too; never substitute reservations, recalculate, round or cap the view percentage.
        var percent = target > 0 ? view?.PctOfTarget ?? 0 : 0;
        return new(checked((long)(view?.ConfirmedCapital ?? 0)), checked((long)(view?.ReservedCapital ?? 0)), view?.InvestorCount ?? 0,
            percent, percent.ToString("F2", CultureInfo.InvariantCulture).Replace('.', ',') + "%");
    }

    private static ExploreBatchResponse Response(Row row, ExploreStandardCost? cost)
    {
        var b = row.Batch;
        return new(b.BatchCode, b.Title, row.OperatorName, b.CrabType, b.Status, b.SeedQuantity, b.ExpectedOutputKg,
            b.CycleDays, b.RestockCutoffDays, checked((long)b.MinViableCapital), checked((long)b.TargetCapital), checked((long)b.MaxCapital),
            checked((long)b.MinContribution), b.OperatorSharePct, b.FundingOpenAt, b.FundingDeadline, Funding(row.Progress, b.TargetCapital), cost);
    }
}
