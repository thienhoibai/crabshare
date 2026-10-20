-- VI-09: farm-authored rules, individual event links and idempotency.
-- Refuse incompatible history; never delete/deduplicate existing crabs automatically.
IF EXISTS (SELECT replaces_crab_item_id FROM dbo.crab_item WHERE replaces_crab_item_id IS NOT NULL
           GROUP BY replaces_crab_item_id HAVING COUNT(*) > 1)
    THROW 50070, N'Có cá thể đã được thay thế nhiều lần. Cần đối chiếu dữ liệu trước khi áp dụng V015; không tự xóa lịch sử.', 1;
IF EXISTS (SELECT 1 FROM dbo.crab_item n JOIN dbo.crab_item old ON old.crab_item_id = n.replaces_crab_item_id
           WHERE n.batch_id <> old.batch_id)
    THROW 50071, N'Có liên kết thả bù khác lô. Cần đối chiếu dữ liệu trước khi áp dụng V015.', 1;
GO
CREATE UNIQUE INDEX ux_crab_item_replacement ON dbo.crab_item(replaces_crab_item_id)
    WHERE replaces_crab_item_id IS NOT NULL;
ALTER TABLE dbo.crab_item ADD CONSTRAINT ak_crab_item_batch UNIQUE(crab_item_id, batch_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_replacement_batch
    FOREIGN KEY(replaces_crab_item_id, batch_id) REFERENCES dbo.crab_item(crab_item_id, batch_id);
ALTER TABLE dbo.crab_item_event DROP CONSTRAINT ck_crab_item_event_event_type;
ALTER TABLE dbo.crab_item_event ADD CONSTRAINT ck_crab_item_event_event_type CHECK
    (event_type IN ('Stocked','Died','Harvested','TagPrinted','TagActivated','TagVoided','StoredIn','Packed','Delivered','Lost','Molted','Relocated'));
GO
CREATE TABLE dbo.slot_event_policy_version (
    policy_version_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_slot_event_policy PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    version_no INT NOT NULL,
    restock_cutoff_basis VARCHAR(20) NOT NULL,
    restock_cutoff_days SMALLINT NOT NULL,
    mortality_window_hours INT NULL,
    mortality_threshold_percent DECIMAL(9,2) NULL,
    mortality_severity VARCHAR(20) NULL,
    mortality_ack_within_hours INT NULL,
    created_by BIGINT NOT NULL,
    created_at DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT ux_slot_event_policy_version UNIQUE(batch_id, version_no),
    CONSTRAINT ak_slot_event_policy_batch UNIQUE(policy_version_id, batch_id),
    CONSTRAINT fk_slot_event_policy_batch FOREIGN KEY(batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_slot_event_policy_actor FOREIGN KEY(created_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_slot_event_policy_version CHECK(version_no > 0),
    CONSTRAINT ck_slot_event_policy_cutoff CHECK(restock_cutoff_basis IN ('AfterStocking','BeforeHarvest') AND restock_cutoff_days > 0),
    CONSTRAINT ck_slot_event_policy_alert CHECK (
        (mortality_window_hours IS NULL AND mortality_threshold_percent IS NULL AND mortality_severity IS NULL AND mortality_ack_within_hours IS NULL)
        OR (mortality_window_hours IS NOT NULL AND mortality_threshold_percent IS NOT NULL AND mortality_severity IS NOT NULL AND mortality_ack_within_hours IS NOT NULL
            AND mortality_window_hours BETWEEN 1 AND 87600 AND mortality_threshold_percent > 0 AND mortality_threshold_percent <= 10000
            AND mortality_severity IN ('Low','Medium','High','Critical') AND mortality_ack_within_hours BETWEEN 1 AND 720))
);
GO
CREATE TRIGGER dbo.tr_slot_event_policy_immutable ON dbo.slot_event_policy_version AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM deleted) THROW 50072, N'Không sửa hoặc xóa phiên bản quy tắc đã lưu. Hãy tạo phiên bản mới.', 1;
END;
GO
ALTER TABLE dbo.slot_event ADD CONSTRAINT ak_slot_event_batch UNIQUE(slot_event_id, batch_id);
CREATE TABLE dbo.slot_event_detail (
    slot_event_id BIGINT NOT NULL CONSTRAINT pk_slot_event_detail PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    crab_item_id BIGINT NOT NULL,
    destination_slot_allocation_id BIGINT NULL,
    actor_id BIGINT NOT NULL,
    request_id UNIQUEIDENTIFIER NOT NULL,
    request_hash CHAR(64) NOT NULL,
    policy_version_id BIGINT NULL,
    alive_count INT NOT NULL,
    CONSTRAINT ux_slot_event_request UNIQUE(batch_id, request_id),
    CONSTRAINT fk_slot_event_detail_event FOREIGN KEY(slot_event_id,batch_id) REFERENCES dbo.slot_event(slot_event_id,batch_id),
    CONSTRAINT fk_slot_event_detail_crab FOREIGN KEY(crab_item_id,batch_id) REFERENCES dbo.crab_item(crab_item_id,batch_id),
    CONSTRAINT fk_slot_event_detail_destination FOREIGN KEY(destination_slot_allocation_id,batch_id) REFERENCES dbo.slot_allocation(slot_allocation_id,batch_id),
    CONSTRAINT fk_slot_event_detail_actor FOREIGN KEY(actor_id) REFERENCES dbo.app_user(user_id),
    CONSTRAINT fk_slot_event_detail_policy FOREIGN KEY(policy_version_id,batch_id) REFERENCES dbo.slot_event_policy_version(policy_version_id,batch_id),
    CONSTRAINT ck_slot_event_detail_count CHECK(alive_count >= 0),
    CONSTRAINT ck_slot_event_detail_request CHECK(request_id <> '00000000-0000-0000-0000-000000000000')
);
CREATE INDEX ix_slot_event_detail_crab ON dbo.slot_event_detail(crab_item_id,slot_event_id);
CREATE INDEX ix_slot_event_detail_destination ON dbo.slot_event_detail(destination_slot_allocation_id);
GO
CREATE TRIGGER dbo.tr_slot_event_detail_immutable ON dbo.slot_event_detail AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM deleted) THROW 50073, N'Chi tiết sự kiện cá thể chỉ được ghi thêm.', 1;
END;
GO
