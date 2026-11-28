-- V051: gộp bảng quyết toán, dòng chia cho nhà đầu tư và phản hồi vào một bảng dbo.settlement_record (43 bảng còn 41).
-- Trước: settlement, settlement_line, settlement_feedback.
-- Sau: cột record_type cho biết loại bản ghi (Settlement, Line, Feedback). Bảng quyết toán giữ nguyên id.
-- Hai view v_investor_portfolio và v_settlement_reconciliation được viết lại theo bảng gộp, giữ nguyên cột trả về.
CREATE TABLE dbo.settlement_record (
    settlement_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_settlement_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    batch_id BIGINT NULL,
    revision_no SMALLINT NULL,
    actual_revenue DECIMAL(18,0) NULL,
    locked_standard_cost DECIMAL(18,0) NULL,
    revenue_pool DECIMAL(18,0) NULL,
    operator_share_pct DECIMAL(5,2) NULL,
    operator_remuneration DECIMAL(18,0) NULL,
    depreciation_amount DECIMAL(18,0) NULL,
    tax_total DECIMAL(18,0) NULL,
    status VARCHAR(20) NULL,
    proposed_at DATETIMEOFFSET(3) NULL,
    feedback_deadline DATETIMEOFFSET(3) NULL,
    approved_by BIGINT NULL,
    approved_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    settlement_mode CHAR(1) NULL,
    settlement_basis VARCHAR(20) NULL,
    platform_fee_rate_pct DECIMAL(5,2) NULL,
    platform_fee DECIMAL(18,0) NULL,
    standard_cost_deductible DECIMAL(18,0) NULL,
    actual_cost_total DECIMAL(18,0) NULL,
    excluded_fault_cost DECIMAL(18,0) NULL,
    disbursed_total DECIMAL(18,0) NULL,
    undisbursed_cost DECIMAL(18,0) NULL,
    customer_refunds DECIMAL(18,0) NULL,
    received_count INT NULL,
    dead_count INT NULL,
    survival_rate_pct DECIMAL(5,2) NULL,
    uncovered_loss DECIMAL(18,0) NULL,
    commission_pct DECIMAL(5,2) NULL,
    commission_amount DECIMAL(18,0) NULL,
    supplier_payout DECIMAL(18,0) NULL,
    is_liquidation BIT NULL,
    settlement_id BIGINT NULL,
    investor_id BIGINT NULL,
    capital_return DECIMAL(18,0) NULL,
    profit_share DECIMAL(18,0) NULL,
    tax_withheld DECIMAL(18,0) NULL,
    net_payout DECIMAL(18,0) NULL,
    in_kind_qty_kg DECIMAL(12,3) NULL,
    user_id BIGINT NULL,
    content NVARCHAR(1000) NULL,
    response NVARCHAR(1000) NULL,
    responded_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_settlement_record_record_type CHECK (record_type IN ('Settlement', 'Line', 'Feedback'))
);
GO
SET IDENTITY_INSERT dbo.settlement_record ON;
INSERT INTO dbo.settlement_record (settlement_record_id, record_type, legacy_id, batch_id, revision_no, actual_revenue, locked_standard_cost, revenue_pool, operator_share_pct, operator_remuneration, depreciation_amount, tax_total, status, proposed_at, feedback_deadline, approved_by, approved_at, created_at, updated_at, settlement_mode, settlement_basis, platform_fee_rate_pct, platform_fee, standard_cost_deductible, actual_cost_total, excluded_fault_cost, disbursed_total, undisbursed_cost, customer_refunds, received_count, dead_count, survival_rate_pct, uncovered_loss, commission_pct, commission_amount, supplier_payout, is_liquidation)
SELECT s.[settlement_id], 'Settlement', s.[settlement_id], s.[batch_id], s.[revision_no], s.[actual_revenue], s.[locked_standard_cost], s.[revenue_pool], s.[operator_share_pct], s.[operator_remuneration], s.[depreciation_amount], s.[tax_total], s.[status], s.[proposed_at], s.[feedback_deadline], s.[approved_by], s.[approved_at], s.[created_at], s.[updated_at], s.[settlement_mode], s.[settlement_basis], s.[platform_fee_rate_pct], s.[platform_fee], s.[standard_cost_deductible], s.[actual_cost_total], s.[excluded_fault_cost], s.[disbursed_total], s.[undisbursed_cost], s.[customer_refunds], s.[received_count], s.[dead_count], s.[survival_rate_pct], s.[uncovered_loss], s.[commission_pct], s.[commission_amount], s.[supplier_payout], s.[is_liquidation] FROM dbo.settlement s ORDER BY s.[settlement_id];
SET IDENTITY_INSERT dbo.settlement_record OFF;
GO
INSERT INTO dbo.settlement_record (record_type, legacy_id, settlement_id, batch_id, investor_id, capital_return, profit_share, tax_withheld, net_payout, in_kind_qty_kg, created_at)
SELECT 'Line', s.[settlement_line_id], s.[settlement_id], s.[batch_id], s.[investor_id], s.[capital_return], s.[profit_share], s.[tax_withheld], s.[net_payout], s.[in_kind_qty_kg], s.[created_at] FROM dbo.settlement_line s ORDER BY s.[settlement_line_id];
GO
INSERT INTO dbo.settlement_record (record_type, legacy_id, settlement_id, user_id, content, status, response, created_at, responded_at, updated_at)
SELECT 'Feedback', s.[feedback_id], s.[settlement_id], s.[user_id], s.[content], s.[status], s.[response], s.[created_at], s.[responded_at], s.[updated_at] FROM dbo.settlement_feedback s ORDER BY s.[feedback_id];
GO
ALTER TABLE dbo.payment_record DROP CONSTRAINT fk_payment_instruction_settlement_line_id;
ALTER TABLE dbo.payment_record DISABLE TRIGGER ALL;
UPDATE x SET x.settlement_line_id = p.settlement_record_id FROM dbo.payment_record x JOIN dbo.settlement_record p ON p.record_type = 'Line' AND p.legacy_id = x.settlement_line_id;
ALTER TABLE dbo.payment_record ENABLE TRIGGER ALL;
GO
ALTER TABLE dbo.settlement_line DROP CONSTRAINT fk_settlement_line_settlement_id;
ALTER TABLE dbo.settlement_feedback DROP CONSTRAINT fk_settlement_feedback_settlement_id;
DROP TABLE dbo.settlement;
DROP TABLE dbo.settlement_line;
DROP TABLE dbo.settlement_feedback;
GO
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_record_settlement_required CHECK (record_type <> 'Settlement' OR (batch_id IS NOT NULL AND revision_no IS NOT NULL AND actual_revenue IS NOT NULL AND locked_standard_cost IS NOT NULL AND revenue_pool IS NOT NULL AND operator_share_pct IS NOT NULL AND operator_remuneration IS NOT NULL AND depreciation_amount IS NOT NULL AND tax_total IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL AND settlement_mode IS NOT NULL AND settlement_basis IS NOT NULL AND platform_fee_rate_pct IS NOT NULL AND platform_fee IS NOT NULL AND standard_cost_deductible IS NOT NULL AND actual_cost_total IS NOT NULL AND excluded_fault_cost IS NOT NULL AND disbursed_total IS NOT NULL AND undisbursed_cost IS NOT NULL AND customer_refunds IS NOT NULL AND received_count IS NOT NULL AND dead_count IS NOT NULL AND uncovered_loss IS NOT NULL AND commission_amount IS NOT NULL AND supplier_payout IS NOT NULL AND is_liquidation IS NOT NULL));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_actual_revenue CHECK (record_type <> 'Settlement' OR ([actual_revenue]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_basis CHECK (record_type <> 'Settlement' OR ([settlement_basis]='ActualCost' OR [settlement_basis]='StandardCost'));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_deadline CHECK (record_type <> 'Settlement' OR ([feedback_deadline] IS NULL OR [proposed_at] IS NULL OR [feedback_deadline]>=dateadd(day,(7),[proposed_at])));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_locked_cost_nonneg CHECK (record_type <> 'Settlement' OR ([locked_standard_cost]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_mode CHECK (record_type <> 'Settlement' OR ([settlement_mode]='A' OR [settlement_mode]='T' OR [settlement_mode]='P'));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_money_v15 CHECK (record_type <> 'Settlement' OR ([platform_fee]>=(0) AND [standard_cost_deductible]>=(0) AND [actual_cost_total]>=(0) AND [excluded_fault_cost]>=(0) AND [disbursed_total]>=(0) AND [undisbursed_cost]>=(0) AND [customer_refunds]>=(0) AND [uncovered_loss]>=(0) AND [commission_amount]>=(0) AND [supplier_payout]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_operator_remuneration CHECK (record_type <> 'Settlement' OR ([operator_remuneration]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_pool_v15 CHECK (record_type <> 'Settlement' OR ([revenue_pool]=(([actual_revenue]-[platform_fee])-[locked_standard_cost])));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_remuneration CHECK (record_type <> 'Settlement' OR ([revenue_pool]>(0) OR [operator_remuneration]=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_status CHECK (record_type <> 'Settlement' OR ([status]='Closed' OR [status]='PaidOut' OR [status]='Approved' OR [status]='Disputed' OR [status]='Proposed' OR [status]='Draft'));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_record_line_required CHECK (record_type <> 'Line' OR (settlement_id IS NOT NULL AND batch_id IS NOT NULL AND investor_id IS NOT NULL AND capital_return IS NOT NULL AND profit_share IS NOT NULL AND tax_withheld IS NOT NULL AND net_payout IS NOT NULL AND in_kind_qty_kg IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_line_capital_return CHECK (record_type <> 'Line' OR ([capital_return]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_line_loss CHECK (record_type <> 'Line' OR (([capital_return]+[profit_share])>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_line_net CHECK (record_type <> 'Line' OR ([net_payout]=(([capital_return]+[profit_share])-[tax_withheld])));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_line_net_payout CHECK (record_type <> 'Line' OR ([net_payout]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_line_tax_withheld CHECK (record_type <> 'Line' OR ([tax_withheld]>=(0)));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_record_feedback_required CHECK (record_type <> 'Feedback' OR (settlement_id IS NOT NULL AND user_id IS NOT NULL AND content IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.settlement_record ADD CONSTRAINT ck_settlement_feedback_status CHECK (record_type <> 'Feedback' OR ([status]='Unresolved' OR [status]='Withdrawn' OR [status]='Answered' OR [status]='Open'));
GO
CREATE UNIQUE INDEX uq_settlement_batch_id ON dbo.settlement_record (batch_id) WHERE record_type = 'Settlement';
CREATE INDEX ix_settlement_approved_by ON dbo.settlement_record (approved_by) WHERE record_type = 'Settlement';
CREATE UNIQUE INDEX ux_settlement_line_investor ON dbo.settlement_record (settlement_id, investor_id) WHERE record_type = 'Line';
CREATE INDEX ix_settlement_line_batch_id ON dbo.settlement_record (batch_id) WHERE record_type = 'Line';
CREATE INDEX ix_settlement_line_investor_id ON dbo.settlement_record (investor_id) WHERE record_type = 'Line';
CREATE INDEX ix_settlement_line_batch_id_investor_id ON dbo.settlement_record (batch_id, investor_id) WHERE record_type = 'Line';
CREATE INDEX ix_settlement_feedback_settlement_id ON dbo.settlement_record (settlement_id) WHERE record_type = 'Feedback';
CREATE INDEX ix_settlement_feedback_user_id ON dbo.settlement_record (user_id) WHERE record_type = 'Feedback';
GO
ALTER TABLE dbo.settlement_record ADD CONSTRAINT fk_settlement_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.settlement_record ADD CONSTRAINT fk_settlement_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.settlement_record ADD CONSTRAINT fk_settlement_line_batch_id_investor_id FOREIGN KEY (batch_id, investor_id) REFERENCES dbo.capital_share(batch_id, investor_id);
ALTER TABLE dbo.settlement_record ADD CONSTRAINT fk_settlement_line_investor_id FOREIGN KEY (investor_id) REFERENCES dbo.investor(user_id);
ALTER TABLE dbo.settlement_record ADD CONSTRAINT fk_settlement_line_settlement_id FOREIGN KEY (settlement_id) REFERENCES dbo.settlement_record(settlement_record_id);
ALTER TABLE dbo.settlement_record ADD CONSTRAINT fk_settlement_feedback_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_settlement_line_id FOREIGN KEY (settlement_line_id) REFERENCES dbo.settlement_record(settlement_record_id);
GO
-- Bảng quyết toán đã duyệt không được sửa số liệu (BR-30).
CREATE TRIGGER dbo.trg_settlement_locked ON dbo.settlement_record AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted d JOIN inserted i ON i.settlement_record_id = d.settlement_record_id
               WHERE d.record_type = 'Settlement' AND d.status IN ('Approved', 'PaidOut', 'Closed')
                 AND (i.actual_revenue <> d.actual_revenue OR i.locked_standard_cost <> d.locked_standard_cost
                      OR i.revenue_pool <> d.revenue_pool OR i.operator_remuneration <> d.operator_remuneration
                      OR i.tax_total <> d.tax_total))
        THROW 50003, N'Bảng quyết toán đã duyệt không được sửa số liệu (BR-30).', 1;
END;
GO
-- Dòng quyết toán của bảng đã duyệt không được thay đổi (BR-30).
CREATE TRIGGER dbo.trg_settlement_line_locked ON dbo.settlement_record AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.settlement_record s
               WHERE s.record_type = 'Settlement' AND s.status IN ('Approved', 'PaidOut', 'Closed')
                 AND s.settlement_record_id IN (SELECT settlement_id FROM inserted WHERE record_type = 'Line'
                                                UNION SELECT settlement_id FROM deleted WHERE record_type = 'Line'))
        THROW 50004, N'Dòng quyết toán của bảng đã duyệt không được thay đổi (BR-30).', 1;
END;
GO
-- Hai view đọc bảng quyết toán: viết lại theo bảng gộp, giữ nguyên tên và cột trả về.
CREATE OR ALTER VIEW dbo.v_investor_portfolio AS
SELECT cs.investor_id, u.full_name, b.batch_id, b.batch_code, b.status AS batch_status,
       cs.confirmed_amount,
       CAST(cs.confirmed_amount * 1.0 / NULLIF(b.total_confirmed_capital, 0) AS DECIMAL(9,6)) AS capital_ratio,
       s.status AS settlement_status, sl.capital_return, sl.profit_share, sl.tax_withheld, sl.net_payout, sl.in_kind_qty_kg
FROM dbo.capital_share cs
JOIN dbo.batch b     ON b.batch_id = cs.batch_id
JOIN dbo.app_user u  ON u.user_id = cs.investor_id
LEFT JOIN dbo.settlement_record s  ON s.record_type = 'Settlement' AND s.batch_id = b.batch_id
LEFT JOIN dbo.settlement_record sl ON sl.record_type = 'Line' AND sl.settlement_id = s.settlement_record_id AND sl.investor_id = cs.investor_id;
GO
CREATE OR ALTER VIEW dbo.v_settlement_reconciliation AS
SELECT s.settlement_record_id AS settlement_id, s.batch_id, s.actual_revenue, s.locked_standard_cost, s.revenue_pool, s.operator_remuneration,
       CASE WHEN s.revenue_pool > 0 THEN s.revenue_pool - s.operator_remuneration ELSE s.revenue_pool END AS distributable,
       ISNULL(SUM(sl.profit_share), 0)  AS sum_profit_share,
       ISNULL(SUM(sl.capital_return), 0) AS sum_capital_return,
       ISNULL(SUM(sl.tax_withheld), 0)  AS sum_tax_withheld,
       COUNT(sl.settlement_record_id)    AS line_count,
       CASE WHEN s.revenue_pool > 0 THEN s.revenue_pool - s.operator_remuneration ELSE s.revenue_pool END
         - ISNULL(SUM(sl.profit_share), 0) AS difference
FROM dbo.settlement_record s
LEFT JOIN dbo.settlement_record sl ON sl.record_type = 'Line' AND sl.settlement_id = s.settlement_record_id
WHERE s.record_type = 'Settlement'
GROUP BY s.settlement_record_id, s.batch_id, s.actual_revenue, s.locked_standard_cost, s.revenue_pool, s.operator_remuneration;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
