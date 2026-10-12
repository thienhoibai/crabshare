/* V001 — Lược đồ ban đầu của CrabShare (52 bảng, 105 FK, 9 view, 5 trigger).
   Nguồn: Chuan_hoa/Database/crabshare_sqlserver.sql bản 1.1. Không sửa file này sau khi đã chạy; thay đổi lược đồ thì thêm file V00x__*.sql mới. */

/* ---------- 1. BẢNG ---------- */
-- User — Tài khoản đăng nhập chung của mọi người dùng
CREATE TABLE dbo.app_user (
    user_id                      BIGINT IDENTITY(1,1) NOT NULL,
    email                        NVARCHAR(254) NOT NULL,
    phone                        VARCHAR(15) NULL,
    full_name                    NVARCHAR(150) NOT NULL,
    password_hash                VARCHAR(255) NOT NULL,
    status                       VARCHAR(21) NOT NULL CONSTRAINT df_app_user_status DEFAULT ('PendingVerification'),
    last_login_at                DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_app_user_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_app_user_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_app_user PRIMARY KEY (user_id),
    CONSTRAINT uq_app_user_email UNIQUE (email),
    CONSTRAINT ck_app_user_status CHECK (status IN ('PendingVerification', 'Active', 'Locked'))
);
GO
-- UserRole — Vai trò của tài khoản (một người có thể vừa là nhà đầu tư vừa là khách hàng)
CREATE TABLE dbo.app_user_role (
    user_id                      BIGINT NOT NULL,
    role_code                    VARCHAR(20) NOT NULL,
    granted_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_app_user_role_granted_at DEFAULT (SYSDATETIMEOFFSET()),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_app_user_role_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_app_user_role PRIMARY KEY (user_id, role_code),
    CONSTRAINT ck_app_user_role_role_code CHECK (role_code IN ('Investor', 'Customer', 'OperatorMember', 'PlatformAdmin', 'EvidenceReviewer'))
);
GO
-- Investor — Nhà đầu tư (kế thừa User). Nhà đầu tư bao tiêu là nhà đầu tư có ít nhất một cam kết bao tiêu
CREATE TABLE dbo.investor (
    user_id                      BIGINT NOT NULL,
    investor_kind                VARCHAR(20) NOT NULL CONSTRAINT df_investor_investor_kind DEFAULT ('Individual'),
    organization_name            NVARCHAR(200) NULL,
    tax_code                     VARCHAR(14) NULL,
    verification_status          VARCHAR(20) NOT NULL CONSTRAINT df_investor_verification_status DEFAULT ('Unverified'),
    verified_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_investor_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_investor PRIMARY KEY (user_id),
    CONSTRAINT ck_investor_investor_kind CHECK (investor_kind IN ('Individual', 'Organization')),
    CONSTRAINT ck_investor_verification_status CHECK (verification_status IN ('Unverified', 'Verified', 'Rejected')),
    CONSTRAINT ck_investor_org CHECK (investor_kind = 'Individual' OR organization_name IS NOT NULL)
);
GO
-- Customer — Khách mua trên gian hàng (kế thừa User)
CREATE TABLE dbo.customer (
    user_id                      BIGINT NOT NULL,
    display_name                 NVARCHAR(100) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_customer_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_customer PRIMARY KEY (user_id)
);
GO
-- CustomerAddress — Địa chỉ nhận hàng của khách (thuộc tính đa trị)
CREATE TABLE dbo.customer_address (
    address_id                   BIGINT IDENTITY(1,1) NOT NULL,
    customer_id                  BIGINT NOT NULL,
    recipient_name               NVARCHAR(150) NOT NULL,
    recipient_phone              VARCHAR(15) NOT NULL,
    address_line                 NVARCHAR(300) NOT NULL,
    province                     NVARCHAR(100) NOT NULL,
    is_default                   BIT NOT NULL CONSTRAINT df_customer_address_is_default DEFAULT (0),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_customer_address_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_customer_address PRIMARY KEY (address_id)
);
GO
-- Operator — Người nuôi: tổ chức có mã số thuế, vận hành cơ sở RAS
CREATE TABLE dbo.operator (
    operator_id                  BIGINT IDENTITY(1,1) NOT NULL,
    legal_name                   NVARCHAR(200) NOT NULL,
    tax_code                     VARCHAR(14) NOT NULL,
    business_reg_no              VARCHAR(30) NOT NULL,
    farm_address                 NVARCHAR(300) NOT NULL,
    approved_slot_capacity       INT NOT NULL CONSTRAINT df_operator_approved_slot_capacity DEFAULT (0),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_operator_status DEFAULT ('Draft'),
    submitted_at                 DATETIMEOFFSET(3) NULL,
    approved_at                  DATETIMEOFFSET(3) NULL,
    approved_by                  BIGINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_operator_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_operator_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_operator PRIMARY KEY (operator_id),
    CONSTRAINT uq_operator_tax_code UNIQUE (tax_code),
    CONSTRAINT ck_operator_approved_slot_capacity CHECK (approved_slot_capacity >= 0),
    CONSTRAINT ck_operator_status CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Suspended'))
);
GO
-- OperatorMember — Tài khoản thuộc tổ chức người nuôi (chủ, nhân viên)
CREATE TABLE dbo.operator_member (
    user_id                      BIGINT NOT NULL,
    operator_id                  BIGINT NOT NULL,
    member_role                  VARCHAR(20) NOT NULL CONSTRAINT df_operator_member_member_role DEFAULT ('Staff'),
    joined_at                    DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_operator_member_joined_at DEFAULT (SYSDATETIMEOFFSET()),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_operator_member_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_operator_member PRIMARY KEY (user_id),
    CONSTRAINT ck_operator_member_member_role CHECK (member_role IN ('Owner', 'Staff'))
);
GO
-- KycCheck — Kết quả từng lần xác minh danh tính. Chỉ lưu kết quả, không lưu ảnh CCCD hay khuôn mặt
CREATE TABLE dbo.kyc_check (
    kyc_check_id                 BIGINT IDENTITY(1,1) NOT NULL,
    user_id                      BIGINT NOT NULL,
    check_type                   VARCHAR(20) NOT NULL,
    provider_ref                 VARCHAR(100) NULL,
    consent_at                   DATETIMEOFFSET(3) NULL,
    result                       VARCHAR(20) NOT NULL CONSTRAINT df_kyc_check_result DEFAULT ('Pending'),
    failure_reason               NVARCHAR(300) NULL,
    reviewed_by                  BIGINT NULL,
    checked_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_kyc_check_checked_at DEFAULT (SYSDATETIMEOFFSET()),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_kyc_check_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_kyc_check PRIMARY KEY (kyc_check_id),
    CONSTRAINT ck_kyc_check_check_type CHECK (check_type IN ('OtpDeclaration', 'EkycIdFace', 'BankNameMatch')),
    CONSTRAINT ck_kyc_check_result CHECK (result IN ('Pending', 'Passed', 'Failed', 'ExceptionApproved')),
    CONSTRAINT ck_kyc_consent CHECK (check_type <> 'EkycIdFace' OR consent_at IS NOT NULL)
);
GO
-- PayoutAccount — Tài khoản nhận tiền của nhà đầu tư hoặc người nuôi (đúng một chủ sở hữu)
CREATE TABLE dbo.payout_account (
    payout_account_id            BIGINT IDENTITY(1,1) NOT NULL,
    owner_user_id                BIGINT NULL,
    owner_operator_id            BIGINT NULL,
    bank_code                    VARCHAR(20) NOT NULL,
    account_no                   VARCHAR(30) NOT NULL,
    account_holder_name          NVARCHAR(150) NOT NULL,
    name_match_status            VARCHAR(20) NOT NULL CONSTRAINT df_payout_account_name_match_status DEFAULT ('Pending'),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_payout_account_status DEFAULT ('Active'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payout_account_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payout_account_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_payout_account PRIMARY KEY (payout_account_id),
    CONSTRAINT ux_payout_bank_account UNIQUE (bank_code, account_no),
    CONSTRAINT ck_payout_account_name_match_status CHECK (name_match_status IN ('Pending', 'Matched', 'Mismatched')),
    CONSTRAINT ck_payout_account_status CHECK (status IN ('Active', 'Locked', 'Closed')),
    CONSTRAINT ck_payout_owner CHECK ((owner_user_id IS NULL AND owner_operator_id IS NOT NULL) OR (owner_user_id IS NOT NULL AND owner_operator_id IS NULL))
);
GO
-- RiskDisclosure — Phiên bản bản công bố rủi ro
CREATE TABLE dbo.risk_disclosure (
    risk_disclosure_id           BIGINT IDENTITY(1,1) NOT NULL,
    version_code                 VARCHAR(20) NOT NULL,
    content_hash                 CHAR(64) NOT NULL,
    effective_from               DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_risk_disclosure_status DEFAULT ('Draft'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_risk_disclosure_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_risk_disclosure_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_risk_disclosure PRIMARY KEY (risk_disclosure_id),
    CONSTRAINT uq_risk_disclosure_version_code UNIQUE (version_code),
    CONSTRAINT ck_risk_disclosure_status CHECK (status IN ('Draft', 'Active', 'Retired'))
);
GO
-- RiskAcknowledgement — Nhà đầu tư xác nhận đã đọc một phiên bản công bố rủi ro
CREATE TABLE dbo.risk_acknowledgement (
    investor_id                  BIGINT NOT NULL,
    risk_disclosure_id           BIGINT NOT NULL,
    acknowledged_at              DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_risk_acknowledgement_acknowledged_at DEFAULT (SYSDATETIMEOFFSET()),
    scrolled_to_end              BIT NOT NULL CONSTRAINT df_risk_acknowledgement_scrolled_to_end DEFAULT (1),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_risk_acknowledgement_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_risk_acknowledgement PRIMARY KEY (investor_id, risk_disclosure_id),
    CONSTRAINT ck_risk_acknowledgement_scrolled_to_end CHECK (scrolled_to_end = 1)
);
GO
-- PhysicalSlot — Hộp nuôi (slot) của người nuôi, nhận diện bằng số hộp in trên nhãn dán lên hộp; dãy, kệ, tầng, cột là tuỳ chọn [v1.1]
CREATE TABLE dbo.physical_slot (
    slot_id                      BIGINT IDENTITY(1,1) NOT NULL,
    operator_id                  BIGINT NOT NULL,
    slot_code                    VARCHAR(30) NOT NULL,
    row_code                     VARCHAR(10) NULL,
    rack_no                      SMALLINT NULL,
    tier_no                      SMALLINT NULL,
    column_no                    SMALLINT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_physical_slot_status DEFAULT ('Available'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_physical_slot_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_physical_slot_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_physical_slot PRIMARY KEY (slot_id),
    CONSTRAINT ux_slot_code UNIQUE (operator_id, slot_code),
    CONSTRAINT ck_physical_slot_status CHECK (status IN ('Available', 'Occupied', 'Maintenance')),
    CONSTRAINT ck_physical_slot_layout CHECK (rack_no > 0 AND tier_no > 0 AND column_no > 0)
);
GO
-- SlotAllocation — Gán ô nuôi cho lô; mỗi ô chỉ thuộc một lô đang hoạt động
CREATE TABLE dbo.slot_allocation (
    slot_allocation_id           BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    slot_id                      BIGINT NOT NULL,
    allocated_at                 DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_slot_allocation_allocated_at DEFAULT (SYSDATETIMEOFFSET()),
    released_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_slot_allocation_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_slot_allocation PRIMARY KEY (slot_allocation_id),
    CONSTRAINT ux_slot_allocation_batch_slot UNIQUE (slot_allocation_id, batch_id)
);
GO
-- Batch — Lô nuôi: đơn vị gọi vốn, sản xuất, bán hàng và quyết toán
CREATE TABLE dbo.batch (
    batch_id                     BIGINT IDENTITY(1,1) NOT NULL,
    batch_code                   VARCHAR(20) NOT NULL,
    operator_id                  BIGINT NOT NULL,
    crab_type                    VARCHAR(20) NOT NULL,
    title                        NVARCHAR(200) NOT NULL,
    seed_quantity                INT NOT NULL,
    expected_output_kg           DECIMAL(12,3) NOT NULL,
    cycle_days                   SMALLINT NOT NULL,
    restock_cutoff_days          SMALLINT NOT NULL,
    min_viable_capital           DECIMAL(18,0) NOT NULL,
    target_capital               DECIMAL(18,0) NOT NULL,
    max_capital                  DECIMAL(18,0) NOT NULL,
    min_contribution             DECIMAL(18,0) NOT NULL CONSTRAINT df_batch_min_contribution DEFAULT (1000000),
    operator_share_pct           DECIMAL(5,2) NOT NULL CONSTRAINT df_batch_operator_share_pct DEFAULT (7.00),
    frozen_stock_cap_months      TINYINT NOT NULL CONSTRAINT df_batch_frozen_stock_cap_months DEFAULT (4),
    offtake_preorder_cap_pct     DECIMAL(5,2) NOT NULL CONSTRAINT df_batch_offtake_preorder_cap_pct DEFAULT (60.00),
    offtake_deposit_pct          DECIMAL(5,2) NOT NULL CONSTRAINT df_batch_offtake_deposit_pct DEFAULT (15.00),
    fee_tier_id                  BIGINT NULL,
    platform_fee_amount          DECIMAL(18,0) NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_batch_status DEFAULT ('Draft'),
    funding_open_at              DATETIMEOFFSET(3) NULL,
    funding_deadline             DATETIMEOFFSET(3) NULL,
    capital_closed_at            DATETIMEOFFSET(3) NULL,
    total_confirmed_capital      DECIMAL(18,0) NULL,
    stocked_at                   DATETIMEOFFSET(3) NULL,
    expected_harvest_date        DATE NULL,
    harvest_started_at           DATETIMEOFFSET(3) NULL,
    early_liquidation_at         DATETIMEOFFSET(3) NULL,
    closed_at                    DATETIMEOFFSET(3) NULL,
    approved_by                  BIGINT NULL,
    approved_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_batch PRIMARY KEY (batch_id),
    CONSTRAINT uq_batch_batch_code UNIQUE (batch_code),
    CONSTRAINT ck_batch_seed_quantity CHECK (seed_quantity > 0),
    CONSTRAINT ck_batch_expected_output_kg CHECK (expected_output_kg > 0),
    CONSTRAINT ck_batch_cycle_days CHECK (cycle_days > 0),
    CONSTRAINT ck_batch_restock_cutoff_days CHECK (restock_cutoff_days > 0),
    CONSTRAINT ck_batch_min_contribution CHECK (min_contribution > 0),
    CONSTRAINT ck_batch_operator_share_pct CHECK (operator_share_pct BETWEEN 5 AND 10),
    CONSTRAINT ck_batch_frozen_stock_cap_months CHECK (frozen_stock_cap_months BETWEEN 1 AND 6),
    CONSTRAINT ck_batch_offtake_preorder_cap_pct CHECK (offtake_preorder_cap_pct BETWEEN 0 AND 60),
    CONSTRAINT ck_batch_offtake_deposit_pct CHECK (offtake_deposit_pct BETWEEN 10 AND 20),
    CONSTRAINT ck_batch_crab_type CHECK (crab_type IN ('FatteningMudCrab', 'RoeCrab', 'SoftShellCrab')),
    CONSTRAINT ck_batch_status CHECK (status IN ('Draft', 'PendingApproval', 'Rejected', 'Funding', 'Cancelled', 'Stocked', 'InProduction', 'Harvesting', 'Settlement', 'Closed')),
    CONSTRAINT ck_batch_capital_range CHECK (min_viable_capital > 0 AND min_viable_capital <= target_capital AND target_capital <= max_capital),
    CONSTRAINT ck_batch_funding_window CHECK (funding_deadline IS NULL OR funding_open_at IS NULL OR funding_deadline > funding_open_at)
);
GO
-- StandardCostVersion — Phiên bản bảng Standard Cost của lô; đúng một bản bị khoá khi mở gọi vốn
CREATE TABLE dbo.standard_cost_version (
    cost_version_id              BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    version_no                   SMALLINT NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_standard_cost_version_status DEFAULT ('Draft'),
    submitted_at                 DATETIMEOFFSET(3) NULL,
    approved_by                  BIGINT NULL,
    approved_at                  DATETIMEOFFSET(3) NULL,
    locked_at                    DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_standard_cost_version_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_standard_cost_version_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_standard_cost_version PRIMARY KEY (cost_version_id),
    CONSTRAINT ux_cost_version_no UNIQUE (batch_id, version_no),
    CONSTRAINT ck_standard_cost_version_version_no CHECK (version_no > 0),
    CONSTRAINT ck_standard_cost_version_status CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Locked', 'Superseded'))
);
GO
-- StandardCostItem — Dòng chi phí theo hạng mục trong một phiên bản Standard Cost
CREATE TABLE dbo.standard_cost_item (
    cost_item_id                 BIGINT IDENTITY(1,1) NOT NULL,
    cost_version_id              BIGINT NOT NULL,
    category                     VARCHAR(20) NOT NULL,
    description                  NVARCHAR(200) NOT NULL,
    quantity                     DECIMAL(12,3) NOT NULL,
    unit                         NVARCHAR(20) NOT NULL,
    unit_price                   DECIMAL(18,0) NOT NULL,
    tranche_no                   TINYINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_standard_cost_item_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_standard_cost_item PRIMARY KEY (cost_item_id),
    CONSTRAINT ck_standard_cost_item_quantity CHECK (quantity > 0),
    CONSTRAINT ck_standard_cost_item_unit_price CHECK (unit_price >= 0),
    CONSTRAINT ck_standard_cost_item_category CHECK (category IN ('Seed', 'Feed', 'Utilities', 'Labour', 'MortalityReserve', 'Depreciation', 'Other')),
    CONSTRAINT ck_cost_item_tranche CHECK ((category = 'Depreciation' AND tranche_no IS NULL) OR (category <> 'Depreciation' AND tranche_no IS NOT NULL))
);
GO
-- DisbursementTranche — Đợt giải ngân theo mốc, suy ra từ Standard Cost đã khoá
CREATE TABLE dbo.disbursement_tranche (
    tranche_id                   BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    tranche_no                   TINYINT NOT NULL,
    planned_amount               DECIMAL(18,0) NOT NULL,
    planned_date                 DATE NOT NULL,
    unlock_condition             NVARCHAR(300) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_disbursement_tranche_status DEFAULT ('Planned'),
    requested_at                 DATETIMEOFFSET(3) NULL,
    explanation_deadline         DATETIMEOFFSET(3) NULL,
    released_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_disbursement_tranche_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_disbursement_tranche_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_disbursement_tranche PRIMARY KEY (tranche_id),
    CONSTRAINT ux_tranche_no UNIQUE (batch_id, tranche_no),
    CONSTRAINT ck_disbursement_tranche_tranche_no CHECK (tranche_no > 0),
    CONSTRAINT ck_disbursement_tranche_planned_amount CHECK (planned_amount > 0),
    CONSTRAINT ck_disbursement_tranche_status CHECK (status IN ('Planned', 'Requested', 'NeedsExplanation', 'Released', 'Blocked'))
);
GO
-- FeeTier — Bậc phí nền tảng theo quy mô vốn của lô
CREATE TABLE dbo.fee_tier (
    fee_tier_id                  BIGINT IDENTITY(1,1) NOT NULL,
    tier_code                    VARCHAR(20) NOT NULL,
    min_capital                  DECIMAL(18,0) NOT NULL,
    max_capital                  DECIMAL(18,0) NULL,
    fee_amount                   DECIMAL(18,0) NOT NULL,
    effective_from               DATE NOT NULL,
    effective_to                 DATE NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_fee_tier_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_fee_tier PRIMARY KEY (fee_tier_id),
    CONSTRAINT uq_fee_tier_tier_code UNIQUE (tier_code),
    CONSTRAINT ck_fee_tier_fee_amount CHECK (fee_amount >= 0),
    CONSTRAINT ck_fee_tier_range CHECK (max_capital IS NULL OR max_capital > min_capital)
);
GO
-- BatchAccount — Tài khoản chuyên dùng của lô do tổ chức trung gian thanh toán giữ hộ
CREATE TABLE dbo.batch_account (
    batch_account_id             BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    provider_name                NVARCHAR(100) NOT NULL,
    provider_account_no          VARCHAR(40) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_batch_account_status DEFAULT ('Requested'),
    opened_at                    DATETIMEOFFSET(3) NULL,
    closed_at                    DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_account_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_account_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_batch_account PRIMARY KEY (batch_account_id),
    CONSTRAINT uq_batch_account_batch_id UNIQUE (batch_id),
    CONSTRAINT uq_batch_account_provider_account_no UNIQUE (provider_account_no),
    CONSTRAINT ck_batch_account_status CHECK (status IN ('Requested', 'Open', 'Frozen', 'Closed'))
);
GO
-- Contribution — Khoản góp vốn: giữ chỗ rồi được xác nhận khi tiền về tài khoản lô
CREATE TABLE dbo.contribution (
    contribution_id              BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    investor_id                  BIGINT NOT NULL,
    amount                       DECIMAL(18,0) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_contribution_status DEFAULT ('Reserved'),
    reserved_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_contribution_reserved_at DEFAULT (SYSDATETIMEOFFSET()),
    expires_at                   DATETIMEOFFSET(3) NOT NULL,
    confirmed_at                 DATETIMEOFFSET(3) NULL,
    refunded_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_contribution_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_contribution_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_contribution PRIMARY KEY (contribution_id),
    CONSTRAINT ux_contribution_batch UNIQUE (contribution_id, batch_id),
    CONSTRAINT ck_contribution_amount CHECK (amount > 0),
    CONSTRAINT ck_contribution_status CHECK (status IN ('Reserved', 'Confirmed', 'Expired', 'Refunded')),
    CONSTRAINT ck_contribution_confirmed CHECK (status <> 'Confirmed' OR confirmed_at IS NOT NULL)
);
GO
-- CapitalShare — Tử số quyền lợi của từng nhà đầu tư, chốt bất biến khi lô đóng vốn
CREATE TABLE dbo.capital_share (
    batch_id                     BIGINT NOT NULL,
    investor_id                  BIGINT NOT NULL,
    confirmed_amount             DECIMAL(18,0) NOT NULL,
    snapshotted_at               DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_capital_share_snapshotted_at DEFAULT (SYSDATETIMEOFFSET()),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_capital_share_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_capital_share PRIMARY KEY (batch_id, investor_id),
    CONSTRAINT ck_capital_share_confirmed_amount CHECK (confirmed_amount > 0)
);
GO
-- ContractTemplate — Phiên bản mẫu hợp đồng hợp tác
CREATE TABLE dbo.contract_template (
    template_id                  BIGINT IDENTITY(1,1) NOT NULL,
    version_code                 VARCHAR(20) NOT NULL,
    content_hash                 CHAR(64) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_contract_template_status DEFAULT ('Draft'),
    effective_from               DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_contract_template_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_contract_template_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_contract_template PRIMARY KEY (template_id),
    CONSTRAINT uq_contract_template_version_code UNIQUE (version_code),
    CONSTRAINT ck_contract_template_status CHECK (status IN ('Draft', 'Active', 'Retired'))
);
GO
-- InvestmentContract — Hợp đồng hợp tác của một khoản góp, ký lần lượt người nuôi rồi nhà đầu tư
CREATE TABLE dbo.investment_contract (
    contract_id                  BIGINT IDENTITY(1,1) NOT NULL,
    contract_no                  VARCHAR(30) NOT NULL,
    contribution_id              BIGINT NOT NULL,
    template_id                  BIGINT NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_investment_contract_status DEFAULT ('Draft'),
    signing_method               VARCHAR(20) NOT NULL CONSTRAINT df_investment_contract_signing_method DEFAULT ('DigitalSignature'),
    draft_hash                   CHAR(64) NOT NULL,
    final_file_uri               NVARCHAR(400) NULL,
    final_hash                   CHAR(64) NULL,
    fully_signed_at              DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_investment_contract_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_investment_contract_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_investment_contract PRIMARY KEY (contract_id),
    CONSTRAINT uq_investment_contract_contract_no UNIQUE (contract_no),
    CONSTRAINT uq_investment_contract_contribution_id UNIQUE (contribution_id),
    CONSTRAINT ck_investment_contract_status CHECK (status IN ('Draft', 'OperatorSigned', 'FullySigned', 'Void')),
    CONSTRAINT ck_investment_contract_signing_method CHECK (signing_method IN ('DigitalSignature', 'OfflineUpload')),
    CONSTRAINT ck_contract_final CHECK (status <> 'FullySigned' OR (final_hash IS NOT NULL AND fully_signed_at IS NOT NULL))
);
GO
-- ContractSignature — Từng chữ ký trên hợp đồng (người nuôi ký trước, nhà đầu tư ký sau)
CREATE TABLE dbo.contract_signature (
    signature_id                 BIGINT IDENTITY(1,1) NOT NULL,
    contract_id                  BIGINT NOT NULL,
    signer_role                  VARCHAR(20) NOT NULL,
    signing_order                TINYINT NOT NULL,
    signer_user_id               BIGINT NOT NULL,
    provider_request_id          VARCHAR(100) NULL,
    signed_hash                  CHAR(64) NOT NULL,
    signed_at                    DATETIMEOFFSET(3) NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_contract_signature_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_contract_signature PRIMARY KEY (signature_id),
    CONSTRAINT ux_signature_role UNIQUE (contract_id, signer_role),
    CONSTRAINT ux_signature_order UNIQUE (contract_id, signing_order),
    CONSTRAINT ck_contract_signature_signing_order CHECK (signing_order IN (1,2)),
    CONSTRAINT ck_contract_signature_signer_role CHECK (signer_role IN ('Operator', 'Investor')),
    CONSTRAINT ck_signature_order CHECK ((signer_role = 'Operator' AND signing_order = 1) OR (signer_role = 'Investor' AND signing_order = 2))
);
GO
-- OfftakeCommitment — Cam kết bao tiêu gắn với một khoản góp: khối lượng, giá chốt, cọc
CREATE TABLE dbo.offtake_commitment (
    offtake_id                   BIGINT IDENTITY(1,1) NOT NULL,
    contribution_id              BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    grade_id                     BIGINT NOT NULL,
    committed_qty_kg             DECIMAL(12,3) NOT NULL,
    fixed_unit_price             DECIMAL(18,0) NOT NULL,
    deposit_amount               DECIMAL(18,0) NOT NULL,
    deposit_status               VARCHAR(20) NOT NULL CONSTRAINT df_offtake_commitment_deposit_status DEFAULT ('Pending'),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_offtake_commitment_status DEFAULT ('PendingHarvest'),
    window_opens_at              DATETIMEOFFSET(3) NULL,
    window_expires_at            DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_offtake_commitment_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_offtake_commitment_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_offtake_commitment PRIMARY KEY (offtake_id),
    CONSTRAINT uq_offtake_commitment_contribution_id UNIQUE (contribution_id),
    CONSTRAINT ck_offtake_commitment_committed_qty_kg CHECK (committed_qty_kg > 0),
    CONSTRAINT ck_offtake_commitment_fixed_unit_price CHECK (fixed_unit_price > 0),
    CONSTRAINT ck_offtake_commitment_deposit_amount CHECK (deposit_amount > 0),
    CONSTRAINT ck_offtake_commitment_deposit_status CHECK (deposit_status IN ('Pending', 'Held', 'Applied', 'Forfeited', 'Refunded')),
    CONSTRAINT ck_offtake_commitment_status CHECK (status IN ('PendingHarvest', 'WindowOpen', 'Fulfilled', 'Expired', 'Cancelled')),
    CONSTRAINT ck_offtake_window CHECK (window_expires_at IS NULL OR window_expires_at > window_opens_at)
);
GO
-- ProductionLog — Nhật ký vận hành hằng ngày của lô
CREATE TABLE dbo.production_log (
    production_log_id            BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    log_date                     DATE NOT NULL,
    water_temp_c                 DECIMAL(4,1) NULL,
    salinity_ppt                 DECIMAL(4,1) NULL,
    ph                           DECIMAL(3,1) NULL,
    feed_kg                      DECIMAL(12,3) NULL,
    note                         NVARCHAR(500) NULL,
    source                       VARCHAR(20) NOT NULL,
    plausibility_flag            VARCHAR(20) NOT NULL CONSTRAINT df_production_log_plausibility_flag DEFAULT ('Ok'),
    verified_at                  DATETIMEOFFSET(3) NULL,
    recorded_by                  BIGINT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_production_log_received_at DEFAULT (SYSDATETIMEOFFSET()),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_production_log_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_production_log PRIMARY KEY (production_log_id),
    CONSTRAINT ux_production_log_day UNIQUE (batch_id, log_date, source),
    CONSTRAINT ck_production_log_source CHECK (source IN ('FarmApi', 'Manual')),
    CONSTRAINT ck_production_log_plausibility_flag CHECK (plausibility_flag IN ('Ok', 'OutOfRange', 'Inconsistent'))
);
GO
-- SlotEvent — Sự kiện của từng ô nuôi: thả giống, lột xác, hao hụt, thả bù, thu hoạch
CREATE TABLE dbo.slot_event (
    slot_event_id                BIGINT IDENTITY(1,1) NOT NULL,
    slot_allocation_id           BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    event_type                   VARCHAR(20) NOT NULL,
    occurred_at                  DATETIMEOFFSET(3) NOT NULL,
    quantity                     SMALLINT NOT NULL CONSTRAINT df_slot_event_quantity DEFAULT (1),
    note                         NVARCHAR(300) NULL,
    source                       VARCHAR(20) NOT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_slot_event_received_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_slot_event PRIMARY KEY (slot_event_id),
    CONSTRAINT ck_slot_event_quantity CHECK (quantity > 0),
    CONSTRAINT ck_slot_event_event_type CHECK (event_type IN ('Stocked', 'Molted', 'Mortality', 'Restocked', 'Harvested', 'Relocated')),
    CONSTRAINT ck_slot_event_source CHECK (source IN ('FarmApi', 'Manual'))
);
GO
-- Evidence — Ảnh/video bằng chứng nuôi: chụp trực tiếp trong ứng dụng, nhận qua API hệ thống trại, hoặc chứng từ tải lên [v1.1]
CREATE TABLE dbo.evidence (
    evidence_id                  BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    slot_event_id                BIGINT NULL,
    tranche_id                   BIGINT NULL,
    slot_id                      BIGINT NULL,
    capture_request_id           BIGINT NULL,
    media_type                   VARCHAR(20) NOT NULL,
    file_uri                     NVARCHAR(400) NOT NULL,
    sha256                       CHAR(64) NOT NULL,
    perceptual_hash              VARCHAR(64) NULL,
    captured_at                  DATETIMEOFFSET(3) NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_evidence_received_at DEFAULT (SYSDATETIMEOFFSET()),
    latitude                     DECIMAL(9,6) NULL,
    longitude                    DECIMAL(9,6) NULL,
    source                       VARCHAR(20) NOT NULL,
    partner_label                NVARCHAR(100) NULL,
    risk_score                   DECIMAL(5,2) NULL,
    review_status                VARCHAR(20) NOT NULL CONSTRAINT df_evidence_review_status DEFAULT ('Accepted'),
    explanation                  NVARCHAR(1000) NULL,
    explained_at                 DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_evidence_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_evidence PRIMARY KEY (evidence_id),
    CONSTRAINT ck_evidence_media_type CHECK (media_type IN ('Photo', 'Video', 'Invoice')),
    CONSTRAINT ck_evidence_source CHECK (source IN ('FarmApi', 'InAppCapture', 'DocumentUpload')),
    CONSTRAINT ck_evidence_review_status CHECK (review_status IN ('Accepted', 'Watch', 'Flagged', 'Rejected')),
    CONSTRAINT ck_evidence_in_app_capture CHECK (source <> 'InAppCapture' OR (media_type IN ('Photo', 'Video') AND captured_at IS NOT NULL)),
    CONSTRAINT ck_evidence_document_upload CHECK (source <> 'DocumentUpload' OR media_type = 'Invoice'),
    CONSTRAINT ck_evidence_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_evidence_longitude CHECK (longitude BETWEEN -180 AND 180)
);
GO
-- CaptureRequest — Yêu cầu chụp đột xuất một ô, có hạn; hệ thống chọn ô ngẫu nhiên [v1.1]
CREATE TABLE dbo.capture_request (
    capture_request_id           BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    slot_id                      BIGINT NOT NULL,
    requested_at                 DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_capture_request_requested_at DEFAULT (SYSDATETIMEOFFSET()),
    due_at                       DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_capture_request_status DEFAULT ('Open'),
    fulfilled_at                 DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_capture_request_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_capture_request PRIMARY KEY (capture_request_id),
    CONSTRAINT ck_capture_request_due_at CHECK (due_at > requested_at),
    CONSTRAINT ck_capture_request_status CHECK (status IN ('Open', 'Fulfilled', 'Expired')),
    CONSTRAINT ck_capture_request_fulfilled CHECK (status <> 'Fulfilled' OR fulfilled_at IS NOT NULL)
);
GO
-- EvidenceDetection — Kết quả mô hình nhận diện cua trên một ảnh; chỉ là một tín hiệu trong điểm rủi ro [v1.1]
CREATE TABLE dbo.evidence_detection (
    detection_id                 BIGINT IDENTITY(1,1) NOT NULL,
    evidence_id                  BIGINT NOT NULL,
    model_version                VARCHAR(50) NOT NULL,
    crab_detected                BIT NOT NULL,
    confidence                   DECIMAL(5,4) NOT NULL,
    bbox_json                    NVARCHAR(400) NULL,
    detected_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_evidence_detection_detected_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_evidence_detection PRIMARY KEY (detection_id),
    CONSTRAINT ux_evidence_detection_model UNIQUE (evidence_id, model_version),
    CONSTRAINT ck_evidence_detection_confidence CHECK (confidence BETWEEN 0 AND 1)
);
GO
-- EvidenceReview — Kết luận của Kiểm định viên cho bằng chứng bị gắn cờ; hồ sơ nặng có hai người xét độc lập [v1.1]
CREATE TABLE dbo.evidence_review (
    evidence_review_id           BIGINT IDENTITY(1,1) NOT NULL,
    evidence_id                  BIGINT NOT NULL,
    reviewer_id                  BIGINT NOT NULL,
    verdict                      VARCHAR(20) NOT NULL,
    note                         NVARCHAR(500) NULL,
    reviewed_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_evidence_review_reviewed_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_evidence_review PRIMARY KEY (evidence_review_id),
    CONSTRAINT ux_evidence_review_reviewer UNIQUE (evidence_id, reviewer_id),
    CONSTRAINT ck_evidence_review_verdict CHECK (verdict IN ('Pass', 'Fail', 'NeedMoreEvidence'))
);
GO
-- Alert — Cảnh báo vận hành, có hạn xác nhận và tự leo thang
CREATE TABLE dbo.alert (
    alert_id                     BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    alert_type                   VARCHAR(20) NOT NULL,
    severity                     VARCHAR(20) NOT NULL,
    message                      NVARCHAR(300) NOT NULL,
    raised_at                    DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_alert_raised_at DEFAULT (SYSDATETIMEOFFSET()),
    ack_deadline                 DATETIMEOFFSET(3) NOT NULL,
    acknowledged_at              DATETIMEOFFSET(3) NULL,
    acknowledged_by              BIGINT NULL,
    response_note                NVARCHAR(300) NULL,
    escalated_at                 DATETIMEOFFSET(3) NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_alert_status DEFAULT ('Open'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_alert_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_alert_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_alert PRIMARY KEY (alert_id),
    CONSTRAINT ck_alert_alert_type CHECK (alert_type IN ('Mortality', 'WaterQuality', 'MilestoneDelay', 'LowStock', 'DataSilence', 'EvidenceFlag')),
    CONSTRAINT ck_alert_severity CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT ck_alert_status CHECK (status IN ('Open', 'Acknowledged', 'Escalated', 'Resolved'))
);
GO
-- Harvest — Khai báo thu hoạch của lô
CREATE TABLE dbo.harvest (
    harvest_id                   BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    harvested_at                 DATETIMEOFFSET(3) NOT NULL,
    harvested_count              INT NOT NULL,
    total_weight_kg              DECIMAL(12,3) NOT NULL,
    declared_by                  BIGINT NOT NULL,
    note                         NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_harvest_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_harvest PRIMARY KEY (harvest_id),
    CONSTRAINT ux_harvest_batch UNIQUE (harvest_id, batch_id),
    CONSTRAINT ck_harvest_harvested_count CHECK (harvested_count >= 0),
    CONSTRAINT ck_harvest_total_weight_kg CHECK (total_weight_kg >= 0)
);
GO
-- CrabItem — Từng con cua, có mã từ lúc thả giống; lúc nuôi gắn với ô, từ lúc thu hoạch gắn với tem [v1.1]
CREATE TABLE dbo.crab_item (
    crab_item_id                 BIGINT IDENTITY(1,1) NOT NULL,
    item_uuid                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_crab_item_item_uuid DEFAULT (NEWID()),
    batch_id                     BIGINT NOT NULL,
    slot_allocation_id           BIGINT NOT NULL,
    stocked_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_item_stocked_at DEFAULT (SYSDATETIMEOFFSET()),
    replaces_crab_item_id        BIGINT NULL,
    harvest_id                   BIGINT NULL,
    grade_id                     BIGINT NULL,
    weight_g                     SMALLINT NULL,
    order_line_id                BIGINT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_crab_item_status DEFAULT ('Growing'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_item_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_item_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_crab_item PRIMARY KEY (crab_item_id),
    CONSTRAINT uq_crab_item_item_uuid UNIQUE (item_uuid),
    CONSTRAINT ck_crab_item_weight_g CHECK (weight_g > 0),
    CONSTRAINT ck_crab_item_status CHECK (status IN ('Growing', 'Dead', 'InStock', 'Packed', 'Sold', 'DeliveredInKind', 'Lost')),
    CONSTRAINT ck_crab_item_harvest_fields CHECK ((status IN ('Growing', 'Dead') AND harvest_id IS NULL AND order_line_id IS NULL)
        OR (status NOT IN ('Growing', 'Dead') AND harvest_id IS NOT NULL AND grade_id IS NOT NULL AND weight_g IS NOT NULL)),
    CONSTRAINT ck_crab_item_replaces CHECK (replaces_crab_item_id <> crab_item_id)
);
GO
-- CrabTag — Tem truy xuất in tại chỗ khi thu hoạch; mỗi con cua có tối đa một tem đang hiệu lực [v1.1]
CREATE TABLE dbo.crab_tag (
    tag_id                       BIGINT IDENTITY(1,1) NOT NULL,
    crab_item_id                 BIGINT NOT NULL,
    tag_code                     CHAR(12) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_crab_tag_status DEFAULT ('Printed'),
    printed_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_tag_printed_at DEFAULT (SYSDATETIMEOFFSET()),
    printed_by                   BIGINT NOT NULL,
    activated_at                 DATETIMEOFFSET(3) NULL,
    activation_evidence_id       BIGINT NULL,
    voided_at                    DATETIMEOFFSET(3) NULL,
    void_reason                  NVARCHAR(200) NULL,
    CONSTRAINT pk_crab_tag PRIMARY KEY (tag_id),
    CONSTRAINT uq_crab_tag_tag_code UNIQUE (tag_code),
    CONSTRAINT ck_crab_tag_status CHECK (status IN ('Printed', 'Active', 'Void')),
    CONSTRAINT ck_crab_tag_active CHECK (status <> 'Active' OR (activated_at IS NOT NULL AND activation_evidence_id IS NOT NULL)),
    CONSTRAINT ck_crab_tag_void CHECK (status <> 'Void' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
GO
-- CrabItemEvent — Lịch sử từng con cua từ lúc thả tới tay người mua; chỉ ghi thêm [v1.1]
CREATE TABLE dbo.crab_item_event (
    crab_item_event_id           BIGINT IDENTITY(1,1) NOT NULL,
    crab_item_id                 BIGINT NOT NULL,
    event_type                   VARCHAR(20) NOT NULL,
    occurred_at                  DATETIMEOFFSET(3) NOT NULL,
    actor_id                     BIGINT NULL,
    evidence_id                  BIGINT NULL,
    tag_id                       BIGINT NULL,
    note                         NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_item_event_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_crab_item_event PRIMARY KEY (crab_item_event_id),
    CONSTRAINT ck_crab_item_event_event_type CHECK (event_type IN ('Stocked', 'Died', 'Harvested', 'TagPrinted', 'TagActivated', 'TagVoided', 'StoredIn', 'Packed', 'Delivered', 'Lost'))
);
GO
-- TagScan — Lượt quét tem của người mua; dùng để phát hiện tem bị sao chép [v1.1]
CREATE TABLE dbo.tag_scan (
    tag_scan_id                  BIGINT IDENTITY(1,1) NOT NULL,
    tag_id                       BIGINT NOT NULL,
    scanned_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_tag_scan_scanned_at DEFAULT (SYSDATETIMEOFFSET()),
    scanned_by                   BIGINT NULL,
    is_order_owner               BIT NOT NULL CONSTRAINT df_tag_scan_is_order_owner DEFAULT (0),
    CONSTRAINT pk_tag_scan PRIMARY KEY (tag_scan_id)
);
GO
-- ProductGrade — Danh mục phân loại cua theo kích cỡ, chất lượng
CREATE TABLE dbo.product_grade (
    grade_id                     BIGINT IDENTITY(1,1) NOT NULL,
    grade_code                   VARCHAR(20) NOT NULL,
    grade_name                   NVARCHAR(100) NOT NULL,
    min_weight_g                 SMALLINT NULL,
    max_weight_g                 SMALLINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_product_grade_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_product_grade PRIMARY KEY (grade_id),
    CONSTRAINT uq_product_grade_grade_code UNIQUE (grade_code),
    CONSTRAINT ck_grade_weight CHECK (max_weight_g IS NULL OR min_weight_g IS NULL OR max_weight_g > min_weight_g)
);
GO
-- ProductListing — Mặt hàng đăng bán của một lô theo một phân loại
CREATE TABLE dbo.product_listing (
    listing_id                   BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    grade_id                     BIGINT NOT NULL,
    title                        NVARCHAR(200) NOT NULL,
    storage_type                 VARCHAR(20) NOT NULL CONSTRAINT df_product_listing_storage_type DEFAULT ('Fresh'),
    frozen_at                    DATETIMEOFFSET(3) NULL,
    current_price_per_kg         DECIMAL(18,0) NOT NULL,
    stock_qty_kg                 DECIMAL(12,3) NOT NULL CONSTRAINT df_product_listing_stock_qty_kg DEFAULT (0),
    reserved_qty_kg              DECIMAL(12,3) NOT NULL CONSTRAINT df_product_listing_reserved_qty_kg DEFAULT (0),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_product_listing_status DEFAULT ('Draft'),
    published_at                 DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_product_listing_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_product_listing_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_product_listing PRIMARY KEY (listing_id),
    CONSTRAINT ux_listing_batch UNIQUE (listing_id, batch_id),
    CONSTRAINT ux_listing_grade UNIQUE (batch_id, grade_id, storage_type),
    CONSTRAINT ck_product_listing_current_price_per_kg CHECK (current_price_per_kg > 0),
    CONSTRAINT ck_product_listing_stock_qty_kg CHECK (stock_qty_kg >= 0),
    CONSTRAINT ck_product_listing_reserved_qty_kg CHECK (reserved_qty_kg >= 0),
    CONSTRAINT ck_product_listing_storage_type CHECK (storage_type IN ('Fresh', 'Frozen')),
    CONSTRAINT ck_product_listing_status CHECK (status IN ('Draft', 'Published', 'SoldOut', 'Closed')),
    CONSTRAINT ck_listing_reserved CHECK (reserved_qty_kg <= stock_qty_kg)
);
GO
-- PriceHistory — Lịch sử đổi giá công khai của mặt hàng
CREATE TABLE dbo.price_history (
    price_history_id             BIGINT IDENTITY(1,1) NOT NULL,
    listing_id                   BIGINT NOT NULL,
    price_per_kg                 DECIMAL(18,0) NOT NULL,
    effective_from               DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_price_history_effective_from DEFAULT (SYSDATETIMEOFFSET()),
    changed_by                   BIGINT NOT NULL,
    flagged_abnormal             BIT NOT NULL CONSTRAINT df_price_history_flagged_abnormal DEFAULT (0),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_price_history_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_price_history PRIMARY KEY (price_history_id),
    CONSTRAINT ck_price_history_price_per_kg CHECK (price_per_kg > 0)
);
GO
-- SalesOrder — Đơn hàng; mỗi đơn thuộc đúng một lô (giỏ hàng nhiều lô được tách đơn)
CREATE TABLE dbo.sales_order (
    order_id                     BIGINT IDENTITY(1,1) NOT NULL,
    order_no                     VARCHAR(20) NOT NULL,
    customer_id                  BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    order_type                   VARCHAR(20) NOT NULL CONSTRAINT df_sales_order_order_type DEFAULT ('Retail'),
    offtake_id                   BIGINT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_sales_order_status DEFAULT ('PendingPayment'),
    total_amount                 DECIMAL(18,0) NOT NULL,
    deposit_amount               DECIMAL(18,0) NULL,
    balance_due_at               DATETIMEOFFSET(3) NULL,
    recipient_name               NVARCHAR(150) NOT NULL,
    recipient_phone              VARCHAR(15) NOT NULL,
    shipping_address             NVARCHAR(300) NOT NULL,
    placed_at                    DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sales_order_placed_at DEFAULT (SYSDATETIMEOFFSET()),
    paid_at                      DATETIMEOFFSET(3) NULL,
    shipped_at                   DATETIMEOFFSET(3) NULL,
    delivered_at                 DATETIMEOFFSET(3) NULL,
    return_window_ends_at        DATETIMEOFFSET(3) NULL,
    completed_at                 DATETIMEOFFSET(3) NULL,
    cancelled_at                 DATETIMEOFFSET(3) NULL,
    cancel_reason                NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sales_order_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sales_order_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_sales_order PRIMARY KEY (order_id),
    CONSTRAINT ux_order_batch UNIQUE (order_id, batch_id),
    CONSTRAINT uq_sales_order_order_no UNIQUE (order_no),
    CONSTRAINT ck_sales_order_total_amount CHECK (total_amount >= 0),
    CONSTRAINT ck_sales_order_order_type CHECK (order_type IN ('Retail', 'PreOrder', 'Offtake')),
    CONSTRAINT ck_sales_order_status CHECK (status IN ('PendingPayment', 'DepositPaid', 'Paid', 'Packed', 'Shipping', 'Delivered', 'Completed', 'Cancelled', 'Returned')),
    CONSTRAINT ck_order_offtake CHECK ((order_type = 'Offtake' AND offtake_id IS NOT NULL) OR (order_type <> 'Offtake' AND offtake_id IS NULL)),
    CONSTRAINT ck_order_deposit CHECK (order_type <> 'PreOrder' OR deposit_amount IS NOT NULL)
);
GO
-- OrderLine — Dòng hàng trong đơn; mặt hàng phải cùng lô với đơn
CREATE TABLE dbo.order_line (
    order_line_id                BIGINT IDENTITY(1,1) NOT NULL,
    order_id                     BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    listing_id                   BIGINT NOT NULL,
    quantity_kg                  DECIMAL(12,3) NOT NULL,
    unit_price                   DECIMAL(18,0) NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_order_line_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_order_line PRIMARY KEY (order_line_id),
    CONSTRAINT ux_order_line_batch UNIQUE (order_line_id, batch_id),
    CONSTRAINT ck_order_line_quantity_kg CHECK (quantity_kg > 0),
    CONSTRAINT ck_order_line_unit_price CHECK (unit_price >= 0)
);
GO
-- StockReservation — Giữ chỗ tồn kho có thời hạn khi đặt hàng
CREATE TABLE dbo.stock_reservation (
    stock_reservation_id         BIGINT IDENTITY(1,1) NOT NULL,
    order_line_id                BIGINT NOT NULL,
    listing_id                   BIGINT NOT NULL,
    quantity_kg                  DECIMAL(12,3) NOT NULL,
    expires_at                   DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_stock_reservation_status DEFAULT ('Active'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_stock_reservation_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_stock_reservation_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_stock_reservation PRIMARY KEY (stock_reservation_id),
    CONSTRAINT uq_stock_reservation_order_line_id UNIQUE (order_line_id),
    CONSTRAINT ck_stock_reservation_quantity_kg CHECK (quantity_kg > 0),
    CONSTRAINT ck_stock_reservation_status CHECK (status IN ('Active', 'Committed', 'Released'))
);
GO
-- Complaint — Khiếu nại đơn hàng và cách giải quyết
CREATE TABLE dbo.complaint (
    complaint_id                 BIGINT IDENTITY(1,1) NOT NULL,
    order_id                     BIGINT NOT NULL,
    complaint_type               VARCHAR(20) NOT NULL,
    description                  NVARCHAR(1000) NOT NULL,
    evidence_uri                 NVARCHAR(400) NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_complaint_status DEFAULT ('Open'),
    resolution                   VARCHAR(20) NULL,
    refund_amount                DECIMAL(18,0) NULL,
    resolved_by                  BIGINT NULL,
    opened_at                    DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_complaint_opened_at DEFAULT (SYSDATETIMEOFFSET()),
    resolved_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_complaint_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_complaint_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_complaint PRIMARY KEY (complaint_id),
    CONSTRAINT ck_complaint_refund_amount CHECK (refund_amount IS NULL OR refund_amount >= 0),
    CONSTRAINT ck_complaint_complaint_type CHECK (complaint_type IN ('LateDelivery', 'WrongGrade', 'Damaged', 'NotReceived', 'Other')),
    CONSTRAINT ck_complaint_status CHECK (status IN ('Open', 'OperatorResponded', 'Escalated', 'Resolved', 'Rejected')),
    CONSTRAINT ck_complaint_resolution CHECK (resolution IN ('Refund', 'Compensation', 'Replacement', 'NoAction'))
);
GO
-- ProductRating — Đánh giá của khách cho một đơn đã nhận
CREATE TABLE dbo.product_rating (
    rating_id                    BIGINT IDENTITY(1,1) NOT NULL,
    order_id                     BIGINT NOT NULL,
    stars                        TINYINT NOT NULL,
    comment                      NVARCHAR(500) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_product_rating_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_product_rating PRIMARY KEY (rating_id),
    CONSTRAINT uq_product_rating_order_id UNIQUE (order_id),
    CONSTRAINT ck_product_rating_stars CHECK (stars BETWEEN 1 AND 5)
);
GO
-- PaymentRequest — Chỉ dẫn thu tiền (mã VietQR) vào tài khoản lô; gắn với đúng một nghĩa vụ
CREATE TABLE dbo.payment_request (
    payment_request_id           BIGINT IDENTITY(1,1) NOT NULL,
    reference_code               VARCHAR(30) NOT NULL,
    batch_account_id             BIGINT NOT NULL,
    purpose                      VARCHAR(20) NOT NULL,
    amount                       DECIMAL(18,0) NOT NULL,
    contribution_id              BIGINT NULL,
    order_id                     BIGINT NULL,
    offtake_id                   BIGINT NULL,
    expires_at                   DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_payment_request_status DEFAULT ('Pending'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payment_request_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payment_request_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_payment_request PRIMARY KEY (payment_request_id),
    CONSTRAINT uq_payment_request_reference_code UNIQUE (reference_code),
    CONSTRAINT ck_payment_request_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_request_purpose CHECK (purpose IN ('Contribution', 'OrderPayment', 'PreOrderDeposit', 'PreOrderBalance', 'OfftakeDeposit', 'OfftakePayment')),
    CONSTRAINT ck_payment_request_status CHECK (status IN ('Pending', 'Paid', 'Expired', 'Cancelled')),
    CONSTRAINT ck_payment_request_target CHECK ((CASE WHEN contribution_id IS NULL THEN 0 ELSE 1 END + CASE WHEN order_id IS NULL THEN 0 ELSE 1 END + CASE WHEN offtake_id IS NULL THEN 0 ELSE 1 END) = 1)
);
GO
-- PaymentInstruction — Lệnh chi CrabShare gửi tổ chức trung gian: giải ngân, chi trả, hoàn tiền, nộp thuế
CREATE TABLE dbo.payment_instruction (
    instruction_id               BIGINT IDENTITY(1,1) NOT NULL,
    batch_account_id             BIGINT NOT NULL,
    instruction_type             VARCHAR(20) NOT NULL,
    amount                       DECIMAL(18,0) NOT NULL,
    payout_account_id            BIGINT NULL,
    beneficiary_note             NVARCHAR(200) NULL,
    tranche_id                   BIGINT NULL,
    settlement_line_id           BIGINT NULL,
    contribution_id              BIGINT NULL,
    order_id                     BIGINT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_payment_instruction_status DEFAULT ('Created'),
    sent_at                      DATETIMEOFFSET(3) NULL,
    completed_at                 DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payment_instruction_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payment_instruction_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_payment_instruction PRIMARY KEY (instruction_id),
    CONSTRAINT ck_payment_instruction_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_instruction_instruction_type CHECK (instruction_type IN ('Disbursement', 'Payout', 'Refund', 'TaxPayment')),
    CONSTRAINT ck_payment_instruction_status CHECK (status IN ('Created', 'Sent', 'Succeeded', 'Failed', 'Disputed'))
);
GO
-- ProviderTransaction — Giao dịch do tổ chức trung gian báo về (webhook); chống trùng theo mã giao dịch
CREATE TABLE dbo.provider_transaction (
    transaction_id               BIGINT IDENTITY(1,1) NOT NULL,
    provider_txn_id              VARCHAR(80) NOT NULL,
    batch_account_id             BIGINT NOT NULL,
    direction                    VARCHAR(20) NOT NULL,
    amount                       DECIMAL(18,0) NOT NULL,
    reference_code               VARCHAR(60) NULL,
    payment_request_id           BIGINT NULL,
    instruction_id               BIGINT NULL,
    match_status                 VARCHAR(20) NOT NULL CONSTRAINT df_provider_transaction_match_status DEFAULT ('Unmatched'),
    occurred_at                  DATETIMEOFFSET(3) NOT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_provider_transaction_received_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_provider_transaction PRIMARY KEY (transaction_id),
    CONSTRAINT uq_provider_transaction_provider_txn_id UNIQUE (provider_txn_id),
    CONSTRAINT ck_provider_transaction_amount CHECK (amount > 0),
    CONSTRAINT ck_provider_transaction_direction CHECK (direction IN ('In', 'Out')),
    CONSTRAINT ck_provider_transaction_match_status CHECK (match_status IN ('Matched', 'Unmatched', 'LatePayment')),
    CONSTRAINT ck_txn_link CHECK ((direction = 'In' AND instruction_id IS NULL) OR (direction = 'Out' AND payment_request_id IS NULL))
);
GO
-- Settlement — Bảng quyết toán của lô; bất biến sau khi được duyệt
CREATE TABLE dbo.settlement (
    settlement_id                BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    revision_no                  SMALLINT NOT NULL CONSTRAINT df_settlement_revision_no DEFAULT (1),
    actual_revenue               DECIMAL(18,0) NOT NULL,
    locked_standard_cost         DECIMAL(18,0) NOT NULL,
    revenue_pool                 DECIMAL(18,0) NOT NULL,
    operator_share_pct           DECIMAL(5,2) NOT NULL,
    operator_remuneration        DECIMAL(18,0) NOT NULL,
    depreciation_amount          DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_depreciation_amount DEFAULT (0),
    tax_total                    DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_tax_total DEFAULT (0),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_settlement_status DEFAULT ('Draft'),
    proposed_at                  DATETIMEOFFSET(3) NULL,
    feedback_deadline            DATETIMEOFFSET(3) NULL,
    approved_by                  BIGINT NULL,
    approved_at                  DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_settlement_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_settlement_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_settlement PRIMARY KEY (settlement_id),
    CONSTRAINT uq_settlement_batch_id UNIQUE (batch_id),
    CONSTRAINT ck_settlement_actual_revenue CHECK (actual_revenue >= 0),
    CONSTRAINT ck_settlement_locked_standard_cost CHECK (locked_standard_cost > 0),
    CONSTRAINT ck_settlement_operator_remuneration CHECK (operator_remuneration >= 0),
    CONSTRAINT ck_settlement_status CHECK (status IN ('Draft', 'Proposed', 'Disputed', 'Approved', 'PaidOut', 'Closed')),
    CONSTRAINT ck_settlement_pool CHECK (revenue_pool = actual_revenue - locked_standard_cost),
    CONSTRAINT ck_settlement_remuneration CHECK (revenue_pool > 0 OR operator_remuneration = 0),
    CONSTRAINT ck_settlement_deadline CHECK (feedback_deadline IS NULL OR proposed_at IS NULL OR feedback_deadline >= DATEADD(DAY, 7, proposed_at))
);
GO
-- SettlementLine — Phần chia của từng nhà đầu tư; tổng khớp Revenue Pool tới từng đồng
CREATE TABLE dbo.settlement_line (
    settlement_line_id           BIGINT IDENTITY(1,1) NOT NULL,
    settlement_id                BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    investor_id                  BIGINT NOT NULL,
    capital_return               DECIMAL(18,0) NOT NULL,
    profit_share                 DECIMAL(18,0) NOT NULL,
    tax_withheld                 DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_line_tax_withheld DEFAULT (0),
    net_payout                   DECIMAL(18,0) NOT NULL,
    in_kind_qty_kg               DECIMAL(12,3) NOT NULL CONSTRAINT df_settlement_line_in_kind_qty_kg DEFAULT (0),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_settlement_line_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_settlement_line PRIMARY KEY (settlement_line_id),
    CONSTRAINT ux_settlement_line_investor UNIQUE (settlement_id, investor_id),
    CONSTRAINT ck_settlement_line_capital_return CHECK (capital_return >= 0),
    CONSTRAINT ck_settlement_line_tax_withheld CHECK (tax_withheld >= 0),
    CONSTRAINT ck_settlement_line_net_payout CHECK (net_payout >= 0),
    CONSTRAINT ck_settlement_line_loss CHECK (capital_return + profit_share >= 0),
    CONSTRAINT ck_settlement_line_net CHECK (net_payout = capital_return + profit_share - tax_withheld)
);
GO
-- SettlementFeedback — Phản hồi / tranh chấp về bảng quyết toán trong cửa sổ 7 ngày
CREATE TABLE dbo.settlement_feedback (
    feedback_id                  BIGINT IDENTITY(1,1) NOT NULL,
    settlement_id                BIGINT NOT NULL,
    user_id                      BIGINT NOT NULL,
    content                      NVARCHAR(1000) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_settlement_feedback_status DEFAULT ('Open'),
    response                     NVARCHAR(1000) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_settlement_feedback_created_at DEFAULT (SYSDATETIMEOFFSET()),
    responded_at                 DATETIMEOFFSET(3) NULL,
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_settlement_feedback_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_settlement_feedback PRIMARY KEY (feedback_id),
    CONSTRAINT ck_settlement_feedback_status CHECK (status IN ('Open', 'Answered', 'Withdrawn', 'Unresolved'))
);
GO
-- AuditLog — Nhật ký chỉ ghi thêm cho mọi thay đổi về tiền, hợp đồng, Standard Cost; nối chuỗi băm
CREATE TABLE dbo.audit_log (
    audit_id                     BIGINT IDENTITY(1,1) NOT NULL,
    entity_type                  VARCHAR(50) NOT NULL,
    entity_id                    BIGINT NOT NULL,
    action_type                  VARCHAR(30) NOT NULL,
    old_value                    NVARCHAR(MAX) NULL,
    new_value                    NVARCHAR(MAX) NULL,
    actor_user_id                BIGINT NULL,
    occurred_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_audit_log_occurred_at DEFAULT (SYSDATETIMEOFFSET()),
    prev_hash                    CHAR(64) NULL,
    row_hash                     CHAR(64) NOT NULL,
    CONSTRAINT pk_audit_log PRIMARY KEY (audit_id)
);
GO

/* ---------- 2. KHOÁ NGOẠI (tạo sau để không phụ thuộc thứ tự bảng) ---------- */
ALTER TABLE dbo.app_user_role ADD CONSTRAINT fk_app_user_role_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id) ON DELETE CASCADE;
ALTER TABLE dbo.investor ADD CONSTRAINT fk_investor_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id) ON DELETE CASCADE;
ALTER TABLE dbo.customer ADD CONSTRAINT fk_customer_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id) ON DELETE CASCADE;
ALTER TABLE dbo.customer_address ADD CONSTRAINT fk_customer_address_customer_id FOREIGN KEY (customer_id) REFERENCES dbo.customer (user_id) ON DELETE CASCADE;
ALTER TABLE dbo.operator ADD CONSTRAINT fk_operator_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.operator_member ADD CONSTRAINT fk_operator_member_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id) ON DELETE CASCADE;
ALTER TABLE dbo.operator_member ADD CONSTRAINT fk_operator_member_operator_id FOREIGN KEY (operator_id) REFERENCES dbo.operator (operator_id);
ALTER TABLE dbo.kyc_check ADD CONSTRAINT fk_kyc_check_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.kyc_check ADD CONSTRAINT fk_kyc_check_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.payout_account ADD CONSTRAINT fk_payout_account_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.payout_account ADD CONSTRAINT fk_payout_account_owner_operator_id FOREIGN KEY (owner_operator_id) REFERENCES dbo.operator (operator_id);
ALTER TABLE dbo.risk_acknowledgement ADD CONSTRAINT fk_risk_acknowledgement_investor_id FOREIGN KEY (investor_id) REFERENCES dbo.investor (user_id);
ALTER TABLE dbo.risk_acknowledgement ADD CONSTRAINT fk_risk_acknowledgement_risk_disclosure_id FOREIGN KEY (risk_disclosure_id) REFERENCES dbo.risk_disclosure (risk_disclosure_id);
ALTER TABLE dbo.physical_slot ADD CONSTRAINT fk_physical_slot_operator_id FOREIGN KEY (operator_id) REFERENCES dbo.operator (operator_id);
ALTER TABLE dbo.slot_allocation ADD CONSTRAINT fk_slot_allocation_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.slot_allocation ADD CONSTRAINT fk_slot_allocation_slot_id FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot (slot_id);
ALTER TABLE dbo.batch ADD CONSTRAINT fk_batch_operator_id FOREIGN KEY (operator_id) REFERENCES dbo.operator (operator_id);
ALTER TABLE dbo.batch ADD CONSTRAINT fk_batch_fee_tier_id FOREIGN KEY (fee_tier_id) REFERENCES dbo.fee_tier (fee_tier_id);
ALTER TABLE dbo.batch ADD CONSTRAINT fk_batch_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.standard_cost_version ADD CONSTRAINT fk_standard_cost_version_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.standard_cost_version ADD CONSTRAINT fk_standard_cost_version_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.standard_cost_item ADD CONSTRAINT fk_standard_cost_item_cost_version_id FOREIGN KEY (cost_version_id) REFERENCES dbo.standard_cost_version (cost_version_id) ON DELETE CASCADE;
ALTER TABLE dbo.disbursement_tranche ADD CONSTRAINT fk_disbursement_tranche_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.batch_account ADD CONSTRAINT fk_batch_account_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.contribution ADD CONSTRAINT fk_contribution_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.contribution ADD CONSTRAINT fk_contribution_investor_id FOREIGN KEY (investor_id) REFERENCES dbo.investor (user_id);
ALTER TABLE dbo.capital_share ADD CONSTRAINT fk_capital_share_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.capital_share ADD CONSTRAINT fk_capital_share_investor_id FOREIGN KEY (investor_id) REFERENCES dbo.investor (user_id);
ALTER TABLE dbo.investment_contract ADD CONSTRAINT fk_investment_contract_contribution_id FOREIGN KEY (contribution_id) REFERENCES dbo.contribution (contribution_id);
ALTER TABLE dbo.investment_contract ADD CONSTRAINT fk_investment_contract_template_id FOREIGN KEY (template_id) REFERENCES dbo.contract_template (template_id);
ALTER TABLE dbo.contract_signature ADD CONSTRAINT fk_contract_signature_contract_id FOREIGN KEY (contract_id) REFERENCES dbo.investment_contract (contract_id) ON DELETE CASCADE;
ALTER TABLE dbo.contract_signature ADD CONSTRAINT fk_contract_signature_signer_user_id FOREIGN KEY (signer_user_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.offtake_commitment ADD CONSTRAINT fk_offtake_commitment_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.offtake_commitment ADD CONSTRAINT fk_offtake_commitment_grade_id FOREIGN KEY (grade_id) REFERENCES dbo.product_grade (grade_id);
ALTER TABLE dbo.offtake_commitment ADD CONSTRAINT fk_offtake_commitment_contribution_id_batch_id FOREIGN KEY (contribution_id, batch_id) REFERENCES dbo.contribution (contribution_id, batch_id);
ALTER TABLE dbo.production_log ADD CONSTRAINT fk_production_log_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.production_log ADD CONSTRAINT fk_production_log_recorded_by FOREIGN KEY (recorded_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.slot_event ADD CONSTRAINT fk_slot_event_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.slot_event ADD CONSTRAINT fk_slot_event_slot_allocation_id_batch_id FOREIGN KEY (slot_allocation_id, batch_id) REFERENCES dbo.slot_allocation (slot_allocation_id, batch_id);
ALTER TABLE dbo.evidence ADD CONSTRAINT fk_evidence_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.evidence ADD CONSTRAINT fk_evidence_slot_event_id FOREIGN KEY (slot_event_id) REFERENCES dbo.slot_event (slot_event_id);
ALTER TABLE dbo.evidence ADD CONSTRAINT fk_evidence_tranche_id FOREIGN KEY (tranche_id) REFERENCES dbo.disbursement_tranche (tranche_id);
ALTER TABLE dbo.alert ADD CONSTRAINT fk_alert_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.alert ADD CONSTRAINT fk_alert_acknowledged_by FOREIGN KEY (acknowledged_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.harvest ADD CONSTRAINT fk_harvest_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.harvest ADD CONSTRAINT fk_harvest_declared_by FOREIGN KEY (declared_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_grade_id FOREIGN KEY (grade_id) REFERENCES dbo.product_grade (grade_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_harvest_id_batch_id FOREIGN KEY (harvest_id, batch_id) REFERENCES dbo.harvest (harvest_id, batch_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_slot_allocation_id_batch_id FOREIGN KEY (slot_allocation_id, batch_id) REFERENCES dbo.slot_allocation (slot_allocation_id, batch_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_order_line_id_batch_id FOREIGN KEY (order_line_id, batch_id) REFERENCES dbo.order_line (order_line_id, batch_id);
ALTER TABLE dbo.product_listing ADD CONSTRAINT fk_product_listing_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.product_listing ADD CONSTRAINT fk_product_listing_grade_id FOREIGN KEY (grade_id) REFERENCES dbo.product_grade (grade_id);
ALTER TABLE dbo.price_history ADD CONSTRAINT fk_price_history_listing_id FOREIGN KEY (listing_id) REFERENCES dbo.product_listing (listing_id);
ALTER TABLE dbo.price_history ADD CONSTRAINT fk_price_history_changed_by FOREIGN KEY (changed_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.sales_order ADD CONSTRAINT fk_sales_order_customer_id FOREIGN KEY (customer_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.sales_order ADD CONSTRAINT fk_sales_order_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.sales_order ADD CONSTRAINT fk_sales_order_offtake_id FOREIGN KEY (offtake_id) REFERENCES dbo.offtake_commitment (offtake_id);
ALTER TABLE dbo.order_line ADD CONSTRAINT fk_order_line_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.order_line ADD CONSTRAINT fk_order_line_order_id_batch_id FOREIGN KEY (order_id, batch_id) REFERENCES dbo.sales_order (order_id, batch_id) ON DELETE CASCADE;
ALTER TABLE dbo.order_line ADD CONSTRAINT fk_order_line_listing_id_batch_id FOREIGN KEY (listing_id, batch_id) REFERENCES dbo.product_listing (listing_id, batch_id);
ALTER TABLE dbo.stock_reservation ADD CONSTRAINT fk_stock_reservation_order_line_id FOREIGN KEY (order_line_id) REFERENCES dbo.order_line (order_line_id);
ALTER TABLE dbo.stock_reservation ADD CONSTRAINT fk_stock_reservation_listing_id FOREIGN KEY (listing_id) REFERENCES dbo.product_listing (listing_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT fk_complaint_order_id FOREIGN KEY (order_id) REFERENCES dbo.sales_order (order_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT fk_complaint_resolved_by FOREIGN KEY (resolved_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.product_rating ADD CONSTRAINT fk_product_rating_order_id FOREIGN KEY (order_id) REFERENCES dbo.sales_order (order_id);
ALTER TABLE dbo.payment_request ADD CONSTRAINT fk_payment_request_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_account (batch_account_id);
ALTER TABLE dbo.payment_request ADD CONSTRAINT fk_payment_request_contribution_id FOREIGN KEY (contribution_id) REFERENCES dbo.contribution (contribution_id);
ALTER TABLE dbo.payment_request ADD CONSTRAINT fk_payment_request_order_id FOREIGN KEY (order_id) REFERENCES dbo.sales_order (order_id);
ALTER TABLE dbo.payment_request ADD CONSTRAINT fk_payment_request_offtake_id FOREIGN KEY (offtake_id) REFERENCES dbo.offtake_commitment (offtake_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_account (batch_account_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_payout_account_id FOREIGN KEY (payout_account_id) REFERENCES dbo.payout_account (payout_account_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_tranche_id FOREIGN KEY (tranche_id) REFERENCES dbo.disbursement_tranche (tranche_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_settlement_line_id FOREIGN KEY (settlement_line_id) REFERENCES dbo.settlement_line (settlement_line_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_contribution_id FOREIGN KEY (contribution_id) REFERENCES dbo.contribution (contribution_id);
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT fk_payment_instruction_order_id FOREIGN KEY (order_id) REFERENCES dbo.sales_order (order_id);
ALTER TABLE dbo.provider_transaction ADD CONSTRAINT fk_provider_transaction_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_account (batch_account_id);
ALTER TABLE dbo.provider_transaction ADD CONSTRAINT fk_provider_transaction_payment_request_id FOREIGN KEY (payment_request_id) REFERENCES dbo.payment_request (payment_request_id);
ALTER TABLE dbo.provider_transaction ADD CONSTRAINT fk_provider_transaction_instruction_id FOREIGN KEY (instruction_id) REFERENCES dbo.payment_instruction (instruction_id);
ALTER TABLE dbo.settlement ADD CONSTRAINT fk_settlement_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.settlement ADD CONSTRAINT fk_settlement_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.settlement_line ADD CONSTRAINT fk_settlement_line_settlement_id FOREIGN KEY (settlement_id) REFERENCES dbo.settlement (settlement_id) ON DELETE CASCADE;
ALTER TABLE dbo.settlement_line ADD CONSTRAINT fk_settlement_line_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.settlement_line ADD CONSTRAINT fk_settlement_line_investor_id FOREIGN KEY (investor_id) REFERENCES dbo.investor (user_id);
ALTER TABLE dbo.settlement_line ADD CONSTRAINT fk_settlement_line_batch_id_investor_id FOREIGN KEY (batch_id, investor_id) REFERENCES dbo.capital_share (batch_id, investor_id);
ALTER TABLE dbo.settlement_feedback ADD CONSTRAINT fk_settlement_feedback_settlement_id FOREIGN KEY (settlement_id) REFERENCES dbo.settlement (settlement_id);
ALTER TABLE dbo.settlement_feedback ADD CONSTRAINT fk_settlement_feedback_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.audit_log ADD CONSTRAINT fk_audit_log_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES dbo.app_user (user_id);
GO
-- [v1.1] Bằng chứng, chụp đột xuất, nhận diện, truy xuất từng con
ALTER TABLE dbo.evidence ADD CONSTRAINT fk_evidence_slot_id FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot (slot_id);
ALTER TABLE dbo.evidence ADD CONSTRAINT fk_evidence_capture_request_id FOREIGN KEY (capture_request_id) REFERENCES dbo.capture_request (capture_request_id);
ALTER TABLE dbo.capture_request ADD CONSTRAINT fk_capture_request_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id);
ALTER TABLE dbo.capture_request ADD CONSTRAINT fk_capture_request_slot_id FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot (slot_id);
ALTER TABLE dbo.evidence_detection ADD CONSTRAINT fk_evidence_detection_evidence_id FOREIGN KEY (evidence_id) REFERENCES dbo.evidence (evidence_id);
ALTER TABLE dbo.evidence_review ADD CONSTRAINT fk_evidence_review_evidence_id FOREIGN KEY (evidence_id) REFERENCES dbo.evidence (evidence_id);
ALTER TABLE dbo.evidence_review ADD CONSTRAINT fk_evidence_review_reviewer_id FOREIGN KEY (reviewer_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.crab_item ADD CONSTRAINT fk_crab_item_replaces_crab_item_id FOREIGN KEY (replaces_crab_item_id) REFERENCES dbo.crab_item (crab_item_id);
ALTER TABLE dbo.crab_tag ADD CONSTRAINT fk_crab_tag_crab_item_id FOREIGN KEY (crab_item_id) REFERENCES dbo.crab_item (crab_item_id);
ALTER TABLE dbo.crab_tag ADD CONSTRAINT fk_crab_tag_printed_by FOREIGN KEY (printed_by) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.crab_tag ADD CONSTRAINT fk_crab_tag_activation_evidence_id FOREIGN KEY (activation_evidence_id) REFERENCES dbo.evidence (evidence_id);
ALTER TABLE dbo.crab_item_event ADD CONSTRAINT fk_crab_item_event_crab_item_id FOREIGN KEY (crab_item_id) REFERENCES dbo.crab_item (crab_item_id);
ALTER TABLE dbo.crab_item_event ADD CONSTRAINT fk_crab_item_event_actor_id FOREIGN KEY (actor_id) REFERENCES dbo.app_user (user_id);
ALTER TABLE dbo.crab_item_event ADD CONSTRAINT fk_crab_item_event_evidence_id FOREIGN KEY (evidence_id) REFERENCES dbo.evidence (evidence_id);
ALTER TABLE dbo.crab_item_event ADD CONSTRAINT fk_crab_item_event_tag_id FOREIGN KEY (tag_id) REFERENCES dbo.crab_tag (tag_id);
ALTER TABLE dbo.tag_scan ADD CONSTRAINT fk_tag_scan_tag_id FOREIGN KEY (tag_id) REFERENCES dbo.crab_tag (tag_id);
ALTER TABLE dbo.tag_scan ADD CONSTRAINT fk_tag_scan_scanned_by FOREIGN KEY (scanned_by) REFERENCES dbo.app_user (user_id);
GO

/* ---------- 3. INDEX ---------- */
CREATE UNIQUE INDEX ux_app_user_phone ON dbo.app_user (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX ux_customer_address_default ON dbo.customer_address (customer_id) WHERE is_default = 1;
CREATE INDEX ix_operator_approved_by ON dbo.operator (approved_by);
CREATE INDEX ix_operator_member_operator_id ON dbo.operator_member (operator_id);
CREATE INDEX ix_kyc_check_user_id ON dbo.kyc_check (user_id);
CREATE INDEX ix_kyc_check_reviewed_by ON dbo.kyc_check (reviewed_by);
CREATE INDEX ix_payout_account_owner_user_id ON dbo.payout_account (owner_user_id);
CREATE INDEX ix_payout_account_owner_operator_id ON dbo.payout_account (owner_operator_id);
CREATE INDEX ix_risk_acknowledgement_risk_disclosure_id ON dbo.risk_acknowledgement (risk_disclosure_id);
CREATE INDEX ix_slot_allocation_batch_id ON dbo.slot_allocation (batch_id);
CREATE UNIQUE INDEX ux_slot_active ON dbo.slot_allocation (slot_id) WHERE released_at IS NULL;
CREATE INDEX ix_batch_operator_id ON dbo.batch (operator_id);
CREATE INDEX ix_batch_status ON dbo.batch (status);
CREATE INDEX ix_batch_fee_tier_id ON dbo.batch (fee_tier_id);
CREATE INDEX ix_batch_approved_by ON dbo.batch (approved_by);
CREATE INDEX ix_standard_cost_version_approved_by ON dbo.standard_cost_version (approved_by);
CREATE UNIQUE INDEX ux_cost_version_locked ON dbo.standard_cost_version (batch_id) WHERE status = 'Locked';
CREATE INDEX ix_standard_cost_item_cost_version_id ON dbo.standard_cost_item (cost_version_id);
CREATE INDEX ix_contribution_batch_id_status ON dbo.contribution (batch_id, status);
CREATE INDEX ix_contribution_investor_id ON dbo.contribution (investor_id);
CREATE INDEX ix_capital_share_investor_id ON dbo.capital_share (investor_id);
CREATE INDEX ix_investment_contract_template_id ON dbo.investment_contract (template_id);
CREATE INDEX ix_contract_signature_signer_user_id ON dbo.contract_signature (signer_user_id);
CREATE INDEX ix_offtake_commitment_batch_id ON dbo.offtake_commitment (batch_id);
CREATE INDEX ix_offtake_commitment_grade_id ON dbo.offtake_commitment (grade_id);
CREATE INDEX ix_offtake_commitment_contribution_id_batch_id ON dbo.offtake_commitment (contribution_id, batch_id);
CREATE INDEX ix_production_log_recorded_by ON dbo.production_log (recorded_by);
CREATE INDEX ix_slot_event_batch_id_occurred_at ON dbo.slot_event (batch_id, occurred_at);
CREATE INDEX ix_slot_event_slot_allocation_id_batch_id ON dbo.slot_event (slot_allocation_id, batch_id);
CREATE INDEX ix_evidence_batch_id ON dbo.evidence (batch_id);
CREATE INDEX ix_evidence_sha256 ON dbo.evidence (sha256);
CREATE INDEX ix_evidence_slot_event_id ON dbo.evidence (slot_event_id);
CREATE INDEX ix_evidence_tranche_id ON dbo.evidence (tranche_id);
CREATE INDEX ix_alert_batch_id_status ON dbo.alert (batch_id, status);
CREATE INDEX ix_alert_acknowledged_by ON dbo.alert (acknowledged_by);
CREATE INDEX ix_harvest_batch_id ON dbo.harvest (batch_id);
CREATE INDEX ix_harvest_declared_by ON dbo.harvest (declared_by);
CREATE INDEX ix_crab_item_batch_id ON dbo.crab_item (batch_id);
CREATE INDEX ix_crab_item_harvest_id ON dbo.crab_item (harvest_id);
CREATE INDEX ix_crab_item_order_line_id ON dbo.crab_item (order_line_id);
CREATE INDEX ix_crab_item_grade_id ON dbo.crab_item (grade_id);
CREATE INDEX ix_crab_item_harvest_id_batch_id ON dbo.crab_item (harvest_id, batch_id);
CREATE INDEX ix_crab_item_slot_allocation_id_batch_id ON dbo.crab_item (slot_allocation_id, batch_id);
CREATE INDEX ix_crab_item_order_line_id_batch_id ON dbo.crab_item (order_line_id, batch_id);
CREATE INDEX ix_product_listing_grade_id ON dbo.product_listing (grade_id);
CREATE INDEX ix_price_history_listing_id_effective_from ON dbo.price_history (listing_id, effective_from);
CREATE INDEX ix_price_history_changed_by ON dbo.price_history (changed_by);
CREATE INDEX ix_sales_order_customer_id ON dbo.sales_order (customer_id);
CREATE INDEX ix_sales_order_batch_id_status ON dbo.sales_order (batch_id, status);
CREATE INDEX ix_sales_order_offtake_id ON dbo.sales_order (offtake_id);
CREATE INDEX ix_order_line_order_id ON dbo.order_line (order_id);
CREATE INDEX ix_order_line_listing_id ON dbo.order_line (listing_id);
CREATE INDEX ix_order_line_batch_id ON dbo.order_line (batch_id);
CREATE INDEX ix_order_line_order_id_batch_id ON dbo.order_line (order_id, batch_id);
CREATE INDEX ix_order_line_listing_id_batch_id ON dbo.order_line (listing_id, batch_id);
CREATE INDEX ix_stock_reservation_listing_id_status ON dbo.stock_reservation (listing_id, status);
CREATE INDEX ix_complaint_order_id ON dbo.complaint (order_id);
CREATE INDEX ix_complaint_resolved_by ON dbo.complaint (resolved_by);
CREATE INDEX ix_payment_request_batch_account_id ON dbo.payment_request (batch_account_id);
CREATE INDEX ix_payment_request_contribution_id ON dbo.payment_request (contribution_id);
CREATE INDEX ix_payment_request_order_id ON dbo.payment_request (order_id);
CREATE INDEX ix_payment_request_offtake_id ON dbo.payment_request (offtake_id);
CREATE INDEX ix_payment_instruction_batch_account_id_status ON dbo.payment_instruction (batch_account_id, status);
CREATE INDEX ix_payment_instruction_payout_account_id ON dbo.payment_instruction (payout_account_id);
CREATE INDEX ix_payment_instruction_tranche_id ON dbo.payment_instruction (tranche_id);
CREATE INDEX ix_payment_instruction_settlement_line_id ON dbo.payment_instruction (settlement_line_id);
CREATE INDEX ix_payment_instruction_contribution_id ON dbo.payment_instruction (contribution_id);
CREATE INDEX ix_payment_instruction_order_id ON dbo.payment_instruction (order_id);
CREATE INDEX ix_provider_transaction_batch_account_id_occurred_at ON dbo.provider_transaction (batch_account_id, occurred_at);
CREATE INDEX ix_provider_transaction_payment_request_id ON dbo.provider_transaction (payment_request_id);
CREATE INDEX ix_provider_transaction_instruction_id ON dbo.provider_transaction (instruction_id);
CREATE INDEX ix_settlement_approved_by ON dbo.settlement (approved_by);
CREATE INDEX ix_settlement_line_batch_id ON dbo.settlement_line (batch_id);
CREATE INDEX ix_settlement_line_investor_id ON dbo.settlement_line (investor_id);
CREATE INDEX ix_settlement_line_batch_id_investor_id ON dbo.settlement_line (batch_id, investor_id);
CREATE INDEX ix_settlement_feedback_settlement_id ON dbo.settlement_feedback (settlement_id);
CREATE INDEX ix_settlement_feedback_user_id ON dbo.settlement_feedback (user_id);
CREATE INDEX ix_audit_log_entity_type_entity_id ON dbo.audit_log (entity_type, entity_id);
CREATE INDEX ix_audit_log_actor_user_id ON dbo.audit_log (actor_user_id);
GO
-- [v1.1]
CREATE INDEX ix_evidence_slot_id ON dbo.evidence (slot_id);
CREATE INDEX ix_evidence_capture_request_id ON dbo.evidence (capture_request_id);
CREATE INDEX ix_evidence_perceptual_hash ON dbo.evidence (perceptual_hash);
CREATE INDEX ix_capture_request_batch_id_status ON dbo.capture_request (batch_id, status);
CREATE INDEX ix_capture_request_slot_id ON dbo.capture_request (slot_id);
CREATE INDEX ix_evidence_review_reviewer_id ON dbo.evidence_review (reviewer_id);
CREATE UNIQUE INDEX ux_crab_item_growing_slot ON dbo.crab_item (slot_allocation_id) WHERE status = 'Growing';
CREATE INDEX ix_crab_item_batch_id_status ON dbo.crab_item (batch_id, status);
CREATE INDEX ix_crab_item_replaces_crab_item_id ON dbo.crab_item (replaces_crab_item_id);
CREATE UNIQUE INDEX ux_crab_tag_active ON dbo.crab_tag (crab_item_id) WHERE status = 'Active';
CREATE INDEX ix_crab_tag_crab_item_id ON dbo.crab_tag (crab_item_id);
CREATE INDEX ix_crab_tag_printed_by ON dbo.crab_tag (printed_by);
CREATE INDEX ix_crab_tag_activation_evidence_id ON dbo.crab_tag (activation_evidence_id);
CREATE INDEX ix_crab_item_event_crab_item_id_occurred_at ON dbo.crab_item_event (crab_item_id, occurred_at);
CREATE INDEX ix_crab_item_event_actor_id ON dbo.crab_item_event (actor_id);
CREATE INDEX ix_crab_item_event_evidence_id ON dbo.crab_item_event (evidence_id);
CREATE INDEX ix_crab_item_event_tag_id ON dbo.crab_item_event (tag_id);
CREATE INDEX ix_tag_scan_tag_id_scanned_at ON dbo.tag_scan (tag_id, scanned_at);
CREATE INDEX ix_tag_scan_scanned_by ON dbo.tag_scan (scanned_by);
GO

/* ---------- 4. TRIGGER (luật bất biến) ---------- */
-- BR-33
CREATE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50001, N'audit_log chỉ cho phép ghi thêm (BR-33).', 1;
END
GO
-- BR-09
CREATE TRIGGER dbo.trg_capital_share_immutable ON dbo.capital_share
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50002, N'Tỷ lệ vốn đã chốt khi đóng vốn, không được sửa hoặc xoá (BR-09).', 1;
END
GO
-- BR-30
CREATE TRIGGER dbo.trg_settlement_locked ON dbo.settlement
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted d JOIN inserted i ON i.settlement_id = d.settlement_id
               WHERE d.status IN ('Approved', 'PaidOut', 'Closed')
                 AND (i.actual_revenue <> d.actual_revenue OR i.locked_standard_cost <> d.locked_standard_cost
                      OR i.revenue_pool <> d.revenue_pool OR i.operator_remuneration <> d.operator_remuneration
                      OR i.tax_total <> d.tax_total))
    BEGIN
        THROW 50003, N'Bảng quyết toán đã duyệt không được sửa số liệu (BR-30).', 1;
    END
END
GO
-- BR-30
CREATE TRIGGER dbo.trg_settlement_line_locked ON dbo.settlement_line
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.settlement s
               WHERE s.status IN ('Approved', 'PaidOut', 'Closed')
                 AND s.settlement_id IN (SELECT settlement_id FROM inserted UNION SELECT settlement_id FROM deleted))
    BEGIN
        THROW 50004, N'Dòng quyết toán của bảng đã duyệt không được thay đổi (BR-30).', 1;
    END
END
GO
-- [v1.1] Chuỗi truy xuất từng con cua chỉ ghi thêm
CREATE TRIGGER dbo.trg_crab_item_event_append_only ON dbo.crab_item_event
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50005, N'Lịch sử từng con cua chỉ cho phép ghi thêm.', 1;
END
GO

/* ---------- 5. VIEW BÁO CÁO ---------- */
-- Tiến độ gọi vốn của từng lô (BR-06, BR-08, BR-09, BR-10)
CREATE VIEW dbo.v_batch_funding_progress AS
SELECT b.batch_id, b.batch_code, b.status, b.funding_deadline,
       b.min_viable_capital, b.target_capital, b.max_capital,
       ISNULL(SUM(CASE WHEN c.status = 'Confirmed' THEN c.amount END), 0) AS confirmed_capital,
       ISNULL(SUM(CASE WHEN c.status = 'Reserved' AND c.expires_at > SYSDATETIMEOFFSET() THEN c.amount END), 0) AS reserved_capital,
       COUNT(DISTINCT CASE WHEN c.status = 'Confirmed' THEN c.investor_id END) AS investor_count,
       CAST(100.0 * ISNULL(SUM(CASE WHEN c.status = 'Confirmed' THEN c.amount END), 0) / b.target_capital AS DECIMAL(7,2)) AS pct_of_target,
       CASE WHEN ISNULL(SUM(CASE WHEN c.status = 'Confirmed' THEN c.amount END), 0) >= b.min_viable_capital THEN 1 ELSE 0 END AS reached_min_viable
FROM dbo.batch b
LEFT JOIN dbo.contribution c ON c.batch_id = b.batch_id
GROUP BY b.batch_id, b.batch_code, b.status, b.funding_deadline, b.min_viable_capital, b.target_capital, b.max_capital;
GO
-- Doanh thu thực của lô: đơn đã qua cửa sổ đổi trả + cọc bao tiêu bị mất − tiền hoàn khiếu nại (BR-19, BR-25, BR-26)
CREATE VIEW dbo.v_batch_actual_revenue AS
WITH o AS (
    SELECT batch_id, SUM(total_amount) AS order_revenue
    FROM dbo.sales_order WHERE status = 'Completed' GROUP BY batch_id),
r AS (
    SELECT so.batch_id, SUM(cp.refund_amount) AS refunds
    FROM dbo.complaint cp JOIN dbo.sales_order so ON so.order_id = cp.order_id
    WHERE cp.status = 'Resolved' AND cp.refund_amount IS NOT NULL GROUP BY so.batch_id),
f AS (
    SELECT batch_id, SUM(deposit_amount) AS forfeited
    FROM dbo.offtake_commitment WHERE deposit_status = 'Forfeited' GROUP BY batch_id)
SELECT b.batch_id, b.batch_code,
       ISNULL(o.order_revenue, 0) AS order_revenue,
       ISNULL(f.forfeited, 0)     AS forfeited_deposits,
       ISNULL(r.refunds, 0)       AS complaint_refunds,
       ISNULL(o.order_revenue, 0) + ISNULL(f.forfeited, 0) - ISNULL(r.refunds, 0) AS actual_revenue
FROM dbo.batch b
LEFT JOIN o ON o.batch_id = b.batch_id
LEFT JOIN r ON r.batch_id = b.batch_id
LEFT JOIN f ON f.batch_id = b.batch_id;
GO
-- Danh mục đầu tư: tỷ lệ vốn chốt và kết quả quyết toán của từng nhà đầu tư (BR-09, BR-29, BR-31)
CREATE VIEW dbo.v_investor_portfolio AS
SELECT cs.investor_id, u.full_name, b.batch_id, b.batch_code, b.status AS batch_status,
       cs.confirmed_amount,
       CAST(cs.confirmed_amount * 1.0 / NULLIF(b.total_confirmed_capital, 0) AS DECIMAL(9,6)) AS capital_ratio,
       s.status AS settlement_status, sl.capital_return, sl.profit_share, sl.tax_withheld, sl.net_payout, sl.in_kind_qty_kg
FROM dbo.capital_share cs
JOIN dbo.batch b     ON b.batch_id = cs.batch_id
JOIN dbo.app_user u  ON u.user_id = cs.investor_id
LEFT JOIN dbo.settlement s       ON s.batch_id = b.batch_id
LEFT JOIN dbo.settlement_line sl ON sl.settlement_id = s.settlement_id AND sl.investor_id = cs.investor_id;
GO
-- Truy xuất nguồn gốc theo tem của từng con cua: ô nuôi, lịch sử nuôi, ảnh thu hoạch, đơn hàng (BR-16, BR-35) [v1.1]
CREATE VIEW dbo.v_traceability AS
SELECT t.tag_code, t.status AS tag_status, ci.item_uuid, ci.weight_g, g.grade_code, g.grade_name, ci.status AS item_status,
       b.batch_code, b.crab_type, ci.stocked_at, h.harvested_at,
       op.legal_name AS operator_name, op.farm_address,
       ps.slot_code, sa.allocated_at,
       (SELECT COUNT(*) FROM dbo.slot_event se
         WHERE se.slot_allocation_id = ci.slot_allocation_id AND se.event_type = 'Molted') AS molt_count,
       (SELECT COUNT(*) FROM dbo.evidence ev
         WHERE ev.slot_id = ps.slot_id AND ev.captured_at BETWEEN ci.stocked_at AND COALESCE(h.harvested_at, SYSDATETIMEOFFSET())) AS evidence_count,
       hp.file_uri AS harvest_photo_uri,
       (SELECT COUNT(*) FROM dbo.tag_scan sc WHERE sc.tag_id = t.tag_id) AS scan_count,
       so.order_no
FROM dbo.crab_tag t
JOIN dbo.crab_item ci       ON ci.crab_item_id = t.crab_item_id
JOIN dbo.batch b            ON b.batch_id = ci.batch_id
JOIN dbo.operator op        ON op.operator_id = b.operator_id
JOIN dbo.slot_allocation sa ON sa.slot_allocation_id = ci.slot_allocation_id
JOIN dbo.physical_slot ps   ON ps.slot_id = sa.slot_id
LEFT JOIN dbo.product_grade g ON g.grade_id = ci.grade_id
LEFT JOIN dbo.harvest h     ON h.harvest_id = ci.harvest_id
LEFT JOIN dbo.evidence hp   ON hp.evidence_id = t.activation_evidence_id
LEFT JOIN dbo.order_line ol ON ol.order_line_id = ci.order_line_id
LEFT JOIN dbo.sales_order so ON so.order_id = ol.order_id;
GO
-- Đối soát số con theo lô: thả, thả bù, chết, đang nuôi, đã thu hoạch (so với số khai), đã bán, tồn, mất, con đã thu hoạch mà chưa có tem hiệu lực [v1.1]
CREATE VIEW dbo.v_crab_count_reconciliation AS
SELECT ci.batch_id,
       COUNT(*) AS stocked_total,
       SUM(CASE WHEN ci.replaces_crab_item_id IS NOT NULL THEN 1 ELSE 0 END) AS restocked,
       SUM(CASE WHEN ci.status = 'Dead' THEN 1 ELSE 0 END) AS dead,
       SUM(CASE WHEN ci.status = 'Growing' THEN 1 ELSE 0 END) AS growing,
       SUM(CASE WHEN ci.harvest_id IS NOT NULL THEN 1 ELSE 0 END) AS harvested,
       (SELECT SUM(h.harvested_count) FROM dbo.harvest h WHERE h.batch_id = ci.batch_id) AS declared_harvested,
       SUM(CASE WHEN ci.status IN ('Sold', 'DeliveredInKind') THEN 1 ELSE 0 END) AS sold,
       SUM(CASE WHEN ci.status IN ('InStock', 'Packed') THEN 1 ELSE 0 END) AS in_stock,
       SUM(CASE WHEN ci.status = 'Lost' THEN 1 ELSE 0 END) AS lost,
       SUM(CASE WHEN ci.harvest_id IS NOT NULL AND t.tag_id IS NULL THEN 1 ELSE 0 END) AS harvested_without_active_tag
FROM dbo.crab_item ci
LEFT JOIN dbo.crab_tag t ON t.crab_item_id = ci.crab_item_id AND t.status = 'Active'
GROUP BY ci.batch_id;
GO
-- Trần bao tiêu + đặt trước so với sản lượng dự kiến (BR-20)
CREATE VIEW dbo.v_batch_commitment_cap AS
WITH ot AS (
    SELECT batch_id, SUM(committed_qty_kg) AS qty
    FROM dbo.offtake_commitment WHERE status NOT IN ('Expired', 'Cancelled') GROUP BY batch_id),
pre AS (
    SELECT so.batch_id, SUM(ol.quantity_kg) AS qty
    FROM dbo.sales_order so JOIN dbo.order_line ol ON ol.order_id = so.order_id
    WHERE so.order_type = 'PreOrder' AND so.status NOT IN ('Cancelled', 'Returned') GROUP BY so.batch_id)
SELECT b.batch_id, b.batch_code, b.expected_output_kg, b.offtake_preorder_cap_pct,
       CAST(b.expected_output_kg * b.offtake_preorder_cap_pct / 100 AS DECIMAL(12,3)) AS cap_kg,
       ISNULL(ot.qty, 0) AS offtake_kg, ISNULL(pre.qty, 0) AS preorder_kg,
       CAST(b.expected_output_kg * b.offtake_preorder_cap_pct / 100 AS DECIMAL(12,3)) - ISNULL(ot.qty, 0) - ISNULL(pre.qty, 0) AS remaining_kg
FROM dbo.batch b
LEFT JOIN ot  ON ot.batch_id = b.batch_id
LEFT JOIN pre ON pre.batch_id = b.batch_id;
GO
-- Đối soát: tổng phần chia của nhà đầu tư phải khớp phần Pool được chia tới từng đồng (BR-27, BR-28, BR-29)
CREATE VIEW dbo.v_settlement_reconciliation AS
SELECT s.settlement_id, s.batch_id, s.actual_revenue, s.locked_standard_cost, s.revenue_pool, s.operator_remuneration,
       CASE WHEN s.revenue_pool > 0 THEN s.revenue_pool - s.operator_remuneration ELSE s.revenue_pool END AS distributable,
       ISNULL(SUM(sl.profit_share), 0)  AS sum_profit_share,
       ISNULL(SUM(sl.capital_return), 0) AS sum_capital_return,
       ISNULL(SUM(sl.tax_withheld), 0)  AS sum_tax_withheld,
       COUNT(sl.settlement_line_id)      AS line_count,
       CASE WHEN s.revenue_pool > 0 THEN s.revenue_pool - s.operator_remuneration ELSE s.revenue_pool END
         - ISNULL(SUM(sl.profit_share), 0) AS difference
FROM dbo.settlement s
LEFT JOIN dbo.settlement_line sl ON sl.settlement_id = s.settlement_id
GROUP BY s.settlement_id, s.batch_id, s.actual_revenue, s.locked_standard_cost, s.revenue_pool, s.operator_remuneration;
GO
-- Hồ sơ uy tín người nuôi: lô đã đóng, lô có lãi, đánh giá, khiếu nại, cảnh báo bị leo thang (BR-01, BR-17)
CREATE VIEW dbo.v_operator_reputation AS
SELECT op.operator_id, op.legal_name, op.status,
       (SELECT COUNT(*) FROM dbo.batch b WHERE b.operator_id = op.operator_id AND b.status = 'Closed') AS closed_batches,
       (SELECT COUNT(*) FROM dbo.settlement s JOIN dbo.batch b ON b.batch_id = s.batch_id
         WHERE b.operator_id = op.operator_id AND s.status IN ('Approved', 'PaidOut', 'Closed') AND s.revenue_pool > 0) AS profitable_batches,
       (SELECT CAST(AVG(CAST(pr.stars AS DECIMAL(4,2))) AS DECIMAL(3,2))
          FROM dbo.product_rating pr JOIN dbo.sales_order so ON so.order_id = pr.order_id
          JOIN dbo.batch b ON b.batch_id = so.batch_id WHERE b.operator_id = op.operator_id) AS avg_rating,
       (SELECT COUNT(*) FROM dbo.complaint cp JOIN dbo.sales_order so ON so.order_id = cp.order_id
          JOIN dbo.batch b ON b.batch_id = so.batch_id WHERE b.operator_id = op.operator_id) AS complaint_count,
       (SELECT COUNT(*) FROM dbo.alert a JOIN dbo.batch b ON b.batch_id = a.batch_id
         WHERE b.operator_id = op.operator_id AND a.escalated_at IS NOT NULL) AS escalated_alerts
FROM dbo.operator op;
GO
-- Cảnh báo quá hạn xác nhận, cần leo thang tới quản trị (BR-17)
CREATE VIEW dbo.v_overdue_alerts AS
SELECT a.alert_id, a.batch_id, b.batch_code, a.alert_type, a.severity, a.raised_at, a.ack_deadline,
       DATEDIFF(MINUTE, a.ack_deadline, SYSDATETIMEOFFSET()) AS minutes_overdue
FROM dbo.alert a
JOIN dbo.batch b ON b.batch_id = a.batch_id
WHERE a.status = 'Open' AND a.ack_deadline < SYSDATETIMEOFFSET();
GO

/* ---------- 6. MÔ TẢ (MS_Description) ---------- */
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tài khoản đăng nhập chung của mọi người dùng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'app_user';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: PendingVerification, Active, Locked', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'app_user', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Vai trò của tài khoản (một người có thể vừa là nhà đầu tư vừa là khách hàng)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'app_user_role';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Investor, Customer, OperatorMember, PlatformAdmin, EvidenceReviewer (quyền Kiểm định viên, không phải tác nhân mới)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'app_user_role', @level2type = N'COLUMN', @level2name = N'role_code';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Nhà đầu tư (kế thừa User). Nhà đầu tư bao tiêu là nhà đầu tư có ít nhất một cam kết bao tiêu', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investor';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'PK + FK tới app_user', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investor', @level2type = N'COLUMN', @level2name = N'user_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Individual, Organization', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investor', @level2type = N'COLUMN', @level2name = N'investor_kind';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Unverified, Verified, Rejected', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investor', @level2type = N'COLUMN', @level2name = N'verification_status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Khách mua trên gian hàng (kế thừa User)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'customer';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'PK + FK tới app_user', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'customer', @level2type = N'COLUMN', @level2name = N'user_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Địa chỉ nhận hàng của khách (thuộc tính đa trị)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'customer_address';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Người nuôi: tổ chức có mã số thuế, vận hành cơ sở RAS', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'operator';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, Submitted, Approved, Rejected, Suspended', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'operator', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tài khoản thuộc tổ chức người nuôi (chủ, nhân viên)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'operator_member';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'PK + FK; mỗi tài khoản thuộc tối đa một người nuôi', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'operator_member', @level2type = N'COLUMN', @level2name = N'user_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Owner, Staff', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'operator_member', @level2type = N'COLUMN', @level2name = N'member_role';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Kết quả từng lần xác minh danh tính. Chỉ lưu kết quả, không lưu ảnh CCCD hay khuôn mặt', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'kyc_check';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: OtpDeclaration, EkycIdFace, BankNameMatch', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'kyc_check', @level2type = N'COLUMN', @level2name = N'check_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Bắt buộc với EkycIdFace', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'kyc_check', @level2type = N'COLUMN', @level2name = N'consent_at';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Pending, Passed, Failed, ExceptionApproved', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'kyc_check', @level2type = N'COLUMN', @level2name = N'result';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tài khoản nhận tiền của nhà đầu tư hoặc người nuôi (đúng một chủ sở hữu)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payout_account';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Pending, Matched, Mismatched', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payout_account', @level2type = N'COLUMN', @level2name = N'name_match_status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Active, Locked, Closed', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payout_account', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phiên bản bản công bố rủi ro', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'risk_disclosure';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, Active, Retired', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'risk_disclosure', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Nhà đầu tư xác nhận đã đọc một phiên bản công bố rủi ro', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'risk_acknowledgement';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Hộp nuôi (slot) của người nuôi, nhận diện bằng số hộp in trên nhãn dán lên hộp; dãy, kệ, tầng, cột là tuỳ chọn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Available, Occupied, Maintenance', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Gán ô nuôi cho lô; mỗi ô chỉ thuộc một lô đang hoạt động', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'slot_allocation';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Lô nuôi: đơn vị gọi vốn, sản xuất, bán hàng và quyết toán', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: FatteningMudCrab, RoeCrab, SoftShellCrab', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'crab_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Số con giống khoá', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'seed_quantity';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Bậc phí áp dụng, chốt khi duyệt lô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'fee_tier_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phí chốt theo bậc; người nuôi trả ngoài tiền của lô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'platform_fee_amount';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, PendingApproval, Rejected, Funding, Cancelled, Stocked, InProduction, Harvesting, Settlement, Closed', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Thời điểm đóng vốn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'capital_closed_at';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Mẫu số tỷ lệ, chốt khi đóng vốn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch', @level2type = N'COLUMN', @level2name = N'total_confirmed_capital';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phiên bản bảng Standard Cost của lô; đúng một bản bị khoá khi mở gọi vốn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'standard_cost_version';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, Submitted, Approved, Locked, Superseded', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'standard_cost_version', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Dòng chi phí theo hạng mục trong một phiên bản Standard Cost', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'standard_cost_item';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Seed, Feed, Utilities, Labour, MortalityReserve, Depreciation, Other', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'standard_cost_item', @level2type = N'COLUMN', @level2name = N'category';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Đợt giải ngân; NULL với khấu hao', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'standard_cost_item', @level2type = N'COLUMN', @level2name = N'tranche_no';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Đợt giải ngân theo mốc, suy ra từ Standard Cost đã khoá', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'disbursement_tranche';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Planned, Requested, NeedsExplanation, Released, Blocked', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'disbursement_tranche', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Bậc phí nền tảng theo quy mô vốn của lô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'fee_tier';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tài khoản chuyên dùng của lô do tổ chức trung gian thanh toán giữ hộ', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch_account';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Requested, Open, Frozen, Closed', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch_account', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Khoản góp vốn: giữ chỗ rồi được xác nhận khi tiền về tài khoản lô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'contribution';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Reserved, Confirmed, Expired, Refunded', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'contribution', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tử số quyền lợi của từng nhà đầu tư, chốt bất biến khi lô đóng vốn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'capital_share';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phiên bản mẫu hợp đồng hợp tác', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'contract_template';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, Active, Retired', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'contract_template', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Hợp đồng hợp tác của một khoản góp, ký lần lượt người nuôi rồi nhà đầu tư', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investment_contract';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, OperatorSigned, FullySigned, Void', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investment_contract', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: DigitalSignature, OfflineUpload', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'investment_contract', @level2type = N'COLUMN', @level2name = N'signing_method';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Từng chữ ký trên hợp đồng (người nuôi ký trước, nhà đầu tư ký sau)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'contract_signature';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Operator, Investor', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'contract_signature', @level2type = N'COLUMN', @level2name = N'signer_role';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Cam kết bao tiêu gắn với một khoản góp: khối lượng, giá chốt, cọc', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'offtake_commitment';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Pending, Held, Applied, Forfeited, Refunded', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'offtake_commitment', @level2type = N'COLUMN', @level2name = N'deposit_status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: PendingHarvest, WindowOpen, Fulfilled, Expired, Cancelled', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'offtake_commitment', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Nhật ký vận hành hằng ngày của lô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'production_log';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: FarmApi, Manual', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'production_log', @level2type = N'COLUMN', @level2name = N'source';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Sự kiện của từng ô nuôi: thả giống, lột xác, hao hụt, thả bù, thu hoạch', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'slot_event';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Stocked, Molted, Mortality, Restocked, Harvested, Relocated', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'slot_event', @level2type = N'COLUMN', @level2name = N'event_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: FarmApi, Manual', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'slot_event', @level2type = N'COLUMN', @level2name = N'source';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Ảnh/video bằng chứng nuôi: chụp trực tiếp trong ứng dụng, nhận qua API hệ thống trại, hoặc chứng từ tải lên', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Photo, Video, Invoice', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'media_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: FarmApi, InAppCapture (chụp trực tiếp, không chọn từ thư viện), DocumentUpload (chỉ cho chứng từ)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'source';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Kết quả nhận diện do đối tác trả về', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'partner_label';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Accepted, Watch (hiện cảnh báo cho nhà đầu tư), Flagged (chờ Kiểm định viên), Rejected', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'review_status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Cảnh báo vận hành, có hạn xác nhận và tự leo thang', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'alert';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Mortality, WaterQuality, MilestoneDelay, LowStock, DataSilence, EvidenceFlag', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'alert', @level2type = N'COLUMN', @level2name = N'alert_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Low, Medium, High, Critical', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'alert', @level2type = N'COLUMN', @level2name = N'severity';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Open, Acknowledged, Escalated, Resolved', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'alert', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Khai báo thu hoạch của lô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'harvest';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Từng con cua, có mã từ lúc thả giống; lúc nuôi gắn với ô, từ lúc thu hoạch gắn với tem', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Mã nội bộ của con cua, sinh lúc thả giống', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item', @level2type = N'COLUMN', @level2name = N'item_uuid';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Gán khi đóng đơn bằng cách quét tem', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item', @level2type = N'COLUMN', @level2name = N'order_line_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Growing, Dead, InStock, Packed, Sold, DeliveredInKind, Lost', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Danh mục phân loại cua theo kích cỡ, chất lượng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'product_grade';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Mặt hàng đăng bán của một lô theo một phân loại', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'product_listing';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Fresh, Frozen', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'product_listing', @level2type = N'COLUMN', @level2name = N'storage_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, Published, SoldOut, Closed', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'product_listing', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Lịch sử đổi giá công khai của mặt hàng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'price_history';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Đơn hàng; mỗi đơn thuộc đúng một lô (giỏ hàng nhiều lô được tách đơn)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'sales_order';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Khách lẻ hoặc nhà đầu tư bao tiêu', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'sales_order', @level2type = N'COLUMN', @level2name = N'customer_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Retail, PreOrder, Offtake', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'sales_order', @level2type = N'COLUMN', @level2name = N'order_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: PendingPayment, DepositPaid, Paid, Packed, Shipping, Delivered, Completed, Cancelled, Returned', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'sales_order', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Chốt lúc đặt để đối soát thanh toán', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'sales_order', @level2type = N'COLUMN', @level2name = N'total_amount';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Dòng hàng trong đơn; mặt hàng phải cùng lô với đơn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'order_line';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá tại thời điểm đặt', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'order_line', @level2type = N'COLUMN', @level2name = N'unit_price';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giữ chỗ tồn kho có thời hạn khi đặt hàng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'stock_reservation';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Active, Committed, Released', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'stock_reservation', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Khiếu nại đơn hàng và cách giải quyết', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'complaint';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: LateDelivery, WrongGrade, Damaged, NotReceived, Other', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'complaint', @level2type = N'COLUMN', @level2name = N'complaint_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Open, OperatorResponded, Escalated, Resolved, Rejected', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'complaint', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Refund, Compensation, Replacement, NoAction', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'complaint', @level2type = N'COLUMN', @level2name = N'resolution';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Đánh giá của khách cho một đơn đã nhận', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'product_rating';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Chỉ dẫn thu tiền (mã VietQR) vào tài khoản lô; gắn với đúng một nghĩa vụ', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_request';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Nội dung chuyển khoản', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_request', @level2type = N'COLUMN', @level2name = N'reference_code';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Contribution, OrderPayment, PreOrderDeposit, PreOrderBalance, OfftakeDeposit, OfftakePayment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_request', @level2type = N'COLUMN', @level2name = N'purpose';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Pending, Paid, Expired, Cancelled', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_request', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Lệnh chi CrabShare gửi tổ chức trung gian: giải ngân, chi trả, hoàn tiền, nộp thuế', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_instruction';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Disbursement, Payout, Refund, TaxPayment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_instruction', @level2type = N'COLUMN', @level2name = N'instruction_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Created, Sent, Succeeded, Failed, Disputed', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'payment_instruction', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giao dịch do tổ chức trung gian báo về (webhook); chống trùng theo mã giao dịch', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'provider_transaction';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: In, Out', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'provider_transaction', @level2type = N'COLUMN', @level2name = N'direction';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Matched, Unmatched, LatePayment', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'provider_transaction', @level2type = N'COLUMN', @level2name = N'match_status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Bảng quyết toán của lô; bất biến sau khi được duyệt', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'= actual_revenue − locked_standard_cost, có thể âm', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement', @level2type = N'COLUMN', @level2name = N'revenue_pool';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Draft, Proposed, Disputed, Approved, PaidOut, Closed', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phần chia của từng nhà đầu tư; tổng khớp Revenue Pool tới từng đồng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement_line';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Âm khi lô lỗ; lỗ không vượt vốn góp', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement_line', @level2type = N'COLUMN', @level2name = N'profit_share';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phản hồi / tranh chấp về bảng quyết toán trong cửa sổ 7 ngày', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement_feedback';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Open, Answered, Withdrawn, Unresolved', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'settlement_feedback', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Nhật ký chỉ ghi thêm cho mọi thay đổi về tiền, hợp đồng, Standard Cost; nối chuỗi băm', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'audit_log';
GO
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Số hộp do người nuôi đánh và in nhãn, ví dụ 0001; duy nhất trong một trại', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot', @level2type = N'COLUMN', @level2name = N'slot_code';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Dãy (tuỳ chọn)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot', @level2type = N'COLUMN', @level2name = N'row_code';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Số kệ (tuỳ chọn)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot', @level2type = N'COLUMN', @level2name = N'rack_no';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tầng trên kệ (tuỳ chọn)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot', @level2type = N'COLUMN', @level2name = N'tier_no';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Cột trên tầng (tuỳ chọn)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'physical_slot', @level2type = N'COLUMN', @level2name = N'column_no';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Kết quả kiểm tra hợp lý số liệu: Ok, OutOfRange (ngoài dải), Inconsistent (mâu thuẫn với số cua còn sống)', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'production_log', @level2type = N'COLUMN', @level2name = N'plausibility_flag';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Có giá trị khi số liệu đã được kiểm (nhãn nguồn "đã kiểm")', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'production_log', @level2type = N'COLUMN', @level2name = N'verified_at';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Hộp người nuôi chọn khi chụp; số hộp phải nhìn thấy trong ảnh', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'slot_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Yêu cầu chụp đột xuất mà ảnh này đáp ứng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'capture_request_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Vị trí lúc chụp', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'latitude';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giải trình của người nuôi khi bằng chứng bị gắn cờ', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence', @level2type = N'COLUMN', @level2name = N'explanation';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Thời điểm thả con cua vào ô', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item', @level2type = N'COLUMN', @level2name = N'stocked_at';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Con cua chết mà con này thả bù thay', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item', @level2type = N'COLUMN', @level2name = N'replaces_crab_item_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Null khi còn nuôi hoặc đã chết', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item', @level2type = N'COLUMN', @level2name = N'harvest_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Yêu cầu chụp đột xuất một ô, có hạn; hệ thống chọn ô ngẫu nhiên', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'capture_request';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Open, Fulfilled, Expired', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'capture_request', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Kết quả mô hình nhận diện cua trên một ảnh; chỉ là một tín hiệu trong điểm rủi ro, không tự từ chối bằng chứng', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence_detection';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Phiên bản mô hình đã chạy, để truy lại kết quả', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence_detection', @level2type = N'COLUMN', @level2name = N'model_version';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Độ tin cậy từ 0 tới 1', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence_detection', @level2type = N'COLUMN', @level2name = N'confidence';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Kết luận của Kiểm định viên cho bằng chứng bị gắn cờ; không xét lô mình có góp vốn', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence_review';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Pass, Fail, NeedMoreEvidence', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'evidence_review', @level2type = N'COLUMN', @level2name = N'verdict';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Tem truy xuất in tại chỗ khi thu hoạch; mỗi con cua có tối đa một tem đang hiệu lực', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_tag';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Mã in trên tem và nằm trong QR; sinh ngẫu nhiên, không đoán được', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_tag', @level2type = N'COLUMN', @level2name = N'tag_code';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Printed, Active, Void', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_tag', @level2type = N'COLUMN', @level2name = N'status';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Ảnh xác nhận lúc thu hoạch thấy cả con cua và tem', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_tag', @level2type = N'COLUMN', @level2name = N'activation_evidence_id';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Lịch sử từng con cua từ lúc thả tới tay người mua; chỉ ghi thêm', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item_event';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá trị: Stocked, Died, Harvested, TagPrinted, TagActivated, TagVoided, StoredIn, Packed, Delivered, Lost', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'crab_item_event', @level2type = N'COLUMN', @level2name = N'event_type';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Lượt quét tem của người mua; dùng để phát hiện tem bị sao chép', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'tag_scan';
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Người quét có phải chủ đơn chứa con cua này không', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'tag_scan', @level2type = N'COLUMN', @level2name = N'is_order_owner';
