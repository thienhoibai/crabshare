using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Lô nuôi: đơn vị gọi vốn, sản xuất, bán hàng và quyết toán
/// </summary>
public partial class Batch
{
    public long BatchId { get; set; }

    public string BatchCode { get; set; } = null!;

    public long OperatorId { get; set; }

    /// <summary>
    /// Giá trị: FatteningMudCrab, RoeCrab, SoftShellCrab
    /// </summary>
    public string CrabType { get; set; } = null!;

    public string Title { get; set; } = null!;

    /// <summary>
    /// Số con giống khoá
    /// </summary>
    public int SeedQuantity { get; set; }

    public decimal ExpectedOutputKg { get; set; }

    public short CycleDays { get; set; }

    public short RestockCutoffDays { get; set; }

    public decimal MinViableCapital { get; set; }

    public decimal TargetCapital { get; set; }

    public decimal MaxCapital { get; set; }

    public decimal MinContribution { get; set; }

    public decimal OperatorSharePct { get; set; }

    public byte FrozenStockCapMonths { get; set; }

    public decimal OfftakePreorderCapPct { get; set; }

    public decimal OfftakeDepositPct { get; set; }

    /// <summary>
    /// Bậc phí áp dụng, chốt khi duyệt lô
    /// </summary>
    public long? FeeTierId { get; set; }

    /// <summary>
    /// Phí chốt theo bậc; người nuôi trả ngoài tiền của lô
    /// </summary>
    public decimal? PlatformFeeAmount { get; set; }

    /// <summary>
    /// Giá trị: Draft, PendingApproval, Rejected, Funding, Cancelled, Stocked, InProduction, Harvesting, Settlement, Closed
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? FundingOpenAt { get; set; }

    public DateTimeOffset? FundingDeadline { get; set; }

    /// <summary>
    /// Thời điểm đóng vốn
    /// </summary>
    public DateTimeOffset? CapitalClosedAt { get; set; }

    /// <summary>
    /// Mẫu số tỷ lệ, chốt khi đóng vốn
    /// </summary>
    public decimal? TotalConfirmedCapital { get; set; }

    public DateTimeOffset? StockedAt { get; set; }

    public DateOnly? ExpectedHarvestDate { get; set; }

    public DateTimeOffset? HarvestStartedAt { get; set; }

    public DateTimeOffset? EarlyLiquidationAt { get; set; }

    public DateTimeOffset? ClosedAt { get; set; }

    public long? ApprovedBy { get; set; }

    public DateTimeOffset? ApprovedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ICollection<Alert> Alerts { get; set; } = new List<Alert>();

    public virtual AppUser? ApprovedByNavigation { get; set; }

    public virtual BatchAccount? BatchAccount { get; set; }

    public virtual ICollection<CapitalShare> CapitalShares { get; set; } = new List<CapitalShare>();

    public virtual ICollection<CaptureRequest> CaptureRequests { get; set; } = new List<CaptureRequest>();

    public virtual ICollection<Contribution> Contributions { get; set; } = new List<Contribution>();

    public virtual ICollection<CrabItem> CrabItems { get; set; } = new List<CrabItem>();

    public virtual ICollection<DisbursementTranche> DisbursementTranches { get; set; } = new List<DisbursementTranche>();

    public virtual ICollection<Evidence> Evidences { get; set; } = new List<Evidence>();

    public virtual FeeTier? FeeTier { get; set; }

    public virtual ICollection<Harvest> Harvests { get; set; } = new List<Harvest>();

    public virtual ICollection<OfftakeCommitment> OfftakeCommitments { get; set; } = new List<OfftakeCommitment>();

    public virtual Operator Operator { get; set; } = null!;

    public virtual ICollection<OrderLine> OrderLines { get; set; } = new List<OrderLine>();

    public virtual ICollection<ProductListing> ProductListings { get; set; } = new List<ProductListing>();

    public virtual ICollection<ProductionLog> ProductionLogs { get; set; } = new List<ProductionLog>();

    public virtual ICollection<SalesOrder> SalesOrders { get; set; } = new List<SalesOrder>();

    public virtual Settlement? Settlement { get; set; }

    public virtual ICollection<SettlementLine> SettlementLines { get; set; } = new List<SettlementLine>();

    public virtual ICollection<SlotAllocation> SlotAllocations { get; set; } = new List<SlotAllocation>();

    public virtual ICollection<SlotEvent> SlotEvents { get; set; } = new List<SlotEvent>();

    public virtual StandardCostVersion? StandardCostVersion { get; set; }
}
