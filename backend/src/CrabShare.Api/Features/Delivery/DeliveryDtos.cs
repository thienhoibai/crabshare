using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Delivery;

// ---------- Đợt giao, chuyến giao, nghiệm thu (BR-160, BR-162, BR-164 – BR-168, BR-234) ----------

public sealed record TrancheLineStatus(long LineId, string SpecCode, int OrderedCrabs, int AllocatedCrabs, int SubstitutedCrabs, decimal PricePerKg);

public sealed record TrancheStatusResponse(long TrancheId, string OrderNo, string OrderStatus, int Seq, DateOnly DueDate, string Status,
    string RecipientName, string RecipientPhone, string DeliveryAddress, IReadOnlyList<TrancheLineStatus> Lines, string? ShipmentNo, string? ShipmentStatus);

public sealed class CreateShipmentRequest
{
    [Required] public DateTimeOffset? ScheduledAt { get; set; }
    [StringLength(300)] public string? TransportCondition { get; set; }
    /// <summary>Thiếu cua đúng quy cách thì cho phép thay cua cùng size, hạng cao hơn, giá theo dòng đơn (BR-160).</summary>
    public bool AllowSubstitution { get; set; } = true;
}

public sealed class DispatchLineRequest
{
    [Range(1, long.MaxValue)] public long LineId { get; set; }
    [Range(0, 100000)] public int DispatchedCrabs { get; set; }
    [Range(typeof(decimal), "0", "100000")] public decimal DispatchedKg { get; set; }
}

public sealed class DispatchRequest
{
    [Required, MinLength(1)] public List<DispatchLineRequest> Lines { get; set; } = [];
    [StringLength(300)] public string? TransportCondition { get; set; }
}

public sealed class ReceiptLineRequest
{
    [Range(1, long.MaxValue)] public long LineId { get; set; }
    [Range(0, 100000)] public int ReceivedCrabs { get; set; }
    [Range(typeof(decimal), "0", "100000")] public decimal ReceivedKg { get; set; }
    [Range(0, 100000)] public int AcceptedCrabs { get; set; }
    [Range(typeof(decimal), "0", "100000")] public decimal AcceptedKg { get; set; }
}

/// <summary>Cân lần hai khi nhận theo từng dòng giao (BR-165); mã các con khách từ chối nếu có.</summary>
public sealed class ReceiptRequest
{
    [Required, MinLength(1)] public List<ReceiptLineRequest> Lines { get; set; } = [];
    public List<string>? RejectedCrabCodes { get; set; }
    [StringLength(300)] public string? DiscrepancyReason { get; set; }
}

public sealed class RefuseDeliveryRequest
{
    [Required, StringLength(300, MinimumLength = 3)] public string Reason { get; set; } = "";
}

public sealed class CancelTrancheRequest
{
    [Required, StringLength(300, MinimumLength = 3)] public string Reason { get; set; } = "";
}

public sealed record ShipmentLineResponse(long LineId, string SpecCode, decimal PricePerKg, int? DispatchedCrabs, decimal? DispatchedKg, int? ReceivedCrabs,
    decimal? ReceivedKg, int? AcceptedCrabs, decimal? AcceptedKg, int? RejectedCrabs, decimal? TransportLossKg, long? GoodsValue);

public sealed record AcceptanceResponse(string Status, int AcceptedCrabs, decimal AcceptedKg, int RejectedCrabs, string? DiscrepancyReason,
    DateTimeOffset OperatorRecordedAt, DateTimeOffset? CustomerConfirmedAt, long? GoodsValue, long? DepositApplied, long? BalanceDue,
    DateTimeOffset? BalanceDueAt, DateTimeOffset? BalancePaidAt);

public sealed record BalancePaymentResponse(long PaymentRequestId, string ReferenceCode, long Amount, string QrContent, DateTimeOffset ExpiresAt,
    string AccountNo, string Status);

public sealed record InvoiceResponse(string InvoiceNo, int? TrancheSeq, long Amount, string SellerName, string BuyerName, string Status, DateTimeOffset IssuedAt);

public sealed record ShipmentResponse(string ShipmentNo, string OrderNo, int TrancheSeq, string Status, DateTimeOffset ScheduledAt, DateTimeOffset? DispatchedAt,
    DateTimeOffset? DeliveredAt, DateTimeOffset? ReturnWindowEndsAt, string? TransportCondition, IReadOnlyList<ShipmentLineResponse> Lines,
    AcceptanceResponse? Acceptance, BalancePaymentResponse? Balance, string? TraceCode);

public sealed record OrderDeliveriesResponse(string OrderNo, string Status, long DepositAmount, long DepositApplied, string? TraceCode,
    IReadOnlyList<ShipmentResponse> Shipments, IReadOnlyList<InvoiceResponse> Invoices, DateTimeOffset? ReturnWindowEndsAt);

public sealed record AllocationResponse(string CrabCode, string OrderNo, string OrderType, int? TrancheSeq, string? LineSpecCode, string? CrabSpecCode,
    bool IsSubstitution, string Status, DateTimeOffset AllocatedAt, DateTimeOffset? ReleasedAt, string? ReleaseReason);

// ---------- Khiếu nại, đánh giá (BR-172 – BR-176) ----------

public sealed class CreateClaimRequest
{
    [Required, StringLength(20)] public string ShipmentNo { get; set; } = "";
    [Required, StringLength(30)] public string SpecCode { get; set; } = "";
    [Required, RegularExpression("^(Return|Complaint)$")] public string ClaimType { get; set; } = "";
    [Required, RegularExpression("^(Dead|Weak|WrongSize|WrongWeight|Late|FoodSafety)$")] public string IssueType { get; set; } = "";
    [Range(1, 100000)] public int? AffectedCrabs { get; set; }
    [Range(typeof(decimal), "0.001", "100000")] public decimal? AffectedKg { get; set; }
    [Required, StringLength(1000, MinimumLength = 3)] public string Description { get; set; } = "";
    /// <summary>Ảnh bằng chứng chụp trong app; không có ảnh thì không gửi được (BR-172).</summary>
    [Required] public IFormFile? Photo { get; set; }
}

public sealed class RespondClaimRequest
{
    public bool Accept { get; set; }
    [Required, StringLength(500, MinimumLength = 3)] public string Response { get; set; } = "";
    /// <summary>Kg hoàn khi chấp nhận; bỏ trống thì lấy kg bị ảnh hưởng do khách khai.</summary>
    [Range(typeof(decimal), "0.001", "100000")] public decimal? RefundKg { get; set; }
}

public sealed class CustomerReplyRequest
{
    public bool Agree { get; set; }
}

public sealed class AdminClaimDecisionRequest
{
    public bool Accept { get; set; }
    [Required, StringLength(500, MinimumLength = 3)] public string Decision { get; set; } = "";
    [Range(typeof(decimal), "0.001", "100000")] public decimal? RefundKg { get; set; }
}

public sealed record ClaimResponse(string ClaimNo, string OrderNo, string ShipmentNo, string SpecCode, string ClaimType, string IssueType, int? AffectedCrabs,
    decimal? AffectedKg, string Description, string Status, DateTimeOffset ResponseDueAt, string? OperatorResponse, DateTimeOffset? OperatorRespondedAt,
    bool? CustomerAgreed, string? AdminDecision, DateTimeOffset? DecidedAt, decimal? RefundKg, long? RefundAmount, DateTimeOffset CreatedAt);

public sealed class RateOrderRequest
{
    [Range(1, 5)] public int Stars { get; set; }
    [StringLength(1000)] public string? Comment { get; set; }
}

public sealed record OrderRatingResponse(string OrderNo, int Stars, string? Comment, DateTimeOffset CreatedAt);

// ---------- Đơn có hoá đơn, đơn hàng cuối (BR-169, BR-177 – BR-182) ----------

public sealed class InvoicedSaleRequest
{
    [Required, RegularExpression("^(LowGrade|ForfeitResale|Surplus)$")] public string SaleReason { get; set; } = "";
    [Required, StringLength(200, MinimumLength = 2)] public string BuyerName { get; set; } = "";
    [StringLength(15)] public string? BuyerPhone { get; set; }
    public long? BuyerPartyId { get; set; }
    [Required, MinLength(1)] public List<string> CrabCodes { get; set; } = [];
    [Range(typeof(decimal), "0.001", "100000")] public decimal Kg { get; set; }
    [Range(1, 100_000_000)] public long PricePerKg { get; set; }
    /// <summary>Đơn mất cọc mà cua được bán lại (ForfeitResale).</summary>
    [StringLength(20)] public string? SourceOrderNo { get; set; }
}

public sealed class FinalOrderRequest
{
    [Range(typeof(decimal), "0.001", "100000")] public decimal Kg { get; set; }
    [Range(1, 100_000_000)] public long PricePerKg { get; set; }
}

public sealed class CancelDirectSaleRequest
{
    [Required, StringLength(300, MinimumLength = 3)] public string Reason { get; set; } = "";
}

public sealed record DirectSaleResponse(string OrderNo, string OrderType, string? SaleReason, string Status, string BuyerName, int Crabs, decimal Kg,
    long PricePerKg, long TotalAmount, string? InvoiceNo, BalancePaymentResponse? Payment, DateTimeOffset PlacedAt, DateTimeOffset? CompletedAt);

public sealed record SellableCrab(string CrabCode, string? SpecCode, string FinalSize, string FinalGrade, bool IsSubstandard, decimal? WeightG, string InventoryStatus);

// ---------- QR đơn (BR-162, BR-163) ----------

public sealed record TraceSourceLot(string? OriginRegion, DateOnly? HarvestedOn, string Species);

public sealed record TraceLine(string SpecCode, string SpecName, int Crabs);

public sealed record OrderTraceResponse(string TraceCode, string BatchCode, string BatchTitle, string CrabType, string FarmName,
    IReadOnlyList<TraceSourceLot> SourceLots, IReadOnlyList<TraceLine> Lines, IReadOnlyList<DateTimeOffset> Deliveries, string StandardNote);
