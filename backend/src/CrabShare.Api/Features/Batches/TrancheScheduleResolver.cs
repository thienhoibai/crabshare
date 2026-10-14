using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Jobs;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Batches;

public sealed class TrancheScheduleResolver(AppDbContext db, IAuditLog audit, TimeProvider clock)
{
    private IQueryable<DisbursementTranche> Pending() => db.DisbursementTranches.Where(t => t.PlannedDate == null && t.AnchorCode != null && t.Status == "Planned" &&
        t.Batch.CapitalClosedAt != null && t.Batch.TotalConfirmedCapital >= t.Batch.MinViableCapital &&
        (t.AnchorCode == "FundingReady" || t.Batch.StockedAt != null) &&
        (t.Batch.Status == "Funding" || t.Batch.Status == "Stocked" || t.Batch.Status == "InProduction" || t.Batch.Status == "Harvesting"));
    public async Task<int> ResolveAsync(CancellationToken ct)
    {
        // Avoid taking the shared audit lock when there is no event ready to inspect.
        if (!await Pending().AsNoTracking().AnyAsync(ct)) return 0;
        return await db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var now = clock.GetUtcNow();
        var pending = await Pending()
            .Include(t => t.Batch).ThenInclude(b => b.Contributions).ThenInclude(c => c.InvestmentContract)
            .AsSplitQuery().OrderBy(t => t.TrancheId).ToListAsync(ct);
        var changed = 0;
        foreach (var t in pending)
        {
            var ready = FundingReadyAt(t.Batch);
            if (ready is null || ready > now) continue;
            DateTimeOffset? anchor = t.AnchorCode switch
            {
                "FundingReady" => ready,
                "Stocked" when t.Batch.StockedAt >= ready => t.Batch.StockedAt,
                _ => null
            };
            if (anchor is null || anchor > now) continue;
            var day = DateOnly.FromDateTime(anchor.Value.ToOffset(TimeSpan.FromHours(7)).DateTime);
            if (t.OffsetDays is not { } offset || offset < 0 || day.DayNumber > DateOnly.MaxValue.DayNumber - offset) continue;
            var before = new { t.TrancheId, t.PlannedDate, t.AnchorCode, t.OffsetDays };
            t.PlannedDate = day.AddDays(offset); t.UpdatedAt = now;
            await audit.WriteAsync("disbursement_tranche", t.TrancheId, "schedule_resolved", before,
                new { t.TrancheId, t.PlannedDate, t.AnchorCode, t.OffsetDays, anchorOccurredAt = anchor }, now, ct);
            changed++;
        }
        return changed;
    }, ct, IsolationLevel.Serializable);
    }

    private static DateTimeOffset? FundingReadyAt(Batch batch)
    {
        if (batch.CapitalClosedAt is not { } closed || batch.TotalConfirmedCapital is not { } total || total < batch.MinViableCapital) return null;
        var confirmed = batch.Contributions.Where(c => c.Status == "Confirmed").ToList();
        if (confirmed.Count == 0 || confirmed.Sum(c => c.Amount) != total ||
            confirmed.Any(c => c.InvestmentContract is not { Status: "FullySigned", FullySignedAt: not null })) return null;
        var lastSigned = confirmed.Max(c => c.InvestmentContract!.FullySignedAt!.Value);
        return lastSigned > closed ? lastSigned : closed;
    }
}

public sealed class TrancheScheduleOptions { public int IntervalSeconds { get; set; } = 60; }
public sealed class TrancheScheduleJob(IServiceScopeFactory scopes, ILogger<TrancheScheduleJob> logger, IConfiguration config, IOptions<TrancheScheduleOptions> options)
    : RecurringJob(scopes, logger, config)
{
    protected override TimeSpan Interval => TimeSpan.FromSeconds(options.Value.IntervalSeconds);
    protected override Task RunAsync(IServiceProvider services, CancellationToken ct) => services.GetRequiredService<TrancheScheduleResolver>().ResolveAsync(ct);
}
