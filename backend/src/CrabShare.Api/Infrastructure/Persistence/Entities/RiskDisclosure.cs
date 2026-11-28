using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phiên bản bản công bố rủi ro
/// </summary>
public partial class RiskDisclosure : ContractRecord
{
    public string VersionCode { get; set; } = null!;

    public string ContentHash { get; set; } = null!;

    public DateTimeOffset EffectiveFrom { get; set; }

    /// <summary>
    /// Giá trị: Draft, Active, Retired
    /// </summary>
    public string Status { get; set; } = "Draft";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public virtual ICollection<RiskAcknowledgement> RiskAcknowledgements { get; set; } = new List<RiskAcknowledgement>();
}
