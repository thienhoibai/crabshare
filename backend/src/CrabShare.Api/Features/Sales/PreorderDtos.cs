using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Sales;

/// <summary>Đặt trước sỉ theo quy cách (BR-085…092, BR-234). Mỗi đơn chỉ chứa cua của một Lô.</summary>
public sealed class PreorderRequest : IValidatableObject
{
    [Required, StringLength(20)] public string BatchCode { get; set; } = "";
    /// <summary>Địa chỉ giao (địa điểm loại DeliveryAddress) của khách, có toạ độ (BR-015, BR-084).</summary>
    [Range(1, long.MaxValue)] public long DeliverySiteId { get; set; }
    [Required] public List<PreorderLineRequest> Lines { get; set; } = [];
    /// <summary>Chia đơn thành các đợt giao (BR-234). Bỏ trống thì một đợt duy nhất.</summary>
    public List<TrancheRequest>? Tranches { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Lines is null || Lines.Count == 0)
            yield return new("Đơn cần ít nhất một dòng.", [nameof(Lines)]);
        else if (Lines.Select(l => l.SpecCode?.Trim().ToUpperInvariant()).Distinct().Count() != Lines.Count)
            yield return new("Mỗi quy cách chỉ một dòng.", [nameof(Lines)]);
    }
}

public sealed class PreorderLineRequest : IValidatableObject
{
    [Required, StringLength(40)] public string SpecCode { get; set; } = "";
    /// <summary>ByCount (theo số con) hoặc ByKg (theo kg) (BR-087).</summary>
    [Required, RegularExpression("^(ByCount|ByKg)$")] public string Mode { get; set; } = "ByCount";
    [Range(1, 100_000)] public int? QtyCrabs { get; set; }
    [Range(typeof(decimal), "0.001", "100000")] public decimal? QtyKg { get; set; }
    /// <summary>Hạng tối thiểu chấp nhận: SPECIAL hoặc G1.</summary>
    [RegularExpression("^(SPECIAL|G1)$")] public string? MinGrade { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Mode == "ByCount" && (QtyCrabs is null || QtyKg is not null))
            yield return new("Dòng đặt theo số con phải có số con, không có kg.", [nameof(QtyCrabs)]);
        if (Mode == "ByKg" && (QtyKg is null || QtyCrabs is not null))
            yield return new("Dòng đặt theo kg phải có số kg, không có số con.", [nameof(QtyKg)]);
        if (QtyKg is { } kg && decimal.Round(kg, 3) != kg)
            yield return new("Số kg có tối đa 3 chữ số thập phân.", [nameof(QtyKg)]);
    }
}

public sealed class TrancheRequest
{
    [Range(1, 50)] public byte Seq { get; set; }
    public DateOnly DueDate { get; set; }
    [Required] public List<TrancheLineRequest> Lines { get; set; } = [];
}

public sealed class TrancheLineRequest
{
    [Required, StringLength(40)] public string SpecCode { get; set; } = "";
    [Range(1, 100_000)] public int? QtyCrabs { get; set; }
    [Range(typeof(decimal), "0.001", "100000")] public decimal? QtyKg { get; set; }
}

public sealed class SplitTranchesRequest
{
    [Required] public List<TrancheRequest> Tranches { get; set; } = [];
}

public sealed class CancelPreorderRequest
{
    [StringLength(300)] public string? Reason { get; set; }
}

public sealed record PreorderLineResponse(long LineId, string SpecCode, string SpecName, string Mode, int? QtyCrabs, decimal? QtyKg,
    int ConvertedCrabs, long PricePerKg, int ConversionWeightG, string? MinGrade, decimal EstimatedKg, long EstimatedValue);
public sealed record TrancheLineResponse(string SpecCode, int? QtyCrabs, decimal? QtyKg, int ConvertedCrabs);
public sealed record TrancheResponse(long TrancheId, byte Seq, DateOnly DueDate, string Status, IReadOnlyList<TrancheLineResponse> Lines);
public sealed record DepositPaymentResponse(long PaymentRequestId, string ReferenceCode, long Amount, string QrContent, DateTimeOffset ExpiresAt,
    string BatchAccountNo, string Status);
public sealed record PreorderResponse(string OrderNo, string BatchCode, string BatchMode, string Status, long EstimatedValue, decimal DepositRatePct,
    long DepositAmount, int ConvertedCrabs, DateTimeOffset PlacedAt, DateTimeOffset? HoldExpiresAt, DateTimeOffset? DepositedAt,
    DateTimeOffset? ConfirmedAt, string DeliveryAddress, decimal? DeliveryDistanceKm, IReadOnlyList<PreorderLineResponse> Lines,
    IReadOnlyList<TrancheResponse> Tranches, DepositPaymentResponse? Deposit, string? CancelReason);

public sealed record SpecAvailability(string SpecCode, string SpecName, long PricePerKg, int ConversionWeightG, int OfferedQuantity, int Committed, int Remaining);
public sealed record AvailabilityResponse(string BatchCode, bool AcceptingPreorders, int SellableCrabs, int CommittedCrabs, int RemainingCrabs,
    IReadOnlyList<SpecAvailability> Specs, int MinOrderCrabs, decimal DepositRatePct, int HoldMinutes);
