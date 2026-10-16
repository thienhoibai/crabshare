using CrabShare.Api.Common.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Mỗi phút quét các khiếu nại Open đã quá hạn phản hồi (24h) để tự động chuyển sang Escalated (UC31, UC32).
/// Tắt bằng cấu hình Orders:ComplaintEscalationJob:Enabled = false.
/// </summary>
public sealed class ComplaintEscalationJob(IServiceScopeFactory scopes, ILogger<ComplaintEscalationJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Orders:ComplaintEscalationJob:Enabled";

    private readonly bool enabled = config.GetValue(EnabledKey, true);

    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (enabled) return base.ExecuteAsync(stoppingToken);
        Logger.LogInformation("Job {Job} đang tắt ({Key} = false)", nameof(ComplaintEscalationJob), EnabledKey);
        return Task.CompletedTask;
    }

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<ComplaintService>().EscalateOverdueAsync(ct);
}
