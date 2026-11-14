-- V025 — BR v1.5 nhóm G7: mốc giải ngân có cổng bằng chứng (BR-144 – BR-147, BR-233), biên bản thăm trại, sáu điều kiện chờ quyết toán
-- (BR-183), quyết toán lô P theo phí trên doanh thu thực thu, cơ sở quyết toán, bậc thù lao theo tỷ lệ sống (BR-187 – BR-199),
-- quyết toán lô T và lô A (BR-200, BR-201), thanh lý sớm (BR-210), quyết định tập thể và phiếu biểu quyết (BR-211).
-- Chỉ thêm và nới ràng buộc; không xoá dữ liệu.

ALTER TABLE dbo.batch DROP CONSTRAINT ck_batch_status;
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_status CHECK (status IN ('Draft', 'PendingApproval', 'NeedsRevision', 'Rejected',
    'Funding', 'Cancelled', 'Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling', 'Liquidating', 'AwaitingSettlement',
    'Settling', 'Settlement', 'Closed'));
GO
ALTER TABLE dbo.batch ADD
    -- Lô A: tỷ lệ hoa hồng theo hợp đồng đại lý (BR-201).
    commission_pct            DECIMAL(5,2) NULL,
    liquidation_started_at    DATETIMEOFFSET(3) NULL,
    awaiting_settlement_at    DATETIMEOFFSET(3) NULL;
GO
ALTER TABLE dbo.batch ADD CONSTRAINT ck_batch_commission_pct CHECK (commission_pct IS NULL OR commission_pct BETWEEN 0 AND 100);
GO

-- Quyết toán: phí nền tảng trên doanh thu thực thu, cơ sở quyết toán, tỷ lệ sống và bậc thù lao, lô T và lô A.
ALTER TABLE dbo.settlement DROP CONSTRAINT ck_settlement_pool;
ALTER TABLE dbo.settlement DROP CONSTRAINT ck_settlement_locked_standard_cost;
GO
ALTER TABLE dbo.settlement ADD
    settlement_mode           CHAR(1)       NOT NULL CONSTRAINT df_settlement_mode DEFAULT ('P'),
    settlement_basis          VARCHAR(20)   NOT NULL CONSTRAINT df_settlement_basis DEFAULT ('StandardCost'),
    platform_fee_rate_pct     DECIMAL(5,2)  NOT NULL CONSTRAINT df_settlement_fee_rate DEFAULT (0),
    platform_fee              DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_fee DEFAULT (0),
    standard_cost_deductible  DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_std_cost DEFAULT (0),
    actual_cost_total         DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_actual_cost DEFAULT (0),
    excluded_fault_cost       DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_fault_cost DEFAULT (0),
    disbursed_total           DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_disbursed DEFAULT (0),
    undisbursed_cost          DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_undisbursed DEFAULT (0),
    customer_refunds          DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_refunds DEFAULT (0),
    received_count            INT           NOT NULL CONSTRAINT df_settlement_received DEFAULT (0),
    dead_count                INT           NOT NULL CONSTRAINT df_settlement_dead DEFAULT (0),
    survival_rate_pct         DECIMAL(5,2)  NULL,
    uncovered_loss            DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_uncovered DEFAULT (0),
    commission_pct            DECIMAL(5,2)  NULL,
    commission_amount         DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_commission DEFAULT (0),
    supplier_payout           DECIMAL(18,0) NOT NULL CONSTRAINT df_settlement_supplier DEFAULT (0),
    is_liquidation            BIT           NOT NULL CONSTRAINT df_settlement_liquidation DEFAULT (0);
GO
ALTER TABLE dbo.settlement ADD CONSTRAINT ck_settlement_mode CHECK (settlement_mode IN ('P', 'T', 'A'));
ALTER TABLE dbo.settlement ADD CONSTRAINT ck_settlement_basis CHECK (settlement_basis IN ('StandardCost', 'ActualCost'));
ALTER TABLE dbo.settlement ADD CONSTRAINT ck_settlement_locked_cost_nonneg CHECK (locked_standard_cost >= 0);
-- BR-189: Revenue Pool = doanh thu thực thu − phí nền tảng − chi phí trừ (locked_standard_cost là chi phí trừ theo cơ sở đã chọn).
ALTER TABLE dbo.settlement ADD CONSTRAINT ck_settlement_pool_v15 CHECK (revenue_pool = actual_revenue - platform_fee - locked_standard_cost);
ALTER TABLE dbo.settlement ADD CONSTRAINT ck_settlement_money_v15 CHECK (platform_fee >= 0 AND standard_cost_deductible >= 0 AND actual_cost_total >= 0
    AND excluded_fault_cost >= 0 AND disbursed_total >= 0 AND undisbursed_cost >= 0 AND customer_refunds >= 0 AND uncovered_loss >= 0
    AND commission_amount >= 0 AND supplier_payout >= 0);
GO

-- Lệnh chi mới: phí nền tảng (BR-188), hoa hồng và tiền trả nhà cung cấp lô A (BR-201).
ALTER TABLE dbo.payment_instruction DROP CONSTRAINT ck_payment_instruction_instruction_type;
ALTER TABLE dbo.payment_instruction ADD CONSTRAINT ck_payment_instruction_instruction_type
    CHECK (instruction_type IN ('Disbursement', 'Payout', 'Refund', 'TaxPayment', 'PlatformFee', 'Commission', 'SupplierPayout'));
GO

-- Mốc giải ngân: mốc chưa giải ngân dừng lại khi thanh lý sớm (BR-147, BR-210).
ALTER TABLE dbo.disbursement_tranche DROP CONSTRAINT ck_disbursement_tranche_status;
ALTER TABLE dbo.disbursement_tranche ADD CONSTRAINT ck_disbursement_tranche_status
    CHECK (status IN ('Planned', 'Requested', 'NeedsExplanation', 'Released', 'Blocked', 'Stopped'));
GO

-- BR-233: biên bản thăm trại do Nhân viên kiểm phẩm được phân ngẫu nhiên lập tại trại trong ứng dụng.
CREATE TABLE dbo.site_visit_report (
    report_id         BIGINT IDENTITY(1,1) NOT NULL,
    report_no         VARCHAR(20)   NOT NULL,
    batch_id          BIGINT        NOT NULL,
    qc_assignment_id  BIGINT        NOT NULL,
    qc_user_id        BIGINT        NOT NULL,
    visited_at        DATETIMEOFFSET(3) NOT NULL,
    latitude          DECIMAL(9,6)  NOT NULL,
    longitude         DECIMAL(9,6)  NOT NULL,
    distance_to_farm_m INT          NULL,
    box_codes         VARCHAR(400)  NOT NULL,
    crabs_seen        INT           NOT NULL,
    findings          NVARCHAR(1000) NOT NULL,
    photo_uri         NVARCHAR(500) NOT NULL,
    photo_sha256      VARCHAR(64)   NOT NULL,
    created_at        DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_site_visit_report PRIMARY KEY (report_id),
    CONSTRAINT ux_site_visit_report_no UNIQUE (report_no),
    CONSTRAINT ux_site_visit_report_assignment UNIQUE (qc_assignment_id),
    CONSTRAINT fk_site_visit_report_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_site_visit_report_assignment FOREIGN KEY (qc_assignment_id) REFERENCES dbo.qc_assignment(qc_assignment_id),
    CONSTRAINT fk_site_visit_report_user FOREIGN KEY (qc_user_id) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_site_visit_report_crabs CHECK (crabs_seen >= 0)
);
GO

-- BR-211: quyết định tập thể của nhà đầu tư, tính theo vốn.
CREATE TABLE dbo.collective_decision (
    decision_id        BIGINT IDENTITY(1,1) NOT NULL,
    decision_no        VARCHAR(20)   NOT NULL,
    batch_id           BIGINT        NOT NULL,
    -- EarlyLiquidation (thanh lý sớm, BR-210), SurplusSale (bán phần dư khi bên cam kết không mua, BR-182).
    decision_kind      VARCHAR(20)   NOT NULL,
    proposal           NVARCHAR(1000) NOT NULL,
    proposed_by        BIGINT        NOT NULL,
    opened_at          DATETIMEOFFSET(3) NOT NULL,
    closes_at          DATETIMEOFFSET(3) NOT NULL,
    -- Open, Passed, Rejected, Cancelled.
    status             VARCHAR(20)   NOT NULL CONSTRAINT df_collective_decision_status DEFAULT ('Open'),
    eligible_capital   DECIMAL(18,0) NOT NULL,
    yes_capital        DECIMAL(18,0) NOT NULL CONSTRAINT df_collective_decision_yes DEFAULT (0),
    no_capital         DECIMAL(18,0) NOT NULL CONSTRAINT df_collective_decision_no DEFAULT (0),
    decided_at         DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_collective_decision PRIMARY KEY (decision_id),
    CONSTRAINT ux_collective_decision_no UNIQUE (decision_no),
    CONSTRAINT fk_collective_decision_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_collective_decision_proposer FOREIGN KEY (proposed_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_collective_decision_kind CHECK (decision_kind IN ('EarlyLiquidation', 'SurplusSale')),
    CONSTRAINT ck_collective_decision_status CHECK (status IN ('Open', 'Passed', 'Rejected', 'Cancelled')),
    CONSTRAINT ck_collective_decision_window CHECK (closes_at > opened_at),
    CONSTRAINT ck_collective_decision_capital CHECK (eligible_capital >= 0 AND yes_capital >= 0 AND no_capital >= 0
        AND yes_capital + no_capital <= eligible_capital)
);
CREATE UNIQUE INDEX ux_collective_decision_open ON dbo.collective_decision(batch_id, decision_kind) WHERE status = 'Open';
GO
CREATE TABLE dbo.vote (
    vote_id        BIGINT IDENTITY(1,1) NOT NULL,
    decision_id    BIGINT        NOT NULL,
    investor_id    BIGINT        NOT NULL,
    -- Trọng số = vốn đã chốt của người bỏ phiếu (BR-211).
    capital        DECIMAL(18,0) NOT NULL,
    choice         VARCHAR(10)   NOT NULL,
    voted_at       DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_vote PRIMARY KEY (vote_id),
    CONSTRAINT ux_vote_investor UNIQUE (decision_id, investor_id),
    CONSTRAINT fk_vote_decision FOREIGN KEY (decision_id) REFERENCES dbo.collective_decision(decision_id),
    CONSTRAINT fk_vote_investor FOREIGN KEY (investor_id) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_vote_choice CHECK (choice IN ('Yes', 'No')),
    CONSTRAINT ck_vote_capital CHECK (capital > 0)
);
GO
