using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Operators;

public sealed class OperatorProfileRequest
{
    [Required, MaxLength(200)]
    public string LegalName { get; set; } = "";

    [Required, MaxLength(14)]
    public string TaxCode { get; set; } = "";

    [Required, MaxLength(30)]
    public string BusinessRegNo { get; set; } = "";

    [Required, MaxLength(300)]
    public string FarmAddress { get; set; } = "";
}

public sealed record OperatorResponse(long OperatorId, string LegalName, string TaxCode,
    string BusinessRegNo, string FarmAddress, string Status, DateTimeOffset? SubmittedAt,
    string MemberRole, bool CanEdit, bool CanSubmit);

public sealed class OperatorListQuery
{
    [RegularExpression("^(Draft|Submitted|Approved|Rejected|Suspended)$")]
    public string? Status { get; set; }
}

public sealed class ApproveOperatorRequest
{
    // INT >= 0 theo ck_operator_approved_slot_capacity; không tự đặt hạn mức khác.
    [Required, Range(0, int.MaxValue)]
    public int? ApprovedSlotCapacity { get; set; }
}

public sealed class OperatorDecisionRequest
{
    [Required]
    public string Reason { get; set; } = "";
}

public sealed class AddOperatorMemberRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = "";
}

public sealed record AdminOperatorResponse(long OperatorId, string LegalName, string TaxCode,
    string BusinessRegNo, string FarmAddress, string Status, int ApprovedSlotCapacity,
    DateTimeOffset? SubmittedAt, DateTimeOffset? ApprovedAt, long? ApprovedBy);

public sealed record OperatorMemberResponse(long UserId, string FullName, string Email,
    string MemberRole, DateTimeOffset JoinedAt);
