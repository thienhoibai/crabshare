using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Hợp đồng hợp tác của một khoản góp, ký lần lượt người nuôi rồi nhà đầu tư
/// </summary>
public partial class InvestmentContract
{
    public long ContractId { get; set; }

    public string ContractNo { get; set; } = null!;

    public long ContributionId { get; set; }

    public long TemplateId { get; set; }

    /// <summary>
    /// Giá trị: Draft, OperatorSigned, FullySigned, Void
    /// </summary>
    public string Status { get; set; } = null!;

    /// <summary>
    /// Giá trị: DigitalSignature, OfflineUpload
    /// </summary>
    public string SigningMethod { get; set; } = null!;

    public string DraftHash { get; set; } = null!;

    public string? FinalFileUri { get; set; }

    public string? FinalHash { get; set; }

    public DateTimeOffset? FullySignedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ICollection<ContractSignature> ContractSignatures { get; set; } = new List<ContractSignature>();

    public virtual Contribution Contribution { get; set; } = null!;

    public virtual ContractTemplate Template { get; set; } = null!;
}
