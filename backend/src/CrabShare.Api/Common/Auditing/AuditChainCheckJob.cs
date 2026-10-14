using CrabShare.Api.Common.Jobs;

namespace CrabShare.Api.Common.Auditing;

/// <summary>
/// Mỗi 6 giờ kiểm tra lại toàn bộ chuỗi băm audit_log; gãy thì ghi log Critical (TL-08).
/// Cũng là ví dụ mẫu cách viết một RecurringJob.
/// </summary>
public sealed class AuditChainCheckJob(IServiceScopeFactory scopes, ILogger<AuditChainCheckJob> logger, IConfiguration config)
    : RecurringJob(scopes, logger, config)
{
    protected override TimeSpan Interval => TimeSpan.FromHours(6);

    protected override async Task RunAsync(IServiceProvider services, CancellationToken ct)
    {
        var result = await services.GetRequiredService<IAuditLog>().VerifyChainAsync(null, null, ct);
        if (result.IsValid)
            Logger.LogInformation("Chuỗi audit_log nguyên vẹn ({Rows} dòng)", result.CheckedRows);
        else
            Logger.LogCritical("Chuỗi audit_log bị gãy tại audit_id {AuditId}: {Problem}", result.BrokenAuditId, result.Problem);
    }
}
