-- Operator-defined water ranges. Existing daily logs remain unchanged and readable.
CREATE TABLE dbo.production_threshold_version (
    threshold_version_id BIGINT IDENTITY(1,1) NOT NULL,
    batch_id BIGINT NOT NULL,
    version_no INT NOT NULL,
    ph_min DECIMAL(3,1) NOT NULL,
    ph_max DECIMAL(3,1) NOT NULL,
    water_temp_min_c DECIMAL(4,1) NOT NULL,
    water_temp_max_c DECIMAL(4,1) NOT NULL,
    salinity_min_ppt DECIMAL(4,1) NOT NULL,
    salinity_max_ppt DECIMAL(4,1) NOT NULL,
    created_by BIGINT NOT NULL,
    created_at DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_production_threshold_version PRIMARY KEY (threshold_version_id),
    CONSTRAINT ux_production_threshold_batch_version UNIQUE (batch_id, version_no),
    CONSTRAINT ak_production_threshold_batch UNIQUE (threshold_version_id, batch_id),
    CONSTRAINT fk_production_threshold_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_production_threshold_creator FOREIGN KEY (created_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_production_threshold_version CHECK (version_no > 0),
    CONSTRAINT ck_production_threshold_ph CHECK (ph_min >= 0 AND ph_max <= 14 AND ph_min <= ph_max),
    CONSTRAINT ck_production_threshold_temp CHECK (water_temp_min_c >= -273.1 AND water_temp_min_c <= water_temp_max_c),
    CONSTRAINT ck_production_threshold_salinity CHECK (salinity_min_ppt >= 0 AND salinity_min_ppt <= salinity_max_ppt)
);
GO
ALTER TABLE dbo.production_log ADD threshold_version_id BIGINT NULL;
ALTER TABLE dbo.production_log ADD CONSTRAINT fk_production_log_threshold_batch
    FOREIGN KEY (threshold_version_id, batch_id)
    REFERENCES dbo.production_threshold_version(threshold_version_id, batch_id);
CREATE INDEX ix_production_log_threshold ON dbo.production_log(threshold_version_id, batch_id);
GO
-- Historical evaluations must never be silently rewritten by changing a version in place.
CREATE TRIGGER dbo.tr_production_threshold_immutable ON dbo.production_threshold_version
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50060, N'Phiên bản ngưỡng đã lưu không được sửa hoặc xóa. Hãy tạo phiên bản mới.', 1;
END;
GO
