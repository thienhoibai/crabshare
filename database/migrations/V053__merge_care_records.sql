-- V053: gộp nhật ký chăm sóc hằng ngày và cảnh báo vào một bảng dbo.care_record (40 bảng còn 39).
-- Trước: production_log, alert.
-- Sau: cột record_type cho biết loại bản ghi (Log, Alert). Cảnh báo giữ nguyên id vì ghi chú xử lý cảnh báo trong nhật ký kiểm toán tra theo id.
-- View v_overdue_alerts được viết lại theo bảng gộp, giữ nguyên cột trả về.
CREATE TABLE dbo.care_record (
    care_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_care_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    batch_id BIGINT NULL,
    alert_type VARCHAR(20) NULL,
    severity VARCHAR(20) NULL,
    message NVARCHAR(300) NULL,
    raised_at DATETIMEOFFSET(3) NULL,
    ack_deadline DATETIMEOFFSET(3) NULL,
    acknowledged_at DATETIMEOFFSET(3) NULL,
    acknowledged_by BIGINT NULL,
    response_note NVARCHAR(300) NULL,
    escalated_at DATETIMEOFFSET(3) NULL,
    status VARCHAR(20) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    log_date DATE NULL,
    water_temp_c DECIMAL(4,1) NULL,
    salinity_ppt DECIMAL(4,1) NULL,
    ph DECIMAL(3,1) NULL,
    feed_kg DECIMAL(12,3) NULL,
    note NVARCHAR(500) NULL,
    source VARCHAR(20) NULL,
    plausibility_flag VARCHAR(20) NULL,
    verified_at DATETIMEOFFSET(3) NULL,
    recorded_by BIGINT NULL,
    received_at DATETIMEOFFSET(3) NULL,
    threshold_version_id BIGINT NULL,
    health_observation NVARCHAR(500) NULL,
    incident_note NVARCHAR(500) NULL,
    CONSTRAINT ck_care_record_record_type CHECK (record_type IN ('Alert', 'Log'))
);
GO
SET IDENTITY_INSERT dbo.care_record ON;
INSERT INTO dbo.care_record (care_record_id, record_type, legacy_id, batch_id, alert_type, severity, message, raised_at, ack_deadline, acknowledged_at, acknowledged_by, response_note, escalated_at, status, created_at, updated_at)
SELECT s.[alert_id], 'Alert', s.[alert_id], s.[batch_id], s.[alert_type], s.[severity], s.[message], s.[raised_at], s.[ack_deadline], s.[acknowledged_at], s.[acknowledged_by], s.[response_note], s.[escalated_at], s.[status], s.[created_at], s.[updated_at] FROM dbo.alert s ORDER BY s.[alert_id];
SET IDENTITY_INSERT dbo.care_record OFF;
GO
INSERT INTO dbo.care_record (record_type, legacy_id, batch_id, log_date, water_temp_c, salinity_ppt, ph, feed_kg, note, source, plausibility_flag, verified_at, recorded_by, received_at, created_at, threshold_version_id, health_observation, incident_note)
SELECT 'Log', s.[production_log_id], s.[batch_id], s.[log_date], s.[water_temp_c], s.[salinity_ppt], s.[ph], s.[feed_kg], s.[note], s.[source], s.[plausibility_flag], s.[verified_at], s.[recorded_by], s.[received_at], s.[created_at], s.[threshold_version_id], s.[health_observation], s.[incident_note] FROM dbo.production_log s ORDER BY s.[production_log_id];
GO
DROP TABLE dbo.alert;
DROP TABLE dbo.production_log;
GO
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_care_record_alert_required CHECK (record_type <> 'Alert' OR (batch_id IS NOT NULL AND alert_type IS NOT NULL AND severity IS NOT NULL AND message IS NOT NULL AND raised_at IS NOT NULL AND ack_deadline IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_alert_alert_type CHECK (record_type <> 'Alert' OR ([alert_type]='MissingCareLog' OR [alert_type]='NoCrabDetected' OR [alert_type]='DeviceOffline' OR [alert_type]='EvidenceFlag' OR [alert_type]='DataSilence' OR [alert_type]='LowStock' OR [alert_type]='MilestoneDelay' OR [alert_type]='WaterQuality' OR [alert_type]='Mortality'));
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_alert_severity CHECK (record_type <> 'Alert' OR ([severity]='Critical' OR [severity]='High' OR [severity]='Medium' OR [severity]='Low'));
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_alert_status CHECK (record_type <> 'Alert' OR ([status]='Resolved' OR [status]='Escalated' OR [status]='Acknowledged' OR [status]='Open'));
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_care_record_log_required CHECK (record_type <> 'Log' OR (batch_id IS NOT NULL AND log_date IS NOT NULL AND source IS NOT NULL AND plausibility_flag IS NOT NULL AND received_at IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_production_log_plausibility_flag CHECK (record_type <> 'Log' OR ([plausibility_flag]='Inconsistent' OR [plausibility_flag]='OutOfRange' OR [plausibility_flag]='Ok'));
ALTER TABLE dbo.care_record ADD CONSTRAINT ck_production_log_source CHECK (record_type <> 'Log' OR ([source]='Manual' OR [source]='FarmApi'));
GO
CREATE INDEX ix_alert_batch_id_status ON dbo.care_record (batch_id, status) WHERE record_type = 'Alert';
CREATE INDEX ix_alert_acknowledged_by ON dbo.care_record (acknowledged_by) WHERE record_type = 'Alert';
CREATE UNIQUE INDEX ux_production_log_day ON dbo.care_record (batch_id, log_date, source) WHERE record_type = 'Log';
CREATE INDEX ix_production_log_recorded_by ON dbo.care_record (recorded_by) WHERE record_type = 'Log';
CREATE INDEX ix_production_log_threshold ON dbo.care_record (threshold_version_id, batch_id) WHERE record_type = 'Log';
GO
ALTER TABLE dbo.care_record ADD CONSTRAINT fk_alert_acknowledged_by FOREIGN KEY (acknowledged_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.care_record ADD CONSTRAINT fk_alert_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.care_record ADD CONSTRAINT fk_production_log_recorded_by FOREIGN KEY (recorded_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.care_record ADD CONSTRAINT fk_production_log_threshold_batch FOREIGN KEY (threshold_version_id, batch_id) REFERENCES dbo.batch_record(batch_record_id, batch_id);
GO
-- View cảnh báo quá hạn: viết lại theo bảng gộp, giữ nguyên cột trả về.
CREATE OR ALTER VIEW dbo.v_overdue_alerts AS
SELECT a.care_record_id AS alert_id, a.batch_id, b.batch_code, a.alert_type, a.severity, a.raised_at, a.ack_deadline,
       DATEDIFF(MINUTE, a.ack_deadline, SYSDATETIMEOFFSET()) AS minutes_overdue
FROM dbo.care_record a
JOIN dbo.batch b ON b.batch_id = a.batch_id
WHERE a.record_type = 'Alert' AND a.status = 'Open' AND a.ack_deadline < SYSDATETIMEOFFSET();
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
