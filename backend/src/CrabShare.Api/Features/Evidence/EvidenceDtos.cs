using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Evidence;

public static class EvidenceUploadLimits
{
    public const int MaxImageBytes = 5 * 1024 * 1024;
    public const int MaxRequestBytes = MaxImageBytes + 64 * 1024;
    public const long MaxPixels = 20_000_000;
}

public sealed class UploadEvidenceRequest
{
    [Required, StringLength(30), RegularExpression(@"[\s\S]*\S[\s\S]*")]
    public string BatchCode { get; set; } = "";
    [Required, StringLength(30), RegularExpression(@"[\s\S]*\S[\s\S]*")]
    public string SlotCode { get; set; } = "";
    // Allows camera evidence before claiming the vacant box for a replacement crab.
    [RegularExpression("^Restocked$")] public string? SlotEventType { get; set; }
    [Required] public DateTimeOffset? CapturedAt { get; set; }
    [Required, Range(typeof(decimal), "-90", "90")] public decimal? Latitude { get; set; }
    [Required, Range(typeof(decimal), "-180", "180")] public decimal? Longitude { get; set; }
    [Range(1, long.MaxValue)] public long? CaptureRequestId { get; set; }
    [Required, EvidenceImageFile] public IFormFile? Image { get; set; }
}

public sealed class EvidenceImageFileAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value is IFormFile file && file.Length is > 0 and <= EvidenceUploadLimits.MaxImageBytes
        && file.ContentType.ToLowerInvariant() is "image/jpeg" or "image/png" or "image/webp";
    public override string FormatErrorMessage(string name) => "Ảnh cần là JPEG, PNG hoặc WebP, dung lượng tối đa 5 MB.";
}

public sealed record EvidenceDetectionResponse(bool? CrabDetected, decimal? Confidence, string ModelVersion);
public sealed record EvidenceResponse(long Id, string BatchCode, string SlotCode, DateTimeOffset CapturedAt,
    DateTimeOffset ReceivedAt, decimal Latitude, decimal Longitude, string Sha256, string PerceptualHash,
    decimal RiskScore, string ReviewStatus, string DuplicateMatch, EvidenceDetectionResponse Detection,
    long? CaptureRequestId, string? CaptureRequestStatus);

public sealed class EvidenceOptions
{
    public int SimilarityDistance { get; set; } = 4;
    public int StaleCaptureHours { get; set; } = 24;
}
