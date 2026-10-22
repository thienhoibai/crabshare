using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace CrabShare.Api.Features.Harvest;

public class StartHarvestRequest : IValidatableObject
{
    public Guid RequestId { get; set; }
    [MaxLength(100)] public string? Name { get; set; }
    [MaxLength(300)] public string? Note { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (RequestId == Guid.Empty) yield return new("Cần mã yêu cầu khác rỗng.", [nameof(RequestId)]);
    }
}

public sealed class RecordHarvestCrabRequest : IValidatableObject
{
    public Guid RequestId { get; set; }
    [Required, MaxLength(30)] public string SlotCode { get; set; } = "";
    [Range(1, long.MaxValue)] public long ExpectedCrabItemId { get; set; }
    [Range(1, short.MaxValue), JsonNumberHandling(JsonNumberHandling.Strict)] public int WeightG { get; set; }
    [Required, RegularExpression("^(HardShell|SoftShell)$")] public string ShellCondition { get; set; } = "";
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (RequestId == Guid.Empty) yield return new("Cần mã yêu cầu khác rỗng.", [nameof(RequestId)]);
    }
}

public class CompleteHarvestRequest
{
    [Range(1, int.MaxValue)] public int ExpectedRevision { get; set; }
}
public sealed class UpdateHarvestRequest : CompleteHarvestRequest
{
    [MaxLength(100)] public string? Name { get; set; }
    [MaxLength(300)] public string? Note { get; set; }
}

public sealed record HarvestResponse(long Id, string BatchCode, string? Name, string? Note, string Status,
    DateTimeOffset StartedAt, DateTimeOffset? CompletedAt, long DeclaredBy, long? CompletedBy,
    int HarvestedCount, decimal TotalWeightKg, int Revision, bool CanRecord, bool CanComplete,
    IReadOnlyList<HarvestGradeSummary> GradeSummaries);
public sealed record HarvestGradeSummary(string GradeCode, string GradeName, int CrabCount, decimal TotalWeightKg);
public sealed record HarvestCrabContext(long Id, Guid ItemUuid, long AllocationId);
public sealed record HarvestContextResponse(string BatchCode, string BatchStatus, HarvestResponse? ActiveHarvest,
    bool CanStart, bool CanRecord, bool CanComplete, int RemainingGrowingCount, int HarvestedCount,
    decimal TotalWeightKg, string? SlotStatus, HarvestCrabContext? CurrentCrab, DateTimeOffset? LatestMoltedAt);
public sealed record HarvestCrabResponse(long CrabItemId, Guid ItemUuid, long HarvestId, string BatchCode,
    string SlotCode, int WeightG, string? ShellCondition, string GradeCode, string GradeName, string? TagCode,
    string? TagStatus, string? TracePath, DateTimeOffset RecordedAt, int? HarvestedCount,
    decimal? TotalWeightKg, int? RemainingGrowingCount);
public sealed record HarvestWriteResult<T>(T Value, bool Created);
