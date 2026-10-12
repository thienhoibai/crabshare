using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Alerts;

public enum AlertType { Mortality, WaterQuality, MilestoneDelay, LowStock, DataSilence, EvidenceFlag }
public enum AlertSeverity { Low, Medium, High, Critical }

public sealed record AlertResponse(long Id, string BatchCode, string FarmName, string Type, string Severity,
    string Message, DateTimeOffset RaisedAt, DateTimeOffset AckDeadline, string Status,
    DateTimeOffset? AcknowledgedAt, long? AcknowledgedBy, string? ResponseNote, DateTimeOffset? EscalatedAt,
    string? ResolutionNote = null);

public sealed class AlertFilter
{
    [RegularExpression("^(Open|Acknowledged|Escalated|Resolved)$")]
    public string? Status { get; init; }
}

public sealed class AcknowledgeAlertRequest
{
    [Required, StringLength(300), RegularExpression(@"[\s\S]*\S[\s\S]*", ErrorMessage = "Vui lòng ghi cách xử lý cảnh báo.")]
    public string ResponseNote { get; init; } = "";
}

public sealed class AdminAlertFilter
{
    [RegularExpression("^(Open|Acknowledged|Escalated|Resolved)$")]
    public string? Status { get; init; } = "Escalated";
    [RegularExpression("^(Low|Medium|High|Critical)$")]
    public string? Severity { get; init; }
    [StringLength(100)]
    public string? Q { get; init; }
}

public sealed class ResolveAlertRequest
{
    [Required, StringLength(300), RegularExpression(@"[\s\S]*\S[\s\S]*", ErrorMessage = "Vui lòng ghi kết quả xử lý cảnh báo.")]
    public string Note { get; init; } = "";
}

/// <summary>Ngưỡng cấu hình cho Production/Catalog; không giả định mọi loại cua cùng ngưỡng.</summary>
public sealed class AlertThresholds
{
    public decimal PhMin { get; init; } = 7.5m;
    public decimal PhMax { get; init; } = 8.5m;
    public decimal WaterTempMinC { get; init; } = 25m;
    public decimal WaterTempMaxC { get; init; } = 32m;
    public decimal SalinityMinPpt { get; init; } = 10m;
    public decimal SalinityMaxPpt { get; init; } = 30m;
    public decimal MortalityPercent { get; init; } = 5m;
    public decimal LowStockKg { get; init; } = 10m;
}
