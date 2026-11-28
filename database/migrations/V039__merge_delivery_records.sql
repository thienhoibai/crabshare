-- V039: gộp các chứng từ giao hàng vào một bảng dbo.delivery_record (85 bảng còn 80).
-- Trước: delivery_tranche, delivery_tranche_line, shipment, shipment_line, delivery_acceptance, invoice.
-- Sau: cột record_type cho biết loại bản ghi (Tranche, TrancheLine, Shipment, ShipmentLine, Acceptance, Invoice). Đợt giao giữ nguyên id.
CREATE TABLE dbo.delivery_record (
    delivery_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_delivery_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    order_id BIGINT NULL,
    seq TINYINT NULL,
    due_date DATE NULL,
    status VARCHAR(20) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    tranche_id BIGINT NULL,
    line_id BIGINT NULL,
    qty_crabs INT NULL,
    qty_kg DECIMAL(12,3) NULL,
    converted_crabs INT NULL,
    shipment_no VARCHAR(20) NULL,
    batch_id BIGINT NULL,
    scheduled_at DATETIMEOFFSET(3) NULL,
    dispatched_at DATETIMEOFFSET(3) NULL,
    delivered_at DATETIMEOFFSET(3) NULL,
    return_window_ends_at DATETIMEOFFSET(3) NULL,
    transport_condition NVARCHAR(300) NULL,
    created_by BIGINT NULL,
    shipment_id BIGINT NULL,
    dispatched_crabs INT NULL,
    dispatched_kg DECIMAL(12,3) NULL,
    received_crabs INT NULL,
    received_kg DECIMAL(12,3) NULL,
    accepted_crabs INT NULL,
    accepted_kg DECIMAL(12,3) NULL,
    rejected_crabs INT NULL,
    price_per_kg DECIMAL(18,0) NULL,
    goods_value DECIMAL(18,0) NULL,
    discrepancy_reason NVARCHAR(300) NULL,
    operator_recorded_by BIGINT NULL,
    operator_recorded_at DATETIMEOFFSET(3) NULL,
    customer_confirmed_by BIGINT NULL,
    customer_confirmed_at DATETIMEOFFSET(3) NULL,
    deposit_applied DECIMAL(18,0) NULL,
    balance_due DECIMAL(18,0) NULL,
    balance_due_at DATETIMEOFFSET(3) NULL,
    balance_paid_at DATETIMEOFFSET(3) NULL,
    invoice_no VARCHAR(20) NULL,
    seller_party_id BIGINT NULL,
    buyer_party_id BIGINT NULL,
    buyer_name NVARCHAR(200) NULL,
    amount DECIMAL(18,0) NULL,
    issued_at DATETIMEOFFSET(3) NULL,
    cancelled_at DATETIMEOFFSET(3) NULL,
    cancel_reason NVARCHAR(300) NULL,
    CONSTRAINT ck_delivery_record_record_type CHECK (record_type IN ('Tranche', 'TrancheLine', 'Shipment', 'ShipmentLine', 'Acceptance', 'Invoice'))
);
GO
SET IDENTITY_INSERT dbo.delivery_record ON;
INSERT INTO dbo.delivery_record (delivery_record_id, record_type, legacy_id, order_id, seq, due_date, status, created_at, updated_at)
SELECT s.[tranche_id], 'Tranche', s.[tranche_id], s.[order_id], s.[seq], s.[due_date], s.[status], s.[created_at], s.[updated_at] FROM dbo.delivery_tranche s ORDER BY s.[tranche_id];
SET IDENTITY_INSERT dbo.delivery_record OFF;
GO
INSERT INTO dbo.delivery_record (record_type, legacy_id, tranche_id, line_id, qty_crabs, qty_kg, converted_crabs)
SELECT 'TrancheLine', NULL, s.[tranche_id], s.[line_id], s.[qty_crabs], s.[qty_kg], s.[converted_crabs] FROM dbo.delivery_tranche_line s ORDER BY s.[tranche_id], s.[line_id];
GO
INSERT INTO dbo.delivery_record (record_type, legacy_id, shipment_no, order_id, tranche_id, batch_id, scheduled_at, dispatched_at, delivered_at, return_window_ends_at, transport_condition, status, created_by, created_at, updated_at)
SELECT 'Shipment', s.[shipment_id], s.[shipment_no], s.[order_id], s.[tranche_id], s.[batch_id], s.[scheduled_at], s.[dispatched_at], s.[delivered_at], s.[return_window_ends_at], s.[transport_condition], s.[status], s.[created_by], s.[created_at], s.[updated_at] FROM dbo.shipment s ORDER BY s.[shipment_id];
GO
INSERT INTO dbo.delivery_record (record_type, legacy_id, shipment_id, line_id, dispatched_crabs, dispatched_kg, received_crabs, received_kg, accepted_crabs, accepted_kg, rejected_crabs, price_per_kg, goods_value)
SELECT 'ShipmentLine', s.[shipment_line_id], s.[shipment_id], s.[line_id], s.[dispatched_crabs], s.[dispatched_kg], s.[received_crabs], s.[received_kg], s.[accepted_crabs], s.[accepted_kg], s.[rejected_crabs], s.[price_per_kg], s.[goods_value] FROM dbo.shipment_line s ORDER BY s.[shipment_line_id];
GO
INSERT INTO dbo.delivery_record (record_type, legacy_id, shipment_id, order_id, tranche_id, accepted_crabs, accepted_kg, rejected_crabs, discrepancy_reason, status, operator_recorded_by, operator_recorded_at, customer_confirmed_by, customer_confirmed_at, goods_value, deposit_applied, balance_due, balance_due_at, balance_paid_at, created_at, updated_at)
SELECT 'Acceptance', s.[acceptance_id], s.[shipment_id], s.[order_id], s.[tranche_id], s.[accepted_crabs], s.[accepted_kg], s.[rejected_crabs], s.[discrepancy_reason], s.[status], s.[operator_recorded_by], s.[operator_recorded_at], s.[customer_confirmed_by], s.[customer_confirmed_at], s.[goods_value], s.[deposit_applied], s.[balance_due], s.[balance_due_at], s.[balance_paid_at], s.[created_at], s.[updated_at] FROM dbo.delivery_acceptance s ORDER BY s.[acceptance_id];
GO
INSERT INTO dbo.delivery_record (record_type, legacy_id, invoice_no, order_id, tranche_id, batch_id, seller_party_id, buyer_party_id, buyer_name, amount, status, issued_at, cancelled_at, cancel_reason)
SELECT 'Invoice', s.[invoice_id], s.[invoice_no], s.[order_id], s.[tranche_id], s.[batch_id], s.[seller_party_id], s.[buyer_party_id], s.[buyer_name], s.[amount], s.[status], s.[issued_at], s.[cancelled_at], s.[cancel_reason] FROM dbo.invoice s ORDER BY s.[invoice_id];
GO
UPDATE c SET c.shipment_id = p.delivery_record_id FROM dbo.delivery_record c JOIN dbo.delivery_record p ON p.record_type = 'Shipment' AND p.legacy_id = c.shipment_id WHERE c.record_type = 'ShipmentLine';
UPDATE c SET c.shipment_id = p.delivery_record_id FROM dbo.delivery_record c JOIN dbo.delivery_record p ON p.record_type = 'Shipment' AND p.legacy_id = c.shipment_id WHERE c.record_type = 'Acceptance';
ALTER TABLE dbo.inventory_allocation DROP CONSTRAINT fk_inventory_allocation_tranche;
ALTER TABLE dbo.payment_request DROP CONSTRAINT fk_payment_request_tranche;
ALTER TABLE dbo.claim DROP CONSTRAINT fk_claim_shipment;
UPDATE x SET x.shipment_id = p.delivery_record_id FROM dbo.claim x JOIN dbo.delivery_record p ON p.record_type = 'Shipment' AND p.legacy_id = x.shipment_id;
GO
ALTER TABLE dbo.delivery_tranche_line DROP CONSTRAINT fk_delivery_tranche_line_tranche;
ALTER TABLE dbo.shipment DROP CONSTRAINT fk_shipment_tranche;
ALTER TABLE dbo.shipment_line DROP CONSTRAINT fk_shipment_line_shipment;
ALTER TABLE dbo.delivery_acceptance DROP CONSTRAINT fk_delivery_acceptance_shipment;
ALTER TABLE dbo.delivery_acceptance DROP CONSTRAINT fk_delivery_acceptance_tranche;
ALTER TABLE dbo.invoice DROP CONSTRAINT fk_invoice_tranche;
DROP TABLE dbo.delivery_tranche;
DROP TABLE dbo.delivery_tranche_line;
DROP TABLE dbo.shipment;
DROP TABLE dbo.shipment_line;
DROP TABLE dbo.delivery_acceptance;
DROP TABLE dbo.invoice;
GO
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_record_tranche_required CHECK (record_type <> 'Tranche' OR (order_id IS NOT NULL AND seq IS NOT NULL AND due_date IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_tranche_seq CHECK (record_type <> 'Tranche' OR ([seq]>(0)));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_tranche_status CHECK (record_type <> 'Tranche' OR ([status]='Cancelled' OR [status]='Completed' OR [status]='Accepted' OR [status]='Dispatched' OR [status]='Allocated' OR [status]='Planned'));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_record_trancheline_required CHECK (record_type <> 'TrancheLine' OR (tranche_id IS NOT NULL AND line_id IS NOT NULL AND converted_crabs IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_tranche_line_converted CHECK (record_type <> 'TrancheLine' OR ([converted_crabs]>(0)));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_tranche_line_qty CHECK (record_type <> 'TrancheLine' OR ([qty_crabs]>(0) AND [qty_kg] IS NULL OR [qty_kg]>(0) AND [qty_crabs] IS NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_record_shipment_required CHECK (record_type <> 'Shipment' OR (shipment_no IS NOT NULL AND order_id IS NOT NULL AND tranche_id IS NOT NULL AND batch_id IS NOT NULL AND scheduled_at IS NOT NULL AND status IS NOT NULL AND created_by IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_shipment_status CHECK (record_type <> 'Shipment' OR ([status]='Cancelled' OR [status]='Refused' OR [status]='Accepted' OR [status]='Dispatched' OR [status]='Scheduled'));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_record_shipmentline_required CHECK (record_type <> 'ShipmentLine' OR (shipment_id IS NOT NULL AND line_id IS NOT NULL AND price_per_kg IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_shipment_line_accept CHECK (record_type <> 'ShipmentLine' OR ([accepted_kg] IS NULL OR [received_kg] IS NULL OR [accepted_kg]<=[received_kg]));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_shipment_line_counts CHECK (record_type <> 'ShipmentLine' OR (([dispatched_crabs] IS NULL OR [dispatched_crabs]>=(0)) AND ([received_crabs] IS NULL OR [received_crabs]>=(0)) AND ([accepted_crabs] IS NULL OR [accepted_crabs]>=(0)) AND ([rejected_crabs] IS NULL OR [rejected_crabs]>=(0))));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_shipment_line_kg CHECK (record_type <> 'ShipmentLine' OR (([dispatched_kg] IS NULL OR [dispatched_kg]>=(0)) AND ([received_kg] IS NULL OR [received_kg]>=(0)) AND ([accepted_kg] IS NULL OR [accepted_kg]>=(0))));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_record_acceptance_required CHECK (record_type <> 'Acceptance' OR (shipment_id IS NOT NULL AND order_id IS NOT NULL AND tranche_id IS NOT NULL AND accepted_crabs IS NOT NULL AND accepted_kg IS NOT NULL AND rejected_crabs IS NOT NULL AND status IS NOT NULL AND operator_recorded_by IS NOT NULL AND operator_recorded_at IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_acceptance_confirmed CHECK (record_type <> 'Acceptance' OR ([status]<>'Confirmed' OR [customer_confirmed_at] IS NOT NULL AND [goods_value] IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_acceptance_counts CHECK (record_type <> 'Acceptance' OR ([accepted_crabs]>=(0) AND [rejected_crabs]>=(0) AND [accepted_kg]>=(0)));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_acceptance_money CHECK (record_type <> 'Acceptance' OR (([goods_value] IS NULL OR [goods_value]>=(0)) AND ([deposit_applied] IS NULL OR [deposit_applied]>=(0)) AND ([balance_due] IS NULL OR [balance_due]>=(0))));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_acceptance_status CHECK (record_type <> 'Acceptance' OR ([status]='Refused' OR [status]='Confirmed' OR [status]='Pending'));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_delivery_record_invoice_required CHECK (record_type <> 'Invoice' OR (invoice_no IS NOT NULL AND order_id IS NOT NULL AND batch_id IS NOT NULL AND seller_party_id IS NOT NULL AND buyer_name IS NOT NULL AND amount IS NOT NULL AND status IS NOT NULL AND issued_at IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_invoice_amount CHECK (record_type <> 'Invoice' OR ([amount]>=(0)));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_invoice_cancelled CHECK (record_type <> 'Invoice' OR ([status]<>'Cancelled' OR [cancelled_at] IS NOT NULL));
ALTER TABLE dbo.delivery_record ADD CONSTRAINT ck_invoice_status CHECK (record_type <> 'Invoice' OR ([status]='Cancelled' OR [status]='Active'));
GO
CREATE UNIQUE INDEX ux_delivery_tranche_seq ON dbo.delivery_record (order_id, seq) WHERE record_type = 'Tranche';
CREATE UNIQUE INDEX ux_delivery_tranche_line_key ON dbo.delivery_record (tranche_id, line_id) WHERE record_type = 'TrancheLine';
CREATE UNIQUE INDEX ux_shipment_no ON dbo.delivery_record (shipment_no) WHERE record_type = 'Shipment';
CREATE UNIQUE INDEX ux_shipment_tranche ON dbo.delivery_record (tranche_id) WHERE record_type = 'Shipment' AND [status]<>'Cancelled';
CREATE UNIQUE INDEX ux_shipment_line ON dbo.delivery_record (shipment_id, line_id) WHERE record_type = 'ShipmentLine';
CREATE UNIQUE INDEX ux_delivery_acceptance_shipment ON dbo.delivery_record (shipment_id) WHERE record_type = 'Acceptance';
CREATE UNIQUE INDEX ux_invoice_no ON dbo.delivery_record (invoice_no) WHERE record_type = 'Invoice';
CREATE UNIQUE INDEX ux_invoice_active ON dbo.delivery_record (order_id, tranche_id) WHERE record_type = 'Invoice' AND [status]='Active';
GO
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_delivery_tranche_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_delivery_tranche_line_line FOREIGN KEY (line_id) REFERENCES dbo.sales_order_line(line_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_delivery_tranche_line_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_record(delivery_record_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_shipment_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_shipment_creator FOREIGN KEY (created_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_shipment_line_shipment FOREIGN KEY (shipment_id) REFERENCES dbo.delivery_record(delivery_record_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_invoice_buyer FOREIGN KEY (buyer_party_id) REFERENCES dbo.party(party_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_invoice_seller FOREIGN KEY (seller_party_id) REFERENCES dbo.party(party_id);
ALTER TABLE dbo.inventory_allocation ADD CONSTRAINT fk_inventory_allocation_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_record(delivery_record_id);
ALTER TABLE dbo.payment_request ADD CONSTRAINT fk_payment_request_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_record(delivery_record_id);
ALTER TABLE dbo.claim ADD CONSTRAINT fk_claim_shipment FOREIGN KEY (shipment_id) REFERENCES dbo.delivery_record(delivery_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
