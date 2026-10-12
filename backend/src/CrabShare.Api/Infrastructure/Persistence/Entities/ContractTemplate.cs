using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phiên bản mẫu hợp đồng hợp tác
/// </summary>
public partial class ContractTemplate
{
    public long TemplateId { get; set; }

    public string VersionCode { get; set; } = null!;

    public string ContentHash { get; set; } = null!;

    /// <summary>
    /// Giá trị: Draft, Active, Retired
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? EffectiveFrom { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ICollection<InvestmentContract> InvestmentContracts { get; set; } = new List<InvestmentContract>();
}
