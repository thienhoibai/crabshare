-- V037: gộp lượt đo, kết quả AI và số đo vào một bảng dbo.measurement_record (89 bảng còn 87).
-- Trước: measurement_session, ai_inference, measurement_value.
-- Sau: cột record_type cho biết loại bản ghi (Session, AiInference, Value). Lượt đo giữ nguyên id.
-- Số đo vẫn chỉ ghi thêm (trigger tr_measurement_value_append_only chỉ áp cho loại Value).
CREATE TABLE dbo.measurement_record (
    measurement_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_measurement_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    session_no VARCHAR(20) NULL,
    batch_id BIGINT NULL,
    crab_unit_id BIGINT NULL,
    station_device_id BIGINT NULL,
    measure_procedure VARCHAR(20) NULL,
    opened_by BIGINT NULL,
    opened_at DATETIMEOFFSET(3) NULL,
    status VARCHAR(20) NULL,
    message_id UNIQUEIDENTIFIER NULL,
    captured_at DATETIMEOFFSET(3) NULL,
    received_at DATETIMEOFFSET(3) NULL,
    firmware_version VARCHAR(30) NULL,
    weight_g DECIMAL(7,1) NULL,
    weight_samples SMALLINT NULL,
    weight_range_g DECIMAL(6,3) NULL,
    tof_mm INT NULL,
    camera_height_mm INT NULL,
    door_closed BIT NULL,
    scale_calibrated_at DATETIMEOFFSET(3) NULL,
    scale_calibration_ok BIT NULL,
    white_image_uri NVARCHAR(500) NULL,
    white_sha256 CHAR(64) NULL,
    red_image_uri NVARCHAR(500) NULL,
    red_sha256 CHAR(64) NULL,
    presets_json NVARCHAR(1000) NULL,
    fail_reason NVARCHAR(300) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    measurement_session_id BIGINT NULL,
    image_kind VARCHAR(10) NULL,
    model_name VARCHAR(50) NULL,
    model_version VARCHAR(30) NULL,
    is_simulated BIT NULL,
    image_quality VARCHAR(20) NULL,
    landmarks_json NVARCHAR(2000) NULL,
    carapace_length_cm DECIMAL(6,2) NULL,
    carapace_width_cm DECIMAL(6,2) NULL,
    carapace_area_cm2 DECIMAL(8,2) NULL,
    edge_band_mm DECIMAL(6,2) NULL,
    confidence DECIMAL(5,4) NULL,
    error_reason NVARCHAR(300) NULL,
    metric VARCHAR(30) NULL,
    value DECIMAL(10,4) NULL,
    unit VARCHAR(10) NULL,
    method VARCHAR(20) NULL,
    verification_status VARCHAR(20) NULL,
    ai_inference_id BIGINT NULL,
    recorded_by BIGINT NULL,
    recorded_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_measurement_record_record_type CHECK (record_type IN ('Session', 'AiInference', 'Value'))
);
GO
SET IDENTITY_INSERT dbo.measurement_record ON;
INSERT INTO dbo.measurement_record (measurement_record_id, record_type, legacy_id, session_no, batch_id, crab_unit_id, station_device_id, measure_procedure, opened_by, opened_at, status, message_id, captured_at, received_at, firmware_version, weight_g, weight_samples, weight_range_g, tof_mm, camera_height_mm, door_closed, scale_calibrated_at, scale_calibration_ok, white_image_uri, white_sha256, red_image_uri, red_sha256, presets_json, fail_reason, created_at, updated_at)
SELECT s.[measurement_session_id], 'Session', s.[measurement_session_id], s.[session_no], s.[batch_id], s.[crab_unit_id], s.[station_device_id], s.[measure_procedure], s.[opened_by], s.[opened_at], s.[status], s.[message_id], s.[captured_at], s.[received_at], s.[firmware_version], s.[weight_g], s.[weight_samples], s.[weight_range_g], s.[tof_mm], s.[camera_height_mm], s.[door_closed], s.[scale_calibrated_at], s.[scale_calibration_ok], s.[white_image_uri], s.[white_sha256], s.[red_image_uri], s.[red_sha256], s.[presets_json], s.[fail_reason], s.[created_at], s.[updated_at] FROM dbo.measurement_session s ORDER BY s.[measurement_session_id];
SET IDENTITY_INSERT dbo.measurement_record OFF;
GO
INSERT INTO dbo.measurement_record (record_type, legacy_id, measurement_session_id, image_kind, model_name, model_version, is_simulated, status, image_quality, landmarks_json, carapace_length_cm, carapace_width_cm, carapace_area_cm2, edge_band_mm, confidence, error_reason, created_at)
SELECT 'AiInference', s.[ai_inference_id], s.[measurement_session_id], s.[image_kind], s.[model_name], s.[model_version], s.[is_simulated], s.[status], s.[image_quality], s.[landmarks_json], s.[carapace_length_cm], s.[carapace_width_cm], s.[carapace_area_cm2], s.[edge_band_mm], s.[confidence], s.[error_reason], s.[created_at] FROM dbo.ai_inference s ORDER BY s.[ai_inference_id];
GO
INSERT INTO dbo.measurement_record (record_type, legacy_id, measurement_session_id, metric, value, unit, method, confidence, verification_status, ai_inference_id, recorded_by, recorded_at)
SELECT 'Value', s.[measurement_value_id], s.[measurement_session_id], s.[metric], s.[value], s.[unit], s.[method], s.[confidence], s.[verification_status], s.[ai_inference_id], s.[recorded_by], s.[recorded_at] FROM dbo.measurement_value s ORDER BY s.[measurement_value_id];
GO
UPDATE c SET c.ai_inference_id = p.measurement_record_id FROM dbo.measurement_record c JOIN dbo.measurement_record p ON p.record_type = 'AiInference' AND p.legacy_id = c.ai_inference_id WHERE c.record_type = 'Value';
ALTER TABLE dbo.device_record DROP CONSTRAINT fk_device_command_measurement_session;
ALTER TABLE dbo.grade_decision DROP CONSTRAINT fk_grade_decision_session;
GO
ALTER TABLE dbo.ai_inference DROP CONSTRAINT fk_ai_inference_session;
ALTER TABLE dbo.measurement_value DROP CONSTRAINT fk_measurement_value_inference;
ALTER TABLE dbo.measurement_value DROP CONSTRAINT fk_measurement_value_session;
DROP TABLE dbo.measurement_session;
DROP TABLE dbo.ai_inference;
DROP TABLE dbo.measurement_value;
GO
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_record_session_required CHECK (record_type <> 'Session' OR (session_no IS NOT NULL AND batch_id IS NOT NULL AND crab_unit_id IS NOT NULL AND measure_procedure IS NOT NULL AND opened_by IS NOT NULL AND opened_at IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_session_procedure CHECK (record_type <> 'Session' OR ([measure_procedure]='Manual' OR [measure_procedure]='Station'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_session_station CHECK (record_type <> 'Session' OR ([measure_procedure]<>'Station' OR [station_device_id] IS NOT NULL));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_session_status CHECK (record_type <> 'Session' OR ([status]='Cancelled' OR [status]='Failed' OR [status]='Measured' OR [status]='Received' OR [status]='Open'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_record_aiinference_required CHECK (record_type <> 'AiInference' OR (measurement_session_id IS NOT NULL AND image_kind IS NOT NULL AND model_name IS NOT NULL AND model_version IS NOT NULL AND is_simulated IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_ai_inference_confidence CHECK (record_type <> 'AiInference' OR ([confidence] IS NULL OR [confidence]>=(0) AND [confidence]<=(1)));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_ai_inference_failed CHECK (record_type <> 'AiInference' OR ([status]<>'Failed' OR [error_reason] IS NOT NULL));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_ai_inference_image CHECK (record_type <> 'AiInference' OR ([image_kind]='Red' OR [image_kind]='White'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_ai_inference_quality CHECK (record_type <> 'AiInference' OR ([image_quality] IS NULL OR ([image_quality]='Unusable' OR [image_quality]='Poor' OR [image_quality]='Good')));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_ai_inference_status CHECK (record_type <> 'AiInference' OR ([status]='Failed' OR [status]='LowConfidence' OR [status]='Succeeded'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_record_value_required CHECK (record_type <> 'Value' OR (measurement_session_id IS NOT NULL AND metric IS NOT NULL AND value IS NOT NULL AND unit IS NOT NULL AND method IS NOT NULL AND verification_status IS NOT NULL AND recorded_at IS NOT NULL));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_value_confidence CHECK (record_type <> 'Value' OR ([confidence] IS NULL OR [confidence]>=(0) AND [confidence]<=(1)));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_value_method CHECK (record_type <> 'Value' OR ([method]='Computed' OR [method]='ManualScale' OR [method]='Caliper' OR [method]='AI' OR [method]='Scale'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_value_metric CHECK (record_type <> 'Value' OR ([metric]='CIndex' OR [metric]='EdgeBandMm' OR [metric]='CarapaceAreaCm2' OR [metric]='CarapaceWidthCm' OR [metric]='CarapaceLengthCm' OR [metric]='WeightG'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_value_positive CHECK (record_type <> 'Value' OR ([value]>=(0)));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT ck_measurement_value_verification CHECK (record_type <> 'Value' OR ([verification_status]='Disputed' OR [verification_status]='Verified' OR [verification_status]='Unverified'));
ALTER TABLE dbo.measurement_record ADD CONSTRAINT df_measurement_record_measure_procedure DEFAULT ('Station') FOR measure_procedure;
ALTER TABLE dbo.measurement_record ADD CONSTRAINT df_measurement_record_updated_at DEFAULT (sysdatetimeoffset()) FOR updated_at;
ALTER TABLE dbo.measurement_record ADD CONSTRAINT df_measurement_record_is_simulated DEFAULT ((0)) FOR is_simulated;
ALTER TABLE dbo.measurement_record ADD CONSTRAINT df_measurement_record_verification_status DEFAULT ('Unverified') FOR verification_status;
GO
CREATE UNIQUE INDEX ux_measurement_session_no ON dbo.measurement_record (session_no) WHERE record_type = 'Session';
CREATE UNIQUE INDEX ux_measurement_session_open_station ON dbo.measurement_record (station_device_id) WHERE record_type = 'Session' AND [status]='Open' AND [station_device_id] IS NOT NULL;
CREATE UNIQUE INDEX ux_measurement_session_message ON dbo.measurement_record (message_id) WHERE record_type = 'Session' AND [message_id] IS NOT NULL;
CREATE INDEX ix_measurement_session_crab ON dbo.measurement_record (crab_unit_id, opened_at) WHERE record_type = 'Session';
CREATE INDEX ix_ai_inference_session ON dbo.measurement_record (measurement_session_id) WHERE record_type = 'AiInference';
CREATE INDEX ix_measurement_value_session ON dbo.measurement_record (measurement_session_id, metric, recorded_at) WHERE record_type = 'Value';
GO
ALTER TABLE dbo.measurement_record ADD CONSTRAINT fk_measurement_session_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.measurement_record ADD CONSTRAINT fk_measurement_session_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id);
ALTER TABLE dbo.measurement_record ADD CONSTRAINT fk_measurement_session_device FOREIGN KEY (station_device_id) REFERENCES dbo.device(device_id);
ALTER TABLE dbo.measurement_record ADD CONSTRAINT fk_ai_inference_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_record(measurement_record_id);
ALTER TABLE dbo.measurement_record ADD CONSTRAINT fk_measurement_value_inference FOREIGN KEY (ai_inference_id) REFERENCES dbo.measurement_record(measurement_record_id);
ALTER TABLE dbo.measurement_record ADD CONSTRAINT fk_measurement_value_user FOREIGN KEY (recorded_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_device_command_measurement_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_record(measurement_record_id);
ALTER TABLE dbo.grade_decision ADD CONSTRAINT fk_grade_decision_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_record(measurement_record_id);
GO
-- Số đo là bằng chứng gốc của hạng: chỉ ghi thêm, không sửa, không xoá.
CREATE TRIGGER dbo.tr_measurement_value_append_only ON dbo.measurement_record
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'Value')
        THROW 50231, N'Số đo đã ghi không được sửa hoặc xoá; hãy đo lại hoặc ghi số mới.', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
