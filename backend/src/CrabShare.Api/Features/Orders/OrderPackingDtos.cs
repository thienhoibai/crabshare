using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

/// <summary>Mã lỗi của UC29 đóng gói bằng quét tem (NH-09). Bảng giải thích: Features/Orders/README.md.</summary>
public static class PackingErrors
{
    /// <summary>Đơn không tồn tại hoặc không thuộc hộ nuôi đang đăng nhập (404).</summary>
    public const string OrderNotFound = "pack.order_not_found";

    /// <summary>Tham số status của danh sách đơn chỉ nhận Paid hoặc Packed (400).</summary>
    public const string InvalidStatus = "pack.invalid_status";

    /// <summary>Chỉ đóng gói được đơn đang Paid (422).</summary>
    public const string OrderNotPaid = "pack.order_not_paid";

    /// <summary>Một mã tem xuất hiện hai lần trong cùng lần quét (422).</summary>
    public const string DuplicateTag = "pack.duplicate_tag";

    /// <summary>Tem không tồn tại hoặc không ở trạng thái Active (422).</summary>
    public const string TagNotActive = "pack.tag_not_active";

    /// <summary>Tem hợp lệ nhưng con cua không còn trong kho: đã đóng gói / đã bán cho đơn khác (422).</summary>
    public const string CrabNotInStock = "pack.crab_not_in_stock";

    /// <summary>Con cua thuộc lô khác với lô của đơn (422).</summary>
    public const string WrongBatch = "pack.wrong_batch";

    /// <summary>Hạng của con cua không có trong dòng nào của đơn (422).</summary>
    public const string WrongGrade = "pack.wrong_grade";

    /// <summary>Hạng đúng nhưng mọi dòng của hạng đó đã đủ kg trước khi quét tới tem này (422).</summary>
    public const string LineAlreadyFull = "pack.line_already_full";

    /// <summary>Tổng khối lượng cua gán cho một dòng nhỏ hơn số kg khách đặt (422).</summary>
    public const string NotEnoughWeight = "pack.not_enough_weight";
}

/// <summary>Thân POST /api/orders/{orderNo}/pack — mã tem đọc từ QR hoặc gõ tay, mỗi con một mã.</summary>
public sealed class PackOrderRequest
{
    [Required, MinLength(1), MaxLength(500)]
    public List<string> TagCodes { get; set; } = [];
}

/// <summary>Một dòng trong danh sách đơn cần xử lý của hộ nuôi.</summary>
public sealed record OperatorOrderSummaryResponse(
    string OrderNo,
    string Status,
    DateTimeOffset PlacedAt,
    DateTimeOffset? PaidAt,
    string BatchCode,
    string CustomerName,
    int LineCount,
    decimal TotalKg,
    long TotalAmount);

/// <summary>Một con cua đã gán vào dòng đơn.</summary>
public sealed record PackedTagResponse(string TagCode, int WeightG, string GradeCode);

/// <param name="QuantityKg">Số kg khách đặt.</param>
/// <param name="AssignedKg">Tổng khối lượng cua đã gán (Packed) cho dòng này.</param>
public sealed record OperatorOrderLineResponse(
    long OrderLineId,
    long ListingId,
    string Title,
    string BatchCode,
    string GradeCode,
    string GradeName,
    decimal QuantityKg,
    decimal AssignedKg,
    int AssignedCount,
    IReadOnlyList<PackedTagResponse> Tags);

public sealed record OperatorOrderDetailResponse(
    string OrderNo,
    string Status,
    DateTimeOffset PlacedAt,
    DateTimeOffset? PaidAt,
    string BatchCode,
    string CustomerName,
    string RecipientName,
    string RecipientPhone,
    string ShippingAddress,
    long TotalAmount,
    decimal TotalKg,
    IReadOnlyList<OperatorOrderLineResponse> Lines);
