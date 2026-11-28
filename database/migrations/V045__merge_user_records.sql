-- V045: gộp vai trò, địa chỉ nhận hàng, lần xác minh eKYC, phiên handoff eKYC và tài khoản nhận tiền vào một bảng dbo.user_record (65 bảng còn 61).
-- Trước: app_user_role, customer_address, kyc_check, kyc_handoff, payout_account.
-- Sau: cột record_type cho biết loại bản ghi (Role, Address, KycCheck, KycHandoff, PayoutAccount). Tài khoản nhận tiền giữ nguyên id.
-- Địa chỉ không còn tự xoá theo khách hàng (SQL Server không cho hai đường xoá dây chuyền từ app_user tới cùng một bảng); vai trò vẫn tự xoá theo tài khoản.
CREATE TABLE dbo.user_record (
    user_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_user_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    owner_user_id BIGINT NULL,
    owner_operator_id BIGINT NULL,
    bank_code VARCHAR(20) NULL,
    account_no VARCHAR(2048) NULL,
    account_holder_name NVARCHAR(150) NULL,
    name_match_status VARCHAR(20) NULL,
    status VARCHAR(20) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    account_no_digest VARCHAR(64) NULL,
    user_id BIGINT NULL,
    role_code VARCHAR(20) NULL,
    granted_at DATETIMEOFFSET(3) NULL,
    customer_id BIGINT NULL,
    recipient_name NVARCHAR(150) NULL,
    recipient_phone VARCHAR(15) NULL,
    address_line NVARCHAR(300) NULL,
    province NVARCHAR(100) NULL,
    is_default BIT NULL,
    check_type VARCHAR(20) NULL,
    provider_ref VARCHAR(100) NULL,
    consent_at DATETIMEOFFSET(3) NULL,
    result VARCHAR(20) NULL,
    failure_reason NVARCHAR(300) NULL,
    reviewed_by BIGINT NULL,
    checked_at DATETIMEOFFSET(3) NULL,
    token_hash CHAR(64) NULL,
    handoff_status VARCHAR(16) NULL,
    expires_at DATETIMEOFFSET(3) NULL,
    claimed_at DATETIMEOFFSET(3) NULL,
    cancelled_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_user_record_record_type CHECK (record_type IN ('PayoutAccount', 'Role', 'Address', 'KycCheck', 'KycHandoff'))
);
GO
SET IDENTITY_INSERT dbo.user_record ON;
INSERT INTO dbo.user_record (user_record_id, record_type, legacy_id, owner_user_id, owner_operator_id, bank_code, account_no, account_holder_name, name_match_status, status, created_at, updated_at, account_no_digest)
SELECT s.[payout_account_id], 'PayoutAccount', s.[payout_account_id], s.[owner_user_id], s.[owner_operator_id], s.[bank_code], s.[account_no], s.[account_holder_name], s.[name_match_status], s.[status], s.[created_at], s.[updated_at], s.[account_no_digest] FROM dbo.payout_account s ORDER BY s.[payout_account_id];
SET IDENTITY_INSERT dbo.user_record OFF;
GO
INSERT INTO dbo.user_record (record_type, legacy_id, user_id, role_code, granted_at, created_at)
SELECT 'Role', NULL, s.[user_id], s.[role_code], s.[granted_at], s.[created_at] FROM dbo.app_user_role s ORDER BY s.[user_id], s.[role_code];
GO
INSERT INTO dbo.user_record (record_type, legacy_id, customer_id, recipient_name, recipient_phone, address_line, province, is_default, created_at)
SELECT 'Address', s.[address_id], s.[customer_id], s.[recipient_name], s.[recipient_phone], s.[address_line], s.[province], s.[is_default], s.[created_at] FROM dbo.customer_address s ORDER BY s.[address_id];
GO
INSERT INTO dbo.user_record (record_type, legacy_id, user_id, check_type, provider_ref, consent_at, result, failure_reason, reviewed_by, checked_at, created_at)
SELECT 'KycCheck', s.[kyc_check_id], s.[user_id], s.[check_type], s.[provider_ref], s.[consent_at], s.[result], s.[failure_reason], s.[reviewed_by], s.[checked_at], s.[created_at] FROM dbo.kyc_check s ORDER BY s.[kyc_check_id];
GO
INSERT INTO dbo.user_record (record_type, legacy_id, user_id, token_hash, handoff_status, created_at, expires_at, claimed_at, cancelled_at)
SELECT 'KycHandoff', s.[handoff_id], s.[user_id], s.[token_hash], s.[status], s.[created_at], s.[expires_at], s.[claimed_at], s.[cancelled_at] FROM dbo.kyc_handoff s ORDER BY s.[handoff_id];
GO
ALTER TABLE dbo.payment_instruction DROP CONSTRAINT fk_payment_instruction_payout_account_id;
GO
DROP TABLE dbo.payout_account;
DROP TABLE dbo.app_user_role;
DROP TABLE dbo.customer_address;
DROP TABLE dbo.kyc_check;
DROP TABLE dbo.kyc_handoff;
GO
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_user_record_payoutaccount_required CHECK (record_type <> 'PayoutAccount' OR (bank_code IS NOT NULL AND account_no IS NOT NULL AND account_holder_name IS NOT NULL AND name_match_status IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_payout_account_name_match_status CHECK (record_type <> 'PayoutAccount' OR ([name_match_status]='Mismatched' OR [name_match_status]='Matched' OR [name_match_status]='Pending'));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_payout_account_status CHECK (record_type <> 'PayoutAccount' OR ([status]='Closed' OR [status]='Locked' OR [status]='Active'));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_payout_owner CHECK (record_type <> 'PayoutAccount' OR ([owner_user_id] IS NULL AND [owner_operator_id] IS NOT NULL OR [owner_user_id] IS NOT NULL AND [owner_operator_id] IS NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_user_record_role_required CHECK (record_type <> 'Role' OR (user_id IS NOT NULL AND role_code IS NOT NULL AND granted_at IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_app_user_role_role_code CHECK (record_type <> 'Role' OR ([role_code]='QcInspector' OR [role_code]='EvidenceReviewer' OR [role_code]='PlatformAdmin' OR [role_code]='OperatorMember' OR [role_code]='Customer' OR [role_code]='Investor'));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_user_record_address_required CHECK (record_type <> 'Address' OR (customer_id IS NOT NULL AND recipient_name IS NOT NULL AND recipient_phone IS NOT NULL AND address_line IS NOT NULL AND province IS NOT NULL AND is_default IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_user_record_kyccheck_required CHECK (record_type <> 'KycCheck' OR (user_id IS NOT NULL AND check_type IS NOT NULL AND result IS NOT NULL AND checked_at IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_check_check_type CHECK (record_type <> 'KycCheck' OR ([check_type]='BankNameMatch' OR [check_type]='EkycIdFace' OR [check_type]='OtpDeclaration'));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_check_result CHECK (record_type <> 'KycCheck' OR ([result]='ExceptionApproved' OR [result]='Failed' OR [result]='Passed' OR [result]='Pending'));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_consent CHECK (record_type <> 'KycCheck' OR ([check_type]<>'EkycIdFace' OR [consent_at] IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_user_record_kychandoff_required CHECK (record_type <> 'KycHandoff' OR (user_id IS NOT NULL AND token_hash IS NOT NULL AND handoff_status IS NOT NULL AND created_at IS NOT NULL AND expires_at IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_handoff_cancelled CHECK (record_type <> 'KycHandoff' OR ([handoff_status]<>'Cancelled' OR [cancelled_at] IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_handoff_claimed CHECK (record_type <> 'KycHandoff' OR ([handoff_status]<>'Claimed' OR [claimed_at] IS NOT NULL));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_handoff_expiry CHECK (record_type <> 'KycHandoff' OR ([expires_at]>[created_at]));
ALTER TABLE dbo.user_record ADD CONSTRAINT ck_kyc_handoff_status CHECK (record_type <> 'KycHandoff' OR ([handoff_status]='Expired' OR [handoff_status]='Cancelled' OR [handoff_status]='Claimed' OR [handoff_status]='Pending'));
GO
CREATE UNIQUE INDEX ux_payout_account_digest ON dbo.user_record (account_no_digest) WHERE record_type = 'PayoutAccount' AND [account_no_digest] IS NOT NULL;
CREATE INDEX ix_payout_account_owner_user_id ON dbo.user_record (owner_user_id) WHERE record_type = 'PayoutAccount';
CREATE INDEX ix_payout_account_owner_operator_id ON dbo.user_record (owner_operator_id) WHERE record_type = 'PayoutAccount';
CREATE UNIQUE INDEX ux_payout_active_user ON dbo.user_record (owner_user_id) WHERE record_type = 'PayoutAccount' AND [status]='Active' AND [owner_user_id] IS NOT NULL;
CREATE UNIQUE INDEX ux_payout_active_operator ON dbo.user_record (owner_operator_id) WHERE record_type = 'PayoutAccount' AND [status]='Active' AND [owner_operator_id] IS NOT NULL;
CREATE UNIQUE INDEX ux_app_user_role_key ON dbo.user_record (user_id, role_code) WHERE record_type = 'Role';
CREATE UNIQUE INDEX ux_customer_address_default ON dbo.user_record (customer_id) WHERE record_type = 'Address' AND [is_default]=(1);
CREATE INDEX ix_kyc_check_user_id ON dbo.user_record (user_id) WHERE record_type = 'KycCheck';
CREATE INDEX ix_kyc_check_reviewed_by ON dbo.user_record (reviewed_by) WHERE record_type = 'KycCheck';
CREATE UNIQUE INDEX ux_kyc_handoff_token_hash ON dbo.user_record (token_hash) WHERE record_type = 'KycHandoff';
CREATE UNIQUE INDEX ux_kyc_handoff_pending_user ON dbo.user_record (user_id) WHERE record_type = 'KycHandoff' AND [handoff_status]='Pending';
CREATE INDEX ix_kyc_handoff_user_id_created_at ON dbo.user_record (user_id, created_at DESC) WHERE record_type = 'KycHandoff';
GO
ALTER TABLE dbo.user_record ADD CONSTRAINT fk_payout_account_owner_operator_id FOREIGN KEY (owner_operator_id) REFERENCES dbo.operator(operator_id);
ALTER TABLE dbo.user_record ADD CONSTRAINT fk_payout_account_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.user_record ADD CONSTRAINT fk_app_user_role_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user(user_id) ON DELETE CASCADE;
ALTER TABLE dbo.user_record ADD CONSTRAINT fk_customer_address_customer_id FOREIGN KEY (customer_id) REFERENCES dbo.customer(user_id);
ALTER TABLE dbo.user_record ADD CONSTRAINT fk_kyc_check_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_payout_account_id FOREIGN KEY (payout_account_id) REFERENCES dbo.user_record(user_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
