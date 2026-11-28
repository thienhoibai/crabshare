using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Giao dịch do tổ chức trung gian báo về (webhook); chống trùng theo mã giao dịch
/// </summary>
public partial class ProviderTransaction : PaymentRecord
{
    public string ProviderTxnId { get; set; } = null!;

    public long BatchAccountId { get; set; }

    /// <summary>
    /// Giá trị: In, Out
    /// </summary>
    public string Direction { get; set; } = null!;

    public decimal Amount { get; set; }

    public string? ReferenceCode { get; set; }

    public long? PaymentRequestId { get; set; }

    public long? InstructionId { get; set; }

    /// <summary>
    /// Giá trị: Matched, Unmatched, LatePayment
    /// </summary>
    public string MatchStatus { get; set; } = "Unmatched";

    public DateTimeOffset OccurredAt { get; set; }

    public DateTimeOffset ReceivedAt { get; set; } = DateTimeOffset.UtcNow;

    public virtual BatchAccount BatchAccount { get; set; } = null!;

    public virtual PaymentInstruction? Instruction { get; set; }

    public virtual PaymentRequest? PaymentRequest { get; set; }
}
