using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Accounts;

public static class EkycUploadLimits
{
    public const int MaxImageBytes = 5 * 1024 * 1024;
    public const int MaxRequestBytes = 16 * 1024 * 1024;
}

public sealed class EkycRequest
{
    [Required]
    public IFormFile? IdCardFront { get; set; }

    [Required]
    public IFormFile? IdCardBack { get; set; }

    [Required]
    public IFormFile? Selfie { get; set; }

    [AllowedValues(true, ErrorMessage = "Bạn cần đồng ý xác minh danh tính trước khi gửi ảnh.")]
    public bool Consent { get; set; }
}

public sealed record KycCheckResponse(
    long Id,
    string CheckType,
    string Result,
    string? ProviderReference,
    DateTimeOffset? ConsentAt,
    DateTimeOffset CheckedAt,
    string? FailureReason);

public sealed record KycStatusResponse(
    string VerificationStatus,
    DateTimeOffset? VerifiedAt,
    KycCheckResponse? LastCheck);
