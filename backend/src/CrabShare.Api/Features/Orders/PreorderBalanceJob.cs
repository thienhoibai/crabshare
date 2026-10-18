using CrabShare.Api.Common.Jobs;

namespace CrabShare.Api.Features.Orders;

public sealed class PreorderBalanceJob(IServiceScopeFactory scopes, ILogger<PreorderBalanceJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Orders:BalanceJob:Enabled";

    private readonly bool enabled = config.GetValue(EnabledKey, true);

    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (enabled) return base.ExecuteAsync(stoppingToken);
        Logger.LogInformation("Job {Job} đang tắt ({Key} = false)", nameof(PreorderBalanceJob), EnabledKey);
        return Task.CompletedTask;
    }

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<PreorderBalanceService>().IssueForHarvestingBatchesAsync(ct);
}
