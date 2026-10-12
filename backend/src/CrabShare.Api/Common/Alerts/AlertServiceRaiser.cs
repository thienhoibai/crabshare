using CrabShare.Api.Features.Alerts;

namespace CrabShare.Api.Common.Alerts;

/// <summary>
/// Chuyển tiếp sang AlertService (KH-05). AlertService tham gia transaction của caller nếu có, nên chỉ gọi khi
/// caller không còn transaction mở hoặc đã khóa AuditChain trước khóa nghiệp vụ (docs/validation/CS-37-alerts.md).
/// </summary>
public sealed class AlertServiceRaiser(AlertService alerts) : IAlertRaiser
{
    public Task RaiseAsync(long batchId, AlertType type, AlertSeverity severity, string message, TimeSpan ackWithin, CancellationToken ct)
        => alerts.RaiseAsync(batchId, type, severity, message, ackWithin, ct);
}
