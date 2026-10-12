using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phiên bản bản công bố rủi ro
/// </summary>
public partial class RiskDisclosure
{
    public long RiskDisclosureId { get; set; }

    public string VersionCode { get; set; } = null!;

    public string ContentHash { get; set; } = null!;

    public DateTimeOffset EffectiveFrom { get; set; }

    /// <summary>
    /// Giá trị: Draft, Active, Retired
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ICollection<RiskAcknowledgement> RiskAcknowledgements { get; set; } = new List<RiskAcknowledgement>();
}
