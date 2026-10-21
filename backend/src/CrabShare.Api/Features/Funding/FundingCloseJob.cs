using CrabShare.Api.Common.Jobs;

namespace CrabShare.Api.Features.Funding;

/// <summary>
/// Mỗi phút: hết hạn giữ chỗ, chốt vốn hoặc huỷ lô tới hạn gọi vốn (TH-07). Việc thật nằm ở <see cref="FundingCloseService"/>.
/// Tắt riêng job này bằng <c>Funding:CloseJob:Enabled = false</c> (biến môi trường <c>Funding__CloseJob__Enabled</c>;
/// test đặt trong TestBackgroundJobs); tắt mọi job bằng <c>Jobs:Enabled</c>.
/// </summary>
public sealed class FundingCloseJob(IServiceScopeFactory scopes, ILogger<FundingCloseJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    public const string EnabledKey = "Funding:CloseJob:Enabled";

    private readonly bool enabled = config.GetValue(EnabledKey, true);

    protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (enabled) return base.ExecuteAsync(stoppingToken);
        Logger.LogInformation("Job {Job} đang tắt ({Key} = false)", nameof(FundingCloseJob), EnabledKey);
        return Task.CompletedTask;
    }

    protected override async Task RunAsync(IServiceProvider services, CancellationToken ct)
    {
        var result = await services.GetRequiredService<FundingCloseService>().RunAsync(ct);
        if (result.ExpiredReservations > 0)
            Logger.LogInformation("Đã hết hạn {Count} khoản giữ chỗ", result.ExpiredReservations);
        foreach (var batch in result.Batches)
            Logger.LogInformation("Lô {BatchCode}: {Outcome}, vốn xác nhận {Capital:N0} đ, {Investors} nhà đầu tư, {Refunds} lệnh hoàn",
                batch.BatchCode, batch.Outcome, batch.ConfirmedCapital, batch.InvestorCount, batch.RefundCount);
    }
}
