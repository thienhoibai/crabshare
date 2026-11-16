using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V020 — BR v1.5 nhóm C: đặt trước theo quy cách, dòng đơn, đợt giao.

public partial class SalesOrder
{
    [Column("customer_party_id")] public long? CustomerPartyId { get; set; }
    [Column("delivery_site_id")] public long? DeliverySiteId { get; set; }
    [Column("delivery_distance_km"), Precision(7, 1)] public decimal? DeliveryDistanceKm { get; set; }
    [Column("estimated_value"), Precision(18, 0)] public decimal? EstimatedValue { get; set; }
    [Column("deposit_rate_pct"), Precision(5, 2)] public decimal? DepositRatePct { get; set; }
    [Column("hold_expires_at"), Precision(3)] public DateTimeOffset? HoldExpiresAt { get; set; }
    [Column("deposited_at"), Precision(3)] public DateTimeOffset? DepositedAt { get; set; }
    [Column("confirmed_at"), Precision(3)] public DateTimeOffset? ConfirmedAt { get; set; }
    [Column("cancel_requested_at"), Precision(3)] public DateTimeOffset? CancelRequestedAt { get; set; }
    [Column("forfeited_at"), Precision(3)] public DateTimeOffset? ForfeitedAt { get; set; }
    [Column("refunded_at"), Precision(3)] public DateTimeOffset? RefundedAt { get; set; }
}

[Table("sales_order_line")]
public sealed class SalesOrderLine
{
    [Key, Column("line_id")] public long LineId { get; set; }
    [Column("order_id")] public long OrderId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("offer_id")] public long OfferId { get; set; }
    [Column("spec_id")] public long SpecId { get; set; }
    /// <summary>ByCount hoặc ByKg (BR-087).</summary>
    [Column("order_mode"), MaxLength(10), Unicode(false)] public string OrderMode { get; set; } = "";
    [Column("qty_crabs")] public int? QtyCrabs { get; set; }
    [Column("qty_kg"), Precision(12, 3)] public decimal? QtyKg { get; set; }
    [Column("converted_crabs")] public int ConvertedCrabs { get; set; }
    [Column("price_per_kg"), Precision(18, 0)] public decimal PricePerKg { get; set; }
    [Column("conversion_weight_g")] public int ConversionWeightG { get; set; }
    [Column("min_grade_code"), MaxLength(10), Unicode(false)] public string? MinGradeCode { get; set; }
    [Column("estimated_kg"), Precision(12, 3)] public decimal EstimatedKg { get; set; }
    [Column("estimated_value"), Precision(18, 0)] public decimal EstimatedValue { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    public ProductSpecification Spec { get; set; } = null!;
}

[Table("delivery_tranche")]
public sealed class DeliveryTranche
{
    [Key, Column("tranche_id")] public long TrancheId { get; set; }
    [Column("order_id")] public long OrderId { get; set; }
    [Column("seq")] public byte Seq { get; set; }
    [Column("due_date")] public DateOnly DueDate { get; set; }
    /// <summary>Planned, Allocated, Dispatched, Accepted, Completed, Cancelled.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Planned";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
    public List<DeliveryTrancheLine> Lines { get; set; } = [];
}

[Table("delivery_tranche_line")]
public sealed class DeliveryTrancheLine
{
    [Column("tranche_id")] public long TrancheId { get; set; }
    [Column("line_id")] public long LineId { get; set; }
    [Column("qty_crabs")] public int? QtyCrabs { get; set; }
    [Column("qty_kg"), Precision(12, 3)] public decimal? QtyKg { get; set; }
    [Column("converted_crabs")] public int ConvertedCrabs { get; set; }
}
