using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Catalog;

/// <summary>Ngưỡng cảnh báo sắp hết hàng. Nằm chung mục Alerts:Thresholds với các ngưỡng khác của KH-05.</summary>
public sealed class LowStockOptions
{
    public const string Section = "Alerts:Thresholds";

    /// <summary>Tồn khả dụng (stock − reserved) dưới mức này thì báo người nuôi.</summary>
    [Range(0.001, 100_000)]
    public decimal LowStockKg { get; set; } = 5;

    [Range(1, 720)]
    public int LowStockAckHours { get; set; } = 24;
}
