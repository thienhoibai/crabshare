-- V050: gộp dòng đơn hàng, khiếu nại, đánh giá đơn và dòng doanh thu vào một bảng dbo.sales_record (46 bảng còn 43).
-- Trước: sales_order_line, claim, order_rating, revenue_line.
-- Sau: cột record_type cho biết loại bản ghi (Line, Claim, Rating, Revenue). Dòng đơn hàng giữ nguyên id. Dòng doanh thu vẫn chỉ ghi thêm.
-- Đổi tên cột: revenue_line.batch_id thành revenue_batch_id.
CREATE TABLE dbo.sales_record (
    sales_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_sales_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    order_id BIGINT NULL,
    batch_id BIGINT NULL,
    offer_id BIGINT NULL,
    spec_id BIGINT NULL,
    order_mode VARCHAR(10) NULL,
    qty_crabs INT NULL,
    qty_kg DECIMAL(12,3) NULL,
    converted_crabs INT NULL,
    price_per_kg DECIMAL(18,0) NULL,
    conversion_weight_g INT NULL,
    min_grade_code VARCHAR(10) NULL,
    estimated_kg DECIMAL(12,3) NULL,
    estimated_value DECIMAL(18,0) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    claim_no VARCHAR(20) NULL,
    shipment_id BIGINT NULL,
    line_id BIGINT NULL,
    claim_type VARCHAR(20) NULL,
    issue_type VARCHAR(20) NULL,
    affected_crabs INT NULL,
    affected_kg DECIMAL(12,3) NULL,
    description NVARCHAR(1000) NULL,
    photo_uri NVARCHAR(500) NULL,
    photo_sha256 VARCHAR(64) NULL,
    status VARCHAR(20) NULL,
    response_due_at DATETIMEOFFSET(3) NULL,
    operator_response NVARCHAR(500) NULL,
    operator_responded_by BIGINT NULL,
    operator_responded_at DATETIMEOFFSET(3) NULL,
    customer_agreed BIT NULL,
    admin_decision NVARCHAR(500) NULL,
    decided_by BIGINT NULL,
    decided_at DATETIMEOFFSET(3) NULL,
    refund_kg DECIMAL(12,3) NULL,
    refund_amount DECIMAL(18,0) NULL,
    refund_instruction_id BIGINT NULL,
    created_by BIGINT NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    stars TINYINT NULL,
    comment NVARCHAR(1000) NULL,
    revenue_batch_id BIGINT NULL,
    source_type VARCHAR(20) NULL,
    amount DECIMAL(18,0) NULL,
    recognized_at DATETIMEOFFSET(3) NULL,
    note NVARCHAR(300) NULL,
    CONSTRAINT ck_sales_record_record_type CHECK (record_type IN ('Line', 'Claim', 'Rating', 'Revenue'))
);
GO
SET IDENTITY_INSERT dbo.sales_record ON;
INSERT INTO dbo.sales_record (sales_record_id, record_type, legacy_id, order_id, batch_id, offer_id, spec_id, order_mode, qty_crabs, qty_kg, converted_crabs, price_per_kg, conversion_weight_g, min_grade_code, estimated_kg, estimated_value, created_at)
SELECT s.[line_id], 'Line', s.[line_id], s.[order_id], s.[batch_id], s.[offer_id], s.[spec_id], s.[order_mode], s.[qty_crabs], s.[qty_kg], s.[converted_crabs], s.[price_per_kg], s.[conversion_weight_g], s.[min_grade_code], s.[estimated_kg], s.[estimated_value], s.[created_at] FROM dbo.sales_order_line s ORDER BY s.[line_id];
SET IDENTITY_INSERT dbo.sales_record OFF;
GO
INSERT INTO dbo.sales_record (record_type, legacy_id, claim_no, order_id, shipment_id, line_id, claim_type, issue_type, affected_crabs, affected_kg, description, photo_uri, photo_sha256, status, response_due_at, operator_response, operator_responded_by, operator_responded_at, customer_agreed, admin_decision, decided_by, decided_at, refund_kg, refund_amount, refund_instruction_id, created_by, created_at, updated_at)
SELECT 'Claim', s.[claim_id], s.[claim_no], s.[order_id], s.[shipment_id], s.[line_id], s.[claim_type], s.[issue_type], s.[affected_crabs], s.[affected_kg], s.[description], s.[photo_uri], s.[photo_sha256], s.[status], s.[response_due_at], s.[operator_response], s.[operator_responded_by], s.[operator_responded_at], s.[customer_agreed], s.[admin_decision], s.[decided_by], s.[decided_at], s.[refund_kg], s.[refund_amount], s.[refund_instruction_id], s.[created_by], s.[created_at], s.[updated_at] FROM dbo.claim s ORDER BY s.[claim_id];
GO
INSERT INTO dbo.sales_record (record_type, legacy_id, order_id, stars, comment, created_by, created_at)
SELECT 'Rating', NULL, s.[order_id], s.[stars], s.[comment], s.[created_by], s.[created_at] FROM dbo.order_rating s ORDER BY s.[order_id];
GO
INSERT INTO dbo.sales_record (record_type, legacy_id, revenue_batch_id, source_type, order_id, amount, recognized_at, note)
SELECT 'Revenue', s.[revenue_line_id], s.[batch_id], s.[source_type], s.[order_id], s.[amount], s.[recognized_at], s.[note] FROM dbo.revenue_line s ORDER BY s.[revenue_line_id];
GO
ALTER TABLE dbo.delivery_record DROP CONSTRAINT fk_delivery_tranche_line_line;
ALTER TABLE dbo.inventory_record DROP CONSTRAINT fk_inventory_allocation_line;
GO
ALTER TABLE dbo.claim DROP CONSTRAINT fk_claim_line;
DROP TABLE dbo.sales_order_line;
DROP TABLE dbo.claim;
DROP TABLE dbo.order_rating;
DROP TABLE dbo.revenue_line;
GO
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_record_line_required CHECK (record_type <> 'Line' OR (order_id IS NOT NULL AND batch_id IS NOT NULL AND offer_id IS NOT NULL AND spec_id IS NOT NULL AND order_mode IS NOT NULL AND converted_crabs IS NOT NULL AND price_per_kg IS NOT NULL AND conversion_weight_g IS NOT NULL AND estimated_kg IS NOT NULL AND estimated_value IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_order_line_converted CHECK (record_type <> 'Line' OR ([converted_crabs]>(0)));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_order_line_grade CHECK (record_type <> 'Line' OR ([min_grade_code] IS NULL OR ([min_grade_code]='G1' OR [min_grade_code]='SPECIAL')));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_order_line_mode CHECK (record_type <> 'Line' OR ([order_mode]='ByCount' AND [qty_crabs]>(0) AND [qty_kg] IS NULL OR [order_mode]='ByKg' AND [qty_kg]>(0) AND [qty_crabs] IS NULL));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_order_line_price CHECK (record_type <> 'Line' OR ([price_per_kg]>(0) AND [conversion_weight_g]>(0)));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_record_claim_required CHECK (record_type <> 'Claim' OR (claim_no IS NOT NULL AND order_id IS NOT NULL AND shipment_id IS NOT NULL AND line_id IS NOT NULL AND claim_type IS NOT NULL AND issue_type IS NOT NULL AND description IS NOT NULL AND photo_uri IS NOT NULL AND photo_sha256 IS NOT NULL AND status IS NOT NULL AND response_due_at IS NOT NULL AND created_by IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_claim_affected CHECK (record_type <> 'Claim' OR ([affected_crabs] IS NOT NULL AND [affected_crabs]>(0) OR [affected_kg] IS NOT NULL AND [affected_kg]>(0)));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_claim_issue CHECK (record_type <> 'Claim' OR ([issue_type]='FoodSafety' OR [issue_type]='Late' OR [issue_type]='WrongWeight' OR [issue_type]='WrongSize' OR [issue_type]='Weak' OR [issue_type]='Dead'));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_claim_refund CHECK (record_type <> 'Claim' OR ([refund_amount] IS NULL OR [refund_amount]>=(0)));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_claim_status CHECK (record_type <> 'Claim' OR ([status]='Rejected' OR [status]='Accepted' OR [status]='Escalated' OR [status]='OperatorRejected' OR [status]='OperatorAccepted' OR [status]='Open'));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_claim_type CHECK (record_type <> 'Claim' OR ([claim_type]='Complaint' OR [claim_type]='Return'));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_record_rating_required CHECK (record_type <> 'Rating' OR (order_id IS NOT NULL AND stars IS NOT NULL AND created_by IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_order_rating_stars CHECK (record_type <> 'Rating' OR ([stars]>=(1) AND [stars]<=(5)));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_sales_record_revenue_required CHECK (record_type <> 'Revenue' OR (revenue_batch_id IS NOT NULL AND source_type IS NOT NULL AND order_id IS NOT NULL AND amount IS NOT NULL AND recognized_at IS NOT NULL));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_revenue_line_amount CHECK (record_type <> 'Revenue' OR ([amount]>=(0)));
ALTER TABLE dbo.sales_record ADD CONSTRAINT ck_revenue_line_source CHECK (record_type <> 'Revenue' OR ([source_type]='FinalOrder' OR [source_type]='ForfeitedDeposit' OR [source_type]='InvoicedSale' OR [source_type]='PreOrderDelivered'));
GO
CREATE UNIQUE INDEX ux_sales_order_line_spec ON dbo.sales_record (order_id, spec_id) WHERE record_type = 'Line';
CREATE UNIQUE INDEX ux_claim_no ON dbo.sales_record (claim_no) WHERE record_type = 'Claim';
CREATE UNIQUE INDEX ux_claim_shipment ON dbo.sales_record (shipment_id) WHERE record_type = 'Claim';
CREATE INDEX ix_claim_status ON dbo.sales_record (status, response_due_at) WHERE record_type = 'Claim';
CREATE UNIQUE INDEX ux_order_rating_key ON dbo.sales_record (order_id) WHERE record_type = 'Rating';
CREATE UNIQUE INDEX ux_revenue_line_source ON dbo.sales_record (source_type, order_id) WHERE record_type = 'Revenue';
CREATE INDEX ix_revenue_line_batch ON dbo.sales_record (revenue_batch_id) WHERE record_type = 'Revenue';
GO
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_sales_order_line_offer FOREIGN KEY (offer_id) REFERENCES dbo.offer(offer_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_sales_order_line_order FOREIGN KEY (order_id, batch_id) REFERENCES dbo.sales_order(order_id, batch_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_sales_order_line_spec FOREIGN KEY (spec_id) REFERENCES dbo.product_specification(spec_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_claim_line FOREIGN KEY (line_id) REFERENCES dbo.sales_record(sales_record_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_claim_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_claim_refund FOREIGN KEY (refund_instruction_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_claim_shipment FOREIGN KEY (shipment_id) REFERENCES dbo.delivery_record(delivery_record_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_revenue_line_batch FOREIGN KEY (revenue_batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.delivery_record ADD CONSTRAINT fk_delivery_tranche_line_line FOREIGN KEY (line_id) REFERENCES dbo.sales_record(sales_record_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_line FOREIGN KEY (line_id) REFERENCES dbo.sales_record(sales_record_id);
GO
-- Dòng doanh thu đã ghi không được sửa hoặc xoá.
CREATE TRIGGER dbo.tr_revenue_line_append_only ON dbo.sales_record
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'Revenue')
        THROW 50240, N'Dòng doanh thu đã ghi không được sửa hoặc xoá.', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
