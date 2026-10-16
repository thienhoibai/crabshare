using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

public sealed class ReturnOrderRequest
{
    [Required, MaxLength(300)]
    public string Reason { get; set; } = "";

    public string? EvidenceUri { get; set; }

    public bool RequireApproval { get; set; }
}

public sealed class ApproveReturnRequest
{
    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed class RejectReturnRequest
{
    [Required, MaxLength(500)]
    public string Reason { get; set; } = "";

    public string? EvidenceUri { get; set; }
}

public sealed record ReturnRequestInfo(
    string Status,
    string Reason,
    string? EvidenceUri,
    DateTimeOffset RequestedAt,
    DateTimeOffset? RespondedAt = null,
    string? OperatorNote = null,
    string? OperatorEvidenceUri = null,
    long? RefundAmount = null,
    long? RefundInstructionId = null);

public sealed record ReturnOrderResponse(
    string OrderNo,
    string Status,
    long RefundAmount,
    long RefundInstructionId,
    ReturnRequestInfo? ReturnRequest = null);
