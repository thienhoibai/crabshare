using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Tài khoản đăng nhập chung của mọi người dùng
/// </summary>
public partial class AppUser
{
    public long UserId { get; set; }

    public string Email { get; set; } = null!;

    public string? Phone { get; set; }

    public string FullName { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    /// <summary>
    /// Giá trị: PendingVerification, Active, Locked
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? LastLoginAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ICollection<Alert> Alerts { get; set; } = new List<Alert>();

    public virtual ICollection<AppUserRole> AppUserRoles { get; set; } = new List<AppUserRole>();

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual ICollection<Batch> Batches { get; set; } = new List<Batch>();

    public virtual ICollection<Complaint> Complaints { get; set; } = new List<Complaint>();

    public virtual ICollection<ContractSignature> ContractSignatures { get; set; } = new List<ContractSignature>();

    public virtual ICollection<CrabItemEvent> CrabItemEvents { get; set; } = new List<CrabItemEvent>();

    public virtual ICollection<CrabTag> CrabTags { get; set; } = new List<CrabTag>();

    public virtual Customer? Customer { get; set; }

    public virtual ICollection<EvidenceReview> EvidenceReviews { get; set; } = new List<EvidenceReview>();

    public virtual ICollection<Harvest> Harvests { get; set; } = new List<Harvest>();

    public virtual Investor? Investor { get; set; }

    public virtual ICollection<KycCheck> KycCheckReviewedByNavigations { get; set; } = new List<KycCheck>();

    public virtual ICollection<KycCheck> KycCheckUsers { get; set; } = new List<KycCheck>();

    public virtual OperatorMember? OperatorMember { get; set; }

    public virtual ICollection<Operator> Operators { get; set; } = new List<Operator>();

    public virtual ICollection<PayoutAccount> PayoutAccounts { get; set; } = new List<PayoutAccount>();

    public virtual ICollection<PriceHistory> PriceHistories { get; set; } = new List<PriceHistory>();

    public virtual ICollection<ProductionLog> ProductionLogs { get; set; } = new List<ProductionLog>();

    public virtual ICollection<SalesOrder> SalesOrders { get; set; } = new List<SalesOrder>();

    public virtual ICollection<SettlementFeedback> SettlementFeedbacks { get; set; } = new List<SettlementFeedback>();

    public virtual ICollection<Settlement> Settlements { get; set; } = new List<Settlement>();

    public virtual ICollection<StandardCostVersion> StandardCostVersions { get; set; } = new List<StandardCostVersion>();

    public virtual ICollection<TagScan> TagScans { get; set; } = new List<TagScan>();
}
