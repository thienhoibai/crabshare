using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V019 — BR v1.5 nhóm B: điều khoản Lô, bậc thù lao, quy cách và chào giá, chi phí thực tế, mốc theo tỷ lệ, phân bổ tiền.

public partial class Batch
{
    /// <summary>Lô có nuôi hoặc lưu giữ ngắn ở trại RAS (BR-105); false = mua về, kiểm phẩm rồi giao.</summary>
    [Column("has_holding")] public bool HasHolding { get; set; } = true;
    [Column("expected_avg_weight_g")] public int? ExpectedAvgWeightG { get; set; }
    [Column("expected_grade"), MaxLength(50)] public string? ExpectedGrade { get; set; }
    [Column("sale_days")] public short? SaleDays { get; set; }
    [Column("delivery_radius_km"), Precision(6, 1)] public decimal? DeliveryRadiusKm { get; set; }
    /// <summary>Địa điểm xuất hàng (trại hoặc kho) để tính khoảng cách giao (BR-084).</summary>
    [Column("dispatch_site_id")] public long? DispatchSiteId { get; set; }
    [Column("min_viable_basis"), MaxLength(300)] public string? MinViableBasis { get; set; }
    [Column("survival_threshold_pct"), Precision(5, 2)] public decimal? SurvivalThresholdPct { get; set; }
    [Column("base_remuneration_pct"), Precision(5, 2)] public decimal? BaseRemunerationPct { get; set; }
    [Column("floor_price_per_kg"), Precision(18, 0)] public decimal? FloorPricePerKg { get; set; }
    [Column("offtake_buyer_party_id")] public long? OfftakeBuyerPartyId { get; set; }
    /// <summary>StandardCost (mặc định) hoặc ActualCost (BR-037).</summary>
    [Column("settlement_basis"), MaxLength(20), Unicode(false)] public string SettlementBasis { get; set; } = "StandardCost";
    [Column("expected_receipt_date")] public DateOnly? ExpectedReceiptDate { get; set; }
    /// <summary>Hạn đặt trước của lô T, A (BR-085).</summary>
    [Column("preorder_deadline"), Precision(3)] public DateTimeOffset? PreorderDeadline { get; set; }
    /// <summary>Tỷ lệ phí nền tảng chốt lúc Lô mở gọi vốn (BR-188, BR-218).</summary>
    [Column("platform_fee_rate_pct"), Precision(5, 2)] public decimal? PlatformFeeRatePct { get; set; }
    /// <summary>Chi phí chuẩn mỗi con đã khoá, làm tròn lên tới đồng (BR-033).</summary>
    [Column("standard_cost_per_crab"), Precision(18, 0)] public decimal? StandardCostPerCrab { get; set; }
    /// <summary>Số con được cấp vốn, chốt khi Lô mở (BR-080).</summary>
    [Column("funded_quantity")] public int? FundedQuantity { get; set; }
    [Column("sourcing_started_at"), Precision(3)] public DateTimeOffset? SourcingStartedAt { get; set; }
    [Column("selling_started_at"), Precision(3)] public DateTimeOffset? SellingStartedAt { get; set; }
    [Column("cancelled_at"), Precision(3)] public DateTimeOffset? CancelledAt { get; set; }
    [Column("cancel_reason"), MaxLength(300)] public string? CancelReason { get; set; }
}

public partial class StandardCostItem
{
    [Column("basis"), MaxLength(300)] public string? Basis { get; set; }
    /// <summary>Batch, Executor, Supplier.</summary>
    [Column("cost_bearer"), MaxLength(20), Unicode(false)] public string? CostBearer { get; set; }
}

public partial class DisbursementTranche
{
    [Column("milestone_kind"), MaxLength(20), Unicode(false)] public string? MilestoneKind { get; set; }
    [Column("milestone_name"), MaxLength(100)] public string? MilestoneName { get; set; }
    [Column("pct"), Precision(5, 2)] public decimal? Pct { get; set; }
}

/// <summary>Bảng gộp batch_record (V043): các bản ghi phụ của lô nằm chung một bảng, phân biệt bằng cột record_type: tài khoản lô (Account), bên tham gia (Participant), bậc thù lao (RemunerationTier), phiên bản ngưỡng nước (ThresholdVersion), đợt lưu nuôi (HoldingOperation), biểu quyết (CollectiveDecision) và phiếu biểu quyết (Vote).</summary>
[Table("batch_record")]
public abstract class BatchRecord
{
    [Key, Column("batch_record_id")] public long BatchRecordId { get; set; }
}

public sealed class RemunerationTier : BatchRecord
{
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("tier_no")] public byte TierNo { get; set; }
    [Column("survival_from_pct"), Precision(5, 2)] public decimal SurvivalFromPct { get; set; }
    [Column("survival_to_pct"), Precision(5, 2)] public decimal SurvivalToPct { get; set; }
    [Column("rate_pct"), Precision(5, 2)] public decimal RatePct { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Bảng gộp offer_record (V052): quy cách sản phẩm (Specification) và chào bán của lô (Offer) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("offer_record")]
public abstract class OfferRecord
{
    [Key, Column("offer_record_id")] public long OfferRecordId { get; set; }
}

public sealed class ProductSpecification : OfferRecord
{
    [Column("spec_code"), MaxLength(40), Unicode(false)] public string SpecCode { get; set; } = "";
    [Column("species"), MaxLength(60)] public string Species { get; set; } = "";
    [Column("crab_type"), MaxLength(20), Unicode(false)] public string CrabType { get; set; } = "";
    [Column("size_code"), MaxLength(10), Unicode(false)] public string SizeCode { get; set; } = "";
    [Column("grade_code"), MaxLength(10), Unicode(false)] public string GradeCode { get; set; } = "";
    [Column("live_condition"), MaxLength(20), Unicode(false)] public string LiveCondition { get; set; } = "Live";
    [Column("name"), MaxLength(150)] public string Name { get; set; } = "";
    [Column("size_rank")] public byte SizeRank { get; set; }
    [Column("grade_rank")] public byte GradeRank { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

public sealed class Offer : OfferRecord
{
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("spec_id")] public long SpecId { get; set; }
    [Column("price_per_kg"), Precision(18, 0)] public decimal PricePerKg { get; set; }
    [Column("conversion_weight_g")] public int ConversionWeightG { get; set; }
    [Column("offered_quantity")] public int OfferedQuantity { get; set; }
    [Column("valid_from"), Precision(3)] public DateTimeOffset? ValidFrom { get; set; }
    [Column("valid_to"), Precision(3)] public DateTimeOffset? ValidTo { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    public ProductSpecification Spec { get; set; } = null!;
}

/// <summary>Bảng gộp cost_record (V046): phiên bản chi phí chuẩn (Version), khoản chi (Item), lịch giải ngân dự kiến (TranchePlan) và chi phí thực tế (Actual) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("cost_record")]
public abstract class CostRecord
{
    [Key, Column("cost_record_id")] public long CostRecordId { get; set; }
}

public sealed class CostActual : CostRecord
{
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("cost_item_id")] public long CostItemId { get; set; }
    [Column("amount", TypeName = "decimal(18, 0)")] public decimal Amount { get; set; }
    [Column("document_evidence_id")] public long? DocumentEvidenceId { get; set; }
    [Column("document_ref"), MaxLength(100)] public string? DocumentRef { get; set; }
    [Column("note"), MaxLength(300)] public string? Note { get; set; }
    [Column("incurred_on")] public DateOnly IncurredOn { get; set; }
    [Column("recorded_by")] public long RecordedBy { get; set; }
    [Column("recorded_at"), Precision(3)] public DateTimeOffset RecordedAt { get; set; }
}

/// <summary>Bảng gộp payment_record (V047): yêu cầu thanh toán (Request), lệnh chi (Instruction), giao dịch của tổ chức thanh toán (Transaction), phân bổ giao dịch (Application) và đợt giải ngân (Disbursement) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("payment_record")]
public abstract class PaymentRecord
{
    [Key, Column("payment_record_id")] public long PaymentRecordId { get; set; }
}

public sealed class PaymentApplication : PaymentRecord
{
    [Column("transaction_id")] public long TransactionId { get; set; }
    [Column("target_type"), MaxLength(30), Unicode(false)] public string TargetType { get; set; } = "";
    [Column("target_id")] public long TargetId { get; set; }
    [Column("amount", TypeName = "decimal(18, 0)")] public decimal Amount { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Applied";
    [Column("applied_at"), Precision(3)] public DateTimeOffset AppliedAt { get; set; }
}
