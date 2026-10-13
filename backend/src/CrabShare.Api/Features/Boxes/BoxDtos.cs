using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Boxes;

public sealed class BoxRangeRequest : IValidatableObject
{
    [Range(1, int.MaxValue)] public int From { get; set; }
    [Range(1, int.MaxValue)] public int To { get; set; }
    [Range(1, 30)] public int Width { get; set; } = 4;
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (To < From) yield return new ValidationResult("Số cuối phải lớn hơn hoặc bằng số đầu.", [nameof(To)]);
    }
}

public sealed class CreateBoxRequest
{
    [Required, MaxLength(30), RegularExpression(@"^[A-Za-z0-9 _-]+$")]
    public string SlotCode { get; set; } = "";
    [MaxLength(10), RegularExpression(@"^[A-Za-z0-9 _-]+$")] public string? RowCode { get; set; }
    [Range(1, short.MaxValue)] public short? RackNo { get; set; }
    [Range(1, short.MaxValue)] public short? TierNo { get; set; }
    [Range(1, short.MaxValue)] public short? ColumnNo { get; set; }
}

public sealed class UpdateBoxRequest
{
    [Required, RegularExpression("^(Available|Maintenance)$")] public string Status { get; set; } = "";
}

public sealed class BoxListQuery
{
    [RegularExpression("^(Available|Occupied|Maintenance)$")] public string? Status { get; set; }
    [MaxLength(30)] public string? Search { get; set; }
}

public sealed record BoxEvidenceResponse(long Id, DateTimeOffset ReceivedAt, string ReviewStatus);
public sealed record BoxResponse(string SlotCode, string Status, string? RowCode, short? RackNo, short? TierNo, short? ColumnNo,
    string? BatchCode = null, BoxEvidenceResponse? LatestEvidence = null);
public sealed record BoxRangeResponse(int Created, string From, string To);
