using CrabShare.Api.Common.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Mỗi phút chuyển đơn Delivered đã hết cửa sổ đổi trả sang Completed (UC30): việc thật ở <see cref="OrderCompletionService"/>.
/// Tắt riêng job này bằng <c>Orders:CompletionJob:Enabled = false</c> (biến môi trường <c>Orders__CompletionJob__Enabled</c>;
/// test đặt trong TestBackgroundJobs); tắt mọi job bằng <c>Jobs:Enabled</c>.
/// </summary>
public sealed class OrderCompletionJob(IServiceScopeFactory scopes, ILogger<OrderCompletionJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Orders:CompletionJob:Enabled";

    private readonly bool enabled = config.GetValue(EnabledKey, true);

    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (enabled) return base.ExecuteAsync(stoppingToken);
        Logger.LogInformation("Job {Job} đang tắt ({Key} = false)", nameof(OrderCompletionJob), EnabledKey);
        return Task.CompletedTask;
    }

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<OrderCompletionService>().CompleteDueAsync(ct);
}
