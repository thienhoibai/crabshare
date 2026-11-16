-- CS-71: explicit harvest sessions, immutable weighing snapshots and safe retries.
IF EXISTS (SELECT crab_item_id FROM dbo.crab_tag WHERE status <> 'Void' GROUP BY crab_item_id HAVING COUNT(*) > 1)
    THROW 50080, N'Có cá thể đang có nhiều tem Printed/Active. Cần đối chiếu trước V016; không tự xóa lịch sử.', 1;
GO
ALTER TABLE dbo.harvest ADD
    name NVARCHAR(100) NULL,
    lifecycle_status VARCHAR(20) NULL,
    completed_at DATETIMEOFFSET(3) NULL,
    completed_by BIGINT NULL,
    revision_no INT NOT NULL CONSTRAINT df_harvest_revision DEFAULT 1;
GO
ALTER TABLE dbo.harvest ADD CONSTRAINT fk_harvest_completed_by FOREIGN KEY(completed_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.harvest ADD CONSTRAINT ck_harvest_lifecycle CHECK (
    revision_no > 0 AND (
      (lifecycle_status IS NULL AND completed_at IS NULL AND completed_by IS NULL) OR
      (lifecycle_status IS NOT NULL AND lifecycle_status = 'Open' AND completed_at IS NULL AND completed_by IS NULL) OR
      (lifecycle_status IS NOT NULL AND lifecycle_status = 'Completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL AND completed_at >= harvested_at)));
CREATE UNIQUE INDEX ux_harvest_open_batch ON dbo.harvest(batch_id) WHERE lifecycle_status = 'Open';
CREATE UNIQUE INDEX ux_crab_tag_non_void ON dbo.crab_tag(crab_item_id) WHERE status <> 'Void';
GO
CREATE TABLE dbo.harvest_start_request (
    request_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_harvest_start_request PRIMARY KEY,
    harvest_id BIGINT NOT NULL,
    batch_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    request_hash CHAR(64) NOT NULL,
    created_at DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT fk_harvest_start_session FOREIGN KEY(harvest_id,batch_id) REFERENCES dbo.harvest(harvest_id,batch_id),
    CONSTRAINT fk_harvest_start_actor FOREIGN KEY(actor_id) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_harvest_start_request CHECK(request_id <> '00000000-0000-0000-0000-000000000000')
);
CREATE INDEX ix_harvest_start_session ON dbo.harvest_start_request(harvest_id);
GO
CREATE TABLE dbo.harvest_record (
    slot_event_id BIGINT NOT NULL CONSTRAINT pk_harvest_record PRIMARY KEY,
    harvest_id BIGINT NOT NULL,
    batch_id BIGINT NOT NULL,
    crab_item_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    slot_code VARCHAR(30) NOT NULL,
    weight_g SMALLINT NOT NULL,
    shell_condition VARCHAR(20) NOT NULL,
    grade_code VARCHAR(20) NOT NULL,
    grade_name NVARCHAR(100) NOT NULL,
    tag_code CHAR(12) NOT NULL,
    tag_status VARCHAR(20) NOT NULL,
    recorded_at DATETIMEOFFSET(3) NOT NULL,
    harvested_count INT NOT NULL,
    total_weight_kg DECIMAL(12,3) NOT NULL,
    CONSTRAINT fk_harvest_record_detail FOREIGN KEY(slot_event_id) REFERENCES dbo.slot_event_detail(slot_event_id),
    CONSTRAINT fk_harvest_record_event_batch FOREIGN KEY(slot_event_id,batch_id) REFERENCES dbo.slot_event(slot_event_id,batch_id),
    CONSTRAINT fk_harvest_record_session FOREIGN KEY(harvest_id,batch_id) REFERENCES dbo.harvest(harvest_id,batch_id),
    CONSTRAINT fk_harvest_record_crab FOREIGN KEY(crab_item_id,batch_id) REFERENCES dbo.crab_item(crab_item_id,batch_id),
    CONSTRAINT fk_harvest_record_tag FOREIGN KEY(tag_id) REFERENCES dbo.crab_tag(tag_id),
    CONSTRAINT ux_harvest_record_crab UNIQUE(crab_item_id),
    CONSTRAINT ux_harvest_record_tag UNIQUE(tag_id),
    CONSTRAINT ck_harvest_record_values CHECK(weight_g > 0 AND harvested_count > 0 AND total_weight_kg > 0
        AND shell_condition IN ('HardShell','SoftShell') AND tag_status = 'Printed'),
    CONSTRAINT ck_harvest_record_code CHECK(LEN(tag_code) = 12 AND tag_code COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]%')
);
CREATE INDEX ix_harvest_record_session ON dbo.harvest_record(harvest_id,slot_event_id);
GO
CREATE TRIGGER dbo.tr_harvest_record_immutable ON dbo.harvest_record AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM deleted) THROW 50081, N'Kết quả cân thu hoạch chỉ được ghi thêm.', 1;
END;
GO
CREATE TRIGGER dbo.tr_harvest_start_immutable ON dbo.harvest_start_request AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM deleted) THROW 50082, N'Yêu cầu mở đợt thu hoạch chỉ được ghi thêm.', 1;
END;
