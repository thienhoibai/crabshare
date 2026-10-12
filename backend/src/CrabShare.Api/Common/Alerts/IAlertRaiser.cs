using CrabShare.Api.Features.Alerts;

namespace CrabShare.Api.Common.Alerts;

/// <summary>
/// Cửa để module khác phát cảnh báo vận hành (UC19); bản chạy thật là <see cref="AlertServiceRaiser"/>.
/// Cùng lô + cùng loại còn Open/Escalated thì AlertService cập nhật dòng cũ, không thêm dòng mới.
/// </summary>
public interface IAlertRaiser
{
    /// <param name="message">Tối đa 300 ký tự (alert.message).</param>
    /// <param name="ackWithin">Hạn phản hồi tính từ lúc phát; quá hạn thì job leo thang chuyển Escalated.</param>
    Task RaiseAsync(long batchId, AlertType type, AlertSeverity severity, string message, TimeSpan ackWithin, CancellationToken ct);
}
