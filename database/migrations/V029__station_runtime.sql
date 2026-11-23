ALTER TABLE dbo.device ADD station_state_json nvarchar(4000) NULL,
    station_state_received_at datetimeoffset(3) NULL;
GO
