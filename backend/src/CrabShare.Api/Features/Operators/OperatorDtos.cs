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
