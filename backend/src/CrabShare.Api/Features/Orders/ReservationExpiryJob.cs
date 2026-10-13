using CrabShare.Api.Common.Jobs;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Mỗi phút trả tồn cho đơn quá hạn thanh toán (BR-13, TL-28 §5): việc thật nằm ở <see cref="ReservationExpiryService"/>.
/// Tắt riêng job này bằng cấu hình <c>Orders:ExpiryJob:Enabled = false</c> (biến môi trường
/// <c>Orders__ExpiryJob__Enabled</c>; test đặt trong TestBackgroundJobs); tắt mọi job bằng <c>Jobs:Enabled</c>.
/// </summary>
public sealed class ReservationExpiryJob(IServiceScopeFactory scopes, ILogger<ReservationExpiryJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Orders:ExpiryJob:Enabled";

    private readonly bool enabled = config.GetValue(EnabledKey, true);

    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (enabled) return base.ExecuteAsync(stoppingToken);
        Logger.LogInformation("Job {Job} đang tắt ({Key} = false)", nameof(ReservationExpiryJob), EnabledKey);
        return Task.CompletedTask;
    }

    protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        => services.GetRequiredService<ReservationExpiryService>().ReleaseExpiredAsync(ct);
}
