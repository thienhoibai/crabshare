using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

/* NH-10 — Giao hàng, xác nhận đã nhận, tự hoàn tất đơn (UC30). Tách file để không đụng DTO của CS-36/CS-46/CS-53. */

/// <summary>Mã lỗi của giao hàng / nhận hàng. Bảng giải thích: Features/Orders/README.md.</summary>
public static class FulfilmentErrors
{
    /// <summary>Không có đơn với mã này (404).</summary>
    public const string OrderNotFound = "fulfil.order_not_found";

    /// <summary>Đơn thuộc lô của hộ nuôi khác (403).</summary>
    public const string OrderForbidden = "fulfil.order_forbidden";

    /// <summary>Trạng thái đơn không cho thao tác này; Details: orderNo, status, allowed (422).</summary>
    public const string InvalidStatus = "fulfil.invalid_status";

    /// <summary>Giờ xe dự kiến đến sớm hơn hiện tại quá 5 phút hoặc muộn hơn 7 ngày (422).</summary>
    public const string EtaInvalid = "fulfil.eta_invalid";

    /// <summary>Đơn vừa bị thao tác khác đổi trạng thái giữa lúc đọc và lúc ghi (409).</summary>
    public const string StatusChanged = "fulfil.status_changed";
}

/// <summary>Thân POST /api/orders/{orderNo}/ship — hộ nuôi khai thông tin gửi hàng (TL-31 §6.1). Không có phí ship.</summary>
public sealed class ShipOrderRequest
{
    [Required, MaxLength(150)]
    public string CarrierName { get; set; } = "";

    [MaxLength(20)]
    public string? VehiclePlate { get; set; }

    [Required, RegularExpression(@"^(0[0-9]{9}|\+84[0-9]{9})$", ErrorMessage = "Số điện thoại tài xế cần 10 chữ số bắt đầu bằng 0, hoặc dạng +84.")]
    public string DriverPhone { get; set; } = "";

    public DateTimeOffset? ExpectedArrivalAt { get; set; }

    [MaxLength(300)]
    public string? Note { get; set; }
}

/// <summary>
/// Thông tin giao nhận của một đơn; null khi đơn chưa giao cho nhà xe. Đơn demo cũ có thể có ShippedAt nhưng không có
/// CarrierName / DriverPhone nên hai trường này nullable.
/// </summary>
public sealed record OrderShipmentResponse(
    string? CarrierName,
    string? VehiclePlate,
    string? DriverPhone,
    DateTimeOffset? ExpectedArrivalAt,
    string? Note,
    DateTimeOffset? ShippedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? ReceivedAt,
    DateTimeOffset? ReturnWindowEndsAt,
    DateTimeOffset? CompletedAt);
