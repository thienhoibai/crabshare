using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Catalog;

public enum StorageType { Fresh, Frozen }

/// <summary>Lý do đổi giá (TL-27 §6.2). "Initial" chỉ dùng cho giá lúc tạo niêm yết nên không có ở đây.</summary>
public enum PriceChangeReason { Market, Promotion, Clearance, Correction, Other }

public sealed class CreateListingRequest
{
    [Required, MaxLength(20)]
    public string BatchCode { get; set; } = "";

    [Required, MaxLength(20)]
    public string GradeCode { get; set; } = "";

    /// <summary>Mỗi lô + hạng chỉ có một kiểu bảo quản: "Fresh" hoặc "Frozen".</summary>
    public StorageType StorageType { get; set; } = StorageType.Fresh;

    /// <summary>Ngày cấp đông (chỉ với Frozen); bỏ trống = lúc tạo. Trần bán tính từ ngày này (TL-23).</summary>
    public DateTimeOffset? FrozenAt { get; set; }

    [MaxLength(200)]
    public string? Title { get; set; }

    /// <summary>Giá bán, số nguyên đồng / kg.</summary>
    [Range(1, 100_000_000)]
    public long PricePerKg { get; set; }
}

public sealed class ChangePriceRequest
{
    [Range(1, 100_000_000)]
    public long PricePerKg { get; set; }

    [Required]
    public PriceChangeReason? Reason { get; set; }

    [MaxLength(300)]
    public string? Note { get; set; }
}

public sealed record PriceCheckResponse(
    bool HasEnoughData,
    bool IsFlagged,
    int SampleCount,
    int OperatorCount,
    short WindowDays,
    long? MedianPricePerKg,
    decimal? Score,
    decimal? Threshold,
    string Method,
    string AlgorithmVersion);

public sealed record PriceRevisionResponse(
    long PriceHistoryId,
    long PricePerKg,
    long? PreviousPricePerKg,
    string Reason,
    string? Note,
    DateTimeOffset EffectiveFrom,
    string ChangedBy,
    bool FlaggedAbnormal,
    PriceCheckResponse? Check);

public sealed record ListingResponse(
    long ListingId,
    string Title,
    string Status,
    string BatchCode,
    string BatchTitle,
    string CrabType,
    string FarmName,
    string GradeCode,
    string GradeName,
    short? MinWeightG,
    short? MaxWeightG,
    string StorageType,
    DateTimeOffset? FrozenAt,
    DateTimeOffset? SellUntil,
    DateTimeOffset? HarvestedAt,
    long PricePerKg,
    decimal StockQtyKg,
    decimal ReservedQtyKg,
    decimal AvailableQtyKg,
    string? ImageUrl,
    DateTimeOffset? PublishedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<PriceRevisionResponse> PriceHistory);

/// <summary>Một hạng cua còn tồn trong lô đang thu hoạch — dùng cho form tạo niêm yết.</summary>
public sealed record ListingOptionResponse(
    string BatchCode,
    string BatchTitle,
    string CrabType,
    string GradeCode,
    string GradeName,
    int InStockCount,
    decimal InStockKg,
    long? ExistingListingId);
