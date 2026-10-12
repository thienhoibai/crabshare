namespace CrabShare.Api.Common.Auth;

/// <summary>
/// Tên vai trò — trùng với giá trị CHECK của cột app_user_role.role_code.
/// Evidence Reviewer là một quyền (không phải tác nhân riêng), cấp cho người được Admin chỉ định.
/// </summary>
public static class Roles
{
    public const string Investor = "Investor";
    public const string Customer = "Customer";
    public const string OperatorMember = "OperatorMember";
    public const string PlatformAdmin = "PlatformAdmin";
    public const string EvidenceReviewer = "EvidenceReviewer";

    public static readonly string[] All = [Investor, Customer, OperatorMember, PlatformAdmin, EvidenceReviewer];
}

/// <summary>Tên policy dùng với .RequireAuthorization(Policies.X)</summary>
public static class Policies
{
    public const string Admin = "Admin";
    public const string Operator = "Operator";
    public const string Investor = "Investor";
    public const string Customer = "Customer";
    public const string Reviewer = "Reviewer";
}
