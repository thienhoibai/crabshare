using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Nhà đầu tư (kế thừa User). Nhà đầu tư bao tiêu là nhà đầu tư có ít nhất một cam kết bao tiêu
/// </summary>
public partial class Investor
{
    /// <summary>
    /// PK + FK tới app_user
    /// </summary>
    public long UserId { get; set; }

    /// <summary>
    /// Giá trị: Individual, Organization
    /// </summary>
    public string InvestorKind { get; set; } = null!;

    public string? OrganizationName { get; set; }

    public string? TaxCode { get; set; }

    /// <summary>
    /// Giá trị: Unverified, Verified, Rejected
    /// </summary>
    public string VerificationStatus { get; set; } = null!;

    public DateTimeOffset? VerifiedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual ICollection<CapitalShare> CapitalShares { get; set; } = new List<CapitalShare>();

    public virtual ICollection<Contribution> Contributions { get; set; } = new List<Contribution>();

    public virtual ICollection<RiskAcknowledgement> RiskAcknowledgements { get; set; } = new List<RiskAcknowledgement>();

    public virtual ICollection<SettlementLine> SettlementLines { get; set; } = new List<SettlementLine>();

    public virtual AppUser User { get; set; } = null!;
}
