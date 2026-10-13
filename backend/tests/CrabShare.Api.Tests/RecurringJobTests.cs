using CrabShare.Api.Common.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CrabShare.Api.Tests;

public class RecurringJobTests
{
    private sealed class FlakyJob(IServiceScopeFactory scopes)
        : RecurringJob(scopes, NullLogger.Instance, new ConfigurationBuilder().Build())
    {
        public int Runs { get; private set; }

        protected override TimeSpan Interval => TimeSpan.FromMinutes(1);

        protected override Task RunAsync(IServiceProvider services, CancellationToken ct)
        {
            Runs++;
            if (Runs == 1) throw new InvalidOperationException("lỗi giả lập ở lần chạy đầu");
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Loi_o_mot_lan_chay_khong_lam_dung_job()
    {
        var scopes = new ServiceCollection().BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
        var job = new FlakyJob(scopes);

        await job.RunOnceAsync(CancellationToken.None);   // lần 1 ném lỗi → phải được bắt, không văng ra ngoài
        await job.RunOnceAsync(CancellationToken.None);   // lần 2 vẫn chạy bình thường

        Assert.Equal(2, job.Runs);
    }
}
