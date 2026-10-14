using System.Security.Cryptography;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Evidence;

public sealed class CaptureRequestOptions
{
    public const string Section = "Evidence:CaptureRequests";
    public bool Enabled { get; init; } = true;
    public int IntervalMinutes { get; init; } = 5;
    public int UtcOffsetHours { get; init; } = 7;
    public int DailyRequestHour { get; init; } = 9;
    public int ResponseWindowMinutes { get; init; } = 120;
    public int AlertAckWithinHours { get; init; } = 2;
}
public sealed record CaptureRequestJobResult(int Created, int Expired);

/// <summary>Daily selection and overdue processing; callable by a shared scheduler. Audit lock serializes multiple workers and uploads.</summary>
public sealed class CaptureRequestJob(AppDbContext db, AlertService alerts, IOptions<CaptureRequestOptions> options, TimeProvider clock)
{
    public Task<CaptureRequestJobResult> RunAsync(CancellationToken ct = default) => alerts.TransactionAsync(async _ =>
    {
        var settings = options.Value;
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var local = now.ToOffset(TimeSpan.FromHours(settings.UtcOffsetHours));
        var dayStart = new DateTimeOffset(local.Date, local.Offset).ToUniversalTime();
        var dayEnd = dayStart.AddDays(1);
        var overdue = await db.CaptureRequests.Include(r => r.Slot).Where(r => r.Status == "Open" && r.DueAt < now)
            .OrderBy(r => r.CaptureRequestId).ToListAsync(ct);
        foreach (var group in overdue.GroupBy(r => r.BatchId))
        {
            foreach (var request in group)
            {
                var old = Snapshot(request);
                request.Status = "Expired";
                await db.SaveChangesAsync(ct);
                await AuditAsync(request, "ExpireCaptureRequest", old, now, ct);
            }
            var codes = string.Join(", ", group.Select(r => r.Slot.SlotCode).Distinct().Take(3));
            await alerts.RaiseAsync(group.Key, AlertType.EvidenceFlag, AlertSeverity.Medium,
                $"Quá hạn chụp {group.Count()} hộp: {codes}. Vui lòng bổ sung bằng chứng.",
                TimeSpan.FromHours(settings.AlertAckWithinHours), ct);
        }

        var created = 0;
        if (local.Hour >= settings.DailyRequestHour)
        {
            var batchIds = await db.Batches.AsNoTracking().Where(b => b.Status == "InProduction" && b.Operator.Status == "Approved"
                && (b.StockedAt == null || b.StockedAt <= now)
                && !b.CaptureRequests.Any(r => r.Status == "Open" || (r.RequestedAt >= dayStart && r.RequestedAt < dayEnd)))
                .OrderBy(b => b.BatchId).Select(b => b.BatchId).ToListAsync(ct);
            foreach (var batchId in batchIds)
            {
                var slots = await db.SlotAllocations.AsNoTracking().Where(a => a.BatchId == batchId && a.ReleasedAt == null
                    && a.AllocatedAt <= now && a.Slot.Status == "Occupied" && a.Slot.OperatorId == a.Batch.OperatorId)
                    .Select(a => a.SlotId).Distinct().OrderBy(id => id).ToListAsync(ct);
                if (slots.Count == 0) continue;
                var request = new CaptureRequest { BatchId = batchId, SlotId = slots[RandomNumberGenerator.GetInt32(slots.Count)],
                    RequestedAt = now, DueAt = now.AddMinutes(settings.ResponseWindowMinutes), Status = "Open", CreatedAt = now };
                db.CaptureRequests.Add(request);
                await db.SaveChangesAsync(ct);
                await AuditAsync(request, "CreateCaptureRequest", null, now, ct);
                created++;
            }
        }
        return new CaptureRequestJobResult(created, overdue.Count);
    }, ct);

    private async Task AuditAsync(CaptureRequest request, string action, string? old, DateTimeOffset now, CancellationToken ct)
    {
        var previous = await AuditChain.LockAndReadTailAsync(db, ct);
        var row = new AuditLog { EntityType = "CaptureRequest", EntityId = request.CaptureRequestId, ActionType = action,
            OldValue = old, NewValue = Snapshot(request), ActorUserId = null, OccurredAt = now, PrevHash = previous };
        row.RowHash = AuditChain.Hash(row); db.AuditLogs.Add(row); await db.SaveChangesAsync(ct);
    }
    private static string Snapshot(CaptureRequest r) => AuditChain.Snapshot(new { r.BatchId, r.SlotId, r.RequestedAt, r.DueAt, r.Status, r.FulfilledAt });
}

public sealed class CaptureRequestWorker(IServiceScopeFactory scopes, IOptions<CaptureRequestOptions> options,
    TimeProvider clock, ILogger<CaptureRequestWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled) return;
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(options.Value.IntervalMinutes), clock);
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var result = await scope.ServiceProvider.GetRequiredService<CaptureRequestJob>().RunAsync(stoppingToken);
                logger.LogInformation("Capture request job: {Created} created, {Expired} expired", result.Created, result.Expired);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogError(error, "Capture request job failed; retry at next interval"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
