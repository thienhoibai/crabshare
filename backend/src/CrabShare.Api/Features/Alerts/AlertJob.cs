using CrabShare.Api.Common.Auditing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Alerts;

public sealed class AlertJobOptions
{
    public bool Enabled { get; init; } = true;
    public int IntervalMinutes { get; init; } = 15;
    public int UtcOffsetHours { get; init; } = 7;
    public int DailyLogDueHour { get; init; } = 18;
    public int AckWithinHours { get; init; } = 2;
}

/// <summary>Có thể gọi trực tiếp từ bộ lập lịch chung của TH-02. Mỗi chu kỳ là một transaction.</summary>
public sealed class AlertJob(AlertService alerts, Infrastructure.Persistence.AppDbContext db, IOptions<AlertJobOptions> options, TimeProvider clock)
{
    public Task<int> RunAsync(CancellationToken ct = default) => alerts.TransactionAsync(async _ =>
    {
        var settings = options.Value;
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var local = now.ToOffset(TimeSpan.FromHours(settings.UtcOffsetHours));
        var today = DateOnly.FromDateTime(local.DateTime);
        var dayStart = new DateTimeOffset(today.ToDateTime(TimeOnly.MinValue), local.Offset).ToUniversalTime();
        var changed = 0;

        if (local.Hour >= settings.DailyLogDueHour)
        {
            var silent = await db.Batches.Where(b => b.Status == "InProduction" && (b.StockedAt == null || b.StockedAt <= now)
                && !b.ProductionLogs.Any(p => p.LogDate == today))
                .Select(b => b.BatchId).ToListAsync(ct);
            foreach (var batchId in silent)
                changed += await RaiseDailyAsync(batchId, AlertType.DataSilence, "Chưa có nhật ký ngày " + today.ToString("dd/MM/yyyy") + ".", dayStart, settings, ct);
        }

        var delayed = await db.DisbursementTranches.Where(t => t.PlannedDate < today && t.Status == "Planned"
            && (t.Batch.Status == "InProduction" || t.Batch.Status == "Stocked"))
            .Select(t => t.BatchId).Distinct().ToListAsync(ct);
        foreach (var batchId in delayed)
            changed += await RaiseDailyAsync(batchId, AlertType.MilestoneDelay, "Đợt giải ngân đã quá ngày dự kiến nhưng chưa được yêu cầu.", dayStart, settings, ct);

        // Cùng điều kiện với v_overdue_alerts; dùng TimeProvider để job/test cùng một mốc thời gian.
        var overdue = await db.Alerts.Include(a => a.Batch).ThenInclude(b => b.Operator)
            .Where(a => a.Status == "Open" && a.AckDeadline < now).OrderBy(a => a.AlertId).ToListAsync(ct);
        foreach (var alert in overdue)
        {
            var previous = await AuditChain.LockAndReadTailAsync(db, ct);
            alerts.Escalate(alert, previous, now);
            await db.SaveChangesAsync(ct); changed++;
        }
        return changed;
    }, ct);

    private async Task<int> RaiseDailyAsync(long batchId, AlertType type, string message, DateTimeOffset dayStart, AlertJobOptions settings, CancellationToken ct)
    {
        var kind = type.ToString();
        // Không tạo lại cảnh báo đã xác nhận/đóng trong cùng ngày, không tạo Open bên cạnh Escalated.
        if (await db.Alerts.AnyAsync(a => a.BatchId == batchId && a.AlertType == kind &&
            (a.Status == "Open" || a.Status == "Escalated" || a.RaisedAt >= dayStart), ct)) return 0;
        await alerts.RaiseAsync(batchId, type, AlertSeverity.Medium, message, TimeSpan.FromHours(settings.AckWithinHours), ct);
        return 1;
    }
}

public sealed partial class AlertService
{
    internal void Escalate(Infrastructure.Persistence.Entities.Alert alert, string? previous, DateTimeOffset now)
    {
        var old = Snapshot(alert); alert.Status = "Escalated"; alert.EscalatedAt = now; alert.UpdatedAt = now;
        AppendAudit(alert, "EscalateAlert", old, previous);
    }
}

public sealed class AlertJobWorker(IServiceScopeFactory scopes, IOptions<AlertJobOptions> options,
    TimeProvider clock, ILogger<AlertJobWorker> logger) : BackgroundService
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
                var changed = await scope.ServiceProvider.GetRequiredService<AlertJob>().RunAsync(stoppingToken);
                logger.LogInformation("Alert job completed: {Changed} changes", changed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogError(error, "Alert job failed; retry at the next interval"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
