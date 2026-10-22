using CrabShare.Api.Common.Jobs;

namespace CrabShare.Api.Features.Offtake;

/// <summary>
/// Mỗi phút: mở cửa sổ khi lô Harvesting, hết hạn thì mất cọc hoặc hoàn cọc, lô huỷ thì hoàn 100%.
/// Tắt bằng <c>Offtake:WindowJob:Enabled = false</c>.
/// </summary>
public sealed class OfftakeWindowJob(IServiceScopeFactory scopes, ILogger<OfftakeWindowJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Offtake:WindowJob:Enabled";

    private readonly bool enabled = config.GetValue(EnabledKey, true);

    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (enabled) return base.ExecuteAsync(stoppingToken);
        Logger.LogInformation("Job {Job} đang tắt ({Key} = false)", nameof(OfftakeWindowJob), EnabledKey);
        return Task.CompletedTask;
    }

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<OfftakeWindowService>().RunAsync(ct);
}
