using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Batches;

public sealed class BatchRequest : IValidatableObject
{
    [Required, StringLength(200)] public string Title { get; set; } = "";
    [Required, RegularExpression("^(FatteningMudCrab|RoeCrab|SoftShellCrab)$")]
    public string CrabType { get; set; } = "";
    [Range(1, int.MaxValue)] public int SeedQuantity { get; set; }
    [Range(typeof(decimal), "0.001", "999999999.999")] public decimal ExpectedOutputKg { get; set; }
    [Range(1, short.MaxValue)] public short CycleDays { get; set; }
    [Range(1, short.MaxValue)] public short RestockCutoffDays { get; set; }
    [Range(typeof(long), "1", "999999999999999999")] public long MinViableCapital { get; set; }
    [Range(typeof(long), "1", "999999999999999999")] public long TargetCapital { get; set; }
    [Range(typeof(long), "1", "999999999999999999")] public long MaxCapital { get; set; }
    [Range(typeof(long), "1", "999999999999999999")] public long MinContribution { get; set; } = 1_000_000;
    [Range(typeof(decimal), "5", "10")] public decimal OperatorSharePct { get; set; } = 7;

    /// <summary>Giá chốt bao tiêu theo hạng (đồng/kg). Chỉ hạng có giá &gt; 0; trùng gradeCode = lỗi.</summary>
    public List<OfftakePriceRequest> OfftakePrices { get; set; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (MinViableCapital > TargetCapital || TargetCapital > MaxCapital)
            yield return new("Vốn phải thỏa tối thiểu khả thi ≤ mục tiêu ≤ tối đa.", [nameof(MinViableCapital), nameof(TargetCapital), nameof(MaxCapital)]);
        if (decimal.Round(ExpectedOutputKg, 3) != ExpectedOutputKg)
            yield return new("Sản lượng có tối đa 3 chữ số thập phân.", [nameof(ExpectedOutputKg)]);
        if (decimal.Round(OperatorSharePct, 2) != OperatorSharePct)
            yield return new("Thù lao có tối đa 2 chữ số thập phân.", [nameof(OperatorSharePct)]);
        if (OfftakePrices is null)
            yield return new("Danh sách giá bao tiêu không hợp lệ.", [nameof(OfftakePrices)]);
        else if (OfftakePrices.Select(p => p.GradeCode?.Trim().ToUpperInvariant()).Where(c => !string.IsNullOrEmpty(c)).Distinct().Count()
                 != OfftakePrices.Count(p => !string.IsNullOrWhiteSpace(p.GradeCode)))
            yield return new("Mỗi hạng chỉ được khai một giá bao tiêu.", [nameof(OfftakePrices)]);
    }
}

public sealed class OfftakePriceRequest
{
    [Required, StringLength(20)] public string GradeCode { get; set; } = "";
    [Range(typeof(long), "1", "999999999999999999")] public long UnitPrice { get; set; }
}

public sealed class StandardCostRequest
{
    [Required] public List<StandardCostItemRequest> Items { get; set; } = [];
    [Required] public List<CostTrancheRequest> Tranches { get; set; } = [];
}

public sealed class CostTrancheRequest : IValidatableObject
{
    [Range(1, 255)] public byte TrancheNo { get; set; }
    public DateOnly? PlannedDate { get; set; }
    [RegularExpression("^(FundingReady|Stocked)$")] public string? AnchorCode { get; set; }
    [Range(0, short.MaxValue)] public short? OffsetDays { get; set; }
    [Required, StringLength(300)] public string UnlockCondition { get; set; } = "";
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        var absolute = PlannedDate is not null && PlannedDate != default(DateOnly);
        var relative = AnchorCode is not null && OffsetDays is not null;
        if (absolute == relative || (absolute && (AnchorCode is not null || OffsetDays is not null)) || (relative && PlannedDate is not null))
            yield return new("Chọn mốc và số ngày sau mốc; lịch theo ngày cũ không được trộn với lịch theo mốc.");
    }
}

public sealed class ApproveBatchRequest
{
    [Required] public DateTimeOffset? FundingOpenAt { get; set; }
    [Required] public DateTimeOffset? FundingDeadline { get; set; }
}

public sealed class RejectBatchRequest
{
    [Required, StringLength(300)] public string Reason { get; set; } = "";
}

public sealed class StandardCostItemRequest : IValidatableObject
{
    [Required, RegularExpression("^(Seed|Feed|Utilities|Labour|MortalityReserve|Depreciation|Other)$")]
    public string Category { get; set; } = "";
    [Required, StringLength(200)] public string Description { get; set; } = "";
    [Range(typeof(decimal), "0.001", "999999999.999")] public decimal Quantity { get; set; }
    [Required, StringLength(20)] public string Unit { get; set; } = "";
    [Range(typeof(long), "0", "999999999999999999")] public long UnitPrice { get; set; }
    public byte? TrancheNo { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if ((Category == "Depreciation") != (TrancheNo is null))
            yield return new("Khấu hao không có đợt giải ngân; các khoản khác phải chọn đợt (0–255).", [nameof(TrancheNo)]);
        if (decimal.Round(Quantity, 3) != Quantity)
            yield return new("Số lượng có tối đa 3 chữ số thập phân.", [nameof(Quantity)]);
    }
}

public sealed class BatchListQuery
{
    [RegularExpression("^(Draft|PendingApproval|Rejected|Funding|Cancelled|Stocked|InProduction|Harvesting|Settlement|Closed)$")]
    public string? Status { get; set; }
}

public sealed record StandardCostItemResponse(string Category, string Description, decimal Quantity, string Unit,
    long UnitPrice, byte? TrancheNo, long Amount);
public sealed record CostTrancheResponse(byte TrancheNo, DateOnly? PlannedDate, string UnlockCondition, long Amount, string? AnchorCode, short? OffsetDays);
public sealed record StandardCostResponse(short VersionNo, string Status, long Total, IReadOnlyList<StandardCostItemResponse> Items,
    IReadOnlyList<CostTrancheResponse> Tranches, DateTimeOffset? LockedAt);
public sealed record OfftakePriceResponse(string GradeCode, string GradeName, long UnitPrice);

public sealed record BatchResponse(string BatchCode, long OperatorId, string Title, string CrabType, int SeedQuantity,
    decimal ExpectedOutputKg, short CycleDays, short RestockCutoffDays, long MinViableCapital, long TargetCapital,
    long MaxCapital, long MinContribution, decimal OperatorSharePct, string Status, StandardCostResponse? StandardCost,
    bool CanEdit, bool CanSubmit, string? RejectionReason,
    decimal OfftakePreorderCapPct, decimal OfftakeDepositPct, IReadOnlyList<OfftakePriceResponse> OfftakePrices);

public sealed record BatchOperatorResponse(long OperatorId, string LegalName, string FarmAddress, string Status);
public sealed record DisbursementResponse(byte TrancheNo, long PlannedAmount, DateOnly? PlannedDate, string UnlockCondition, string Status, string? AnchorCode, short? OffsetDays);
public sealed record AdminBatchResponse(BatchResponse Batch, BatchOperatorResponse Operator, DateTimeOffset? FundingOpenAt,
    DateTimeOffset? FundingDeadline, long? FeeTierId, string? FeeTierCode, long? PlatformFeeAmount, string? RejectionReason,
    DateTimeOffset? ApprovedAt, long? ApprovedBy, IReadOnlyList<DisbursementResponse> Tranches);

