using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

public sealed class ReturnOrderRequest
{
    [Required, MaxLength(300)]
    public string Reason { get; set; } = "";
}

public sealed record ReturnOrderResponse(
    string OrderNo,
    string Status,
    long RefundAmount,
    long RefundInstructionId);
