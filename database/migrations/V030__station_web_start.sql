ALTER TABLE dbo.device_command ADD measurement_session_id BIGINT NULL
    CONSTRAINT fk_device_command_measurement_session REFERENCES dbo.measurement_session (measurement_session_id);
GO

ALTER TABLE dbo.device_command DROP CONSTRAINT ck_device_command_type, ck_device_command_status;
ALTER TABLE dbo.device_command ADD CONSTRAINT ck_device_command_type
    CHECK (command_type IN ('ScanRack', 'ScanBox', 'Park', 'Calibrate', 'StartMeasurement'));
ALTER TABLE dbo.device_command ADD CONSTRAINT ck_device_command_status
    CHECK (status IN ('Pending', 'Acked', 'Cancelled', 'Claimed', 'Accepted', 'Rejected'));
ALTER TABLE dbo.device_command ADD CONSTRAINT ck_device_command_session
    CHECK ((command_type = 'StartMeasurement' AND measurement_session_id IS NOT NULL)
        OR (command_type <> 'StartMeasurement' AND measurement_session_id IS NULL));
GO

CREATE INDEX ix_device_command_measurement_start ON dbo.device_command
    (device_id, measurement_session_id, device_command_id DESC) WHERE command_type = 'StartMeasurement';
GO
