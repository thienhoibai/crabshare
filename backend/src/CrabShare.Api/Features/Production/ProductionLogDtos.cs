using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace CrabShare.Api.Features.Production;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ProductionLogRequest : IValidatableObject
{
    [Required, Range(typeof(decimal), "0", "14")] public decimal? Ph { get; set; }
    [Required, Range(typeof(decimal), "-273.1", "999.9")] public decimal? WaterTempC { get; set; }
    [Required, Range(typeof(decimal), "0", "999.9")] public decimal? SalinityPpt { get; set; }
    [Required, Range(typeof(decimal), "0", "999999999.999")] public decimal? FeedKg { get; set; }
    [StringLength(500)] public string? Note { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        foreach (var (value, name, digits) in new[] { (Ph, nameof(Ph), 1), (WaterTempC, nameof(WaterTempC), 1), (SalinityPpt, nameof(SalinityPpt), 1), (FeedKg, nameof(FeedKg), 3) })
            if (value is { } number && decimal.Round(number, digits) != number)
                yield return new($"Chỉ số có tối đa {digits} chữ số thập phân.", [name]);
    }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ProductionThresholdRequest : IValidatableObject
{
    [JsonRequired, Range(0, int.MaxValue)] public int ExpectedVersionNo { get; set; }
    [Required, Range(typeof(decimal), "0", "14")] public decimal? PhMin { get; set; }
    [Required, Range(typeof(decimal), "0", "14")] public decimal? PhMax { get; set; }
    [Required, Range(typeof(decimal), "-273.1", "999.9")] public decimal? WaterTempMinC { get; set; }
    [Required, Range(typeof(decimal), "-273.1", "999.9")] public decimal? WaterTempMaxC { get; set; }
    [Required, Range(typeof(decimal), "0", "999.9")] public decimal? SalinityMinPpt { get; set; }
    [Required, Range(typeof(decimal), "0", "999.9")] public decimal? SalinityMaxPpt { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        foreach (var (min, max, name) in new[] { (PhMin, PhMax, nameof(PhMin)), (WaterTempMinC, WaterTempMaxC, nameof(WaterTempMinC)), (SalinityMinPpt, SalinityMaxPpt, nameof(SalinityMinPpt)) })
            if (min > max) yield return new("Ngưỡng nhỏ nhất phải nhỏ hơn hoặc bằng ngưỡng lớn nhất.", [name]);
        foreach (var (value, name) in new[] { (PhMin, nameof(PhMin)), (PhMax, nameof(PhMax)), (WaterTempMinC, nameof(WaterTempMinC)), (WaterTempMaxC, nameof(WaterTempMaxC)), (SalinityMinPpt, nameof(SalinityMinPpt)), (SalinityMaxPpt, nameof(SalinityMaxPpt)) })
            if (value is { } number && decimal.Round(number, 1) != number)
                yield return new("Ngưỡng có tối đa 1 chữ số thập phân.", [name]);
    }
}

public sealed class ProductionLogFilter : IValidatableObject
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (From > To) yield return new("Ngày bắt đầu không được sau ngày kết thúc.", [nameof(From)]);
    }
}

public sealed record ProductionThresholdResponse(long Id, int VersionNo, decimal PhMin, decimal PhMax,
    decimal WaterTempMinC, decimal WaterTempMaxC, decimal SalinityMinPpt, decimal SalinityMaxPpt, long CreatedBy, DateTimeOffset CreatedAt);
public sealed record ProductionThresholdState(DateOnly BusinessDate, bool CanConfigure, bool CanRecord, ProductionThresholdResponse? Current);
public sealed record ProductionLogResponse(long Id, string BatchCode, DateOnly LogDate, decimal? Ph, decimal? WaterTempC,
    decimal? SalinityPpt, decimal? FeedKg, string? Note, string Source, string PlausibilityFlag, long? RecordedBy,
    DateTimeOffset CreatedAt, int? ThresholdVersion, ProductionThresholdResponse? ThresholdsApplied);
public sealed record ProductionBatchResponse(string BatchCode, string Title, string CrabType, string Status, short CycleDays,
    int SeedQuantity, int AliveCount, int? DayOfCycle, ProductionLogResponse? LatestLog, bool LoggedToday, bool CanRecord, DateOnly BusinessDate);
