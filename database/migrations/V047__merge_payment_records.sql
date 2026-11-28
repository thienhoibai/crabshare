-- V047: gộp yêu cầu thanh toán, lệnh chi, giao dịch của tổ chức thanh toán, phân bổ giao dịch và đợt giải ngân vào một bảng dbo.payment_record (58 bảng còn 54).
-- Trước: payment_request, payment_instruction, provider_transaction, payment_application, disbursement_tranche.
-- Sau: cột record_type cho biết loại bản ghi (Request, Instruction, Transaction, Application, Disbursement). Lệnh chi giữ nguyên id vì mã gửi cổng thanh toán là CHI + id lệnh chi.
-- Đổi tên cột: payment_request.tranche_id thành delivery_tranche_id (đợt giao hàng), provider_transaction.reference_code thành txn_reference_code.
CREATE TABLE dbo.payment_record (
    payment_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_payment_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    batch_account_id BIGINT NULL,
    instruction_type VARCHAR(20) NULL,
    amount DECIMAL(18,0) NULL,
    payout_account_id BIGINT NULL,
    beneficiary_note NVARCHAR(200) NULL,
    tranche_id BIGINT NULL,
    settlement_line_id BIGINT NULL,
    contribution_id BIGINT NULL,
    order_id BIGINT NULL,
    status VARCHAR(20) NULL,
    sent_at DATETIMEOFFSET(3) NULL,
    completed_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    reference_code VARCHAR(30) NULL,
    purpose VARCHAR(20) NULL,
    offtake_id BIGINT NULL,
    expires_at DATETIMEOFFSET(3) NULL,
    delivery_tranche_id BIGINT NULL,
    provider_txn_id VARCHAR(80) NULL,
    direction VARCHAR(20) NULL,
    txn_reference_code VARCHAR(60) NULL,
    payment_request_id BIGINT NULL,
    instruction_id BIGINT NULL,
    match_status VARCHAR(20) NULL,
    occurred_at DATETIMEOFFSET(3) NULL,
    received_at DATETIMEOFFSET(3) NULL,
    transaction_id BIGINT NULL,
    target_type VARCHAR(30) NULL,
    target_id BIGINT NULL,
    applied_at DATETIMEOFFSET(3) NULL,
    batch_id BIGINT NULL,
    tranche_no TINYINT NULL,
    planned_amount DECIMAL(18,0) NULL,
    planned_date DATE NULL,
    unlock_condition NVARCHAR(300) NULL,
    requested_at DATETIMEOFFSET(3) NULL,
    explanation_deadline DATETIMEOFFSET(3) NULL,
    released_at DATETIMEOFFSET(3) NULL,
    anchor_code VARCHAR(20) NULL,
    offset_days SMALLINT NULL,
    milestone_kind VARCHAR(20) NULL,
    milestone_name NVARCHAR(100) NULL,
    pct DECIMAL(5,2) NULL,
    CONSTRAINT ck_payment_record_record_type CHECK (record_type IN ('Instruction', 'Request', 'Transaction', 'Application', 'Disbursement'))
);
GO
SET IDENTITY_INSERT dbo.payment_record ON;
INSERT INTO dbo.payment_record (payment_record_id, record_type, legacy_id, batch_account_id, instruction_type, amount, payout_account_id, beneficiary_note, tranche_id, settlement_line_id, contribution_id, order_id, status, sent_at, completed_at, created_at, updated_at)
SELECT s.[instruction_id], 'Instruction', s.[instruction_id], s.[batch_account_id], s.[instruction_type], s.[amount], s.[payout_account_id], s.[beneficiary_note], s.[tranche_id], s.[settlement_line_id], s.[contribution_id], s.[order_id], s.[status], s.[sent_at], s.[completed_at], s.[created_at], s.[updated_at] FROM dbo.payment_instruction s ORDER BY s.[instruction_id];
SET IDENTITY_INSERT dbo.payment_record OFF;
GO
INSERT INTO dbo.payment_record (record_type, legacy_id, reference_code, batch_account_id, purpose, amount, contribution_id, order_id, offtake_id, expires_at, status, created_at, updated_at, delivery_tranche_id)
SELECT 'Request', s.[payment_request_id], s.[reference_code], s.[batch_account_id], s.[purpose], s.[amount], s.[contribution_id], s.[order_id], s.[offtake_id], s.[expires_at], s.[status], s.[created_at], s.[updated_at], s.[tranche_id] FROM dbo.payment_request s ORDER BY s.[payment_request_id];
GO
INSERT INTO dbo.payment_record (record_type, legacy_id, provider_txn_id, batch_account_id, direction, amount, txn_reference_code, payment_request_id, instruction_id, match_status, occurred_at, received_at)
SELECT 'Transaction', s.[transaction_id], s.[provider_txn_id], s.[batch_account_id], s.[direction], s.[amount], s.[reference_code], s.[payment_request_id], s.[instruction_id], s.[match_status], s.[occurred_at], s.[received_at] FROM dbo.provider_transaction s ORDER BY s.[transaction_id];
GO
INSERT INTO dbo.payment_record (record_type, legacy_id, transaction_id, target_type, target_id, amount, status, applied_at)
SELECT 'Application', s.[application_id], s.[transaction_id], s.[target_type], s.[target_id], s.[amount], s.[status], s.[applied_at] FROM dbo.payment_application s ORDER BY s.[application_id];
GO
INSERT INTO dbo.payment_record (record_type, legacy_id, batch_id, tranche_no, planned_amount, planned_date, unlock_condition, status, requested_at, explanation_deadline, released_at, created_at, updated_at, anchor_code, offset_days, milestone_kind, milestone_name, pct)
SELECT 'Disbursement', s.[tranche_id], s.[batch_id], s.[tranche_no], s.[planned_amount], s.[planned_date], s.[unlock_condition], s.[status], s.[requested_at], s.[explanation_deadline], s.[released_at], s.[created_at], s.[updated_at], s.[anchor_code], s.[offset_days], s.[milestone_kind], s.[milestone_name], s.[pct] FROM dbo.disbursement_tranche s ORDER BY s.[tranche_id];
GO
UPDATE c SET c.tranche_id = p.payment_record_id FROM dbo.payment_record c JOIN dbo.payment_record p ON p.record_type = 'Disbursement' AND p.legacy_id = c.tranche_id WHERE c.record_type = 'Instruction';
UPDATE c SET c.payment_request_id = p.payment_record_id FROM dbo.payment_record c JOIN dbo.payment_record p ON p.record_type = 'Request' AND p.legacy_id = c.payment_request_id WHERE c.record_type = 'Transaction';
UPDATE c SET c.transaction_id = p.payment_record_id FROM dbo.payment_record c JOIN dbo.payment_record p ON p.record_type = 'Transaction' AND p.legacy_id = c.transaction_id WHERE c.record_type = 'Application';
ALTER TABLE dbo.claim DROP CONSTRAINT fk_claim_refund;
ALTER TABLE dbo.evidence DROP CONSTRAINT fk_evidence_tranche_id;
UPDATE x SET x.tranche_id = p.payment_record_id FROM dbo.evidence x JOIN dbo.payment_record p ON p.record_type = 'Disbursement' AND p.legacy_id = x.tranche_id;
GO
ALTER TABLE dbo.payment_instruction DROP CONSTRAINT fk_payment_instruction_tranche_id;
ALTER TABLE dbo.provider_transaction DROP CONSTRAINT fk_provider_transaction_instruction_id;
ALTER TABLE dbo.provider_transaction DROP CONSTRAINT fk_provider_transaction_payment_request_id;
ALTER TABLE dbo.payment_application DROP CONSTRAINT fk_payment_application_txn;
DROP TABLE dbo.payment_instruction;
DROP TABLE dbo.payment_request;
DROP TABLE dbo.provider_transaction;
DROP TABLE dbo.payment_application;
DROP TABLE dbo.disbursement_tranche;
GO
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_record_instruction_required CHECK (record_type <> 'Instruction' OR (batch_account_id IS NOT NULL AND instruction_type IS NOT NULL AND amount IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_instruction_amount CHECK (record_type <> 'Instruction' OR ([amount]>(0)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_instruction_instruction_type CHECK (record_type <> 'Instruction' OR ([instruction_type]='SupplierPayout' OR [instruction_type]='Commission' OR [instruction_type]='PlatformFee' OR [instruction_type]='TaxPayment' OR [instruction_type]='Refund' OR [instruction_type]='Payout' OR [instruction_type]='Disbursement'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_instruction_status CHECK (record_type <> 'Instruction' OR ([status]='Disputed' OR [status]='Failed' OR [status]='Succeeded' OR [status]='Sent' OR [status]='Created'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_record_request_required CHECK (record_type <> 'Request' OR (reference_code IS NOT NULL AND batch_account_id IS NOT NULL AND purpose IS NOT NULL AND amount IS NOT NULL AND expires_at IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_request_amount CHECK (record_type <> 'Request' OR ([amount]>(0)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_request_purpose CHECK (record_type <> 'Request' OR ([purpose]='OfftakePayment' OR [purpose]='OfftakeDeposit' OR [purpose]='PreOrderBalance' OR [purpose]='PreOrderDeposit' OR [purpose]='OrderPayment' OR [purpose]='Contribution'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_request_status CHECK (record_type <> 'Request' OR ([status]='Cancelled' OR [status]='Expired' OR [status]='Paid' OR [status]='Pending'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_request_target CHECK (record_type <> 'Request' OR (((case when [contribution_id] IS NULL then (0) else (1) end+case when [order_id] IS NULL then (0) else (1) end)+case when [offtake_id] IS NULL then (0) else (1) end)=(1)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_record_transaction_required CHECK (record_type <> 'Transaction' OR (provider_txn_id IS NOT NULL AND batch_account_id IS NOT NULL AND direction IS NOT NULL AND amount IS NOT NULL AND match_status IS NOT NULL AND occurred_at IS NOT NULL AND received_at IS NOT NULL));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_provider_transaction_amount CHECK (record_type <> 'Transaction' OR ([amount]>(0)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_provider_transaction_direction CHECK (record_type <> 'Transaction' OR ([direction]='Out' OR [direction]='In'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_provider_transaction_match_status CHECK (record_type <> 'Transaction' OR ([match_status]='LatePayment' OR [match_status]='Unmatched' OR [match_status]='Matched'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_txn_link CHECK (record_type <> 'Transaction' OR ([direction]='In' AND [instruction_id] IS NULL OR [direction]='Out' AND [payment_request_id] IS NULL));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_record_application_required CHECK (record_type <> 'Application' OR (transaction_id IS NOT NULL AND target_type IS NOT NULL AND target_id IS NOT NULL AND amount IS NOT NULL AND status IS NOT NULL AND applied_at IS NOT NULL));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_application_amount CHECK (record_type <> 'Application' OR ([amount]>(0)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_application_status CHECK (record_type <> 'Application' OR ([status]='Reversed' OR [status]='Applied'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_application_target CHECK (record_type <> 'Application' OR ([target_type]='Other' OR [target_type]='OrderPayment' OR [target_type]='PaymentInstruction' OR [target_type]='Refund' OR [target_type]='FinalOrder' OR [target_type]='InvoicedSale' OR [target_type]='Invoice' OR [target_type]='TrancheBalance' OR [target_type]='OrderDeposit' OR [target_type]='Contribution'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_payment_record_disbursement_required CHECK (record_type <> 'Disbursement' OR (batch_id IS NOT NULL AND tranche_no IS NOT NULL AND planned_amount IS NOT NULL AND unlock_condition IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_disbursement_tranche_planned_amount CHECK (record_type <> 'Disbursement' OR ([planned_amount]>(0)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_disbursement_tranche_status CHECK (record_type <> 'Disbursement' OR ([status]='Stopped' OR [status]='Blocked' OR [status]='Released' OR [status]='NeedsExplanation' OR [status]='Requested' OR [status]='Planned'));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_disbursement_tranche_tranche_no CHECK (record_type <> 'Disbursement' OR ([tranche_no]>(0)));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_tranche_kind CHECK (record_type <> 'Disbursement' OR ([milestone_kind] IS NULL OR ([milestone_kind]='Custom' OR [milestone_kind]='Settlement' OR [milestone_kind]='MidCycle' OR [milestone_kind]='Receipt')));
ALTER TABLE dbo.payment_record ADD CONSTRAINT ck_tranche_timing CHECK (record_type <> 'Disbursement' OR ([milestone_kind] IS NOT NULL OR [anchor_code] IS NULL AND [offset_days] IS NULL AND [planned_date] IS NOT NULL OR ([anchor_code]='Stocked' OR [anchor_code]='FundingReady') AND [offset_days] IS NOT NULL AND [offset_days]>=(0)));
GO
CREATE INDEX ix_payment_instruction_batch_account_id_status ON dbo.payment_record (batch_account_id, status) WHERE record_type = 'Instruction';
CREATE INDEX ix_payment_instruction_payout_account_id ON dbo.payment_record (payout_account_id) WHERE record_type = 'Instruction';
CREATE INDEX ix_payment_instruction_tranche_id ON dbo.payment_record (tranche_id) WHERE record_type = 'Instruction';
CREATE INDEX ix_payment_instruction_settlement_line_id ON dbo.payment_record (settlement_line_id) WHERE record_type = 'Instruction';
CREATE INDEX ix_payment_instruction_contribution_id ON dbo.payment_record (contribution_id) WHERE record_type = 'Instruction';
CREATE INDEX ix_payment_instruction_order_id ON dbo.payment_record (order_id) WHERE record_type = 'Instruction';
CREATE UNIQUE INDEX uq_payment_request_reference_code ON dbo.payment_record (reference_code) WHERE record_type = 'Request';
CREATE INDEX ix_payment_request_batch_account_id ON dbo.payment_record (batch_account_id) WHERE record_type = 'Request';
CREATE INDEX ix_payment_request_contribution_id ON dbo.payment_record (contribution_id) WHERE record_type = 'Request';
CREATE INDEX ix_payment_request_order_id ON dbo.payment_record (order_id) WHERE record_type = 'Request';
CREATE INDEX ix_payment_request_offtake_id ON dbo.payment_record (offtake_id) WHERE record_type = 'Request';
CREATE UNIQUE INDEX uq_provider_transaction_provider_txn_id ON dbo.payment_record (provider_txn_id) WHERE record_type = 'Transaction';
CREATE INDEX ix_provider_transaction_batch_account_id_occurred_at ON dbo.payment_record (batch_account_id, occurred_at) WHERE record_type = 'Transaction';
CREATE INDEX ix_provider_transaction_payment_request_id ON dbo.payment_record (payment_request_id) WHERE record_type = 'Transaction';
CREATE INDEX ix_provider_transaction_instruction_id ON dbo.payment_record (instruction_id) WHERE record_type = 'Transaction';
CREATE INDEX ix_payment_application_txn ON dbo.payment_record (transaction_id) WHERE record_type = 'Application';
CREATE INDEX ix_payment_application_target ON dbo.payment_record (target_type, target_id) WHERE record_type = 'Application';
CREATE UNIQUE INDEX ux_tranche_no ON dbo.payment_record (batch_id, tranche_no) WHERE record_type = 'Disbursement';
GO
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_batch_account_id FOREIGN KEY (batch_account_id) REFERENCES dbo.batch_record(batch_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_contribution_id FOREIGN KEY (contribution_id) REFERENCES dbo.contribution(contribution_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_order_id FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_payout_account_id FOREIGN KEY (payout_account_id) REFERENCES dbo.user_record(user_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_settlement_line_id FOREIGN KEY (settlement_line_id) REFERENCES dbo.settlement_line(settlement_line_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_instruction_tranche_id FOREIGN KEY (tranche_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_request_offtake_id FOREIGN KEY (offtake_id) REFERENCES dbo.offtake_commitment(offtake_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_request_tranche FOREIGN KEY (delivery_tranche_id) REFERENCES dbo.delivery_record(delivery_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_provider_transaction_instruction_id FOREIGN KEY (instruction_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_provider_transaction_payment_request_id FOREIGN KEY (payment_request_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_payment_application_txn FOREIGN KEY (transaction_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.payment_record ADD CONSTRAINT fk_disbursement_tranche_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.claim ADD CONSTRAINT fk_claim_refund FOREIGN KEY (refund_instruction_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.evidence ADD CONSTRAINT fk_evidence_tranche_id FOREIGN KEY (tranche_id) REFERENCES dbo.payment_record(payment_record_id);
GO
-- Tổng phân bổ của một giao dịch không vượt số tiền giao dịch.
CREATE TRIGGER dbo.tr_payment_application_cap ON dbo.payment_record AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM (SELECT DISTINCT transaction_id FROM inserted WHERE record_type = 'Application') i
        JOIN dbo.payment_record t ON t.record_type = 'Transaction' AND t.payment_record_id = i.transaction_id
        CROSS APPLY (SELECT SUM(a.amount) total FROM dbo.payment_record a
                     WHERE a.record_type = 'Application' AND a.transaction_id = i.transaction_id AND a.status = 'Applied') s
        WHERE s.total > t.amount)
        THROW 51020, N'Tổng phân bổ vượt số tiền của giao dịch.', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
