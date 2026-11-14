/* V018 — BR v1.5 nhóm A (G0): đối tác, vai trò đối tác, địa điểm, bên liên quan, người tham gia Lô,
   quyền kiểm phẩm (QC), tham số nền tảng, chế độ lô P/T/A và các trạng thái, loại cua mới.
   Chỉ thêm, không xoá bảng cũ: investor, customer, operator vẫn là hồ sơ riêng của từng vai trò.
   BR-001, 002, 003, 005, 008, 015, 016, 017, 018, 019, 025, 028, 052, 104, 161, 217, 218. */

/* ---------- 1. Đối tác ---------- */
CREATE TABLE dbo.party (
    party_id                     BIGINT IDENTITY(1,1) NOT NULL,
    party_code                   AS ('DT' + RIGHT('00000000' + CAST(party_id AS VARCHAR(10)), 8)) PERSISTED,
    legal_name                   NVARCHAR(200) NOT NULL,
    party_type                   VARCHAR(20) NOT NULL,
    registration_no              VARCHAR(30) NULL,
    representative               NVARCHAR(150) NULL,
    phone                        VARCHAR(15) NULL,
    verification_status          VARCHAR(20) NOT NULL CONSTRAINT df_party_verification_status DEFAULT ('Unverified'),
    reject_reason                NVARCHAR(300) NULL,
    is_platform                  BIT NOT NULL CONSTRAINT df_party_is_platform DEFAULT (0),
    registered_at                DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_party_registered_at DEFAULT (SYSDATETIMEOFFSET()),
    verified_at                  DATETIMEOFFSET(3) NULL,
    verified_by                  BIGINT NULL,
    created_by                   BIGINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_party_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_party_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_party PRIMARY KEY (party_id),
    CONSTRAINT ck_party_party_type CHECK (party_type IN ('Individual', 'Household', 'Company', 'Cooperative')),
    CONSTRAINT ck_party_verification_status CHECK (verification_status IN ('Unverified', 'Pending', 'Verified', 'Rejected')),
    CONSTRAINT ck_party_reject_reason CHECK (verification_status <> 'Rejected' OR reject_reason IS NOT NULL)
);
GO
CREATE UNIQUE INDEX ux_party_code ON dbo.party (party_code);
CREATE UNIQUE INDEX ux_party_registration_no ON dbo.party (registration_no) WHERE registration_no IS NOT NULL;
CREATE UNIQUE INDEX ux_party_platform ON dbo.party (is_platform) WHERE is_platform = 1;
GO
ALTER TABLE dbo.app_user ADD party_id BIGINT NULL
    CONSTRAINT fk_app_user_party FOREIGN KEY REFERENCES dbo.party (party_id);
ALTER TABLE dbo.operator ADD party_id BIGINT NULL
    CONSTRAINT fk_operator_party FOREIGN KEY REFERENCES dbo.party (party_id);
GO
CREATE INDEX ix_app_user_party ON dbo.app_user (party_id);
CREATE UNIQUE INDEX ux_operator_party ON dbo.operator (party_id) WHERE party_id IS NOT NULL;
GO

/* ---------- 2. Vai trò đối tác (BR-001, BR-006, BR-016) ---------- */
CREATE TABLE dbo.partner_role (
    partner_role_id              BIGINT IDENTITY(1,1) NOT NULL,
    party_id                     BIGINT NOT NULL,
    role_type                    VARCHAR(20) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_partner_role_status DEFAULT ('Active'),
    valid_from                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_partner_role_valid_from DEFAULT (SYSDATETIMEOFFSET()),
    valid_to                     DATETIMEOFFSET(3) NULL,
    note                         NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_partner_role_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_partner_role_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_partner_role PRIMARY KEY (partner_role_id),
    CONSTRAINT fk_partner_role_party FOREIGN KEY (party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT ux_partner_role UNIQUE (party_id, role_type, valid_from),
    CONSTRAINT ck_partner_role_role_type CHECK (role_type IN ('Farmer', 'Investor', 'Customer', 'Supplier', 'OfftakeBuyer')),
    CONSTRAINT ck_partner_role_status CHECK (status IN ('Pending', 'Active', 'Suspended', 'Revoked')),
    CONSTRAINT ck_partner_role_validity CHECK (valid_to IS NULL OR valid_to > valid_from)
);
GO
CREATE UNIQUE INDEX ux_partner_role_open ON dbo.partner_role (party_id, role_type) WHERE valid_to IS NULL;
GO

/* ---------- 3. Địa điểm (BR-015, BR-021) ---------- */
CREATE TABLE dbo.party_site (
    site_id                      BIGINT IDENTITY(1,1) NOT NULL,
    party_id                     BIGINT NOT NULL,
    site_code                    VARCHAR(30) NOT NULL,
    site_type                    VARCHAR(20) NOT NULL,
    name                         NVARCHAR(150) NOT NULL,
    address_line                 NVARCHAR(300) NOT NULL,
    province                     NVARCHAR(100) NULL,
    latitude                     DECIMAL(9,6) NULL,
    longitude                    DECIMAL(9,6) NULL,
    contact_name                 NVARCHAR(150) NULL,
    contact_phone                VARCHAR(15) NULL,
    is_default                   BIT NOT NULL CONSTRAINT df_party_site_is_default DEFAULT (0),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_party_site_status DEFAULT ('Active'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_party_site_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_party_site_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_party_site PRIMARY KEY (site_id),
    CONSTRAINT fk_party_site_party FOREIGN KEY (party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT ux_party_site_code UNIQUE (party_id, site_code),
    CONSTRAINT ck_party_site_site_type CHECK (site_type IN ('Farm', 'QcStation', 'Warehouse', 'DeliveryAddress')),
    CONSTRAINT ck_party_site_status CHECK (status IN ('Active', 'Inactive')),
    CONSTRAINT ck_party_site_coords CHECK ((latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
GO
CREATE UNIQUE INDEX ux_party_site_default ON dbo.party_site (party_id, site_type) WHERE is_default = 1 AND status = 'Active';
GO

/* ---------- 4. Bên liên quan của người nuôi (BR-008) ---------- */
CREATE TABLE dbo.related_party (
    related_party_id             BIGINT IDENTITY(1,1) NOT NULL,
    party_id                     BIGINT NOT NULL,
    full_name                    NVARCHAR(150) NOT NULL,
    relation                     NVARCHAR(50) NOT NULL,
    id_number_digest             CHAR(64) NOT NULL,
    id_number_last4              VARCHAR(4) NOT NULL,
    linked_party_id              BIGINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_related_party_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_related_party PRIMARY KEY (related_party_id),
    CONSTRAINT fk_related_party_party FOREIGN KEY (party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT fk_related_party_linked FOREIGN KEY (linked_party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT ux_related_party UNIQUE (party_id, id_number_digest)
);
GO

/* ---------- 5. Tham số nền tảng (BR-217, BR-218) ---------- */
CREATE TABLE dbo.platform_parameter (
    parameter_id                 BIGINT IDENTITY(1,1) NOT NULL,
    param_key                    VARCHAR(50) NOT NULL,
    value                        DECIMAL(18,4) NOT NULL,
    effective_from               DATETIMEOFFSET(3) NOT NULL,
    note                         NVARCHAR(300) NULL,
    created_by                   BIGINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_platform_parameter_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_platform_parameter PRIMARY KEY (parameter_id),
    CONSTRAINT ux_platform_parameter UNIQUE (param_key, effective_from)
);
GO
CREATE TRIGGER dbo.tr_platform_parameter_append_only ON dbo.platform_parameter AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    THROW 51018, N'Tham số nền tảng chỉ được thêm giá trị mới có ngày hiệu lực, không sửa hay xoá giá trị cũ.', 1;
END;
GO
INSERT INTO dbo.platform_parameter (param_key, value, effective_from, note) VALUES
 ('PlatformFeeRatePct',        2,      '2026-01-01T00:00:00+07:00', N'BR-188: % doanh thu thực thu, lô P'),
 ('MinContributionVnd',        1000000,'2026-01-01T00:00:00+07:00', N'BR-059'),
 ('ContributionHoldMinutes',   30,     '2026-01-01T00:00:00+07:00', N'BR-060'),
 ('OrderHoldMinutes',          15,     '2026-01-01T00:00:00+07:00', N'BR-090'),
 ('DepositRatePct',            20,     '2026-01-01T00:00:00+07:00', N'BR-092'),
 ('MinOrderCrabs',             10,     '2026-01-01T00:00:00+07:00', N'BR-087: số con quy đổi tối thiểu mỗi đơn'),
 ('MinPreorderRatioPct',       30,     '2026-01-01T00:00:00+07:00', N'BR-077'),
 ('ReturnWindowHours',         72,     '2026-01-01T00:00:00+07:00', N'BR-172'),
 ('BalancePaymentHours',       24,     '2026-01-01T00:00:00+07:00', N'BR-168'),
 ('ClaimResponseHours',        48,     '2026-01-01T00:00:00+07:00', N'BR-172'),
 ('SettlementFeedbackDays',    7,      '2026-01-01T00:00:00+07:00', N'BR-202'),
 ('EvidenceRiskThreshold',     70,     '2026-01-01T00:00:00+07:00', N'BR-138'),
 ('CaptureRequestHours',       2,      '2026-01-01T00:00:00+07:00', N'BR-134'),
 ('DeviceOfflineMinutes',      15,     '2026-01-01T00:00:00+07:00', N'BR-118, BR-231'),
 ('MassMortalityPct',          30,     '2026-01-01T00:00:00+07:00', N'BR-122'),
 ('MassMortalityWindowHours',  24,     '2026-01-01T00:00:00+07:00', N'BR-122'),
 ('AiConfidenceThreshold',     0.8,    '2026-01-01T00:00:00+07:00', N'BR-153'),
 ('CalibrationPeriodDays',     30,     '2026-01-01T00:00:00+07:00', N'BR-225, BR-229');
GO

/* ---------- 5b. Loại khách B2B (BR-014) ---------- */
ALTER TABLE dbo.customer ADD customer_type VARCHAR(20) NULL
    CONSTRAINT ck_customer_customer_type CHECK (customer_type IN ('Restaurant', 'Trader', 'Wholesaler', 'Agent', 'CentralKitchen', 'Other'));
GO

/* ---------- 6. Quyền kiểm phẩm (BR-017) ---------- */
ALTER TABLE dbo.app_user_role DROP CONSTRAINT ck_app_user_role_role_code;
ALTER TABLE dbo.app_user_role ADD CONSTRAINT ck_app_user_role_role_code
    CHECK (role_code IN ('Investor', 'Customer', 'OperatorMember', 'PlatformAdmin', 'EvidenceReviewer', 'QcInspector'));
GO

/* ---------- 7. Lô: chế độ P/T/A, đơn vị thực hiện, loại cua, trạng thái (BR-018, 019, 025, 028, 052, 104, 161) ---------- */
ALTER TABLE dbo.batch ADD
    batch_mode                   CHAR(1) NOT NULL CONSTRAINT df_batch_batch_mode DEFAULT ('P'),
    executor_party_id            BIGINT NULL CONSTRAINT fk_batch_executor_party FOREIGN KEY REFERENCES dbo.party (party_id);
GO
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_batch_mode CHECK (batch_mode IN ('P', 'T', 'A'));
ALTER TABLE dbo.batch DROP CONSTRAINT ck_batch_crab_type;
-- SoftShellCrab chỉ còn cho dữ liệu cũ; lô mới bị chặn ở tầng ứng dụng.
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_crab_type
    CHECK (crab_type IN ('FatteningMudCrab', 'RoeCrab', 'YoungFemaleCrab', 'OilRoeCrab', 'SoftShellCrab'));
ALTER TABLE dbo.batch DROP CONSTRAINT ck_batch_status;
-- Stocked chỉ còn cho dữ liệu cũ; luồng mới đi Funding/Sourcing → InProduction → Harvesting → Selling → Settlement → Closed.
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_status CHECK (status IN ('Draft', 'PendingApproval', 'NeedsRevision', 'Rejected',
    'Funding', 'Cancelled', 'Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling', 'Settlement', 'Closed'));
GO

/* ---------- 8. Người tham gia Lô (BR-002) ---------- */
CREATE TABLE dbo.batch_participant (
    participant_id               BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    party_id                     BIGINT NOT NULL,
    participant_role             VARCHAR(20) NOT NULL,
    joined_at                    DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_participant_joined_at DEFAULT (SYSDATETIMEOFFSET()),
    responsibility_scope         NVARCHAR(300) NULL,
    approval_status              VARCHAR(20) NOT NULL CONSTRAINT df_batch_participant_approval_status DEFAULT ('Approved'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_participant_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_batch_participant PRIMARY KEY (participant_id),
    CONSTRAINT fk_batch_participant_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_batch_participant_party FOREIGN KEY (party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT ux_batch_participant UNIQUE (batch_id, party_id, participant_role),
    CONSTRAINT ck_batch_participant_role CHECK (participant_role IN ('Executor', 'Investor', 'Customer', 'Supplier', 'OfftakeBuyer')),
    CONSTRAINT ck_batch_participant_approval CHECK (approval_status IN ('Pending', 'Approved', 'Rejected'))
);
GO
CREATE UNIQUE INDEX ux_batch_participant_executor ON dbo.batch_participant (batch_id) WHERE participant_role = 'Executor';
CREATE INDEX ix_batch_participant_party ON dbo.batch_participant (party_id, participant_role);
GO

/* ---------- 9. Chuyển dữ liệu cũ sang mô hình đối tác ---------- */
-- 9.1 Đối tác CrabShare: đơn vị thực hiện của lô T, bên nhận phí nền tảng.
INSERT INTO dbo.party (legal_name, party_type, verification_status, is_platform, verified_at)
VALUES (N'CrabShare', 'Company', 'Verified', 1, SYSDATETIMEOFFSET());
GO
-- 9.2 Mỗi hộ nuôi là một đối tác tổ chức; mã số thuế làm số đăng ký.
DECLARE @farm TABLE (operator_id BIGINT, party_id BIGINT);
MERGE dbo.party AS p
USING (
    SELECT o.operator_id, o.legal_name, o.tax_code, o.status,
           owner_user.full_name AS representative, owner_user.phone
    FROM dbo.operator o
    OUTER APPLY (SELECT TOP 1 u.full_name, u.phone FROM dbo.operator_member m JOIN dbo.app_user u ON u.user_id = m.user_id
                 WHERE m.operator_id = o.operator_id AND m.member_role = 'Owner' ORDER BY m.joined_at) owner_user
) AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (legal_name, party_type, registration_no, representative, phone, verification_status, reject_reason, verified_at)
    VALUES (src.legal_name,
            CASE WHEN src.legal_name LIKE N'HTX%' OR src.legal_name LIKE N'Hợp tác xã%' THEN 'Cooperative' ELSE 'Household' END,
            src.tax_code, src.representative, src.phone,
            CASE src.status WHEN 'Approved' THEN 'Verified' WHEN 'Suspended' THEN 'Verified' WHEN 'Rejected' THEN 'Rejected'
                            WHEN 'Submitted' THEN 'Pending' ELSE 'Unverified' END,
            CASE WHEN src.status = 'Rejected' THEN N'Hồ sơ người nuôi bị từ chối trước khi có mô hình đối tác.' END,
            CASE WHEN src.status IN ('Approved', 'Suspended') THEN SYSDATETIMEOFFSET() END)
OUTPUT src.operator_id, inserted.party_id INTO @farm (operator_id, party_id);
UPDATE o SET party_id = f.party_id FROM dbo.operator o JOIN @farm f ON f.operator_id = o.operator_id;
-- Chủ hộ đứng tên tài khoản của hộ nuôi (BR-003, BR-007).
UPDATE u SET party_id = o.party_id
FROM dbo.app_user u JOIN dbo.operator_member m ON m.user_id = u.user_id AND m.member_role = 'Owner'
JOIN dbo.operator o ON o.operator_id = m.operator_id;
GO
-- 9.3 Mọi tài khoản còn lại là một đối tác: cá nhân, hoặc tổ chức nếu là nhà đầu tư tổ chức.
DECLARE @person TABLE (user_id BIGINT, party_id BIGINT);
MERGE dbo.party AS p
USING (
    SELECT u.user_id, u.full_name, u.phone, i.investor_kind, i.organization_name, i.tax_code, i.verification_status
    FROM dbo.app_user u LEFT JOIN dbo.investor i ON i.user_id = u.user_id
    WHERE u.party_id IS NULL
) AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (legal_name, party_type, registration_no, representative, phone, verification_status, verified_at)
    VALUES (CASE WHEN src.investor_kind = 'Organization' THEN src.organization_name ELSE src.full_name END,
            CASE WHEN src.investor_kind = 'Organization' THEN 'Company' ELSE 'Individual' END,
            CASE WHEN src.investor_kind = 'Organization' THEN src.tax_code END,
            CASE WHEN src.investor_kind = 'Organization' THEN src.full_name END,
            src.phone,
            CASE src.verification_status WHEN 'Verified' THEN 'Verified' ELSE 'Unverified' END,
            CASE WHEN src.verification_status = 'Verified' THEN SYSDATETIMEOFFSET() END)
OUTPUT src.user_id, inserted.party_id INTO @person (user_id, party_id);
UPDATE u SET party_id = p.party_id FROM dbo.app_user u JOIN @person p ON p.user_id = u.user_id;
GO
-- 9.4 Vai trò đối tác.
INSERT INTO dbo.partner_role (party_id, role_type, status)
SELECT o.party_id, 'Farmer',
       CASE o.status WHEN 'Approved' THEN 'Active' WHEN 'Suspended' THEN 'Suspended' WHEN 'Rejected' THEN 'Revoked' ELSE 'Pending' END
FROM dbo.operator o WHERE o.party_id IS NOT NULL;
INSERT INTO dbo.partner_role (party_id, role_type, status)
SELECT DISTINCT u.party_id, 'Investor', 'Active' FROM dbo.investor i JOIN dbo.app_user u ON u.user_id = i.user_id
WHERE u.party_id IS NOT NULL;
INSERT INTO dbo.partner_role (party_id, role_type, status)
SELECT DISTINCT u.party_id, 'Customer', 'Active' FROM dbo.customer c JOIN dbo.app_user u ON u.user_id = c.user_id
WHERE u.party_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.partner_role r WHERE r.party_id = u.party_id AND r.role_type = 'Customer');
GO
-- 9.5 Địa điểm: trại của hộ nuôi, địa chỉ giao của khách.
INSERT INTO dbo.party_site (party_id, site_code, site_type, name, address_line, is_default)
SELECT o.party_id, 'TRAI-01', 'Farm', o.legal_name, o.farm_address, 1 FROM dbo.operator o WHERE o.party_id IS NOT NULL;
INSERT INTO dbo.party_site (party_id, site_code, site_type, name, address_line, province, contact_name, contact_phone, is_default)
SELECT u.party_id, 'DC-' + CAST(a.address_id AS VARCHAR(20)), 'DeliveryAddress', a.recipient_name, a.address_line, a.province,
       a.recipient_name, a.recipient_phone, a.is_default
FROM dbo.customer_address a JOIN dbo.app_user u ON u.user_id = a.customer_id WHERE u.party_id IS NOT NULL;
GO
-- 9.6 Lô cũ: chế độ P, đơn vị thực hiện là hộ nuôi; người tham gia gồm hộ nuôi và các nhà đầu tư đã góp.
UPDATE b SET executor_party_id = o.party_id FROM dbo.batch b JOIN dbo.operator o ON o.operator_id = b.operator_id;
INSERT INTO dbo.batch_participant (batch_id, party_id, participant_role, joined_at)
SELECT b.batch_id, b.executor_party_id, 'Executor', b.created_at FROM dbo.batch b WHERE b.executor_party_id IS NOT NULL;
INSERT INTO dbo.batch_participant (batch_id, party_id, participant_role, joined_at)
SELECT c.batch_id, u.party_id, 'Investor', MIN(c.created_at)
FROM dbo.contribution c JOIN dbo.app_user u ON u.user_id = c.investor_id
WHERE c.status = 'Confirmed' AND u.party_id IS NOT NULL
GROUP BY c.batch_id, u.party_id;
GO
