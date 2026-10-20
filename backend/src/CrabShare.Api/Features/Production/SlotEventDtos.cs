using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CrabShare.Api.Features.Production;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SlotEventRequest : IValidatableObject
{
    [JsonRequired] public Guid RequestId { get; set; }
    [Required, StringLength(30), RegularExpression(@"[\s\S]*\S[\s\S]*")] public string SlotCode { get; set; } = "";
    [Required, RegularExpression("^(Molted|Mortality|Restocked|Relocated)$")] public string EventType { get; set; } = "";
    [Required, JsonConverter(typeof(ExplicitOffsetConverter))] public DateTimeOffset? OccurredAt { get; set; }
    [Required, Range(1, 1)] public short? Quantity { get; set; }
    [StringLength(300)] public string? Note { get; set; }
    [StringLength(30)] public string? DestinationSlotCode { get; set; }
    [Range(1, long.MaxValue)] public long? ReplacesCrabItemId { get; set; }
    [Range(1, long.MaxValue)] public long? EvidenceId { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (RequestId == Guid.Empty) yield return new("Cần mã yêu cầu để chống gửi lặp.", [nameof(RequestId)]);
        if ((EventType == "Relocated") != !string.IsNullOrWhiteSpace(DestinationSlotCode))
            yield return new("Chỉ chuyển hộp mới được và phải chọn hộp đích.", [nameof(DestinationSlotCode)]);
        if ((EventType == "Restocked") != ReplacesCrabItemId.HasValue)
            yield return new("Thả bù phải chọn đúng cá thể được thay thế.", [nameof(ReplacesCrabItemId)]);
        if (EventType is "Mortality" or "Restocked" && EvidenceId is null)
            yield return new("Cần ảnh bằng chứng chụp trực tiếp từ app mobile.", [nameof(EvidenceId)]);
        if (EventType is "Molted" or "Relocated" && EvidenceId is not null)
            yield return new("Loại sự kiện này không nhận trường ảnh bằng chứng.", [nameof(EvidenceId)]);
    }
}

// Prevent server/local timezone inference when the client omitted the offset.
public sealed class ExplicitOffsetConverter : JsonConverter<DateTimeOffset?>
{
    public override DateTimeOffset? Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType != JsonTokenType.String) throw new JsonException("Thời điểm phải là ISO 8601 có múi giờ.");
        var value = reader.GetString()!;
        if (!(value.EndsWith('Z') || System.Text.RegularExpressions.Regex.IsMatch(value, @"[+-]\d{2}:\d{2}$"))
            || !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            throw new JsonException("Thời điểm phải là ISO 8601 có múi giờ, ví dụ +07:00.");
        return parsed;
    }
    public override void Write(Utf8JsonWriter writer, DateTimeOffset? value, JsonSerializerOptions options)
    { if (value is null) writer.WriteNullValue(); else writer.WriteStringValue(value.Value); }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SlotEventPolicyRequest : IValidatableObject
{
    [JsonRequired, Range(0, int.MaxValue)] public int ExpectedVersionNo { get; set; }
    [Required, RegularExpression("^(AfterStocking|BeforeHarvest)$")] public string RestockCutoffBasis { get; set; } = "";
    [Range(1, short.MaxValue)] public short RestockCutoffDays { get; set; }
    [Range(1, 87600)] public int? MortalityWindowHours { get; set; }
    [Range(typeof(decimal), "0.01", "10000")] public decimal? MortalityThresholdPercent { get; set; }
    [RegularExpression("^(Low|Medium|High|Critical)$")] public string? MortalitySeverity { get; set; }
    [Range(1, 720)] public int? MortalityAckWithinHours { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        var count = new object?[] { MortalityWindowHours, MortalityThresholdPercent, MortalitySeverity, MortalityAckWithinHours }.Count(v => v is not null);
        if (count is not (0 or 4)) yield return new("Điền đủ cửa sổ, tỷ lệ, mức cảnh báo và hạn phản hồi; hoặc để trống cả bốn để tắt đánh giá tự động.");
        if (MortalityThresholdPercent is { } p && decimal.Round(p, 2) != p) yield return new("Tỷ lệ có tối đa hai chữ số thập phân.");
    }
}

public sealed record SlotEventPolicyResponse(long Id, int VersionNo, string RestockCutoffBasis, short RestockCutoffDays,
    int? MortalityWindowHours, decimal? MortalityThresholdPercent, string? MortalitySeverity, int? MortalityAckWithinHours,
    long CreatedBy, DateTimeOffset CreatedAt);
public sealed record SlotEventPolicyState(string BatchCode, bool CanConfigure, SlotEventPolicyResponse? Current,
    DateOnly? RestockDeadline, short SuggestedRestockCutoffDays, DateOnly BusinessDate);
public sealed record SlotCrabResponse(long Id, Guid ItemUuid, string Status);
public sealed record ReplacementCrabResponse(long Id, Guid ItemUuid, DateTimeOffset DiedAt);
public sealed record SlotEvidenceResponse(long Id, DateTimeOffset CapturedAt, string ReviewStatus);
public sealed record SlotEventContext(string BatchCode, string SlotCode, string Status, SlotCrabResponse? CurrentCrab,
    IReadOnlyList<ReplacementCrabResponse> ReplacementCandidates, IReadOnlyList<SlotEvidenceResponse> AvailableEvidence,
    DateOnly? RestockDeadline, bool CanRecord, int AliveCount);
public sealed record SlotEventResponse(long Id, string BatchCode, string SlotCode, string EventType, DateTimeOffset OccurredAt,
    short Quantity, string? Note, long? CrabItemId, Guid? ItemUuid, string? DestinationSlotCode, long? ReplacesCrabItemId,
    long? EvidenceId, long? ActorId, int? AliveCount);
