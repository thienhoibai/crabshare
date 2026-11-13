using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V025 — BR v1.5 nhóm G7: quyết toán P/T/A, mốc giải ngân, biên bản thăm trại, thanh lý sớm, quyết định tập thể.

public partial class Batch
{
    /// <summary>Lô A: tỷ lệ hoa hồng theo hợp đồng đại lý (BR-201).</summary>
    [Column("commission_pct"), Precision(5, 2)] public decimal? CommissionPct { get; set; }
    [Column("liquidation_started_at"), Precision(3)] public DateTimeOffset? LiquidationStartedAt { get; set; }
    [Column("awaiting_settlement_at"), Precision(3)] public DateTimeOffset? AwaitingSettlementAt { get; set; }
}

public partial class Settlement
{
    /// <summary>P, T, A.</summary>
    [Column("settlement_mode"), MaxLength(1), Unicode(false)] public string SettlementMode { get; set; } = "P";
    /// <summary>StandardCost hoặc ActualCost (BR-037).</summary>
    [Column("settlement_basis"), MaxLength(20), Unicode(false)] public string SettlementBasis { get; set; } = "StandardCost";
    [Column("platform_fee_rate_pct"), Precision(5, 2)] public decimal PlatformFeeRatePct { get; set; }
    [Column("platform_fee"), Precision(18, 0)] public decimal PlatformFee { get; set; }
    [Column("standard_cost_deductible"), Precision(18, 0)] public decimal StandardCostDeductible { get; set; }
    [Column("actual_cost_total"), Precision(18, 0)] public decimal ActualCostTotal { get; set; }
    [Column("excluded_fault_cost"), Precision(18, 0)] public decimal ExcludedFaultCost { get; set; }
    [Column("disbursed_total"), Precision(18, 0)] public decimal DisbursedTotal { get; set; }
    [Column("undisbursed_cost"), Precision(18, 0)] public decimal UndisbursedCost { get; set; }
    [Column("customer_refunds"), Precision(18, 0)] public decimal CustomerRefunds { get; set; }
    [Column("received_count")] public int ReceivedCount { get; set; }
    [Column("dead_count")] public int DeadCount { get; set; }
    [Column("survival_rate_pct"), Precision(5, 2)] public decimal? SurvivalRatePct { get; set; }
    [Column("uncovered_loss"), Precision(18, 0)] public decimal UncoveredLoss { get; set; }
    [Column("commission_pct"), Precision(5, 2)] public decimal? CommissionPct { get; set; }
    [Column("commission_amount"), Precision(18, 0)] public decimal CommissionAmount { get; set; }
    [Column("supplier_payout"), Precision(18, 0)] public decimal SupplierPayout { get; set; }
    [Column("is_liquidation")] public bool IsLiquidation { get; set; }
}

[Table("site_visit_report")]
public sealed class SiteVisitReport
{
    [Key, Column("report_id")] public long ReportId { get; set; }
    [Column("report_no"), MaxLength(20), Unicode(false)] public string ReportNo { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("qc_assignment_id")] public long QcAssignmentId { get; set; }
    [Column("qc_user_id")] public long QcUserId { get; set; }
    [Column("visited_at"), Precision(3)] public DateTimeOffset VisitedAt { get; set; }
    [Column("latitude"), Precision(9, 6)] public decimal Latitude { get; set; }
    [Column("longitude"), Precision(9, 6)] public decimal Longitude { get; set; }
    [Column("distance_to_farm_m")] public int? DistanceToFarmM { get; set; }
    [Column("box_codes"), MaxLength(400), Unicode(false)] public string BoxCodes { get; set; } = "";
    [Column("crabs_seen")] public int CrabsSeen { get; set; }
    [Column("findings"), MaxLength(1000)] public string Findings { get; set; } = "";
    [Column("photo_uri"), MaxLength(500)] public string PhotoUri { get; set; } = "";
    [Column("photo_sha256"), MaxLength(64), Unicode(false)] public string PhotoSha256 { get; set; } = "";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("collective_decision")]
public sealed class CollectiveDecision
{
    [Key, Column("decision_id")] public long DecisionId { get; set; }
    [Column("decision_no"), MaxLength(20), Unicode(false)] public string DecisionNo { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    /// <summary>EarlyLiquidation, SurplusSale.</summary>
    [Column("decision_kind"), MaxLength(20), Unicode(false)] public string DecisionKind { get; set; } = "";
    [Column("proposal"), MaxLength(1000)] public string Proposal { get; set; } = "";
    [Column("proposed_by")] public long ProposedBy { get; set; }
    [Column("opened_at"), Precision(3)] public DateTimeOffset OpenedAt { get; set; }
    [Column("closes_at"), Precision(3)] public DateTimeOffset ClosesAt { get; set; }
    /// <summary>Open, Passed, Rejected, Cancelled.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Open";
    [Column("eligible_capital"), Precision(18, 0)] public decimal EligibleCapital { get; set; }
    [Column("yes_capital"), Precision(18, 0)] public decimal YesCapital { get; set; }
    [Column("no_capital"), Precision(18, 0)] public decimal NoCapital { get; set; }
    [Column("decided_at"), Precision(3)] public DateTimeOffset? DecidedAt { get; set; }
}

[Table("vote")]
public sealed class Vote
{
    [Key, Column("vote_id")] public long VoteId { get; set; }
    [Column("decision_id")] public long DecisionId { get; set; }
    [Column("investor_id")] public long InvestorId { get; set; }
    [Column("capital"), Precision(18, 0)] public decimal Capital { get; set; }
    /// <summary>Yes, No.</summary>
    [Column("choice"), MaxLength(10), Unicode(false)] public string Choice { get; set; } = "";
    [Column("voted_at"), Precision(3)] public DateTimeOffset VotedAt { get; set; }
}
