using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Orders;

public static class ComplaintTypes
{
    public const string LateDelivery = "LateDelivery";
    public const string WrongGrade = "WrongGrade";
    public const string Damaged = "Damaged";
    public const string NotReceived = "NotReceived";
    public const string Other = "Other";

    public static readonly string[] All = [LateDelivery, WrongGrade, Damaged, NotReceived, Other];

    public static bool IsValid(string type) => All.Contains(type);
}

public static class ComplaintStatuses
{
    public const string Open = "Open";
    public const string OperatorResponded = "OperatorResponded";
    public const string Escalated = "Escalated";
    public const string Resolved = "Resolved";
    public const string Rejected = "Rejected";

    public static readonly string[] All = [Open, OperatorResponded, Escalated, Resolved, Rejected];
}

public static class ComplaintResolutions
{
    public const string Refund = "Refund";
    public const string Compensation = "Compensation";
    public const string Replacement = "Replacement";
    public const string NoAction = "NoAction";

    public static readonly string[] All = [Refund, Compensation, Replacement, NoAction];

    public static bool IsValid(string resolution) => All.Contains(resolution);
}

public static class ComplaintErrors
{
    public const string OrderNotFound = "complaint.order_not_found";
    public const string OrderNotEligible = "complaint.order_not_eligible";
    public const string OrderNotOwner = "complaint.order_not_owner";
    public const string OperatorForbidden = "complaint.operator_forbidden";
    public const string NotFound = "complaint.not_found";
    public const string InvalidType = "complaint.invalid_type";
    public const string InvalidResolution = "complaint.invalid_resolution";
    public const string AlreadyHasActive = "complaint.already_has_active";
    public const string CannotRespond = "complaint.cannot_respond";
    public const string AlreadyResolved = "complaint.already_resolved";
    public const string RefundAmountInvalid = "complaint.refund_amount_invalid";
}

/// <summary>Khách hàng gửi khiếu nại (UC31).</summary>
public sealed record CreateComplaintRequest(
    [Required(ErrorMessage = "Loại khiếu nại là bắt buộc.")]
    string ComplaintType,

    [Required(ErrorMessage = "Mô tả khiếu nại là bắt buộc.")]
    [StringLength(1000, ErrorMessage = "Mô tả tối đa 1000 ký tự.")]
    string Description,

    [StringLength(400, ErrorMessage = "Đường dẫn bằng chứng tối đa 400 ký tự.")]
    string? EvidenceUri
);

/// <summary>Hộ nuôi gửi giải trình khiếu nại.</summary>
public sealed record RespondComplaintRequest(
    [Required(ErrorMessage = "Nội dung giải trình là bắt buộc.")]
    [StringLength(1000, ErrorMessage = "Nội dung giải trình tối đa 1000 ký tự.")]
    string Response,

    [StringLength(400, ErrorMessage = "Đường dẫn bằng chứng tối đa 400 ký tự.")]
    string? EvidenceUri
);

/// <summary>Admin giải quyết tranh chấp (UC32).</summary>
public sealed record ResolveComplaintRequest(
    [Required(ErrorMessage = "Kết quả giải quyết là bắt buộc.")]
    string Resolution,

    [Range(0, 100_000_000, ErrorMessage = "Số tiền hoàn không hợp lệ.")]
    decimal? RefundAmount,

    [StringLength(1000, ErrorMessage = "Ghi chú của admin tối đa 1000 ký tự.")]
    string? AdminNotes
);

/// <summary>Chi tiết khiếu nại đầy đủ.</summary>
public sealed record ComplaintDetailResponse(
    long ComplaintId,
    long OrderId,
    string OrderNo,
    string BatchCode,
    string FarmName,
    string CustomerName,
    string CustomerEmail,
    decimal TotalAmount,
    string ComplaintType,
    string Description,
    string? EvidenceUri,
    string Status,
    string? OperatorResponse,
    string? OperatorEvidenceUri,
    DateTimeOffset? RespondedAt,
    DateTimeOffset? EscalatedAt,
    string? Resolution,
    decimal? RefundAmount,
    string? AdminNotes,
    long? ResolvedBy,
    string? ResolvedByName,
    DateTimeOffset OpenedAt,
    DateTimeOffset? ResolvedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

/// <summary>Tóm tắt khiếu nại cho danh sách.</summary>
public sealed record ComplaintSummaryResponse(
    long ComplaintId,
    long OrderId,
    string OrderNo,
    string BatchCode,
    string CustomerName,
    string ComplaintType,
    string Status,
    decimal TotalAmount,
    string Description,
    DateTimeOffset OpenedAt,
    DateTimeOffset? RespondedAt,
    DateTimeOffset? EscalatedAt,
    DateTimeOffset? ResolvedAt,
    string? Resolution,
    decimal? RefundAmount
);
