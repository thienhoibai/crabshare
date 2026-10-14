using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

/// <summary>Mục "Orders" trong appsettings.json.</summary>
public sealed class OrderOptions
{
    public const string Section = "Orders";

    /// <summary>Cửa sổ giữ chỗ tồn kho chờ chuyển khoản (BR-13, TL-28 §5). Là tham số, hiệu chỉnh khi có số liệu thật.</summary>
    [Range(1, 1440)]
    public int ReservationMinutes { get; set; } = 15;
}

public sealed class CheckoutLine
{
    [Range(1, long.MaxValue)]
    public long ListingId { get; set; }

    /// <summary>Số kg muốn mua, tối đa 3 chữ số thập phân.</summary>
    [Range(typeof(decimal), "0.001", "100000")]
    public decimal QuantityKg { get; set; }
}

/// <summary>Giỏ hàng có thể chứa nhiều lô; hệ thống tự tách mỗi lô thành một đơn (BR-67, TL-29).</summary>
public sealed class CheckoutRequest
{
    [Required, MinLength(1), MaxLength(50)]
    public List<CheckoutLine> Lines { get; set; } = [];

    [Range(1, long.MaxValue)]
    public long AddressId { get; set; }
}

public sealed record CheckoutLineResponse(
    long ListingId,
    string Title,
    decimal QuantityKg,
    long UnitPrice,
    long Amount);

/// <param name="QrContent">Chuỗi nội dung QR; web và app tự vẽ ảnh QR từ chuỗi này.</param>
/// <param name="PaymentRequestId">Id yêu cầu thu tiền, để web hỏi <c>GET /api/payment-requests/{id}</c> biết tiền đã về (TH-06).</param>
public sealed record OrderPaymentResponse(
    string ReferenceCode,
    string AccountNo,
    long Amount,
    string QrContent,
    DateTimeOffset ExpiresAt,
    long PaymentRequestId);

public sealed record CheckoutOrderResponse(
    string OrderNo,
    string BatchCode,
    string FarmName,
    string Status,
    long TotalAmount,
    DateTimeOffset ExpiresAt,
    IReadOnlyList<CheckoutLineResponse> Lines,
    OrderPaymentResponse Payment);

public sealed record CheckoutResponse(IReadOnlyList<CheckoutOrderResponse> Orders);
