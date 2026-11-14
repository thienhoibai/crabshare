using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V021 — BR v1.5 nhóm D: nguồn hàng, kiểm đầu vào, con cua, sự kiện tồn, đợt lưu nuôi, xếp hộp.

public partial class Evidence
{
    [Column("crab_unit_id")] public long? CrabUnitId { get; set; }
    /// <summary>Stocking, Mortality, Restock, AlertCheck, CaptureResponse, Retake, SiteVisit, ScaleTicket, Document, Claim, Grading.</summary>
    [Column("evidence_kind"), MaxLength(20), Unicode(false)] public string? EvidenceKind { get; set; }
}

public partial class ProductionLog
{
    [Column("health_observation"), MaxLength(500)] public string? HealthObservation { get; set; }
    [Column("incident_note"), MaxLength(500)] public string? IncidentNote { get; set; }
}

[Table("procurement_order")]
public sealed class ProcurementOrder
{
    [Key, Column("procurement_order_id")] public long ProcurementOrderId { get; set; }
    [Column("po_no"), MaxLength(20), Unicode(false)] public string PoNo { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("supplier_party_id")] public long SupplierPartyId { get; set; }
    [Column("ordered_on")] public DateOnly OrderedOn { get; set; }
    [Column("agreed_spec"), MaxLength(300)] public string AgreedSpec { get; set; } = "";
    [Column("quantity")] public int Quantity { get; set; }
    [Column("unit_price"), Precision(18, 0)] public decimal UnitPrice { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Ordered";
    [Column("created_by")] public long CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("supply_lot")]
public sealed class SupplyLot
{
    [Key, Column("supply_lot_id")] public long SupplyLotId { get; set; }
    [Column("lot_code"), MaxLength(30), Unicode(false)] public string LotCode { get; set; } = "";
    [Column("procurement_order_id")] public long ProcurementOrderId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("origin_region"), MaxLength(150)] public string OriginRegion { get; set; } = "";
    [Column("harvested_on")] public DateOnly HarvestedOn { get; set; }
    [Column("declared_species"), MaxLength(60)] public string DeclaredSpecies { get; set; } = "";
    [Column("declared_count")] public int DeclaredCount { get; set; }
    [Column("declared_weight_kg"), Precision(12, 3)] public decimal DeclaredWeightKg { get; set; }
    [Column("trace_status"), MaxLength(20), Unicode(false)] public string TraceStatus { get; set; } = "Declared";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("goods_receipt")]
public sealed class GoodsReceipt
{
    [Key, Column("goods_receipt_id")] public long GoodsReceiptId { get; set; }
    [Column("receipt_no"), MaxLength(20), Unicode(false)] public string ReceiptNo { get; set; } = "";
    [Column("supply_lot_id")] public long SupplyLotId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("site_id")] public long? SiteId { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset ReceivedAt { get; set; }
    [Column("received_by")] public long ReceivedBy { get; set; }
    [Column("qc_user_id")] public long? QcUserId { get; set; }
    [Column("accepted_count")] public int AcceptedCount { get; set; }
    [Column("rejected_count")] public int RejectedCount { get; set; }
    [Column("accepted_weight_g")] public long AcceptedWeightG { get; set; }
    /// <summary>Inspecting, Completed, Cancelled.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Inspecting";
    [Column("completed_at"), Precision(3)] public DateTimeOffset? CompletedAt { get; set; }
    [Column("note"), MaxLength(300)] public string? Note { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("crab_unit")]
public sealed class CrabUnit
{
    [Key, Column("crab_unit_id")] public long CrabUnitId { get; set; }
    [Column("crab_code"), MaxLength(12), Unicode(false)] public string CrabCode { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("supply_lot_id")] public long SupplyLotId { get; set; }
    [Column("goods_receipt_id")] public long GoodsReceiptId { get; set; }
    [Column("species"), MaxLength(60)] public string Species { get; set; } = "";
    [Column("sex"), MaxLength(10), Unicode(false)] public string Sex { get; set; } = "";
    [Column("maturity"), MaxLength(20), Unicode(false)] public string Maturity { get; set; } = "";
    [Column("received_weight_g"), Precision(7, 1)] public decimal ReceivedWeightG { get; set; }
    /// <summary>Healthy, Weak, Molting, Dead.</summary>
    [Column("condition"), MaxLength(20), Unicode(false)] public string Condition { get; set; } = "Healthy";
    /// <summary>Received, Holding, Graded, Allocated, Shipped, Delivered, Sold, Dead, Destroyed, Returned.</summary>
    [Column("inventory_status"), MaxLength(20), Unicode(false)] public string InventoryStatus { get; set; } = "Received";
    [Column("replaces_crab_unit_id")] public long? ReplacesCrabUnitId { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset ReceivedAt { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("qc_assignment")]
public sealed class QcAssignment
{
    [Key, Column("qc_assignment_id")] public long QcAssignmentId { get; set; }
    /// <summary>IncomingInspection, GradingSession, SecondReview, SiteVisit, Dispatch, Dispute.</summary>
    [Column("assignment_kind"), MaxLength(20), Unicode(false)] public string AssignmentKind { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("target_type"), MaxLength(30), Unicode(false)] public string TargetType { get; set; } = "";
    [Column("target_id")] public long TargetId { get; set; }
    [Column("qc_user_id")] public long QcUserId { get; set; }
    [Column("assigned_at"), Precision(3)] public DateTimeOffset AssignedAt { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Assigned";
    [Column("completed_at"), Precision(3)] public DateTimeOffset? CompletedAt { get; set; }
}

[Table("qc_inspection")]
public sealed class QcInspection
{
    [Key, Column("qc_inspection_id")] public long QcInspectionId { get; set; }
    [Column("inspection_no"), MaxLength(20), Unicode(false)] public string InspectionNo { get; set; } = "";
    /// <summary>Incoming, Grading, Dispatch, Dispute.</summary>
    [Column("inspection_kind"), MaxLength(20), Unicode(false)] public string InspectionKind { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("goods_receipt_id")] public long? GoodsReceiptId { get; set; }
    [Column("crab_unit_id")] public long? CrabUnitId { get; set; }
    [Column("inspector_id")] public long InspectorId { get; set; }
    [Column("inspected_at"), Precision(3)] public DateTimeOffset InspectedAt { get; set; }
    [Column("species"), MaxLength(60)] public string? Species { get; set; }
    [Column("sex"), MaxLength(10), Unicode(false)] public string? Sex { get; set; }
    [Column("maturity"), MaxLength(20), Unicode(false)] public string? Maturity { get; set; }
    [Column("species_ok")] public bool? SpeciesOk { get; set; }
    [Column("alive")] public bool? Alive { get; set; }
    [Column("healthy")] public bool? Healthy { get; set; }
    [Column("two_claws")] public bool? TwoClaws { get; set; }
    [Column("food_safe")] public bool? FoodSafe { get; set; }
    [Column("weight_g"), Precision(7, 1)] public decimal? WeightG { get; set; }
    [Column("sensory_result"), MaxLength(300)] public string? SensoryResult { get; set; }
    /// <summary>Accepted, Rejected, Hold.</summary>
    [Column("conclusion"), MaxLength(20), Unicode(false)] public string Conclusion { get; set; } = "";
    [Column("reject_reason"), MaxLength(300)] public string? RejectReason { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("inventory_event")]
public sealed class InventoryEvent
{
    [Key, Column("inventory_event_id")] public long InventoryEventId { get; set; }
    [Column("crab_unit_id")] public long CrabUnitId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("event_type"), MaxLength(20), Unicode(false)] public string EventType { get; set; } = "";
    [Column("occurred_at"), Precision(3)] public DateTimeOffset OccurredAt { get; set; }
    [Column("quantity")] public int Quantity { get; set; } = 1;
    [Column("weight_g"), Precision(7, 1)] public decimal? WeightG { get; set; }
    [Column("reason"), MaxLength(300)] public string? Reason { get; set; }
    /// <summary>App, Station, Device, System, Qc.</summary>
    [Column("source"), MaxLength(20), Unicode(false)] public string Source { get; set; } = "App";
    [Column("slot_id")] public long? SlotId { get; set; }
    [Column("site_id")] public long? SiteId { get; set; }
    [Column("evidence_id")] public long? EvidenceId { get; set; }
    [Column("actor_id")] public long? ActorId { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("holding_operation")]
public sealed class HoldingOperation
{
    [Key, Column("holding_id")] public long HoldingId { get; set; }
    [Column("holding_code"), MaxLength(20), Unicode(false)] public string HoldingCode { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("method"), MaxLength(100)] public string Method { get; set; } = "";
    [Column("stocked_at"), Precision(3)] public DateTimeOffset StockedAt { get; set; }
    [Column("expected_end_date")] public DateOnly ExpectedEndDate { get; set; }
    [Column("actual_end_at"), Precision(3)] public DateTimeOffset? ActualEndAt { get; set; }
    [Column("responsible_user_id")] public long ResponsibleUserId { get; set; }
    /// <summary>Active, Harvesting, Closed.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("box_assignment")]
public sealed class BoxAssignment
{
    [Key, Column("box_assignment_id")] public long BoxAssignmentId { get; set; }
    [Column("crab_unit_id")] public long CrabUnitId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("slot_id")] public long SlotId { get; set; }
    [Column("assigned_at"), Precision(3)] public DateTimeOffset AssignedAt { get; set; }
    [Column("left_at"), Precision(3)] public DateTimeOffset? LeftAt { get; set; }
    /// <summary>Stock, Restock, Move.</summary>
    [Column("reason"), MaxLength(20), Unicode(false)] public string Reason { get; set; } = "";
    /// <summary>Moved, Died, Harvested, Destroyed.</summary>
    [Column("leave_reason"), MaxLength(20), Unicode(false)] public string? LeaveReason { get; set; }
    [Column("evidence_id")] public long? EvidenceId { get; set; }
    [Column("actor_id")] public long ActorId { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}
