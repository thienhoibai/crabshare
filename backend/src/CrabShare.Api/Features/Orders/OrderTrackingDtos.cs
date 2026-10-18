using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

/* NH-07 — Theo dõi đơn, lịch sử, huỷ đơn (UC28). Tách khỏi OrderDtos.cs (checkout, CS-36) để các nhánh không đụng nhau. */

/// <summary>Bộ lọc danh sách đơn: ?status=PendingPayment hoặc nhiều trạng thái cách nhau bằng dấu phẩy.</summary>
public sealed class OrderListQuery
{
    [MaxLength(200)]
    public string? Status { get; set; }

    /// <summary>Danh sách trạng thái đã tách, bỏ khoảng trắng và phần tử rỗng.</summary>
    public IReadOnlyList<string> Statuses =>
        string.IsNullOrWhiteSpace(Status)
            ? []
            : Status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

/// <summary>Một dòng trong lịch sử đơn (GET /api/orders).</summary>
public sealed record OrderSummaryResponse(
    string OrderNo,
    string BatchCode,
    string FarmName,
    string Status,
    long TotalAmount,
    int LineCount,
    decimal TotalKg,
    DateTimeOffset PlacedAt,
    DateTimeOffset? CancelledAt,
    string? CancelReason);

public sealed record OrderTrackingLineResponse(
    long ListingId,
    string Title,
    string GradeCode,
    string GradeName,
    decimal QuantityKg,
    long UnitPrice,
    long Amount);

/// <summary>Khoản thu VietQR của đơn; <c>Status</c> đã quy Pending quá hạn thành Expired như PaymentRequestService.</summary>
public sealed record OrderTrackingPaymentResponse(
    long PaymentRequestId,
    string ReferenceCode,
    string Status,
    long Amount,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? PaidAt);

/// <summary>
/// Một mốc trên dòng thời gian: <c>Step</c> = placed · paid · packed · shipped · delivered · completed · cancelled.
/// <c>At</c> null khi mốc đó chưa tới hoặc CSDL không lưu giờ (packed). Đơn huỷ chỉ còn các mốc đã qua + cancelled.
/// </summary>
public sealed record OrderTimelineStep(string Step, DateTimeOffset? At, bool Done);

/// <param name="CanCancel">Khách còn tự huỷ được không (PendingPayment hoặc Paid chưa đóng gói).</param>
/// <param name="CanConfirmReceipt">Khách còn bấm "Đã nhận hàng" được không (Shipping, hoặc Delivered mà chưa xác nhận).</param>
public sealed record OrderTrackingResponse(
    string OrderNo,
    string BatchCode,
    string FarmName,
    string Status,
    long TotalAmount,
    DateTimeOffset PlacedAt,
    string RecipientName,
    string RecipientPhone,
    string ShippingAddress,
    DateTimeOffset? CancelledAt,
    string? CancelReason,
    bool CanCancel,
    IReadOnlyList<OrderTrackingLineResponse> Lines,
    OrderTrackingPaymentResponse? Payment,
    IReadOnlyList<OrderTimelineStep> Timeline,
    bool CanConfirmReceipt,
    OrderShipmentResponse? Shipment = null,
    bool CanReturn = false,
    ReturnRequestInfo? ReturnRequest = null,
    string OrderType = "Retail",
    long? DepositAmount = null,
    DateTimeOffset? BalanceDueAt = null,
    IReadOnlyList<OrderTrackingPaymentResponse>? Payments = null);

public sealed class CancelOrderRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Reason { get; set; } = "";
}

/// <param name="RefundInstructionId">Có khi đơn đã trả tiền: lệnh hoàn (payment_instruction Refund) admin sẽ gửi đi.</param>
public sealed record CancelOrderResponse(
    string OrderNo,
    string Status,
    DateTimeOffset CancelledAt,
    string CancelReason,
    decimal ReleasedKg,
    long? RefundInstructionId);
