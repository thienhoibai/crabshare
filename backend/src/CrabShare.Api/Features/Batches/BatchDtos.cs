using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Batches;

/// <summary>
/// Điều khoản Lô theo Business Rule v1.5 (BR-018…055). Người nuôi khai cho lô P; Admin khai thay cho lô T và A.
/// Hệ thống tự tính Chi phí chuẩn mỗi con, vốn mục tiêu và số con đặt trước được (BR-035), người nuôi không nhập các số này.
/// </summary>
public sealed class BatchRequest : IValidatableObject
{
    [Required, StringLength(200)] public string Title { get; set; } = "";

    /// <summary>Loại cua theo bảng phân loại (BR-028): FatteningMudCrab (cua thịt), RoeCrab (cua gạch), YoungFemaleCrab (cua cái non), OilRoeCrab (cua gạch dầu).</summary>
    [Required, RegularExpression("^(FatteningMudCrab|RoeCrab|YoungFemaleCrab|OilRoeCrab)$")]
    public string CrabType { get; set; } = "";

    /// <summary>Sản lượng kế hoạch, tính bằng số con (BR-026).</summary>
    [Range(1, 100_000)] public int PlannedQuantity { get; set; }

    /// <summary>Lô có nuôi hoặc lưu giữ ở trại RAS (BR-105). Không lưu nuôi thì mua về, kiểm phẩm rồi giao.</summary>
    public bool HasHolding { get; set; } = true;

    /// <summary>Số ngày nuôi, bắt buộc khi có lưu nuôi (khoảng 4–5 tuần, BR-049).</summary>
    [Range(1, 365)] public short? HoldingDays { get; set; }

    /// <summary>Hạn thả bù tính từ ngày thả (ngày); mặc định 15 ngày.</summary>
    [Range(1, 365)] public short? RestockCutoffDays { get; set; }

    [Range(50, 5000)] public int ExpectedAvgWeightG { get; set; }
    [StringLength(50)] public string? ExpectedGrade { get; set; }
    [Range(1, 180)] public short SaleDays { get; set; } = 14;
    [Range(typeof(decimal), "0.1", "2000")] public decimal DeliveryRadiusKm { get; set; } = 50;

    /// <summary>Địa điểm xuất hàng của đơn vị thực hiện (trại hoặc kho). Bỏ trống thì dùng trại mặc định.</summary>
    public long? DispatchSiteId { get; set; }

    /// <summary>Ngày nhận hàng dự kiến; hạn gọi vốn phải trước ngày này (BR-050).</summary>
    public DateOnly ExpectedReceiptDate { get; set; }

    /// <summary>Lô P: vốn tối thiểu khả thi kèm căn cứ (BR-034). Không lớn hơn vốn mục tiêu.</summary>
    [Range(typeof(long), "1", "999999999999999999")] public long? MinViableCapital { get; set; }
    [StringLength(300)] public string? MinViableBasis { get; set; }

    /// <summary>Lô P: ngưỡng tỷ lệ sống, tỷ lệ thù lao cơ sở và các bậc thù lao (BR-046, BR-047).</summary>
    [Range(typeof(decimal), "0", "100")] public decimal? SurvivalThresholdPct { get; set; }
    [Range(typeof(decimal), "0", "100")] public decimal? BaseRemunerationPct { get; set; }
    public List<RemunerationTierRequest> RemunerationTiers { get; set; } = [];

    /// <summary>Giá sàn mỗi kg và bên cam kết thu mua (BR-044, BR-045).</summary>
    [Range(typeof(long), "1", "999999999999999999")] public long FloorPricePerKg { get; set; }
    [Range(1, long.MaxValue)] public long OfftakeBuyerPartyId { get; set; }

    /// <summary>StandardCost (mặc định) hoặc ActualCost: cơ sở quyết toán ghi trong hợp đồng trước khi gọi vốn (BR-037).</summary>
    [RegularExpression("^(StandardCost|ActualCost)$")] public string SettlementBasis { get; set; } = "StandardCost";

    /// <summary>Chào giá theo quy cách (BR-043).</summary>
    public List<OfferRequest> Offers { get; set; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (HasHolding && HoldingDays is null)
            yield return new("Lô có lưu nuôi phải khai số ngày nuôi.", [nameof(HoldingDays)]);
        if (Offers is null || Offers.Count == 0)
            yield return new("Cần ít nhất một chào giá theo quy cách.", [nameof(Offers)]);
        else if (Offers.Select(o => o.SpecCode?.Trim().ToUpperInvariant()).Distinct().Count() != Offers.Count)
            yield return new("Mỗi quy cách chỉ có một chào giá.", [nameof(Offers)]);
        if (RemunerationTiers is null)
            yield return new("Danh sách bậc thù lao không hợp lệ.", [nameof(RemunerationTiers)]);
    }
}

public sealed class RemunerationTierRequest
{
    [Range(typeof(decimal), "0", "100")] public decimal SurvivalFromPct { get; set; }
    [Range(typeof(decimal), "0", "100")] public decimal SurvivalToPct { get; set; }
    [Range(typeof(decimal), "0", "100")] public decimal RatePct { get; set; }
}

public sealed class OfferRequest
{
    [Required, StringLength(40)] public string SpecCode { get; set; } = "";
    [Range(typeof(long), "1", "999999999999999999")] public long PricePerKg { get; set; }
    /// <summary>Khối lượng quy đổi mỗi con (gram) để đổi kg đặt ra số con (BR-087).</summary>
    [Range(50, 5000)] public int ConversionWeightG { get; set; }
    [Range(1, 100_000)] public int OfferedQuantity { get; set; }
}

/// <summary>Kế hoạch chi phí cho cả Lô và các mốc giải ngân (BR-030…036, BR-145).</summary>
public sealed class CostPlanRequest
{
    [Required] public List<CostItemRequest> Items { get; set; } = [];
    /// <summary>Bỏ trống thì hệ thống tạo mốc mặc định: nhận cua xong, giữa vụ, quyết toán (BR-145).</summary>
    public List<MilestoneRequest>? Milestones { get; set; }
}

public sealed class CostItemRequest : IValidatableObject
{
    [Required, RegularExpression("^(Seed|Feed|Utilities|Labour|MortalityReserve|Depreciation|Other)$")]
    public string Category { get; set; } = "";
    [Required, StringLength(200)] public string Description { get; set; } = "";
    [Range(typeof(decimal), "0.001", "999999999.999")] public decimal Quantity { get; set; }
    [Required, StringLength(20)] public string Unit { get; set; } = "";
    [Range(typeof(long), "0", "999999999999999999")] public long UnitPrice { get; set; }
    [StringLength(300)] public string? Basis { get; set; }
    /// <summary>Batch (Lô chịu, mặc định), Executor (người nuôi tự chịu), Supplier.</summary>
    [RegularExpression("^(Batch|Executor|Supplier)$")] public string CostBearer { get; set; } = "Batch";

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (decimal.Round(Quantity, 3) != Quantity)
            yield return new("Số lượng có tối đa 3 chữ số thập phân.", [nameof(Quantity)]);
    }
}

public sealed class MilestoneRequest
{
    [Range(1, 20)] public byte No { get; set; }
    /// <summary>Receipt (nhận cua xong), MidCycle (giữa vụ), Settlement (quyết toán), Custom.</summary>
    [Required, RegularExpression("^(Receipt|MidCycle|Settlement|Custom)$")] public string Kind { get; set; } = "";
    [Required, StringLength(100)] public string Name { get; set; } = "";
    [Range(typeof(decimal), "0.01", "100")] public decimal Pct { get; set; }
    [StringLength(300)] public string? UnlockCondition { get; set; }
}

/// <summary>Admin tạo lô T (CrabShare mua bán) hoặc lô A (nhà cung cấp bán thẳng, CrabShare thu hoa hồng) (BR-018, BR-020).</summary>
public sealed class AdminBatchRequest
{
    [Required, RegularExpression("^(T|A)$")] public string BatchMode { get; set; } = "";
    /// <summary>Hộ nuôi hoặc trại đối tác vận hành nhận hàng, kiểm phẩm, lưu giữ cho Lô.</summary>
    [Range(1, long.MaxValue)] public long OperatorId { get; set; }
    /// <summary>Lô A: nhà cung cấp được kết nối, là đơn vị thực hiện và bên bán pháp lý (BR-019, BR-025).</summary>
    public long? SupplierPartyId { get; set; }
    /// <summary>Lô A: tỷ lệ hoa hồng theo hợp đồng đại lý (BR-201).</summary>
    [Range(typeof(decimal), "0", "100")] public decimal? CommissionPct { get; set; }
    [Required] public BatchRequest Terms { get; set; } = new();
}

public sealed class ApproveBatchRequest
{
    /// <summary>Lô P: thời điểm mở và hạn gọi vốn.</summary>
    public DateTimeOffset? FundingOpenAt { get; set; }
    public DateTimeOffset? FundingDeadline { get; set; }
    /// <summary>Lô T, A: hạn nhận đặt trước (BR-085).</summary>
    public DateTimeOffset? PreorderDeadline { get; set; }
}

public sealed class RejectBatchRequest
{
    [Required, StringLength(300)] public string Reason { get; set; } = "";
}

public sealed class CancelBatchRequest
{
    [Required, StringLength(300)] public string Reason { get; set; } = "";
}

public sealed class CostActualRequest
{
    [Range(1, long.MaxValue)] public long CostItemId { get; set; }
    [Range(typeof(long), "1", "999999999999999999")] public long Amount { get; set; }
    public DateOnly IncurredOn { get; set; }
    /// <summary>Ảnh hoặc bản chụp chứng từ đã tải lên (bằng chứng loại Invoice), hoặc số chứng từ.</summary>
    public long? DocumentEvidenceId { get; set; }
    [StringLength(100)] public string? DocumentRef { get; set; }
    [StringLength(300)] public string? Note { get; set; }
}

public sealed class BatchListQuery
{
    [RegularExpression("^(Draft|PendingApproval|NeedsRevision|Rejected|Funding|Cancelled|Sourcing|Stocked|InProduction|Harvesting|Selling|Settlement|Closed)$")]
    public string? Status { get; set; }
    [RegularExpression("^(P|T|A)$")] public string? BatchMode { get; set; }
}

public sealed record SpecResponse(long SpecId, string SpecCode, string CrabType, string SizeCode, string GradeCode, string LiveCondition, string Name);
public sealed record OfferResponse(long OfferId, string SpecCode, string SpecName, string SizeCode, string GradeCode, long PricePerKg,
    int ConversionWeightG, int OfferedQuantity);
public sealed record RemunerationTierResponse(byte TierNo, decimal SurvivalFromPct, decimal SurvivalToPct, decimal RatePct);
public sealed record CostItemResponse(long CostItemId, string Category, string Description, decimal Quantity, string Unit, long UnitPrice,
    long Amount, string? Basis, string? CostBearer, long ActualAmount);
public sealed record MilestoneResponse(byte No, string Kind, string Name, decimal Pct, string UnlockCondition, long? PlannedAmount);
public sealed record CostPlanResponse(short VersionNo, string Status, long Total, long CostPerCrab, long LockedTotal,
    IReadOnlyList<CostItemResponse> Items, IReadOnlyList<MilestoneResponse> Milestones, DateTimeOffset? LockedAt);
public sealed record PartyRefResponse(long PartyId, string PartyCode, string LegalName);
public sealed record SiteRefResponse(long SiteId, string SiteCode, string Name, string AddressLine, decimal? Latitude, decimal? Longitude);

public sealed record BatchResponse(
    string BatchCode, string BatchMode, string Status, string Title, string CrabType, long OperatorId,
    PartyRefResponse? Executor, int PlannedQuantity, int? FundedQuantity, bool HasHolding, short? HoldingDays, short RestockCutoffDays,
    int? ExpectedAvgWeightG, string? ExpectedGrade, short? SaleDays, decimal? DeliveryRadiusKm, SiteRefResponse? DispatchSite,
    DateOnly? ExpectedReceiptDate, long TargetCapital, long MinViableCapital, string? MinViableBasis, long MinContribution,
    decimal? SurvivalThresholdPct, decimal? BaseRemunerationPct, IReadOnlyList<RemunerationTierResponse> RemunerationTiers,
    long? FloorPricePerKg, PartyRefResponse? OfftakeBuyer, string SettlementBasis, decimal? PlatformFeeRatePct,
    IReadOnlyList<OfferResponse> Offers, CostPlanResponse? CostPlan,
    DateTimeOffset? FundingOpenAt, DateTimeOffset? FundingDeadline, DateTimeOffset? PreorderDeadline,
    string? RejectionReason, string? CancelReason, bool CanEdit, bool CanSubmit, bool CanCancel);
