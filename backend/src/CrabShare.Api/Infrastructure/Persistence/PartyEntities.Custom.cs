using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V018 — BR v1.5 nhóm A: đối tác, vai trò đối tác, địa điểm, bên liên quan, người tham gia Lô, tham số nền tảng.

public partial class AppUser
{
    /// <summary>Đối tác sở hữu tài khoản (BR-003). Tài khoản cũ có thể chưa có, PartyDirectory tạo khi cần.</summary>
    [Column("party_id")] public long? PartyId { get; set; }
}

public partial class Operator
{
    /// <summary>Đối tác của hộ nuôi (BR-005).</summary>
    [Column("party_id")] public long? PartyId { get; set; }
}

public partial class Customer
{
    /// <summary>Restaurant, Trader, Wholesaler, Agent, CentralKitchen, Other (BR-014).</summary>
    [Column("customer_type"), MaxLength(20), Unicode(false)] public string? CustomerType { get; set; }
}

public partial class Batch
{
    /// <summary>P hợp tác lô, T CrabShare mua bán, A kết nối đại lý (BR-018).</summary>
    [Column("batch_mode"), MaxLength(1), Unicode(false)] public string BatchMode { get; set; } = "P";

    /// <summary>Đơn vị thực hiện (BR-025): người nuôi ở lô P, CrabShare ở lô T, nhà cung cấp ở lô A.</summary>
    [Column("executor_party_id")] public long? ExecutorPartyId { get; set; }
}

[Table("party")]
public sealed class Party
{
    [Key, Column("party_id")] public long PartyId { get; set; }
    [Column("party_code"), MaxLength(10), Unicode(false), DatabaseGenerated(DatabaseGeneratedOption.Computed)]
    public string PartyCode { get; set; } = "";
    [Column("legal_name"), MaxLength(200)] public string LegalName { get; set; } = "";
    [Column("party_type"), MaxLength(20), Unicode(false)] public string PartyType { get; set; } = "Individual";
    [Column("registration_no"), MaxLength(30), Unicode(false)] public string? RegistrationNo { get; set; }
    [Column("representative"), MaxLength(150)] public string? Representative { get; set; }
    [Column("phone"), MaxLength(15), Unicode(false)] public string? Phone { get; set; }
    [Column("verification_status"), MaxLength(20), Unicode(false)] public string VerificationStatus { get; set; } = "Unverified";
    [Column("reject_reason"), MaxLength(300)] public string? RejectReason { get; set; }
    [Column("is_platform")] public bool IsPlatform { get; set; }
    [Column("registered_at"), Precision(3)] public DateTimeOffset RegisteredAt { get; set; }
    [Column("verified_at"), Precision(3)] public DateTimeOffset? VerifiedAt { get; set; }
    [Column("verified_by")] public long? VerifiedBy { get; set; }
    [Column("created_by")] public long? CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
    public List<PartnerRole> Roles { get; set; } = [];
    public List<PartySite> Sites { get; set; } = [];
}

[Table("partner_role")]
public sealed class PartnerRole
{
    [Key, Column("partner_role_id")] public long PartnerRoleId { get; set; }
    [Column("party_id")] public long PartyId { get; set; }
    [Column("role_type"), MaxLength(20), Unicode(false)] public string RoleType { get; set; } = "";
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("valid_from"), Precision(3)] public DateTimeOffset ValidFrom { get; set; }
    [Column("valid_to"), Precision(3)] public DateTimeOffset? ValidTo { get; set; }
    [Column("note"), MaxLength(300)] public string? Note { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
    public Party Party { get; set; } = null!;
}

[Table("party_site")]
public sealed class PartySite
{
    [Key, Column("site_id")] public long SiteId { get; set; }
    [Column("party_id")] public long PartyId { get; set; }
    [Column("site_code"), MaxLength(30), Unicode(false)] public string SiteCode { get; set; } = "";
    [Column("site_type"), MaxLength(20), Unicode(false)] public string SiteType { get; set; } = "";
    [Column("name"), MaxLength(150)] public string Name { get; set; } = "";
    [Column("address_line"), MaxLength(300)] public string AddressLine { get; set; } = "";
    [Column("province"), MaxLength(100)] public string? Province { get; set; }
    [Column("latitude"), Precision(9, 6)] public decimal? Latitude { get; set; }
    [Column("longitude"), Precision(9, 6)] public decimal? Longitude { get; set; }
    [Column("contact_name"), MaxLength(150)] public string? ContactName { get; set; }
    [Column("contact_phone"), MaxLength(15), Unicode(false)] public string? ContactPhone { get; set; }
    [Column("is_default")] public bool IsDefault { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("related_party")]
public sealed class RelatedParty
{
    [Key, Column("related_party_id")] public long RelatedPartyId { get; set; }
    [Column("party_id")] public long PartyId { get; set; }
    [Column("full_name"), MaxLength(150)] public string FullName { get; set; } = "";
    [Column("relation"), MaxLength(50)] public string Relation { get; set; } = "";
    [Column("id_number_digest"), MaxLength(64), Unicode(false)] public string IdNumberDigest { get; set; } = "";
    [Column("id_number_last4"), MaxLength(4), Unicode(false)] public string IdNumberLast4 { get; set; } = "";
    [Column("linked_party_id")] public long? LinkedPartyId { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("batch_participant")]
public sealed class BatchParticipant
{
    [Key, Column("participant_id")] public long ParticipantId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("party_id")] public long PartyId { get; set; }
    [Column("participant_role"), MaxLength(20), Unicode(false)] public string ParticipantRole { get; set; } = "";
    [Column("joined_at"), Precision(3)] public DateTimeOffset JoinedAt { get; set; }
    [Column("responsibility_scope"), MaxLength(300)] public string? ResponsibilityScope { get; set; }
    [Column("approval_status"), MaxLength(20), Unicode(false)] public string ApprovalStatus { get; set; } = "Approved";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("platform_parameter")]
public sealed class PlatformParameter
{
    [Key, Column("parameter_id")] public long ParameterId { get; set; }
    [Column("param_key"), MaxLength(50), Unicode(false)] public string ParamKey { get; set; } = "";
    [Column("value"), Precision(18, 4)] public decimal Value { get; set; }
    [Column("effective_from"), Precision(3)] public DateTimeOffset EffectiveFrom { get; set; }
    [Column("note"), MaxLength(300)] public string? Note { get; set; }
    [Column("created_by")] public long? CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}
