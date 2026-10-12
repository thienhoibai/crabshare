namespace CrabShare.Api.Common.Alerts;

/// <summary>
/// Cửa duy nhất để module khác phát cảnh báo vận hành (UC19). Bản thật là AlertService của Features/Alerts (KH-05):
/// cùng lô + cùng loại còn Open thì cập nhật dòng cũ, không thêm dòng mới.
/// </summary>
public interface IAlertRaiser
{
    /// <param name="type">Giá trị CHECK ck_alert_alert_type, ví dụ <see cref="AlertTypes.LowStock"/>.</param>
    /// <param name="severity">Giá trị CHECK ck_alert_severity, ví dụ <see cref="AlertSeverities.Medium"/>.</param>
    /// <param name="message">Tối đa 300 ký tự (alert.message).</param>
    /// <param name="ackWithin">Hạn phản hồi tính từ lúc phát; quá hạn thì job leo thang chuyển Escalated.</param>
    Task RaiseAsync(long batchId, string type, string severity, string message, TimeSpan ackWithin, CancellationToken ct);
}

public static class AlertTypes
{
    public const string Mortality = "Mortality";
    public const string WaterQuality = "WaterQuality";
    public const string MilestoneDelay = "MilestoneDelay";
    public const string LowStock = "LowStock";
    public const string DataSilence = "DataSilence";
    public const string EvidenceFlag = "EvidenceFlag";
}

public static class AlertSeverities
{
    public const string Low = "Low";
    public const string Medium = "Medium";
    public const string High = "High";
    public const string Critical = "Critical";
}
