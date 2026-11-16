/* V019 — BR v1.5 nhóm B (G1): điều khoản Lô, bậc thù lao, quy cách hàng và chào giá, chi phí thực tế,
   mốc giải ngân theo tỷ lệ, số con được cấp vốn, phân bổ tiền.
   BR-026, 030–037, 043–055, 059, 068, 075, 080–083, 145–146, 188.
   Cột cũ (vốn tối đa, phần người nuôi 5–10%, bao tiêu, cấp đông, bậc phí) giữ cho dữ liệu cũ; luồng mới không dùng. */

/* ---------- 1. Điều khoản Lô ---------- */
ALTER TABLE dbo.batch ADD
    has_holding                  BIT NOT NULL CONSTRAINT df_batch_has_holding DEFAULT (1),
    expected_avg_weight_g        INT NULL,
    expected_grade               NVARCHAR(50) NULL,
    sale_days                    SMALLINT NULL,
    delivery_radius_km           DECIMAL(6,1) NULL,
    dispatch_site_id             BIGINT NULL CONSTRAINT fk_batch_dispatch_site FOREIGN KEY REFERENCES dbo.party_site (site_id),
    min_viable_basis             NVARCHAR(300) NULL,
    survival_threshold_pct       DECIMAL(5,2) NULL,
    base_remuneration_pct        DECIMAL(5,2) NULL,
    floor_price_per_kg           DECIMAL(18,0) NULL,
    offtake_buyer_party_id       BIGINT NULL CONSTRAINT fk_batch_offtake_buyer FOREIGN KEY REFERENCES dbo.party (party_id),
    settlement_basis             VARCHAR(20) NOT NULL CONSTRAINT df_batch_settlement_basis DEFAULT ('StandardCost'),
    expected_receipt_date        DATE NULL,
    preorder_deadline            DATETIMEOFFSET(3) NULL,
    platform_fee_rate_pct        DECIMAL(5,2) NULL,
    standard_cost_per_crab       DECIMAL(18,0) NULL,
    funded_quantity              INT NULL,
    sourcing_started_at          DATETIMEOFFSET(3) NULL,
    selling_started_at           DATETIMEOFFSET(3) NULL,
    cancelled_at                 DATETIMEOFFSET(3) NULL,
    cancel_reason                NVARCHAR(300) NULL;
GO
ALTER TABLE dbo.batch ADD
    CONSTRAINT ck_batch_settlement_basis CHECK (settlement_basis IN ('StandardCost', 'ActualCost')),
    CONSTRAINT ck_batch_expected_avg_weight CHECK (expected_avg_weight_g IS NULL OR expected_avg_weight_g > 0),
    CONSTRAINT ck_batch_sale_days CHECK (sale_days IS NULL OR sale_days > 0),
    CONSTRAINT ck_batch_delivery_radius CHECK (delivery_radius_km IS NULL OR delivery_radius_km > 0),
    CONSTRAINT ck_batch_survival_threshold CHECK (survival_threshold_pct IS NULL OR survival_threshold_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_batch_base_remuneration CHECK (base_remuneration_pct IS NULL OR base_remuneration_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_batch_floor_price CHECK (floor_price_per_kg IS NULL OR floor_price_per_kg > 0),
    CONSTRAINT ck_batch_fee_rate CHECK (platform_fee_rate_pct IS NULL OR platform_fee_rate_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_batch_cost_per_crab CHECK (standard_cost_per_crab IS NULL OR standard_cost_per_crab > 0),
    CONSTRAINT ck_batch_funded_quantity CHECK (funded_quantity IS NULL OR (funded_quantity >= 0 AND funded_quantity <= seed_quantity));
-- Thù lao nay theo bậc tỷ lệ sống (BR-046), không còn khung 5–10% cố định.
ALTER TABLE dbo.batch DROP CONSTRAINT ck_batch_operator_share_pct;
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_operator_share_pct CHECK (operator_share_pct BETWEEN 0 AND 100);
-- Vốn mục tiêu tự tính từ kế hoạch chi phí (BR-035); vốn tối thiểu khả thi ≤ mục tiêu được kiểm khi gửi duyệt (BR-034).
ALTER TABLE dbo.batch DROP CONSTRAINT ck_batch_capital_range;
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_capital_range
    CHECK (min_viable_capital > 0 AND target_capital > 0 AND max_capital >= target_capital);
GO

/* ---------- 2. Bậc thù lao theo tỷ lệ sống (BR-046, BR-047) ---------- */
CREATE TABLE dbo.remuneration_tier (
    batch_id                     BIGINT NOT NULL,
    tier_no                      TINYINT NOT NULL,
    survival_from_pct            DECIMAL(5,2) NOT NULL,
    survival_to_pct              DECIMAL(5,2) NOT NULL,
    rate_pct                     DECIMAL(5,2) NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_remuneration_tier_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_remuneration_tier PRIMARY KEY (batch_id, tier_no),
    CONSTRAINT fk_remuneration_tier_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT ck_remuneration_tier_range CHECK (survival_from_pct >= 0 AND survival_to_pct <= 100 AND survival_from_pct < survival_to_pct),
    CONSTRAINT ck_remuneration_tier_rate CHECK (rate_pct BETWEEN 0 AND 100)
);
GO

/* ---------- 3. Quy cách hàng và chào giá (BR-043, BR-045) ---------- */
CREATE TABLE dbo.product_specification (
    spec_id                      BIGINT IDENTITY(1,1) NOT NULL,
    spec_code                    VARCHAR(40) NOT NULL,
    species                      NVARCHAR(60) NOT NULL,
    crab_type                    VARCHAR(20) NOT NULL,
    size_code                    VARCHAR(10) NOT NULL,
    grade_code                   VARCHAR(10) NOT NULL,
    live_condition               VARCHAR(20) NOT NULL CONSTRAINT df_product_specification_condition DEFAULT ('Live'),
    name                         NVARCHAR(150) NOT NULL,
    size_rank                    TINYINT NOT NULL,
    grade_rank                   TINYINT NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_product_specification_status DEFAULT ('Active'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_product_specification_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_product_specification PRIMARY KEY (spec_id),
    CONSTRAINT ux_product_specification_code UNIQUE (spec_code),
    CONSTRAINT ux_product_specification_key UNIQUE (species, crab_type, size_code, grade_code, live_condition),
    CONSTRAINT ck_product_specification_crab_type CHECK (crab_type IN ('FatteningMudCrab', 'RoeCrab', 'YoungFemaleCrab', 'OilRoeCrab')),
    CONSTRAINT ck_product_specification_size CHECK (size_code IN ('OUT', 'M', 'L', 'XL')),
    CONSTRAINT ck_product_specification_grade CHECK (grade_code IN ('SPECIAL', 'G1')),
    CONSTRAINT ck_product_specification_status CHECK (status IN ('Active', 'Retired'))
);
GO
-- Bảng quy cách chuẩn: 4 loại cua × size M, L, XL × Đặc cấp, Cấp 1, cộng một quy cách "ngoài quy cách" mỗi loại.
;WITH types AS (
    SELECT * FROM (VALUES ('FatteningMudCrab', 'FAT', N'Cua thịt'), ('RoeCrab', 'ROE', N'Cua gạch'),
                          ('YoungFemaleCrab', 'YFC', N'Cua cái non'), ('OilRoeCrab', 'OIL', N'Cua gạch dầu')) t(crab_type, abbr, label)
), sizes AS (
    SELECT * FROM (VALUES ('M', 1), ('L', 2), ('XL', 3)) s(size_code, size_rank)
), grades AS (
    SELECT * FROM (VALUES ('SPECIAL', 2, N'Đặc cấp'), ('G1', 1, N'Cấp 1')) g(grade_code, grade_rank, label)
)
INSERT INTO dbo.product_specification (spec_code, species, crab_type, size_code, grade_code, name, size_rank, grade_rank)
SELECT t.abbr + '-' + s.size_code + '-' + g.grade_code, N'Scylla paramamosain', t.crab_type, s.size_code, g.grade_code,
       t.label + N' size ' + s.size_code + N' ' + g.label, s.size_rank, g.grade_rank
FROM types t CROSS JOIN sizes s CROSS JOIN grades g
UNION ALL
SELECT t.abbr + '-OUT-G1', N'Scylla paramamosain', t.crab_type, 'OUT', 'G1', t.label + N' ngoài quy cách', 0, 1 FROM types t;
GO
CREATE TABLE dbo.offer (
    offer_id                     BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    spec_id                      BIGINT NOT NULL,
    price_per_kg                 DECIMAL(18,0) NOT NULL,
    conversion_weight_g          INT NOT NULL,
    offered_quantity             INT NOT NULL,
    valid_from                   DATETIMEOFFSET(3) NULL,
    valid_to                     DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_offer_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_offer PRIMARY KEY (offer_id),
    CONSTRAINT fk_offer_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_offer_spec FOREIGN KEY (spec_id) REFERENCES dbo.product_specification (spec_id),
    CONSTRAINT ux_offer_batch_spec UNIQUE (batch_id, spec_id),
    CONSTRAINT ck_offer_price CHECK (price_per_kg > 0),
    CONSTRAINT ck_offer_conversion CHECK (conversion_weight_g > 0),
    CONSTRAINT ck_offer_quantity CHECK (offered_quantity > 0),
    CONSTRAINT ck_offer_validity CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);
GO

/* ---------- 4. Chi phí: căn cứ, bên chịu, chi phí thực tế có chứng từ (BR-030, BR-037) ---------- */
ALTER TABLE dbo.standard_cost_item ADD
    basis                        NVARCHAR(300) NULL,
    cost_bearer                  VARCHAR(20) NULL CONSTRAINT ck_standard_cost_item_bearer CHECK (cost_bearer IN ('Batch', 'Executor', 'Supplier'));
-- Khoản chi không còn gắn số đợt; giải ngân theo tỷ lệ của mốc (BR-146).
ALTER TABLE dbo.standard_cost_item DROP CONSTRAINT ck_cost_item_tranche;
GO
CREATE TABLE dbo.cost_actual (
    cost_actual_id               BIGINT IDENTITY(1,1) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    cost_item_id                 BIGINT NOT NULL,
    amount                       DECIMAL(18,0) NOT NULL,
    document_evidence_id         BIGINT NULL,
    document_ref                 NVARCHAR(100) NULL,
    note                         NVARCHAR(300) NULL,
    incurred_on                  DATE NOT NULL,
    recorded_by                  BIGINT NOT NULL,
    recorded_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_cost_actual_recorded_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_cost_actual PRIMARY KEY (cost_actual_id),
    CONSTRAINT fk_cost_actual_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_cost_actual_item FOREIGN KEY (cost_item_id) REFERENCES dbo.standard_cost_item (cost_item_id),
    CONSTRAINT fk_cost_actual_evidence FOREIGN KEY (document_evidence_id) REFERENCES dbo.evidence (evidence_id),
    CONSTRAINT ck_cost_actual_amount CHECK (amount > 0),
    CONSTRAINT ck_cost_actual_document CHECK (document_evidence_id IS NOT NULL OR document_ref IS NOT NULL)
);
GO
CREATE TRIGGER dbo.tr_cost_actual_append_only ON dbo.cost_actual AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    THROW 51019, N'Chi phí thực tế chỉ được ghi thêm; sai thì ghi dòng điều chỉnh mới.', 1;
END;
GO

/* ---------- 5. Mốc giải ngân theo tỷ lệ (BR-145, BR-146) ---------- */
ALTER TABLE dbo.standard_cost_tranche_plan ADD
    milestone_kind               VARCHAR(20) NULL,
    milestone_name               NVARCHAR(100) NULL,
    pct                          DECIMAL(5,2) NULL;
ALTER TABLE dbo.disbursement_tranche ADD
    milestone_kind               VARCHAR(20) NULL,
    milestone_name               NVARCHAR(100) NULL,
    pct                          DECIMAL(5,2) NULL;
GO
ALTER TABLE dbo.standard_cost_tranche_plan DROP CONSTRAINT ck_cost_plan_timing;
ALTER TABLE dbo.standard_cost_tranche_plan ADD CONSTRAINT ck_cost_plan_timing CHECK (
    (milestone_kind IS NOT NULL AND pct IS NOT NULL AND pct > 0 AND pct <= 100) OR
    (milestone_kind IS NULL AND ((planned_date IS NOT NULL AND anchor_code IS NULL AND offset_days IS NULL) OR
     (planned_date IS NULL AND anchor_code IN ('FundingReady', 'Stocked') AND offset_days IS NOT NULL AND offset_days >= 0))));
ALTER TABLE dbo.standard_cost_tranche_plan ADD CONSTRAINT ck_cost_plan_kind
    CHECK (milestone_kind IS NULL OR milestone_kind IN ('Receipt', 'MidCycle', 'Settlement', 'Custom'));
ALTER TABLE dbo.disbursement_tranche DROP CONSTRAINT ck_tranche_timing;
ALTER TABLE dbo.disbursement_tranche ADD CONSTRAINT ck_tranche_timing CHECK (
    milestone_kind IS NOT NULL OR
    (anchor_code IS NULL AND offset_days IS NULL AND planned_date IS NOT NULL) OR
    (anchor_code IN ('FundingReady', 'Stocked') AND offset_days IS NOT NULL AND offset_days >= 0));
ALTER TABLE dbo.disbursement_tranche ADD CONSTRAINT ck_tranche_kind
    CHECK (milestone_kind IS NULL OR milestone_kind IN ('Receipt', 'MidCycle', 'Settlement', 'Custom'));
GO

/* ---------- 6. Phân bổ tiền vào nghĩa vụ (BR-068) ---------- */
CREATE TABLE dbo.payment_application (
    application_id               BIGINT IDENTITY(1,1) NOT NULL,
    transaction_id               BIGINT NOT NULL CONSTRAINT fk_payment_application_txn FOREIGN KEY REFERENCES dbo.provider_transaction (transaction_id),
    target_type                  VARCHAR(30) NOT NULL,
    target_id                    BIGINT NOT NULL,
    amount                       DECIMAL(18,0) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_payment_application_status DEFAULT ('Applied'),
    applied_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_payment_application_applied_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_payment_application PRIMARY KEY (application_id),
    CONSTRAINT ck_payment_application_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_application_status CHECK (status IN ('Applied', 'Reversed')),
    CONSTRAINT ck_payment_application_target CHECK (target_type IN ('Contribution', 'OrderDeposit', 'TrancheBalance', 'Invoice',
        'InvoicedSale', 'FinalOrder', 'Refund', 'PaymentInstruction', 'OrderPayment', 'Other'))
);
GO
CREATE INDEX ix_payment_application_txn ON dbo.payment_application (transaction_id);
CREATE INDEX ix_payment_application_target ON dbo.payment_application (target_type, target_id);
GO
-- Một giao dịch không được phân bổ quá số tiền của nó (phiếu v1.7 mục d).
CREATE TRIGGER dbo.tr_payment_application_cap ON dbo.payment_application AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM (SELECT DISTINCT transaction_id FROM inserted) i
        JOIN dbo.provider_transaction t ON t.transaction_id = i.transaction_id
        CROSS APPLY (SELECT SUM(a.amount) total FROM dbo.payment_application a
                     WHERE a.transaction_id = i.transaction_id AND a.status = 'Applied') s
        WHERE s.total > t.amount)
        THROW 51020, N'Tổng phân bổ vượt số tiền của giao dịch.', 1;
END;
GO
