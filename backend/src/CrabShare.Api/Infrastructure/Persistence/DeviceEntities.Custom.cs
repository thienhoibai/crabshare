using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// V022 — BR v1.5 nhóm E: thiết bị IoT, bản tin, ảnh thiết bị, chỉ số nước, hiệu chuẩn, lệnh, lượt đo.

[Table("device")]
public sealed class Device
{
    [Key, Column("device_id")] public long DeviceId { get; set; }
    [Column("device_code"), MaxLength(40), Unicode(false)] public string DeviceCode { get; set; } = "";
    /// <summary>Camera, RailCamera, WaterSensor, Station.</summary>
    [Column("device_type"), MaxLength(20), Unicode(false)] public string DeviceType { get; set; } = "";
    [Column("operator_id")] public long OperatorId { get; set; }
    /// <summary>Box, Rack, Holding, QcStation.</summary>
    [Column("scope_type"), MaxLength(20), Unicode(false)] public string ScopeType { get; set; } = "";
    [Column("scope_slot_id")] public long? ScopeSlotId { get; set; }
    [Column("scope_rack_code"), MaxLength(20), Unicode(false)] public string? ScopeRackCode { get; set; }
    [Column("scope_holding_id")] public long? ScopeHoldingId { get; set; }
    [Column("scope_site_id")] public long? ScopeSiteId { get; set; }
    [Column("key_hash"), MaxLength(64), Unicode(false)] public string KeyHash { get; set; } = "";
    [Column("key_prefix"), MaxLength(8), Unicode(false)] public string KeyPrefix { get; set; } = "";
    /// <summary>Real hoặc Simulated (BR-230: hệ thống không phân biệt hai nguồn ngoài cờ này).</summary>
    [Column("source"), MaxLength(20), Unicode(false)] public string Source { get; set; } = "Real";
    /// <summary>Active, Offline, Removed.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Active";
    [Column("firmware_version"), MaxLength(30), Unicode(false)] public string? FirmwareVersion { get; set; }
    [Column("last_seen_at"), Precision(3)] public DateTimeOffset? LastSeenAt { get; set; }
    [Column("last_calibrated_at"), Precision(3)] public DateTimeOffset? LastCalibratedAt { get; set; }
    [Column("calibration_period_days")] public short CalibrationPeriodDays { get; set; } = 30;
    [Column("queue_length")] public int? QueueLength { get; set; }
    [Column("camera_height_mm")] public int? CameraHeightMm { get; set; }
    [Column("registered_by")] public long RegisteredBy { get; set; }
    [Column("removed_at"), Precision(3)] public DateTimeOffset? RemovedAt { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("device_message")]
public sealed class DeviceMessage
{
    [Key, Column("device_message_id")] public long DeviceMessageId { get; set; }
    [Column("message_id")] public Guid MessageId { get; set; }
    [Column("device_id")] public long? DeviceId { get; set; }
    [Column("device_code"), MaxLength(40), Unicode(false)] public string DeviceCode { get; set; } = "";
    [Column("kind"), MaxLength(20), Unicode(false)] public string Kind { get; set; } = "";
    [Column("captured_at"), Precision(3)] public DateTimeOffset? CapturedAt { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset ReceivedAt { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "";
    [Column("reject_reason"), MaxLength(300)] public string? RejectReason { get; set; }
    [Column("payload_sha256"), MaxLength(64), Unicode(false)] public string? PayloadSha256 { get; set; }
}

[Table("device_image")]
public sealed class DeviceImage
{
    [Key, Column("device_image_id")] public long DeviceImageId { get; set; }
    [Column("device_id")] public long DeviceId { get; set; }
    [Column("batch_id")] public long? BatchId { get; set; }
    [Column("slot_id")] public long SlotId { get; set; }
    [Column("crab_unit_id")] public long? CrabUnitId { get; set; }
    [Column("message_id")] public Guid MessageId { get; set; }
    [Column("captured_at"), Precision(3)] public DateTimeOffset CapturedAt { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset ReceivedAt { get; set; }
    [Column("file_uri"), MaxLength(500)] public string FileUri { get; set; } = "";
    [Column("sha256"), MaxLength(64), Unicode(false)] public string Sha256 { get; set; } = "";
    [Column("run_id"), MaxLength(60), Unicode(false)] public string? RunId { get; set; }
    [Column("tof_mm")] public int? TofMm { get; set; }
    [Column("illumination"), MaxLength(20), Unicode(false)] public string? Illumination { get; set; }
    [Column("crab_detected")] public bool? CrabDetected { get; set; }
    [Column("detection_confidence"), Precision(5, 4)] public decimal? DetectionConfidence { get; set; }
    [Column("detection_model"), MaxLength(50), Unicode(false)] public string? DetectionModel { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("water_reading")]
public sealed class WaterReading
{
    [Key, Column("water_reading_id")] public long WaterReadingId { get; set; }
    [Column("device_id")] public long DeviceId { get; set; }
    [Column("holding_id")] public long HoldingId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("message_id")] public Guid MessageId { get; set; }
    [Column("measured_at"), Precision(3)] public DateTimeOffset MeasuredAt { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset ReceivedAt { get; set; }
    [Column("temperature_c"), Precision(5, 2)] public decimal? TemperatureC { get; set; }
    [Column("salinity_ppt"), Precision(5, 2)] public decimal? SalinityPpt { get; set; }
    [Column("ph"), Precision(4, 2)] public decimal? Ph { get; set; }
    [Column("device_quality_flag"), MaxLength(20), Unicode(false)] public string? DeviceQualityFlag { get; set; }
    /// <summary>Calibrated, Uncalibrated, Suspect (BR-229).</summary>
    [Column("quality"), MaxLength(20), Unicode(false)] public string Quality { get; set; } = "Calibrated";
}

[Table("device_calibration")]
public sealed class DeviceCalibration
{
    [Key, Column("device_calibration_id")] public long DeviceCalibrationId { get; set; }
    [Column("device_id")] public long DeviceId { get; set; }
    [Column("message_id")] public Guid? MessageId { get; set; }
    /// <summary>scale, camera, tof, ph, ec, position.</summary>
    [Column("kind"), MaxLength(20), Unicode(false)] public string Kind { get; set; } = "";
    [Column("performed_at"), Precision(3)] public DateTimeOffset PerformedAt { get; set; }
    [Column("details_json"), MaxLength(2000)] public string? DetailsJson { get; set; }
    [Column("error_g"), Precision(7, 3)] public decimal? ErrorG { get; set; }
    [Column("passed")] public bool? Passed { get; set; }
    [Column("recorded_by")] public long? RecordedBy { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset ReceivedAt { get; set; }
}

[Table("device_command")]
public sealed class DeviceCommand
{
    [Key, Column("device_command_id")] public long DeviceCommandId { get; set; }
    [Column("device_id")] public long DeviceId { get; set; }
    /// <summary>ScanRack, ScanBox, Park, Calibrate.</summary>
    [Column("command_type"), MaxLength(20), Unicode(false)] public string CommandType { get; set; } = "";
    [Column("box_code"), MaxLength(30), Unicode(false)] public string? BoxCode { get; set; }
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Pending";
    [Column("reason"), MaxLength(300)] public string? Reason { get; set; }
    [Column("created_by")] public long? CreatedBy { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("acked_at"), Precision(3)] public DateTimeOffset? AckedAt { get; set; }
}

[Table("measurement_session")]
public sealed class MeasurementSession
{
    [Key, Column("measurement_session_id")] public long MeasurementSessionId { get; set; }
    [Column("session_no"), MaxLength(20), Unicode(false)] public string SessionNo { get; set; } = "";
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("crab_unit_id")] public long CrabUnitId { get; set; }
    [Column("station_device_id")] public long? StationDeviceId { get; set; }
    /// <summary>Station (trạm đo) hoặc Manual (thước kẹp và cân tay, dự phòng).</summary>
    [Column("measure_procedure"), MaxLength(20), Unicode(false)] public string Procedure { get; set; } = "Station";
    [Column("opened_by")] public long OpenedBy { get; set; }
    [Column("opened_at"), Precision(3)] public DateTimeOffset OpenedAt { get; set; }
    /// <summary>Open, Received, Measured, Failed, Cancelled.</summary>
    [Column("status"), MaxLength(20), Unicode(false)] public string Status { get; set; } = "Open";
    [Column("message_id")] public Guid? MessageId { get; set; }
    [Column("captured_at"), Precision(3)] public DateTimeOffset? CapturedAt { get; set; }
    [Column("received_at"), Precision(3)] public DateTimeOffset? ReceivedAt { get; set; }
    [Column("firmware_version"), MaxLength(30), Unicode(false)] public string? FirmwareVersion { get; set; }
    [Column("weight_g"), Precision(7, 1)] public decimal? WeightG { get; set; }
    [Column("weight_samples")] public short? WeightSamples { get; set; }
    [Column("weight_range_g"), Precision(6, 3)] public decimal? WeightRangeG { get; set; }
    [Column("tof_mm")] public int? TofMm { get; set; }
    [Column("camera_height_mm")] public int? CameraHeightMm { get; set; }
    [Column("door_closed")] public bool? DoorClosed { get; set; }
    [Column("scale_calibrated_at"), Precision(3)] public DateTimeOffset? ScaleCalibratedAt { get; set; }
    [Column("scale_calibration_ok")] public bool? ScaleCalibrationOk { get; set; }
    [Column("white_image_uri"), MaxLength(500)] public string? WhiteImageUri { get; set; }
    [Column("white_sha256"), MaxLength(64), Unicode(false)] public string? WhiteSha256 { get; set; }
    [Column("red_image_uri"), MaxLength(500)] public string? RedImageUri { get; set; }
    [Column("red_sha256"), MaxLength(64), Unicode(false)] public string? RedSha256 { get; set; }
    [Column("presets_json"), MaxLength(1000)] public string? PresetsJson { get; set; }
    [Column("fail_reason"), MaxLength(300)] public string? FailReason { get; set; }
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at"), Precision(3)] public DateTimeOffset UpdatedAt { get; set; }
}
