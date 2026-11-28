-- V043: gộp các bản ghi phụ của lô vào một bảng dbo.batch_record (74 bảng còn 68).
-- Trước: batch_account, batch_participant, remuneration_tier, production_threshold_version, holding_operation, collective_decision, vote.
-- Sau: cột record_type cho biết loại bản ghi (Account, Participant, RemunerationTier, ThresholdVersion, HoldingOperation, CollectiveDecision, Vote). Tài khoản lô giữ nguyên id.
-- Phiên bản ngưỡng nước vẫn không sửa, không xoá được.
CREATE TABLE dbo.batch_record (
    batch_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_batch_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    batch_id BIGINT NULL,
    provider_name NVARCHAR(100) NULL,
    provider_account_no VARCHAR(40) NULL,
    status VARCHAR(20) NULL,
    opened_at DATETIMEOFFSET(3) NULL,
    closed_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    party_id BIGINT NULL,
    participant_role VARCHAR(20) NULL,
    joined_at DATETIMEOFFSET(3) NULL,
    responsibility_scope NVARCHAR(300) NULL,
    approval_status VARCHAR(20) NULL,
    tier_no TINYINT NULL,
    survival_from_pct DECIMAL(5,2) NULL,
    survival_to_pct DECIMAL(5,2) NULL,
    rate_pct DECIMAL(5,2) NULL,
    version_no INT NULL,
    ph_min DECIMAL(3,1) NULL,
    ph_max DECIMAL(3,1) NULL,
    water_temp_min_c DECIMAL(4,1) NULL,
    water_temp_max_c DECIMAL(4,1) NULL,
    salinity_min_ppt DECIMAL(4,1) NULL,
    salinity_max_ppt DECIMAL(4,1) NULL,
    created_by BIGINT NULL,
    holding_code VARCHAR(20) NULL,
    method NVARCHAR(100) NULL,
    stocked_at DATETIMEOFFSET(3) NULL,
    expected_end_date DATE NULL,
    actual_end_at DATETIMEOFFSET(3) NULL,
    responsible_user_id BIGINT NULL,
    decision_no VARCHAR(20) NULL,
    decision_kind VARCHAR(20) NULL,
    proposal NVARCHAR(1000) NULL,
    proposed_by BIGINT NULL,
    closes_at DATETIMEOFFSET(3) NULL,
    eligible_capital DECIMAL(18,0) NULL,
    yes_capital DECIMAL(18,0) NULL,
    no_capital DECIMAL(18,0) NULL,
    decided_at DATETIMEOFFSET(3) NULL,
    decision_id BIGINT NULL,
    investor_id BIGINT NULL,
    capital DECIMAL(18,0) NULL,
    choice VARCHAR(10) NULL,
    voted_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_batch_record_record_type CHECK (record_type IN ('Account', 'Participant', 'RemunerationTier', 'ThresholdVersion', 'HoldingOperation', 'CollectiveDecision', 'Vote'))
);
GO
SET IDENTITY_INSERT dbo.batch_record ON;
INSERT INTO dbo.batch_record (batch_record_id, record_type, legacy_id, batch_id, provider_name, provider_account_no, status, opened_at, closed_at, created_at, updated_at)
SELECT s.[batch_account_id], 'Account', s.[batch_account_id], s.[batch_id], s.[provider_name], s.[provider_account_no], s.[status], s.[opened_at], s.[closed_at], s.[created_at], s.[updated_at] FROM dbo.batch_account s ORDER BY s.[batch_account_id];
SET IDENTITY_INSERT dbo.batch_record OFF;
GO
INSERT INTO dbo.batch_record (record_type, legacy_id, batch_id, party_id, participant_role, joined_at, responsibility_scope, approval_status, created_at)
SELECT 'Participant', s.[participant_id], s.[batch_id], s.[party_id], s.[participant_role], s.[joined_at], s.[responsibility_scope], s.[approval_status], s.[created_at] FROM dbo.batch_participant s ORDER BY s.[participant_id];
GO
INSERT INTO dbo.batch_record (record_type, legacy_id, batch_id, tier_no, survival_from_pct, survival_to_pct, rate_pct, created_at)
SELECT 'RemunerationTier', NULL, s.[batch_id], s.[tier_no], s.[survival_from_pct], s.[survival_to_pct], s.[rate_pct], s.[created_at] FROM dbo.remuneration_tier s ORDER BY s.[batch_id], s.[tier_no];
GO
INSERT INTO dbo.batch_record (record_type, legacy_id, batch_id, version_no, ph_min, ph_max, water_temp_min_c, water_temp_max_c, salinity_min_ppt, salinity_max_ppt, created_by, created_at)
SELECT 'ThresholdVersion', s.[threshold_version_id], s.[batch_id], s.[version_no], s.[ph_min], s.[ph_max], s.[water_temp_min_c], s.[water_temp_max_c], s.[salinity_min_ppt], s.[salinity_max_ppt], s.[created_by], s.[created_at] FROM dbo.production_threshold_version s ORDER BY s.[threshold_version_id];
GO
INSERT INTO dbo.batch_record (record_type, legacy_id, holding_code, batch_id, method, stocked_at, expected_end_date, actual_end_at, responsible_user_id, status, created_at)
SELECT 'HoldingOperation', s.[holding_id], s.[holding_code], s.[batch_id], s.[method], s.[stocked_at], s.[expected_end_date], s.[actual_end_at], s.[responsible_user_id], s.[status], s.[created_at] FROM dbo.holding_operation s ORDER BY s.[holding_id];
GO
INSERT INTO dbo.batch_record (record_type, legacy_id, decision_no, batch_id, decision_kind, proposal, proposed_by, opened_at, closes_at, status, eligible_capital, yes_capital, no_capital, decided_at)
SELECT 'CollectiveDecision', s.[decision_id], s.[decision_no], s.[batch_id], s.[decision_kind], s.[proposal], s.[proposed_by], s.[opened_at], s.[closes_at], s.[status], s.[eligible_capital], s.[yes_capital], s.[no_capital], s.[decided_at] FROM dbo.collective_decision s ORDER BY s.[decision_id];
GO
INSERT INTO dbo.batch_record (record_type, legacy_id, decision_id, investor_id, capital, choice, voted_at)
SELECT 'Vote', s.[vote_id], s.[decision_id], s.[investor_id], s.[capital], s.[choice], s.[voted_at] FROM dbo.vote s ORDER BY s.[vote_id];
GO
UPDATE c SET c.decision_id = p.batch_record_id FROM dbo.batch_record c JOIN dbo.batch_record p ON p.record_type = 'CollectiveDecision' AND p.legacy_id = c.decision_id WHERE c.record_type = 'Vote';
ALTER TABLE dbo.payment_instruction DROP CONSTRAINT fk_payment_instruction_batch_account_id;
ALTER TABLE dbo.payment_request DROP CONSTRAINT fk_payment_request_batch_account_id;
ALTER TABLE dbo.provider_transaction DROP CONSTRAINT fk_provider_transaction_batch_account_id;
ALTER TABLE dbo.production_log DROP CONSTRAINT fk_production_log_threshold_batch;
ALTER TABLE dbo.device DROP CONSTRAINT fk_device_holding;
UPDATE x SET x.scope_holding_id = p.batch_record_id FROM dbo.device x JOIN dbo.batch_record p ON p.record_type = 'HoldingOperation' AND p.legacy_id = x.scope_holding_id;
ALTER TABLE dbo.device_record DROP CONSTRAINT fk_water_reading_holding;
UPDATE x SET x.holding_id = p.batch_record_id FROM dbo.device_record x JOIN dbo.batch_record p ON p.record_type = 'HoldingOperation' AND p.legacy_id = x.holding_id;
GO
ALTER TABLE dbo.vote DROP CONSTRAINT fk_vote_decision;
DROP TABLE dbo.batch_account;
DROP TABLE dbo.batch_participant;
DROP TABLE dbo.remuneration_tier;
DROP TABLE dbo.production_threshold_version;
DROP TABLE dbo.holding_operation;
DROP TABLE dbo.collective_decision;
DROP TABLE dbo.vote;
GO
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_account_required CHECK (record_type <> 'Account' OR (batch_id IS NOT NULL AND provider_name IS NOT NULL AND provider_account_no IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_account_status CHECK (record_type <> 'Account' OR ([status]='Closed' OR [status]='Frozen' OR [status]='Open' OR [status]='Requested'));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_participant_required CHECK (record_type <> 'Participant' OR (batch_id IS NOT NULL AND party_id IS NOT NULL AND participant_role IS NOT NULL AND joined_at IS NOT NULL AND approval_status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_participant_approval CHECK (record_type <> 'Participant' OR ([approval_status]='Rejected' OR [approval_status]='Approved' OR [approval_status]='Pending'));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_participant_role CHECK (record_type <> 'Participant' OR ([participant_role]='OfftakeBuyer' OR [participant_role]='Supplier' OR [participant_role]='Customer' OR [participant_role]='Investor' OR [participant_role]='Executor'));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_remunerationtier_required CHECK (record_type <> 'RemunerationTier' OR (batch_id IS NOT NULL AND tier_no IS NOT NULL AND survival_from_pct IS NOT NULL AND survival_to_pct IS NOT NULL AND rate_pct IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_remuneration_tier_range CHECK (record_type <> 'RemunerationTier' OR ([survival_from_pct]>=(0) AND [survival_to_pct]<=(100) AND [survival_from_pct]<[survival_to_pct]));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_remuneration_tier_rate CHECK (record_type <> 'RemunerationTier' OR ([rate_pct]>=(0) AND [rate_pct]<=(100)));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_thresholdversion_required CHECK (record_type <> 'ThresholdVersion' OR (batch_id IS NOT NULL AND version_no IS NOT NULL AND ph_min IS NOT NULL AND ph_max IS NOT NULL AND water_temp_min_c IS NOT NULL AND water_temp_max_c IS NOT NULL AND salinity_min_ppt IS NOT NULL AND salinity_max_ppt IS NOT NULL AND created_by IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_production_threshold_ph CHECK (record_type <> 'ThresholdVersion' OR ([ph_min]>=(0) AND [ph_max]<=(14) AND [ph_min]<=[ph_max]));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_production_threshold_salinity CHECK (record_type <> 'ThresholdVersion' OR ([salinity_min_ppt]>=(0) AND [salinity_min_ppt]<=[salinity_max_ppt]));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_production_threshold_temp CHECK (record_type <> 'ThresholdVersion' OR ([water_temp_min_c]>=(-273.1) AND [water_temp_min_c]<=[water_temp_max_c]));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_production_threshold_version CHECK (record_type <> 'ThresholdVersion' OR ([version_no]>(0)));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_holdingoperation_required CHECK (record_type <> 'HoldingOperation' OR (holding_code IS NOT NULL AND batch_id IS NOT NULL AND method IS NOT NULL AND stocked_at IS NOT NULL AND expected_end_date IS NOT NULL AND responsible_user_id IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_holding_operation_status CHECK (record_type <> 'HoldingOperation' OR ([status]='Closed' OR [status]='Harvesting' OR [status]='Active'));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_collectivedecision_required CHECK (record_type <> 'CollectiveDecision' OR (decision_no IS NOT NULL AND batch_id IS NOT NULL AND decision_kind IS NOT NULL AND proposal IS NOT NULL AND proposed_by IS NOT NULL AND opened_at IS NOT NULL AND closes_at IS NOT NULL AND status IS NOT NULL AND eligible_capital IS NOT NULL AND yes_capital IS NOT NULL AND no_capital IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_collective_decision_capital CHECK (record_type <> 'CollectiveDecision' OR ([eligible_capital]>=(0) AND [yes_capital]>=(0) AND [no_capital]>=(0) AND ([yes_capital]+[no_capital])<=[eligible_capital]));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_collective_decision_kind CHECK (record_type <> 'CollectiveDecision' OR ([decision_kind]='SurplusSale' OR [decision_kind]='EarlyLiquidation'));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_collective_decision_status CHECK (record_type <> 'CollectiveDecision' OR ([status]='Cancelled' OR [status]='Rejected' OR [status]='Passed' OR [status]='Open'));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_collective_decision_window CHECK (record_type <> 'CollectiveDecision' OR ([closes_at]>[opened_at]));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_batch_record_vote_required CHECK (record_type <> 'Vote' OR (decision_id IS NOT NULL AND investor_id IS NOT NULL AND capital IS NOT NULL AND choice IS NOT NULL AND voted_at IS NOT NULL));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_vote_capital CHECK (record_type <> 'Vote' OR ([capital]>(0)));
ALTER TABLE dbo.batch_record ADD CONSTRAINT ck_vote_choice CHECK (record_type <> 'Vote' OR ([choice]='No' OR [choice]='Yes'));
GO
CREATE UNIQUE INDEX uq_batch_account_provider_account_no ON dbo.batch_record (provider_account_no) WHERE record_type = 'Account';
CREATE UNIQUE INDEX uq_batch_account_batch_id ON dbo.batch_record (batch_id) WHERE record_type = 'Account';
CREATE UNIQUE INDEX ux_batch_participant ON dbo.batch_record (batch_id, party_id, participant_role) WHERE record_type = 'Participant';
CREATE UNIQUE INDEX ux_batch_participant_executor ON dbo.batch_record (batch_id) WHERE record_type = 'Participant' AND [participant_role]='Executor';
CREATE INDEX ix_batch_participant_party ON dbo.batch_record (party_id, participant_role) WHERE record_type = 'Participant';
CREATE UNIQUE INDEX ux_remuneration_tier_key ON dbo.batch_record (batch_id, tier_no) WHERE record_type = 'RemunerationTier';
CREATE UNIQUE INDEX ak_production_threshold_batch ON dbo.batch_record (batch_record_id, batch_id) WHERE record_type = 'ThresholdVersion';
CREATE UNIQUE INDEX ux_production_threshold_batch_version ON dbo.batch_record (batch_id, version_no) WHERE record_type = 'ThresholdVersion';
CREATE UNIQUE INDEX ux_holding_operation_batch ON dbo.batch_record (batch_id) WHERE record_type = 'HoldingOperation';
CREATE UNIQUE INDEX ux_holding_operation_code ON dbo.batch_record (holding_code) WHERE record_type = 'HoldingOperation';
CREATE UNIQUE INDEX ux_collective_decision_no ON dbo.batch_record (decision_no) WHERE record_type = 'CollectiveDecision';
CREATE UNIQUE INDEX ux_collective_decision_open ON dbo.batch_record (batch_id, decision_kind) WHERE record_type = 'CollectiveDecision' AND [status]='Open';
CREATE UNIQUE INDEX ux_vote_investor ON dbo.batch_record (decision_id, investor_id) WHERE record_type = 'Vote';
GO
ALTER TABLE dbo.batch_record ADD CONSTRAINT fk_batch_account_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.batch_record ADD CONSTRAINT fk_batch_participant_party FOREIGN KEY (party_id) REFERENCES dbo.party(party_id);
ALTER TABLE dbo.batch_record ADD CONSTRAINT fk_production_threshold_creator FOREIGN KEY (created_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.batch_record ADD CONSTRAINT fk_collective_decision_proposer FOREIGN KEY (proposed_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.batch_record ADD CONSTRAINT fk_vote_decision FOREIGN KEY (decision_id) REFERENCES dbo.batch_record(batch_record_id);
ALTER TABLE dbo.batch_record ADD CONSTRAINT fk_vote_investor FOREIGN KEY (investor_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_record(batch_record_id);
ALTER TABLE dbo.payment_request ADD CONSTRAINT fk_payment_request_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_record(batch_record_id);
ALTER TABLE dbo.provider_transaction ADD CONSTRAINT fk_provider_transaction_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_record(batch_record_id);
ALTER TABLE dbo.device ADD CONSTRAINT fk_device_holding FOREIGN KEY (scope_holding_id) REFERENCES dbo.batch_record(batch_record_id);
ALTER TABLE dbo.device_record ADD CONSTRAINT fk_water_reading_holding FOREIGN KEY (holding_id) REFERENCES dbo.batch_record(batch_record_id);
GO
-- Phiên bản ngưỡng đã lưu không được sửa hoặc xoá: đánh giá cũ không bị viết lại ngầm.
CREATE TRIGGER dbo.tr_production_threshold_immutable ON dbo.batch_record
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'ThresholdVersion')
        THROW 50060, N'Phiên bản ngưỡng đã lưu không được sửa hoặc xóa. Hãy tạo phiên bản mới.', 1;
END;
GO
-- Nhật ký chăm sóc trỏ sang phiên bản ngưỡng bằng cặp (id, lô): giữ ràng buộc đó trên bảng gộp.
UPDATE x SET x.threshold_version_id = p.batch_record_id FROM dbo.production_log x JOIN dbo.batch_record p ON p.record_type = 'ThresholdVersion' AND p.legacy_id = x.threshold_version_id;
GO
CREATE UNIQUE INDEX ak_batch_record_batch ON dbo.batch_record (batch_record_id, batch_id);
ALTER TABLE dbo.production_log ADD CONSTRAINT fk_production_log_threshold_batch FOREIGN KEY (threshold_version_id, batch_id) REFERENCES dbo.batch_record(batch_record_id, batch_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
