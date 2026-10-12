using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Accounts;

public sealed class AdminUserQuery
{
    [AllowedValues(null, "Investor", "Customer", "OperatorMember", "PlatformAdmin", "EvidenceReviewer")]
    public string? Role { get; set; }
    [AllowedValues(null, "Active", "Locked", "PendingVerification")]
    public string? Status { get; set; }
    [StringLength(150)]
    public string? Q { get; set; }
}

public sealed class AdminKycQuery
{
    [AllowedValues(null, "Pending", "Passed", "Failed", "ExceptionApproved")]
    public string? Result { get; set; } = "Failed";
    [AllowedValues(null, "OtpDeclaration", "EkycIdFace", "BankNameMatch")]
    public string? CheckType { get; set; }
}

public sealed class AdminAccountDecisionRequest
{
    [Required, StringLength(300)]
    public string Reason { get; set; } = "";
}

public sealed record AdminUserResponse(long UserId, string FullName, string Email, string? Phone,
    string Status, IReadOnlyList<string> Roles, string? VerificationStatus, DateTimeOffset CreatedAt, DateTimeOffset? LastLoginAt);
public sealed record AdminKycResponse(long Id, long UserId, string FullName, string Email, string CheckType,
    string Result, string? ProviderReference, DateTimeOffset? ConsentAt, DateTimeOffset CheckedAt,
    string? FailureReason, long? ReviewedBy, bool CanApproveException);
public sealed record AdminUserDetailResponse(AdminUserResponse User, DateTimeOffset? VerifiedAt, IReadOnlyList<AdminKycResponse> KycChecks);
