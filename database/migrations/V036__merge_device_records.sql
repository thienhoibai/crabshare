-- V036: gộp 5 bảng dữ liệu thiết bị vào một bảng dbo.device_record (93 bảng còn 89).
-- Trước: device_message, device_image, water_reading, device_calibration, device_command.
-- Sau: một bảng, cột record_type cho biết loại bản ghi (Message, Image, WaterReading, Calibration, Command);
--      mỗi loại chỉ dùng các cột của mình, các ràng buộc cũ giữ nguyên tên và chỉ áp cho đúng loại.
-- Dữ liệu được chép sang đầy đủ. Lệnh thiết bị (Command) giữ nguyên id; các loại khác nhận id mới.
CREATE TABLE dbo.device_record (
    device_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_device_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    device_id BIGINT NULL,
    command_type VARCHAR(20) NULL,
    box_code VARCHAR(30) NULL,
    status VARCHAR(20) NULL,
    reason NVARCHAR(300) NULL,
    created_by BIGINT NULL,
    created_at DATETIMEOFFSET(3) NULL,
    acked_at DATETIMEOFFSET(3) NULL,
    measurement_session_id BIGINT NULL,
    protected_payload NVARCHAR(2048) NULL,
    message_id UNIQUEIDENTIFIER NULL,
    device_code VARCHAR(40) NULL,
    kind VARCHAR(20) NULL,
    captured_at DATETIMEOFFSET(3) NULL,
    received_at DATETIMEOFFSET(3) NULL,
    reject_reason NVARCHAR(300) NULL,
    payload_sha256 CHAR(64) NULL,
    batch_id BIGINT NULL,
    slot_id BIGINT NULL,
    crab_unit_id BIGINT NULL,
    file_uri NVARCHAR(500) NULL,
    sha256 CHAR(64) NULL,
    run_id VARCHAR(60) NULL,
    tof_mm INT NULL,
    illumination VARCHAR(20) NULL,
    crab_detected BIT NULL,
    detection_confidence DECIMAL(5,4) NULL,
    detection_model VARCHAR(50) NULL,
    holding_id BIGINT NULL,
    measured_at DATETIMEOFFSET(3) NULL,
    temperature_c DECIMAL(5,2) NULL,
    salinity_ppt DECIMAL(5,2) NULL,
    ph DECIMAL(4,2) NULL,
    device_quality_flag VARCHAR(20) NULL,
    quality VARCHAR(20) NULL,
    performed_at DATETIMEOFFSET(3) NULL,
    details_json NVARCHAR(2000) NULL,
    error_g DECIMAL(7,3) NULL,
    passed BIT NULL,
    recorded_by BIGINT NULL,
    CONSTRAINT ck_device_record_record_type CHECK (record_type IN ('Command', 'Message', 'Image', 'WaterReading', 'Calibration'))
);
GO
SET IDENTITY_INSERT dbo.device_record ON;
INSERT INTO dbo.device_record (device_record_id, record_type, legacy_id, device_id, command_type, box_code, status, reason, created_by, created_at, acked_at, measurement_session_id, protected_payload)
SELECT s.[device_command_id], 'Command', s.[device_command_id], s.[device_id], s.[command_type], s.[box_code], s.[status], s.[reason], s.[created_by], s.[created_at], s.[acked_at], s.[measurement_session_id], s.[protected_payload] FROM dbo.device_command s ORDER BY s.[device_command_id];
SET IDENTITY_INSERT dbo.device_record OFF;
GO
INSERT INTO dbo.device_record (record_type, legacy_id, message_id, device_id, device_code, kind, captured_at, received_at, status, reject_reason, payload_sha256)
SELECT 'Message', s.[device_message_id], s.[message_id], s.[device_id], s.[device_code], s.[kind], s.[captured_at], s.[received_at], s.[status], s.[reject_reason], s.[payload_sha256] FROM dbo.device_message s ORDER BY s.[device_message_id];
GO
INSERT INTO dbo.device_record (record_type, legacy_id, device_id, batch_id, slot_id, crab_unit_id, message_id, captured_at, received_at, file_uri, sha256, run_id, tof_mm, illumination, crab_detected, detection_confidence, detection_model, created_at)
SELECT 'Image', s.[device_image_id], s.[device_id], s.[batch_id], s.[slot_id], s.[crab_unit_id], s.[message_id], s.[captured_at], s.[received_at], s.[file_uri], s.[sha256], s.[run_id], s.[tof_mm], s.[illumination], s.[crab_detected], s.[detection_confidence], s.[detection_model], s.[created_at] FROM dbo.device_image s ORDER BY s.[device_image_id];
GO
INSERT INTO dbo.device_record (record_type, legacy_id, device_id, holding_id, batch_id, message_id, measured_at, received_at, temperature_c, salinity_ppt, ph, device_quality_flag, quality)
SELECT 'WaterReading', s.[water_reading_id], s.[device_id], s.[holding_id], s.[batch_id], s.[message_id], s.[measured_at], s.[received_at], s.[temperature_c], s.[salinity_ppt], s.[ph], s.[device_quality_flag], s.[quality] FROM dbo.water_reading s ORDER BY s.[water_reading_id];
GO
INSERT INTO dbo.device_record (record_type, legacy_id, device_id, message_id, kind, performed_at, details_json, error_g, passed, recorded_by, received_at)
SELECT 'Calibration', s.[device_calibration_id], s.[device_id], s.[message_id], s.[kind], s.[performed_at], s.[details_json], s.[error_g], s.[passed], s.[recorded_by], s.[received_at] FROM dbo.device_calibration s ORDER BY s.[device_calibration_id];
GO
DROP TABLE dbo.device_command;
DROP TABLE dbo.device_message;
DROP TABLE dbo.device_image;
DROP TABLE dbo.water_reading;
DROP TABLE dbo.device_calibration;
GO
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_record_command_required CHECK (record_type <> 'Command' OR (device_id IS NOT NULL AND command_type IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_command_box CHECK (record_type <> 'Command' OR ([command_type]<>'ScanBox' OR [box_code] IS NOT NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_command_session CHECK (record_type <> 'Command' OR ([command_type]='StartMeasurement' AND [measurement_session_id] IS NOT NULL OR [command_type]<>'StartMeasurement' AND [measurement_session_id] IS NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_command_status CHECK (record_type <> 'Command' OR ([status]='Rejected' OR [status]='Accepted' OR [status]='Claimed' OR [status]='Cancelled' OR [status]='Acked' OR [status]='Pending'));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_command_type CHECK (record_type <> 'Command' OR ([command_type]='ConfigureWifi' OR [command_type]='StartMeasurement' OR [command_type]='Calibrate' OR [command_type]='Park' OR [command_type]='ScanBox' OR [command_type]='ScanRack'));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_record_message_required CHECK (record_type <> 'Message' OR (message_id IS NOT NULL AND device_code IS NOT NULL AND kind IS NOT NULL AND received_at IS NOT NULL AND status IS NOT NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_message_kind CHECK (record_type <> 'Message' OR ([kind]='RunSummary' OR [kind]='CommandAck' OR [kind]='Calibration' OR [kind]='WaterReading' OR [kind]='BoxImage' OR [kind]='Measurement' OR [kind]='Heartbeat'));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_message_status CHECK (record_type <> 'Message' OR ([status]='Rejected' OR [status]='Accepted'));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_record_image_required CHECK (record_type <> 'Image' OR (device_id IS NOT NULL AND slot_id IS NOT NULL AND message_id IS NOT NULL AND captured_at IS NOT NULL AND received_at IS NOT NULL AND file_uri IS NOT NULL AND sha256 IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_record_waterreading_required CHECK (record_type <> 'WaterReading' OR (device_id IS NOT NULL AND holding_id IS NOT NULL AND batch_id IS NOT NULL AND message_id IS NOT NULL AND measured_at IS NOT NULL AND received_at IS NOT NULL AND quality IS NOT NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_water_reading_quality CHECK (record_type <> 'WaterReading' OR ([quality]='Suspect' OR [quality]='Uncalibrated' OR [quality]='Calibrated'));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_water_reading_values CHECK (record_type <> 'WaterReading' OR (([temperature_c] IS NULL OR [temperature_c]>=(-5) AND [temperature_c]<=(60)) AND ([ph] IS NULL OR [ph]>=(0) AND [ph]<=(14)) AND ([salinity_ppt] IS NULL OR [salinity_ppt]>=(0) AND [salinity_ppt]<=(80))));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_record_calibration_required CHECK (record_type <> 'Calibration' OR (device_id IS NOT NULL AND kind IS NOT NULL AND performed_at IS NOT NULL AND received_at IS NOT NULL));
ALTER TABLE dbo.device_record ADD CONSTRAINT ck_device_calibration_kind CHECK (record_type <> 'Calibration' OR ([kind]='position' OR [kind]='ec' OR [kind]='ph' OR [kind]='tof' OR [kind]='camera' OR [kind]='scale'));
ALTER TABLE dbo.device_record ADD CONSTRAINT df_device_record_created_at DEFAULT (sysdatetimeoffset()) FOR created_at;
GO
CREATE INDEX ix_device_command_measurement_start ON dbo.device_record (device_id, measurement_session_id, device_record_id DESC) WHERE record_type = 'Command' AND [command_type]='StartMeasurement';
CREATE UNIQUE INDEX ux_device_message_accepted ON dbo.device_record (message_id) WHERE record_type = 'Message' AND [status]='Accepted';
CREATE INDEX ix_device_message_device ON dbo.device_record (device_id, received_at) WHERE record_type = 'Message';
CREATE UNIQUE INDEX ux_device_image_message ON dbo.device_record (message_id) WHERE record_type = 'Image';
CREATE INDEX ix_device_image_slot ON dbo.device_record (slot_id, captured_at) WHERE record_type = 'Image';
CREATE INDEX ix_device_image_batch ON dbo.device_record (batch_id, captured_at) WHERE record_type = 'Image';
CREATE UNIQUE INDEX ux_water_reading_message ON dbo.device_record (message_id) WHERE record_type = 'WaterReading';
CREATE INDEX ix_water_reading_batch ON dbo.device_record (batch_id, measured_at) WHERE record_type = 'WaterReading';
GO
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_device_command_device FOREIGN KEY (device_id) REFERENCES dbo.device(device_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_device_command_measurement_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_session(measurement_session_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_device_image_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_device_image_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_device_image_slot FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot(slot_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_water_reading_holding FOREIGN KEY (holding_id) REFERENCES dbo.holding_operation(holding_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
