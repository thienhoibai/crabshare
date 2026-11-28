-- V048: gộp hợp đồng góp vốn, mẫu hợp đồng, chữ ký, công bố rủi ro, xác nhận rủi ro và cam kết bao tiêu vào một bảng dbo.contract_record (54 bảng còn 49).
-- Trước: investment_contract, contract_template, contract_signature, risk_disclosure, risk_acknowledgement, offtake_commitment.
-- Sau: cột record_type cho biết loại bản ghi (Contract, Template, Signature, RiskDisclosure, RiskAcknowledgement, Offtake). Hợp đồng giữ nguyên id.
CREATE TABLE dbo.contract_record (
    contract_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_contract_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    contract_no VARCHAR(30) NULL,
    contribution_id BIGINT NULL,
    template_id BIGINT NULL,
    status VARCHAR(20) NULL,
    signing_method VARCHAR(20) NULL,
    draft_hash CHAR(64) NULL,
    final_file_uri NVARCHAR(400) NULL,
    final_hash CHAR(64) NULL,
    fully_signed_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    version_code VARCHAR(20) NULL,
    content_hash CHAR(64) NULL,
    effective_from DATETIMEOFFSET(3) NULL,
    contract_id BIGINT NULL,
    signer_role VARCHAR(20) NULL,
    signing_order TINYINT NULL,
    signer_user_id BIGINT NULL,
    provider_request_id VARCHAR(100) NULL,
    signed_hash CHAR(64) NULL,
    signed_at DATETIMEOFFSET(3) NULL,
    investor_id BIGINT NULL,
    risk_disclosure_id BIGINT NULL,
    acknowledged_at DATETIMEOFFSET(3) NULL,
    scrolled_to_end BIT NULL,
    batch_id BIGINT NULL,
    committed_qty_kg DECIMAL(12,3) NULL,
    fixed_unit_price DECIMAL(18,0) NULL,
    deposit_amount DECIMAL(18,0) NULL,
    deposit_status VARCHAR(20) NULL,
    window_opens_at DATETIMEOFFSET(3) NULL,
    window_expires_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_contract_record_record_type CHECK (record_type IN ('Contract', 'Template', 'Signature', 'RiskDisclosure', 'RiskAcknowledgement', 'Offtake'))
);
GO
SET IDENTITY_INSERT dbo.contract_record ON;
INSERT INTO dbo.contract_record (contract_record_id, record_type, legacy_id, contract_no, contribution_id, template_id, status, signing_method, draft_hash, final_file_uri, final_hash, fully_signed_at, created_at, updated_at)
SELECT s.[contract_id], 'Contract', s.[contract_id], s.[contract_no], s.[contribution_id], s.[template_id], s.[status], s.[signing_method], s.[draft_hash], s.[final_file_uri], s.[final_hash], s.[fully_signed_at], s.[created_at], s.[updated_at] FROM dbo.investment_contract s ORDER BY s.[contract_id];
SET IDENTITY_INSERT dbo.contract_record OFF;
GO
INSERT INTO dbo.contract_record (record_type, legacy_id, version_code, content_hash, status, effective_from, created_at, updated_at)
SELECT 'Template', s.[template_id], s.[version_code], s.[content_hash], s.[status], s.[effective_from], s.[created_at], s.[updated_at] FROM dbo.contract_template s ORDER BY s.[template_id];
GO
INSERT INTO dbo.contract_record (record_type, legacy_id, contract_id, signer_role, signing_order, signer_user_id, provider_request_id, signed_hash, signed_at, created_at)
SELECT 'Signature', s.[signature_id], s.[contract_id], s.[signer_role], s.[signing_order], s.[signer_user_id], s.[provider_request_id], s.[signed_hash], s.[signed_at], s.[created_at] FROM dbo.contract_signature s ORDER BY s.[signature_id];
GO
INSERT INTO dbo.contract_record (record_type, legacy_id, version_code, content_hash, effective_from, status, created_at, updated_at)
SELECT 'RiskDisclosure', s.[risk_disclosure_id], s.[version_code], s.[content_hash], s.[effective_from], s.[status], s.[created_at], s.[updated_at] FROM dbo.risk_disclosure s ORDER BY s.[risk_disclosure_id];
GO
INSERT INTO dbo.contract_record (record_type, legacy_id, investor_id, risk_disclosure_id, acknowledged_at, scrolled_to_end, created_at)
SELECT 'RiskAcknowledgement', NULL, s.[investor_id], s.[risk_disclosure_id], s.[acknowledged_at], s.[scrolled_to_end], s.[created_at] FROM dbo.risk_acknowledgement s ORDER BY s.[investor_id], s.[risk_disclosure_id];
GO
INSERT INTO dbo.contract_record (record_type, legacy_id, contribution_id, batch_id, committed_qty_kg, fixed_unit_price, deposit_amount, deposit_status, status, window_opens_at, window_expires_at, created_at, updated_at)
SELECT 'Offtake', s.[offtake_id], s.[contribution_id], s.[batch_id], s.[committed_qty_kg], s.[fixed_unit_price], s.[deposit_amount], s.[deposit_status], s.[status], s.[window_opens_at], s.[window_expires_at], s.[created_at], s.[updated_at] FROM dbo.offtake_commitment s ORDER BY s.[offtake_id];
GO
UPDATE c SET c.template_id = p.contract_record_id FROM dbo.contract_record c JOIN dbo.contract_record p ON p.record_type = 'Template' AND p.legacy_id = c.template_id WHERE c.record_type = 'Contract';
UPDATE c SET c.risk_disclosure_id = p.contract_record_id FROM dbo.contract_record c JOIN dbo.contract_record p ON p.record_type = 'RiskDisclosure' AND p.legacy_id = c.risk_disclosure_id WHERE c.record_type = 'RiskAcknowledgement';
ALTER TABLE dbo.payment_record DROP CONSTRAINT fk_payment_request_offtake_id;
ALTER TABLE dbo.payment_record DISABLE TRIGGER ALL;
UPDATE x SET x.offtake_id = p.contract_record_id FROM dbo.payment_record x JOIN dbo.contract_record p ON p.record_type = 'Offtake' AND p.legacy_id = x.offtake_id;
ALTER TABLE dbo.payment_record ENABLE TRIGGER ALL;
ALTER TABLE dbo.sales_order DROP CONSTRAINT fk_sales_order_offtake_id;
UPDATE x SET x.offtake_id = p.contract_record_id FROM dbo.sales_order x JOIN dbo.contract_record p ON p.record_type = 'Offtake' AND p.legacy_id = x.offtake_id;
GO
ALTER TABLE dbo.investment_contract DROP CONSTRAINT fk_investment_contract_template_id;
ALTER TABLE dbo.contract_signature DROP CONSTRAINT fk_contract_signature_contract_id;
ALTER TABLE dbo.risk_acknowledgement DROP CONSTRAINT fk_risk_acknowledgement_risk_disclosure_id;
DROP TABLE dbo.investment_contract;
DROP TABLE dbo.contract_template;
DROP TABLE dbo.contract_signature;
DROP TABLE dbo.risk_disclosure;
DROP TABLE dbo.risk_acknowledgement;
DROP TABLE dbo.offtake_commitment;
GO
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_record_contract_required CHECK (record_type <> 'Contract' OR (contract_no IS NOT NULL AND contribution_id IS NOT NULL AND template_id IS NOT NULL AND status IS NOT NULL AND signing_method IS NOT NULL AND draft_hash IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_final CHECK (record_type <> 'Contract' OR ([status]<>'FullySigned' OR [final_hash] IS NOT NULL AND [fully_signed_at] IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_investment_contract_signing_method CHECK (record_type <> 'Contract' OR ([signing_method]='OfflineUpload' OR [signing_method]='DigitalSignature'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_investment_contract_status CHECK (record_type <> 'Contract' OR ([status]='Void' OR [status]='FullySigned' OR [status]='OperatorSigned' OR [status]='Draft'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_record_template_required CHECK (record_type <> 'Template' OR (version_code IS NOT NULL AND content_hash IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_template_status CHECK (record_type <> 'Template' OR ([status]='Retired' OR [status]='Active' OR [status]='Draft'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_record_signature_required CHECK (record_type <> 'Signature' OR (contract_id IS NOT NULL AND signer_role IS NOT NULL AND signing_order IS NOT NULL AND signer_user_id IS NOT NULL AND signed_hash IS NOT NULL AND signed_at IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_signature_signer_role CHECK (record_type <> 'Signature' OR ([signer_role]='Investor' OR [signer_role]='Operator'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_signature_signing_order CHECK (record_type <> 'Signature' OR ([signing_order]=(2) OR [signing_order]=(1)));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_signature_order CHECK (record_type <> 'Signature' OR ([signer_role]='Operator' AND [signing_order]=(1) OR [signer_role]='Investor' AND [signing_order]=(2)));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_record_riskdisclosure_required CHECK (record_type <> 'RiskDisclosure' OR (version_code IS NOT NULL AND content_hash IS NOT NULL AND effective_from IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_risk_disclosure_status CHECK (record_type <> 'RiskDisclosure' OR ([status]='Retired' OR [status]='Active' OR [status]='Draft'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_record_riskacknowledgement_required CHECK (record_type <> 'RiskAcknowledgement' OR (investor_id IS NOT NULL AND risk_disclosure_id IS NOT NULL AND acknowledged_at IS NOT NULL AND scrolled_to_end IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_risk_acknowledgement_scrolled_to_end CHECK (record_type <> 'RiskAcknowledgement' OR ([scrolled_to_end]=(1)));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_contract_record_offtake_required CHECK (record_type <> 'Offtake' OR (contribution_id IS NOT NULL AND batch_id IS NOT NULL AND committed_qty_kg IS NOT NULL AND fixed_unit_price IS NOT NULL AND deposit_amount IS NOT NULL AND deposit_status IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_offtake_commitment_committed_qty_kg CHECK (record_type <> 'Offtake' OR ([committed_qty_kg]>(0)));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_offtake_commitment_deposit_amount CHECK (record_type <> 'Offtake' OR ([deposit_amount]>(0)));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_offtake_commitment_deposit_status CHECK (record_type <> 'Offtake' OR ([deposit_status]='Refunded' OR [deposit_status]='Forfeited' OR [deposit_status]='Applied' OR [deposit_status]='Held' OR [deposit_status]='Pending'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_offtake_commitment_fixed_unit_price CHECK (record_type <> 'Offtake' OR ([fixed_unit_price]>(0)));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_offtake_commitment_status CHECK (record_type <> 'Offtake' OR ([status]='Cancelled' OR [status]='Expired' OR [status]='Fulfilled' OR [status]='WindowOpen' OR [status]='PendingHarvest'));
ALTER TABLE dbo.contract_record ADD CONSTRAINT ck_offtake_window CHECK (record_type <> 'Offtake' OR ([window_expires_at] IS NULL OR [window_expires_at]>[window_opens_at]));
GO
CREATE UNIQUE INDEX uq_investment_contract_contribution_id ON dbo.contract_record (contribution_id) WHERE record_type = 'Contract';
CREATE UNIQUE INDEX uq_investment_contract_contract_no ON dbo.contract_record (contract_no) WHERE record_type = 'Contract';
CREATE INDEX ix_investment_contract_template_id ON dbo.contract_record (template_id) WHERE record_type = 'Contract';
CREATE UNIQUE INDEX uq_contract_template_version_code ON dbo.contract_record (version_code) WHERE record_type = 'Template';
CREATE UNIQUE INDEX ux_signature_order ON dbo.contract_record (contract_id, signing_order) WHERE record_type = 'Signature';
CREATE UNIQUE INDEX ux_signature_role ON dbo.contract_record (contract_id, signer_role) WHERE record_type = 'Signature';
CREATE INDEX ix_contract_signature_signer_user_id ON dbo.contract_record (signer_user_id) WHERE record_type = 'Signature';
CREATE UNIQUE INDEX uq_risk_disclosure_version_code ON dbo.contract_record (version_code) WHERE record_type = 'RiskDisclosure';
CREATE UNIQUE INDEX ux_risk_acknowledgement_key ON dbo.contract_record (investor_id, risk_disclosure_id) WHERE record_type = 'RiskAcknowledgement';
CREATE INDEX ix_risk_acknowledgement_risk_disclosure_id ON dbo.contract_record (risk_disclosure_id) WHERE record_type = 'RiskAcknowledgement';
CREATE UNIQUE INDEX uq_offtake_commitment_contribution_id ON dbo.contract_record (contribution_id) WHERE record_type = 'Offtake';
CREATE INDEX ix_offtake_commitment_batch_id ON dbo.contract_record (batch_id) WHERE record_type = 'Offtake';
CREATE INDEX ix_offtake_commitment_contribution_id_batch_id ON dbo.contract_record (contribution_id, batch_id) WHERE record_type = 'Offtake';
GO
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_investment_contract_contribution_id FOREIGN KEY (contribution_id) REFERENCES dbo.contribution(contribution_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_investment_contract_template_id FOREIGN KEY (template_id) REFERENCES dbo.contract_record(contract_record_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_contract_signature_contract_id FOREIGN KEY (contract_id) REFERENCES dbo.contract_record(contract_record_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_contract_signature_signer_user_id FOREIGN KEY (signer_user_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_risk_acknowledgement_investor_id FOREIGN KEY (investor_id) REFERENCES dbo.investor(user_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_risk_acknowledgement_risk_disclosure_id FOREIGN KEY (risk_disclosure_id) REFERENCES dbo.contract_record(contract_record_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_offtake_commitment_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.contract_record ADD CONSTRAINT fk_offtake_commitment_contribution_id_batch_id FOREIGN KEY (contribution_id, batch_id) REFERENCES dbo.contribution(contribution_id, batch_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_request_offtake_id FOREIGN KEY (offtake_id) REFERENCES dbo.contract_record(contract_record_id);
ALTER TABLE dbo.sales_order ADD CONSTRAINT fk_sales_order_offtake_id FOREIGN KEY (offtake_id) REFERENCES dbo.contract_record(contract_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
