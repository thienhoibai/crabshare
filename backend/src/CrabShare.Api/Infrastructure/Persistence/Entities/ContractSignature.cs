using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Từng chữ ký trên hợp đồng (người nuôi ký trước, nhà đầu tư ký sau)
/// </summary>
public partial class ContractSignature
{
    public long SignatureId { get; set; }

    public long ContractId { get; set; }

    /// <summary>
    /// Giá trị: Operator, Investor
    /// </summary>
    public string SignerRole { get; set; } = null!;

    public byte SigningOrder { get; set; }

    public long SignerUserId { get; set; }

    public string? ProviderRequestId { get; set; }

    public string SignedHash { get; set; } = null!;

    public DateTimeOffset SignedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual InvestmentContract Contract { get; set; } = null!;

    public virtual AppUser SignerUser { get; set; } = null!;
}
