using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Devices;

// Bản tin thiết bị theo mục 11 của Hướng dẫn dựng trạm đo GradeAI và camera chạy dàn (BR-230). Tên trường giữ đúng như đặc tả.

public sealed class HeartbeatMessage
{
    [Required, StringLength(40)] public string DeviceCode { get; set; } = "";
    [StringLength(30)] public string? FirmwareVersion { get; set; }
    [StringLength(30)] public string? Status { get; set; }
    public DateTimeOffset? LastCalibratedAt { get; set; }
    [Range(0, 1_000_000)] public int? QueueLength { get; set; }
}

public sealed class LensPreset
{
    public int? ExposureUs { get; set; }
    public decimal? Gain { get; set; }
    public decimal? LensPosition { get; set; }
}

public sealed class StationPresets
{
    public LensPreset? White { get; set; }
    public LensPreset? Red { get; set; }
}

/// <summary>Phần meta của bản tin trạm đo (multipart: meta + white + red).</summary>
public sealed class StationMeta
{
    public Guid MessageId { get; set; }
    [Required, StringLength(40)] public string DeviceCode { get; set; } = "";
    [StringLength(20)] public string? DeviceType { get; set; }
    [StringLength(30)] public string? FirmwareVersion { get; set; }
    public DateTimeOffset? CapturedAt { get; set; }
    [Range(typeof(decimal), "0.1", "5000")] public decimal? WeightG { get; set; }
    [Range(1, 1000)] public int? WeightSamples { get; set; }
    [Range(typeof(decimal), "0", "1000")] public decimal? WeightRangeG { get; set; }
    [Range(1, 2000)] public int? TofMm { get; set; }
    [Range(50, 2000)] public int? CameraHeightMm { get; set; }
    public DateTimeOffset? LastCalibratedAt { get; set; }
    public StationPresets? Presets { get; set; }
    public bool? DoorClosed { get; set; }
}

/// <summary>Phần meta của ảnh hộp từ camera chạy dàn hoặc camera cố định (multipart: meta + image).</summary>
public sealed class BoxImageMeta
{
    public Guid MessageId { get; set; }
    [Required, StringLength(40)] public string DeviceCode { get; set; } = "";
    [StringLength(20)] public string? DeviceType { get; set; }
    [StringLength(20)] public string? RackCode { get; set; }
    [Required, StringLength(30)] public string BoxCode { get; set; } = "";
    public int? Tier { get; set; }
    public int? Column { get; set; }
    [StringLength(60)] public string? RunId { get; set; }
    public DateTimeOffset? CapturedAt { get; set; }
    public int? TofMm { get; set; }
    [StringLength(20)] public string? Illumination { get; set; }
    public int? ExposureUs { get; set; }
    public decimal? Gain { get; set; }
}

public sealed class WaterReadingMessage
{
    public Guid MessageId { get; set; }
    [Required, StringLength(40)] public string DeviceCode { get; set; } = "";
    public DateTimeOffset? MeasuredAt { get; set; }
    [Range(typeof(decimal), "-5", "60")] public decimal? TemperatureC { get; set; }
    [Range(typeof(decimal), "0", "80")] public decimal? SalinityPpt { get; set; }
    [Range(typeof(decimal), "0", "14")] public decimal? Ph { get; set; }
    [StringLength(20)] public string? QualityFlag { get; set; }
    public DateTimeOffset? LastCalibratedAt { get; set; }
}

public sealed class CalibrationMessage
{
    public Guid MessageId { get; set; }
    [Required, StringLength(40)] public string DeviceCode { get; set; } = "";
    /// <summary>scale, camera, tof, ph, ec (và position cho camera chạy dàn).</summary>
    [Required, RegularExpression("^(scale|camera|tof|ph|ec|position)$")] public string Kind { get; set; } = "";
    public DateTimeOffset? PerformedAt { get; set; }
    public System.Text.Json.JsonElement? Details { get; set; }
}

public sealed record IngestAccepted(string Status, string? SessionNo = null, long? Id = null);
public sealed record OpenSessionResponse(string SessionNo, string CrabTag, DateTimeOffset OpenedAt);
public sealed record DeviceCommandResponse(long CommandId, string CommandType, string? BoxCode, DateTimeOffset CreatedAt);
public sealed record HeartbeatResponse(DateTimeOffset ServerTime, string Status, DateTimeOffset? LastCalibratedAt, bool CalibrationDue);

// ---------- quản trị thiết bị ----------
public sealed class RegisterDeviceRequest
{
    [Required, RegularExpression("^[A-Za-z0-9_-]{3,40}$")] public string DeviceCode { get; set; } = "";
    [Required, RegularExpression("^(Camera|RailCamera|WaterSensor|Station)$")] public string DeviceType { get; set; } = "";
    [Range(1, long.MaxValue)] public long OperatorId { get; set; }
    /// <summary>Camera: mã hộp. RailCamera: mã dàn dạng R01 (kệ số 1). WaterSensor: mã Lô (đợt lưu nuôi của Lô). Station: mã địa điểm trạm kiểm phẩm.</summary>
    [StringLength(30)] public string? SlotCode { get; set; }
    [StringLength(20)] public string? RackCode { get; set; }
    [StringLength(20)] public string? BatchCode { get; set; }
    public long? SiteId { get; set; }
    [RegularExpression("^(Real|Simulated)$")] public string Source { get; set; } = "Real";
    [Range(1, 365)] public short? CalibrationPeriodDays { get; set; }
    [Range(50, 2000)] public int? CameraHeightMm { get; set; }
}

public sealed record DeviceResponse(string DeviceCode, string DeviceType, long OperatorId, string ScopeType, string Scope, string Source, string Status,
    string? FirmwareVersion, DateTimeOffset? LastSeenAt, DateTimeOffset? LastCalibratedAt, short CalibrationPeriodDays, bool CalibrationDue,
    int? QueueLength, string KeyPrefix);
public sealed record DeviceRegisteredResponse(DeviceResponse Device, string DeviceKey);

public sealed class DeviceCommandRequest
{
    [Required, RegularExpression("^(ScanRack|ScanBox|Park|Calibrate)$")] public string CommandType { get; set; } = "";
    [StringLength(30)] public string? BoxCode { get; set; }
    [StringLength(300)] public string? Reason { get; set; }
}

public sealed class ManualCalibrationRequest
{
    [Required, RegularExpression("^(scale|camera|tof|ph|ec|position)$")] public string Kind { get; set; } = "";
    public DateTimeOffset? PerformedAt { get; set; }
    /// <summary>Sai số đo được với quả cân chuẩn 200 g, 500 g (BR-225: ≤ 0,5 g).</summary>
    [Range(typeof(decimal), "0", "100")] public decimal? ErrorG { get; set; }
    [StringLength(500)] public string? Note { get; set; }
}

public sealed record WaterReadingResponse(DateTimeOffset MeasuredAt, decimal? TemperatureC, decimal? SalinityPpt, decimal? Ph, string Quality, string DeviceCode);
public sealed record DeviceImageResponse(long DeviceImageId, string SlotCode, string? CrabCode, DateTimeOffset CapturedAt, DateTimeOffset ReceivedAt,
    bool? CrabDetected, decimal? DetectionConfidence, string DeviceCode, string? RunId);
