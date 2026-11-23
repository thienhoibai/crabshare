ALTER TABLE dbo.device_command ADD protected_payload nvarchar(2048) NULL;
ALTER TABLE dbo.device_command DROP CONSTRAINT ck_device_command_type;
ALTER TABLE dbo.device_command ADD CONSTRAINT ck_device_command_type
    CHECK (command_type IN ('ScanRack', 'ScanBox', 'Park', 'Calibrate', 'StartMeasurement', 'ConfigureWifi'));
GO
