using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Nhà đầu tư xác nhận đã đọc một phiên bản công bố rủi ro
/// </summary>
public partial class RiskAcknowledgement
{
    public long InvestorId { get; set; }

    public long RiskDisclosureId { get; set; }

    public DateTimeOffset AcknowledgedAt { get; set; }

    public bool ScrolledToEnd { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Investor Investor { get; set; } = null!;

    public virtual RiskDisclosure RiskDisclosure { get; set; } = null!;
}
