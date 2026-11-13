using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V024 — BR v1.5 nhóm G6: phân bổ, chuyến giao, nghiệm thu, hoá đơn, khiếu nại, đánh giá, dòng doanh thu.

public partial class SalesOrder
{
    /// <summary>LowGrade, ForfeitResale, Surplus (đơn có hoá đơn, BR-177).</summary>
    [Column("sale_reason"), MaxLength(20), Unicode(false)] public string? SaleReason { get; set; }
    [Column("buyer_party_id")] public long? BuyerPartyId { get; set; }
    [Column("buyer_name"), MaxLength(200)] public string? BuyerName { get; set; }
    [Column("sale_kg"), Precision(12, 3)] public decimal? SaleKg { get; set; }
    [Column("sale_price_per_kg"), Precision(18, 0)] public decimal? SalePricePerKg { get; set; }
    [Column("source_order_id")] public long? SourceOrderId { get; set; }
    /// <summary>Mã QR đơn (BR-162).</summary>
    [Column("trace_code"), MaxLength(20), Unicode(false)] public string? TraceCode { get; set; }
}

public partial class PaymentRequest
{
    /// <summary>Đợt giao của phần còn lại (PreOrderBalance, BR-164).</summary>
    [Column("tranche_id")] public long? TrancheId { get; set; }
}

[Table("inventory_allocation")]
public sealed class InventoryAllocation
{
    [Key, Column("allocation_id")] public long AllocationId { get; set; }
    [Column("crab_unit_id")] public long CrabUnitId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("order_id")] public long OrderId { get; set; }
    [Column("line_id")] public long? LineId { get; set; }
    [Column("tranche_id")] public long? TrancheId { get; set; }
    [Column("grade_decision_id")] public long GradeDecisionId { get; set; }
    [Column("crab_spec_id")] public long? CrabSpecId { get; set; }
    [Column("is_substitution")] public bool IsSubstitution { get; set; }
    /// <summary>Active, Shipped, Delivered, Released, Returned.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("allocated_at"), Precision(3)] public DateTimeOffset AllocatedAt { get; set; }
    [Column("released_at"), Precision(3)] public DateTimeOffset? ReleasedAt { get; set; }
    [Column("release_reason"), MaxLength(300)] public string? ReleaseReason { get; set; }
    [Column("actor_id")] public long? ActorId { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("shipment")]
public sealed class Shipment
{
    [Key, Column("shipment_id")] public long ShipmentId { get; set; }
    [Column("shipment_no"), MaxLength(20), Unicode(false)] public string ShipmentNo { get; set; } = "";
    [Column("order_id")] public long OrderId { get; set; }
    [Column("tranche_id")] public long TrancheId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("scheduled_at"), Precision(3)] public DateTimeOffset ScheduledAt { get; set; }
    [Column("dispatched_at"), Precision(3)] public DateTimeOffset? DispatchedAt { get; set; }
    [Column("delivered_at"), Precision(3)] public DateTimeOffset? DeliveredAt { get; set; }
    [Column("return_window_ends_at"), Precision(3)] public DateTimeOffset? ReturnWindowEndsAt { get; set; }
    [Column("transport_condition"), MaxLength(300)] public string? TransportCondition { get; set; }
    /// <summary>Scheduled, Dispatched, Accepted, Refused, Cancelled.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Scheduled";
    [Column("created_by")] public long CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
    public List<ShipmentLine> Lines { get; set; } = [];
}

[Table("shipment_line")]
public sealed class ShipmentLine
{
    [Key, Column("shipment_line_id")] public long ShipmentLineId { get; set; }
    [Column("shipment_id")] public long ShipmentId { get; set; }
    [Column("line_id")] public long LineId { get; set; }
    [Column("dispatched_crabs")] public int? DispatchedCrabs { get; set; }
    [Column("dispatched_kg"), Precision(12, 3)] public decimal? DispatchedKg { get; set; }
    [Column("received_crabs")] public int? ReceivedCrabs { get; set; }
    [Column("received_kg"), Precision(12, 3)] public decimal? ReceivedKg { get; set; }
    [Column("accepted_crabs")] public int? AcceptedCrabs { get; set; }
    [Column("accepted_kg"), Precision(12, 3)] public decimal? AcceptedKg { get; set; }
    [Column("rejected_crabs")] public int? RejectedCrabs { get; set; }
    [Column("price_per_kg"), Precision(18, 0)] public decimal PricePerKg { get; set; }
    [Column("goods_value"), Precision(18, 0)] public decimal? GoodsValue { get; set; }
}

[Table("delivery_acceptance")]
public sealed class DeliveryAcceptance
{
    [Key, Column("acceptance_id")] public long AcceptanceId { get; set; }
    [Column("shipment_id")] public long ShipmentId { get; set; }
    [Column("order_id")] public long OrderId { get; set; }
    [Column("tranche_id")] public long TrancheId { get; set; }
    [Column("accepted_crabs")] public int AcceptedCrabs { get; set; }
    [Column("accepted_kg"), Precision(12, 3)] public decimal AcceptedKg { get; set; }
    [Column("rejected_crabs")] public int RejectedCrabs { get; set; }
    [Column("discrepancy_reason"), MaxLength(300)] public string? DiscrepancyReason { get; set; }
    /// <summary>Pending, Confirmed, Refused.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Pending";
    [Column("operator_recorded_by")] public long OperatorRecordedBy { get; set; }
    [Column("operator_recorded_at"), Precision(3)] public DateTimeOffset OperatorRecordedAt { get; set; }
    [Column("customer_confirmed_by")] public long? CustomerConfirmedBy { get; set; }
    [Column("customer_confirmed_at"), Precision(3)] public DateTimeOffset? CustomerConfirmedAt { get; set; }
    [Column("goods_value"), Precision(18, 0)] public decimal? GoodsValue { get; set; }
    [Column("deposit_applied"), Precision(18, 0)] public decimal? DepositApplied { get; set; }
    [Column("balance_due"), Precision(18, 0)] public decimal? BalanceDue { get; set; }
    [Column("balance_due_at"), Precision(3)] public DateTimeOffset? BalanceDueAt { get; set; }
    [Column("balance_paid_at"), Precision(3)] public DateTimeOffset? BalancePaidAt { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("invoice")]
public sealed class Invoice
{
    [Key, Column("invoice_id")] public long InvoiceId { get; set; }
    [Column("invoice_no"), MaxLength(20), Unicode(false)] public string InvoiceNo { get; set; } = "";
    [Column("order_id")] public long OrderId { get; set; }
    [Column("tranche_id")] public long? TrancheId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("seller_party_id")] public long SellerPartyId { get; set; }
    [Column("buyer_party_id")] public long? BuyerPartyId { get; set; }
    [Column("buyer_name"), MaxLength(200)] public string BuyerName { get; set; } = "";
    [Column("amount"), Precision(18, 0)] public decimal Amount { get; set; }
    /// <summary>Active, Cancelled.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("issued_at"), Precision(3)] public DateTimeOffset IssuedAt { get; set; }
    [Column("cancelled_at"), Precision(3)] public DateTimeOffset? CancelledAt { get; set; }
    [Column("cancel_reason"), MaxLength(300)] public string? CancelReason { get; set; }
}

[Table("claim")]
public sealed class CustomerClaim
{
    [Key, Column("claim_id")] public long ClaimId { get; set; }
    [Column("claim_no"), MaxLength(20), Unicode(false)] public string ClaimNo { get; set; } = "";
    [Column("order_id")] public long OrderId { get; set; }
    [Column("shipment_id")] public long ShipmentId { get; set; }
    [Column("line_id")] public long LineId { get; set; }
    /// <summary>Return, Complaint.</summary>
    [Column("claim_type"), MaxLength(20), Unicode(false)] public string ClaimType { get; set; } = "";
    /// <summary>Dead, Weak, WrongSize, WrongWeight, Late, FoodSafety.</summary>
    [Column("issue_type"), MaxLength(20), Unicode(false)] public string IssueType { get; set; } = "";
    [Column("affected_crabs")] public int? AffectedCrabs { get; set; }
    [Column("affected_kg"), Precision(12, 3)] public decimal? AffectedKg { get; set; }
    [Column("description"), MaxLength(1000)] public string Description { get; set; } = "";
    [Column("photo_uri"), MaxLength(500)] public string PhotoUri { get; set; } = "";
    [Column("photo_sha256"), MaxLength(64), Unicode(false)] public string PhotoSha256 { get; set; } = "";
    /// <summary>Open, OperatorAccepted, OperatorRejected, Escalated, Accepted, Rejected.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Open";
    [Column("response_due_at"), Precision(3)] public DateTimeOffset ResponseDueAt { get; set; }
    [Column("operator_response"), MaxLength(500)] public string? OperatorResponse { get; set; }
    [Column("operator_responded_by")] public long? OperatorRespondedBy { get; set; }
    [Column("operator_responded_at"), Precision(3)] public DateTimeOffset? OperatorRespondedAt { get; set; }
    [Column("customer_agreed")] public bool? CustomerAgreed { get; set; }
    [Column("admin_decision"), MaxLength(500)] public string? AdminDecision { get; set; }
    [Column("decided_by")] public long? DecidedBy { get; set; }
    [Column("decided_at"), Precision(3)] public DateTimeOffset? DecidedAt { get; set; }
    [Column("refund_kg"), Precision(12, 3)] public decimal? RefundKg { get; set; }
    [Column("refund_amount"), Precision(18, 0)] public decimal? RefundAmount { get; set; }
    [Column("refund_instruction_id")] public long? RefundInstructionId { get; set; }
    [Column("created_by")] public long CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("order_rating")]
public sealed class OrderRating
{
    [Key, Column("order_id")] public long OrderId { get; set; }
    [Column("stars")] public byte Stars { get; set; }
    [Column("comment"), MaxLength(1000)] public string? Comment { get; set; }
    [Column("created_by")] public long CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("revenue_line")]
public sealed class RevenueLine
{
    [Key, Column("revenue_line_id")] public long RevenueLineId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    /// <summary>PreOrderDelivered, InvoicedSale, ForfeitedDeposit, FinalOrder (BR-185).</summary>
    [Column("source_type"), MaxLength(20), Unicode(false)] public string SourceType { get; set; } = "";
    [Column("order_id")] public long OrderId { get; set; }
    [Column("amount"), Precision(18, 0)] public decimal Amount { get; set; }
    [Column("recognized_at"), Precision(3)] public DateTimeOffset RecognizedAt { get; set; }
    [Column("note"), MaxLength(300)] public string? Note { get; set; }
}
