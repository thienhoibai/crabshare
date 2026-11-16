using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Sourcing;

public sealed class ProcurementOrderRequest
{
    [Range(1, long.MaxValue)] public long SupplierPartyId { get; set; }
    public DateOnly OrderedOn { get; set; }
    [Required, StringLength(300)] public string AgreedSpec { get; set; } = "";
    [Range(1, 100_000)] public int Quantity { get; set; }
    /// <summary>Đơn giá mỗi con (đồng).</summary>
    [Range(typeof(long), "0", "999999999999")] public long UnitPrice { get; set; }
}

public sealed class GoodsReceiptRequest
{
    [StringLength(30)] public string? LotCode { get; set; }
    [Required, StringLength(150)] public string OriginRegion { get; set; } = "";
    public DateOnly HarvestedOn { get; set; }
    [Required, StringLength(60)] public string DeclaredSpecies { get; set; } = "Scylla paramamosain";
    [Range(1, 100_000)] public int DeclaredCount { get; set; }
    [Range(typeof(decimal), "0.001", "100000")] public decimal DeclaredWeightKg { get; set; }
    /// <summary>Địa điểm nhận (trại hoặc trạm kiểm phẩm) của đơn vị thực hiện.</summary>
    public long? SiteId { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
    [StringLength(300)] public string? Note { get; set; }
}

/// <summary>Kiểm đầu vào một con (BR-101). Đạt khi mọi điều kiện đạt; con đạt được gắn mã cua nội bộ (BR-100).</summary>
public sealed class IncomingInspectionRequest
{
    [Required, StringLength(60)] public string Species { get; set; } = "Scylla paramamosain";
    [Required, RegularExpression("^(Male|Female)$")] public string Sex { get; set; } = "";
    [Required, RegularExpression("^(Immature|Mature|Unknown)$")] public string Maturity { get; set; } = "";
    public bool SpeciesOk { get; set; }
    public bool Alive { get; set; }
    public bool Healthy { get; set; }
    public bool TwoClaws { get; set; }
    public bool FoodSafe { get; set; }
    /// <summary>Khối lượng nhận, cân bằng cân điện tử (gram).</summary>
    [Range(typeof(decimal), "1", "5000")] public decimal WeightG { get; set; }
    [StringLength(300)] public string? Note { get; set; }
}

public sealed record ProcurementOrderResponse(string PoNo, string BatchCode, long SupplierPartyId, string SupplierName, DateOnly OrderedOn,
    string AgreedSpec, int Quantity, long UnitPrice, string Status, int ReceivedCount);
public sealed record GoodsReceiptResponse(string ReceiptNo, string PoNo, string LotCode, string OriginRegion, DateOnly HarvestedOn,
    int DeclaredCount, decimal DeclaredWeightKg, DateTimeOffset ReceivedAt, string Status, int AcceptedCount, int RejectedCount,
    long AcceptedWeightG, long? QcUserId, DateTimeOffset? CompletedAt);
public sealed record InspectionResponse(string InspectionNo, string Conclusion, string? RejectReason, string? CrabCode, decimal WeightG);
