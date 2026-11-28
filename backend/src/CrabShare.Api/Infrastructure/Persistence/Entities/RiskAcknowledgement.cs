using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Nhà đầu tư xác nhận đã đọc một phiên bản công bố rủi ro
/// </summary>
public partial class RiskAcknowledgement : ContractRecord
{
    public long InvestorId { get; set; }

    public long RiskDisclosureId { get; set; }

    public DateTimeOffset AcknowledgedAt { get; set; } = DateTimeOffset.UtcNow;

    public bool ScrolledToEnd { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public virtual Investor Investor { get; set; } = null!;

    public virtual RiskDisclosure RiskDisclosure { get; set; } = null!;
}
