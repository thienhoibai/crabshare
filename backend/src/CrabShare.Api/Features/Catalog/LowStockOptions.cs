using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Catalog;

/// <summary>
/// Hạn phản hồi cảnh báo sắp hết hàng. Ngưỡng kg dùng chung <c>AlertThresholds.LowStockKg</c> của KH-05,
/// cả hai nằm trong mục Alerts:Thresholds.
/// </summary>
public sealed class LowStockOptions
{
    public const string Section = "Alerts:Thresholds";

    [Range(1, 720)]
    public int LowStockAckHours { get; set; } = 24;
}
