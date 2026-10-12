namespace CrabShare.Api.Common.Alerts;

/// <summary>Bản tạm khi chưa có AlertService (KH-05): chỉ ghi log, không ghi bảng alert.</summary>
public sealed class LoggingAlertRaiser(ILogger<LoggingAlertRaiser> logger) : IAlertRaiser
{
    public Task RaiseAsync(long batchId, string type, string severity, string message, TimeSpan ackWithin, CancellationToken ct)
    {
        logger.LogWarning("Alert {Type}/{Severity} for batch {BatchId} (ack within {AckWithin}): {Message}",
            type, severity, batchId, ackWithin, message);
        return Task.CompletedTask;
    }
}
