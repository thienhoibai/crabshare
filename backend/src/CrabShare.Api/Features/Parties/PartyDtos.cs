using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Parties;

public sealed record PartnerRoleResponse(string RoleType, string Status, DateTimeOffset ValidFrom, DateTimeOffset? ValidTo, string? Note);

public sealed record PartySiteResponse(long SiteId, string SiteCode, string SiteType, string Name, string AddressLine, string? Province,
    decimal? Latitude, decimal? Longitude, string? ContactName, string? ContactPhone, bool IsDefault, string Status);

public sealed record PartyResponse(long PartyId, string PartyCode, string LegalName, string PartyType, string? RegistrationNo,
    string? Representative, string? Phone, string VerificationStatus, string? RejectReason, bool IsPlatform,
    IReadOnlyList<PartnerRoleResponse> Roles, IReadOnlyList<PartySiteResponse> Sites);

public sealed class UpdatePartyRequest
{
    [Required, MaxLength(200)] public string LegalName { get; set; } = "";
    /// <summary>Individual, Household, Company, Cooperative.</summary>
    [Required, RegularExpression("^(Individual|Household|Company|Cooperative)$")] public string PartyType { get; set; } = "Individual";
    [MaxLength(30)] public string? RegistrationNo { get; set; }
    [MaxLength(150)] public string? Representative { get; set; }
    [Phone, MaxLength(15)] public string? Phone { get; set; }
}

public sealed class SiteRequest
{
    [MaxLength(30), RegularExpression("^[A-Za-z0-9_-]+$")] public string? SiteCode { get; set; }
    /// <summary>Farm, QcStation, Warehouse, DeliveryAddress.</summary>
    [Required, RegularExpression("^(Farm|QcStation|Warehouse|DeliveryAddress)$")] public string SiteType { get; set; } = "";
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [Required, MaxLength(300)] public string AddressLine { get; set; } = "";
    [MaxLength(100)] public string? Province { get; set; }
    [Range(-90, 90)] public decimal? Latitude { get; set; }
    [Range(-180, 180)] public decimal? Longitude { get; set; }
    [MaxLength(150)] public string? ContactName { get; set; }
    [Phone, MaxLength(15)] public string? ContactPhone { get; set; }
    public bool IsDefault { get; set; }
}

public sealed class RelatedPartyRequest
{
    [Required, MaxLength(150)] public string FullName { get; set; } = "";
    [Required, MaxLength(50)] public string Relation { get; set; } = "";
    /// <summary>Số CCCD/CMND. Hệ thống chỉ lưu mã băm và 4 số cuối.</summary>
    [Required, RegularExpression("^[0-9A-Za-z]{6,20}$")] public string IdNumber { get; set; } = "";
    /// <summary>Mã đối tác nếu bên liên quan cũng có tài khoản trên nền tảng.</summary>
    [MaxLength(10)] public string? LinkedPartyCode { get; set; }
}

public sealed record RelatedPartyResponse(long RelatedPartyId, string FullName, string Relation, string IdNumberLast4, string? LinkedPartyCode);

/// <summary>Nhà cung cấp cua hoặc bên cam kết thu mua, không bắt buộc có tài khoản (BR-016).</summary>
public sealed class ExternalPartyRequest
{
    [Required, MaxLength(200)] public string LegalName { get; set; } = "";
    [Required, RegularExpression("^(Individual|Household|Company|Cooperative)$")] public string PartyType { get; set; } = "Household";
    [MaxLength(30)] public string? RegistrationNo { get; set; }
    [MaxLength(150)] public string? Representative { get; set; }
    [Required, Phone, MaxLength(15)] public string Phone { get; set; } = "";
    /// <summary>Supplier hoặc OfftakeBuyer.</summary>
    [Required, RegularExpression("^(Supplier|OfftakeBuyer)$")] public string RoleType { get; set; } = "";
    public SiteRequest? Site { get; set; }
}

public sealed class PartyDecisionRequest
{
    [MaxLength(300)] public string? Reason { get; set; }
}

public sealed class RoleChangeRequest
{
    [Required, RegularExpression("^(Farmer|Investor|Customer|Supplier|OfftakeBuyer)$")] public string RoleType { get; set; } = "";
    [Required, RegularExpression("^(Pending|Active|Suspended|Revoked)$")] public string Status { get; set; } = "";
    [MaxLength(300)] public string? Note { get; set; }
}

public sealed class PartyListQuery
{
    [MaxLength(100)] public string? Search { get; set; }
    [RegularExpression("^(Farmer|Investor|Customer|Supplier|OfftakeBuyer)$")] public string? RoleType { get; set; }
    [RegularExpression("^(Unverified|Pending|Verified|Rejected)$")] public string? VerificationStatus { get; set; }
}

public sealed record PartySummaryResponse(long PartyId, string PartyCode, string LegalName, string PartyType, string VerificationStatus,
    IReadOnlyList<string> ActiveRoles);

public sealed record QcInspectorResponse(long UserId, string FullName, string Email, string? PartyCode, DateTimeOffset GrantedAt,
    int ApprovedCount, int AcceptedClaimCount);

public sealed class GrantQcRequest
{
    [Range(1, long.MaxValue)] public long UserId { get; set; }
}

public sealed record ParameterValueResponse(string Key, string Label, decimal Value, DateTimeOffset EffectiveFrom, string? Note);

public sealed class ParameterChangeRequest
{
    [Required, MaxLength(50)] public string Key { get; set; } = "";
    public decimal Value { get; set; }
    /// <summary>Không được ở quá khứ (BR-218): Lô đang chạy giữ giá trị lúc mở gọi vốn.</summary>
    public DateTimeOffset EffectiveFrom { get; set; }
    [MaxLength(300)] public string? Note { get; set; }
}
