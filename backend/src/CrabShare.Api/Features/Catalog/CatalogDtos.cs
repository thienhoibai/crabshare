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
    DateTimeOffset? HiddenAt,
    string? HiddenReason,
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

// ---------- Kiểm duyệt (UC24, quản trị) ----------

/// <summary>?flagged=true&amp;hidden=false&amp;status=Published — bỏ trống = không lọc.</summary>
public sealed class AdminListingQuery
{
    /// <summary>true = lần đổi giá gần nhất bị gắn cờ bất thường.</summary>
    public bool? Flagged { get; set; }

    public bool? Hidden { get; set; }

    [RegularExpression("^(Draft|Published|SoldOut|Closed)$")]
    public string? Status { get; set; }
}

public sealed class HideListingRequest
{
    [Required, MaxLength(300)]
    public string Reason { get; set; } = "";
}

public sealed record AdminListingResponse(
    long ListingId,
    string Title,
    string Status,
    string BatchCode,
    string FarmName,
    string CrabType,
    string GradeCode,
    string GradeName,
    string StorageType,
    long PricePerKg,
    decimal AvailableQtyKg,
    string? ImageUrl,
    DateTimeOffset? PublishedAt,
    PriceRevisionResponse? LatestPrice,
    DateTimeOffset? HiddenAt,
    string? HiddenBy,
    string? HiddenReason);

// ---------- Cửa hàng (UC25, công khai) ----------

public enum StoreSort { Newest, PriceAsc, PriceDesc }

/// <summary>?crabType=RoeCrab&amp;grade=L1&amp;storage=Fresh&amp;sort=PriceAsc&amp;page=1&amp;pageSize=20 — bỏ trống = không lọc.</summary>
public sealed class StoreListingQuery
{
    /// <summary>FatteningMudCrab, RoeCrab, SoftShellCrab.</summary>
    [MaxLength(30)]
    public string? CrabType { get; set; }

    /// <summary>Mã hạng: L1–L4, SOFT.</summary>
    [MaxLength(20)]
    public string? Grade { get; set; }

    public StorageType? Storage { get; set; }

    public StoreSort Sort { get; set; } = StoreSort.Newest;

    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 20;
}

/// <summary>Thẻ sản phẩm ở cửa hàng. Không lộ phần đang giữ cho đơn hay người đổi giá.</summary>
public sealed record StoreListingResponse(
    long ListingId,
    string Title,
    string Status,
    string CrabType,
    string GradeCode,
    string GradeName,
    short? MinWeightG,
    short? MaxWeightG,
    string StorageType,
    string BatchCode,
    string FarmName,
    DateTimeOffset? HarvestedAt,
    long PricePerKg,
    decimal AvailableQtyKg,
    bool InStock,
    string? ImageUrl,
    DateTimeOffset? PublishedAt);

public sealed record PublicPriceRevisionResponse(
    long PricePerKg,
    long? PreviousPricePerKg,
    string Reason,
    DateTimeOffset EffectiveFrom,
    bool FlaggedAbnormal);

public sealed record StoreListingDetailResponse(
    StoreListingResponse Listing,
    string BatchTitle,
    DateTimeOffset? FrozenAt,
    DateTimeOffset? SellUntil,
    string? TraceTagCode,
    IReadOnlyList<PublicPriceRevisionResponse> PriceHistory);
