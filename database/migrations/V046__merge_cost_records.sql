-- V046: gộp phiên bản chi phí chuẩn, khoản chi, lịch giải ngân dự kiến và chi phí thực tế vào một bảng dbo.cost_record (61 bảng còn 58).
-- Trước: standard_cost_version, standard_cost_item, standard_cost_tranche_plan, cost_actual.
-- Sau: cột record_type cho biết loại bản ghi (Version, Item, TranchePlan, Actual). Phiên bản giữ nguyên id.
-- Các khoá cũ giữ nguyên ý nghĩa: phiên bản đã khoá bất biến, khoản chi và lịch của phiên bản đã khoá không đổi được, chi phí thực tế chỉ ghi thêm.
-- Khoản chi không còn tự xoá theo phiên bản (mã nguồn tự xoá khoản chi trước khi đổi).
CREATE TABLE dbo.cost_record (
    cost_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_cost_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    batch_id BIGINT NULL,
    version_no SMALLINT NULL,
    status VARCHAR(20) NULL,
    submitted_at DATETIMEOFFSET(3) NULL,
    approved_by BIGINT NULL,
    approved_at DATETIMEOFFSET(3) NULL,
    locked_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    cost_version_id BIGINT NULL,
    category VARCHAR(20) NULL,
    description NVARCHAR(200) NULL,
    quantity DECIMAL(12,3) NULL,
    unit NVARCHAR(20) NULL,
    unit_price DECIMAL(18,0) NULL,
    tranche_no TINYINT NULL,
    basis NVARCHAR(300) NULL,
    cost_bearer VARCHAR(20) NULL,
    planned_date DATE NULL,
    unlock_condition NVARCHAR(300) NULL,
    anchor_code VARCHAR(20) NULL,
    offset_days SMALLINT NULL,
    milestone_kind VARCHAR(20) NULL,
    milestone_name NVARCHAR(100) NULL,
    pct DECIMAL(5,2) NULL,
    cost_item_id BIGINT NULL,
    amount DECIMAL(18,0) NULL,
    document_evidence_id BIGINT NULL,
    document_ref NVARCHAR(100) NULL,
    note NVARCHAR(300) NULL,
    incurred_on DATE NULL,
    recorded_by BIGINT NULL,
    recorded_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_cost_record_record_type CHECK (record_type IN ('Version', 'Item', 'TranchePlan', 'Actual'))
);
GO
SET IDENTITY_INSERT dbo.cost_record ON;
INSERT INTO dbo.cost_record (cost_record_id, record_type, legacy_id, batch_id, version_no, status, submitted_at, approved_by, approved_at, locked_at, created_at, updated_at)
SELECT s.[cost_version_id], 'Version', s.[cost_version_id], s.[batch_id], s.[version_no], s.[status], s.[submitted_at], s.[approved_by], s.[approved_at], s.[locked_at], s.[created_at], s.[updated_at] FROM dbo.standard_cost_version s ORDER BY s.[cost_version_id];
SET IDENTITY_INSERT dbo.cost_record OFF;
GO
INSERT INTO dbo.cost_record (record_type, legacy_id, cost_version_id, category, description, quantity, unit, unit_price, tranche_no, created_at, basis, cost_bearer)
SELECT 'Item', s.[cost_item_id], s.[cost_version_id], s.[category], s.[description], s.[quantity], s.[unit], s.[unit_price], s.[tranche_no], s.[created_at], s.[basis], s.[cost_bearer] FROM dbo.standard_cost_item s ORDER BY s.[cost_item_id];
GO
INSERT INTO dbo.cost_record (record_type, legacy_id, cost_version_id, tranche_no, planned_date, unlock_condition, anchor_code, offset_days, milestone_kind, milestone_name, pct)
SELECT 'TranchePlan', NULL, s.[cost_version_id], s.[tranche_no], s.[planned_date], s.[unlock_condition], s.[anchor_code], s.[offset_days], s.[milestone_kind], s.[milestone_name], s.[pct] FROM dbo.standard_cost_tranche_plan s ORDER BY s.[cost_version_id], s.[tranche_no];
GO
INSERT INTO dbo.cost_record (record_type, legacy_id, batch_id, cost_item_id, amount, document_evidence_id, document_ref, note, incurred_on, recorded_by, recorded_at)
SELECT 'Actual', s.[cost_actual_id], s.[batch_id], s.[cost_item_id], s.[amount], s.[document_evidence_id], s.[document_ref], s.[note], s.[incurred_on], s.[recorded_by], s.[recorded_at] FROM dbo.cost_actual s ORDER BY s.[cost_actual_id];
GO
UPDATE c SET c.cost_item_id = p.cost_record_id FROM dbo.cost_record c JOIN dbo.cost_record p ON p.record_type = 'Item' AND p.legacy_id = c.cost_item_id WHERE c.record_type = 'Actual';
GO
ALTER TABLE dbo.standard_cost_item DROP CONSTRAINT fk_standard_cost_item_cost_version_id;
ALTER TABLE dbo.standard_cost_tranche_plan DROP CONSTRAINT fk_cost_tranche_plan_version;
ALTER TABLE dbo.cost_actual DROP CONSTRAINT fk_cost_actual_item;
DROP TABLE dbo.standard_cost_version;
DROP TABLE dbo.standard_cost_item;
DROP TABLE dbo.standard_cost_tranche_plan;
DROP TABLE dbo.cost_actual;
GO
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_record_version_required CHECK (record_type <> 'Version' OR (batch_id IS NOT NULL AND version_no IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_standard_cost_version_status CHECK (record_type <> 'Version' OR ([status]='Superseded' OR [status]='Locked' OR [status]='Approved' OR [status]='Submitted' OR [status]='Draft'));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_standard_cost_version_version_no CHECK (record_type <> 'Version' OR ([version_no]>(0)));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_record_item_required CHECK (record_type <> 'Item' OR (cost_version_id IS NOT NULL AND category IS NOT NULL AND description IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL AND unit_price IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_standard_cost_item_bearer CHECK (record_type <> 'Item' OR ([cost_bearer]='Supplier' OR [cost_bearer]='Executor' OR [cost_bearer]='Batch'));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_standard_cost_item_category CHECK (record_type <> 'Item' OR ([category]='Other' OR [category]='Depreciation' OR [category]='MortalityReserve' OR [category]='Labour' OR [category]='Utilities' OR [category]='Feed' OR [category]='Seed'));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_standard_cost_item_quantity CHECK (record_type <> 'Item' OR ([quantity]>(0)));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_standard_cost_item_unit_price CHECK (record_type <> 'Item' OR ([unit_price]>=(0)));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_record_trancheplan_required CHECK (record_type <> 'TranchePlan' OR (cost_version_id IS NOT NULL AND tranche_no IS NOT NULL AND unlock_condition IS NOT NULL));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_plan_kind CHECK (record_type <> 'TranchePlan' OR ([milestone_kind] IS NULL OR ([milestone_kind]='Custom' OR [milestone_kind]='Settlement' OR [milestone_kind]='MidCycle' OR [milestone_kind]='Receipt')));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_plan_timing CHECK (record_type <> 'TranchePlan' OR ([milestone_kind] IS NOT NULL AND [pct] IS NOT NULL AND [pct]>(0) AND [pct]<=(100) OR [milestone_kind] IS NULL AND ([planned_date] IS NOT NULL AND [anchor_code] IS NULL AND [offset_days] IS NULL OR [planned_date] IS NULL AND ([anchor_code]='Stocked' OR [anchor_code]='FundingReady') AND [offset_days] IS NOT NULL AND [offset_days]>=(0))));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_tranche_plan_condition CHECK (record_type <> 'TranchePlan' OR (len(ltrim(rtrim([unlock_condition])))>(0)));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_tranche_plan_no CHECK (record_type <> 'TranchePlan' OR ([tranche_no]>(0)));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_record_actual_required CHECK (record_type <> 'Actual' OR (batch_id IS NOT NULL AND cost_item_id IS NOT NULL AND amount IS NOT NULL AND incurred_on IS NOT NULL AND recorded_by IS NOT NULL AND recorded_at IS NOT NULL));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_actual_amount CHECK (record_type <> 'Actual' OR ([amount]>(0)));
ALTER TABLE dbo.cost_record ADD CONSTRAINT ck_cost_actual_document CHECK (record_type <> 'Actual' OR ([document_evidence_id] IS NOT NULL OR [document_ref] IS NOT NULL));
GO
CREATE UNIQUE INDEX ux_cost_version_no ON dbo.cost_record (batch_id, version_no) WHERE record_type = 'Version';
CREATE INDEX ix_standard_cost_version_approved_by ON dbo.cost_record (approved_by) WHERE record_type = 'Version';
CREATE UNIQUE INDEX ux_cost_version_locked ON dbo.cost_record (batch_id) WHERE record_type = 'Version' AND [status]='Locked';
CREATE INDEX ix_standard_cost_item_cost_version_id ON dbo.cost_record (cost_version_id) WHERE record_type = 'Item';
CREATE UNIQUE INDEX ux_standard_cost_tranche_plan_key ON dbo.cost_record (cost_version_id, tranche_no) WHERE record_type = 'TranchePlan';
GO
ALTER TABLE dbo.cost_record ADD CONSTRAINT fk_standard_cost_version_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.cost_record ADD CONSTRAINT fk_standard_cost_version_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.cost_record ADD CONSTRAINT fk_standard_cost_item_cost_version_id FOREIGN KEY (cost_version_id) REFERENCES dbo.cost_record(cost_record_id);
ALTER TABLE dbo.cost_record ADD CONSTRAINT fk_cost_actual_evidence FOREIGN KEY (document_evidence_id) REFERENCES dbo.evidence(evidence_id);
ALTER TABLE dbo.cost_record ADD CONSTRAINT fk_cost_actual_item FOREIGN KEY (cost_item_id) REFERENCES dbo.cost_record(cost_record_id);
GO
-- Phiên bản chi phí đã khoá là bất biến; lô đã có chi phí khoá thì không thay bằng phiên bản khác.
CREATE TRIGGER dbo.tr_cost_version_locked ON dbo.cost_record AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'Version' AND status = 'Locked')
        THROW 51008, N'Phiên bản chi phí đã khóa là bất biến.', 1;
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.cost_record v WITH (UPDLOCK, HOLDLOCK)
               ON v.record_type = 'Version' AND v.batch_id = i.batch_id AND v.cost_record_id <> i.cost_record_id
               WHERE i.record_type = 'Version' AND v.status = 'Locked')
        THROW 51008, N'Lô đã có chi phí khóa, không thể thay thế phiên bản.', 1;
END;
GO
-- Khoản chi và lịch giải ngân của phiên bản đã khoá không đổi được.
CREATE TRIGGER dbo.tr_cost_item_locked ON dbo.cost_record AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.cost_record v WITH (UPDLOCK, HOLDLOCK)
               JOIN (SELECT cost_version_id FROM inserted WHERE record_type = 'Item'
                     UNION SELECT cost_version_id FROM deleted WHERE record_type = 'Item') a ON a.cost_version_id = v.cost_record_id
               WHERE v.record_type = 'Version' AND v.status = 'Locked')
        THROW 51008, N'Chi phí đã khóa, không thể thay đổi khoản chi.', 1;
    IF EXISTS (SELECT 1 FROM dbo.cost_record v WITH (UPDLOCK, HOLDLOCK)
               JOIN (SELECT cost_version_id FROM inserted WHERE record_type = 'TranchePlan'
                     UNION SELECT cost_version_id FROM deleted WHERE record_type = 'TranchePlan') a ON a.cost_version_id = v.cost_record_id
               WHERE v.record_type = 'Version' AND v.status = 'Locked')
        THROW 51008, N'Chi phí đã khóa, không thể thay đổi lịch giải ngân.', 1;
END;
GO
-- Chi phí thực tế chỉ ghi thêm.
CREATE TRIGGER dbo.tr_cost_actual_append_only ON dbo.cost_record AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'Actual')
        THROW 51019, N'Chi phí thực tế chỉ được ghi thêm; sai thì ghi dòng điều chỉnh mới.', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
