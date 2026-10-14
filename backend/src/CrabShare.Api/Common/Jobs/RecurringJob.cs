using System.Diagnostics;

namespace CrabShare.Api.Common.Jobs;

/// <summary>
/// Khung job nền chạy lặp theo chu kỳ (TH-02). Kế thừa lớp này: đặt Interval và viết RunAsync,
/// rồi đăng ký bằng services.AddHostedService&lt;TênJob&gt;().
/// - Lần chạy đầu là sau một chu kỳ kể từ lúc API khởi động (test ngắn không bị job chen vào).
/// - Mỗi lần chạy có scope DI riêng → AppDbContext mới, không dùng chung với request nào.
/// - Lỗi được ghi log rồi chờ chu kỳ sau; job không dừng hẳn.
/// - Tắt mọi job: appsettings "Jobs:Enabled": false.
/// </summary>
public abstract class RecurringJob(IServiceScopeFactory scopes, ILogger logger, IConfiguration config) : BackgroundService
{
    protected ILogger Logger { get; } = logger;

    /// <summary>Khoảng cách giữa hai lần chạy.</summary>
    protected abstract TimeSpan Interval { get; }

    /// <summary>Việc của job. Lấy service qua <paramref name="services"/> (ví dụ AppDbContext, IAuditLog).</summary>
    protected abstract Task RunAsync(IServiceProvider services, CancellationToken ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue("Jobs:Enabled", true))
        {
            Logger.LogInformation("Job {Job} đang tắt (Jobs:Enabled = false)", GetType().Name);
            return;
        }

        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
            await RunOnceAsync(stoppingToken);
    }

    /// <summary>Chạy đúng một lần. Để public cho test gọi trực tiếp, không phải chờ chu kỳ.</summary>
    public async Task RunOnceAsync(CancellationToken ct)
    {
        var job = GetType().Name;
        var started = Stopwatch.GetTimestamp();
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await RunAsync(scope.ServiceProvider, ct);
            Logger.LogInformation("Job {Job} xong sau {Elapsed:N0} ms", job, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // API đang tắt: dừng êm, không báo lỗi
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Job {Job} lỗi sau {Elapsed:N0} ms, sẽ chạy lại ở chu kỳ sau", job,
                Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
    }
}
