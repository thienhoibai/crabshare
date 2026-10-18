using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

public sealed class PlacePreorderRequest
{
    [Range(1, long.MaxValue)]
    public long ListingId { get; set; }

    [Range(typeof(decimal), "0.001", "100000")]
    public decimal QuantityKg { get; set; }

    [Range(1, long.MaxValue)]
    public long AddressId { get; set; }
}

public sealed record PreorderResponse(
    string OrderNo,
    string BatchCode,
    string FarmName,
    string Status,
    long TotalAmount,
    long DepositAmount,
    decimal DepositPct,
    DateTimeOffset ExpiresAt,
    IReadOnlyList<CheckoutLineResponse> Lines,
    OrderPaymentResponse Payment);

public sealed record IssueBalancesResponse(
    string BatchCode,
    int IssuedCount,
    IReadOnlyList<string> OrderNos);
