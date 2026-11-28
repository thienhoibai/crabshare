-- V040: gộp đơn mua, lô cua nhập và phiếu nhận vào một bảng dbo.supply_record (80 bảng còn 78).
-- Trước: procurement_order, supply_lot, goods_receipt.
-- Sau: cột record_type cho biết loại bản ghi (ProcurementOrder, SupplyLot, GoodsReceipt). Lô cua nhập giữ nguyên id.
CREATE TABLE dbo.supply_record (
    supply_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_supply_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    lot_code VARCHAR(30) NULL,
    procurement_order_id BIGINT NULL,
    batch_id BIGINT NULL,
    origin_region NVARCHAR(150) NULL,
    harvested_on DATE NULL,
    declared_species NVARCHAR(60) NULL,
    declared_count INT NULL,
    declared_weight_kg DECIMAL(12,3) NULL,
    trace_status VARCHAR(20) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    po_no VARCHAR(20) NULL,
    supplier_party_id BIGINT NULL,
    ordered_on DATE NULL,
    agreed_spec NVARCHAR(300) NULL,
    quantity INT NULL,
    unit_price DECIMAL(18,0) NULL,
    status VARCHAR(20) NULL,
    created_by BIGINT NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    receipt_no VARCHAR(20) NULL,
    supply_lot_id BIGINT NULL,
    site_id BIGINT NULL,
    received_at DATETIMEOFFSET(3) NULL,
    received_by BIGINT NULL,
    qc_user_id BIGINT NULL,
    accepted_count INT NULL,
    rejected_count INT NULL,
    accepted_weight_g BIGINT NULL,
    completed_at DATETIMEOFFSET(3) NULL,
    note NVARCHAR(300) NULL,
    CONSTRAINT ck_supply_record_record_type CHECK (record_type IN ('SupplyLot', 'ProcurementOrder', 'GoodsReceipt'))
);
GO
SET IDENTITY_INSERT dbo.supply_record ON;
INSERT INTO dbo.supply_record (supply_record_id, record_type, legacy_id, lot_code, procurement_order_id, batch_id, origin_region, harvested_on, declared_species, declared_count, declared_weight_kg, trace_status, created_at)
SELECT s.[supply_lot_id], 'SupplyLot', s.[supply_lot_id], s.[lot_code], s.[procurement_order_id], s.[batch_id], s.[origin_region], s.[harvested_on], s.[declared_species], s.[declared_count], s.[declared_weight_kg], s.[trace_status], s.[created_at] FROM dbo.supply_lot s ORDER BY s.[supply_lot_id];
SET IDENTITY_INSERT dbo.supply_record OFF;
GO
INSERT INTO dbo.supply_record (record_type, legacy_id, po_no, batch_id, supplier_party_id, ordered_on, agreed_spec, quantity, unit_price, status, created_by, created_at, updated_at)
SELECT 'ProcurementOrder', s.[procurement_order_id], s.[po_no], s.[batch_id], s.[supplier_party_id], s.[ordered_on], s.[agreed_spec], s.[quantity], s.[unit_price], s.[status], s.[created_by], s.[created_at], s.[updated_at] FROM dbo.procurement_order s ORDER BY s.[procurement_order_id];
GO
INSERT INTO dbo.supply_record (record_type, legacy_id, receipt_no, supply_lot_id, batch_id, site_id, received_at, received_by, qc_user_id, accepted_count, rejected_count, accepted_weight_g, status, completed_at, note, created_at)
SELECT 'GoodsReceipt', s.[goods_receipt_id], s.[receipt_no], s.[supply_lot_id], s.[batch_id], s.[site_id], s.[received_at], s.[received_by], s.[qc_user_id], s.[accepted_count], s.[rejected_count], s.[accepted_weight_g], s.[status], s.[completed_at], s.[note], s.[created_at] FROM dbo.goods_receipt s ORDER BY s.[goods_receipt_id];
GO
UPDATE c SET c.procurement_order_id = p.supply_record_id FROM dbo.supply_record c JOIN dbo.supply_record p ON p.record_type = 'ProcurementOrder' AND p.legacy_id = c.procurement_order_id WHERE c.record_type = 'SupplyLot';
ALTER TABLE dbo.crab_unit DROP CONSTRAINT fk_crab_unit_lot;
ALTER TABLE dbo.crab_unit DROP CONSTRAINT fk_crab_unit_receipt;
UPDATE x SET x.goods_receipt_id = p.supply_record_id FROM dbo.crab_unit x JOIN dbo.supply_record p ON p.record_type = 'GoodsReceipt' AND p.legacy_id = x.goods_receipt_id;
ALTER TABLE dbo.qc_inspection DROP CONSTRAINT fk_qc_inspection_receipt;
ALTER TABLE dbo.qc_inspection DISABLE TRIGGER ALL;
UPDATE x SET x.goods_receipt_id = p.supply_record_id FROM dbo.qc_inspection x JOIN dbo.supply_record p ON p.record_type = 'GoodsReceipt' AND p.legacy_id = x.goods_receipt_id;
ALTER TABLE dbo.qc_inspection ENABLE TRIGGER ALL;
GO
ALTER TABLE dbo.supply_lot DROP CONSTRAINT fk_supply_lot_po;
ALTER TABLE dbo.goods_receipt DROP CONSTRAINT fk_goods_receipt_lot;
DROP TABLE dbo.supply_lot;
DROP TABLE dbo.procurement_order;
DROP TABLE dbo.goods_receipt;
GO
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_supply_record_supplylot_required CHECK (record_type <> 'SupplyLot' OR (lot_code IS NOT NULL AND procurement_order_id IS NOT NULL AND batch_id IS NOT NULL AND origin_region IS NOT NULL AND harvested_on IS NOT NULL AND declared_species IS NOT NULL AND declared_count IS NOT NULL AND declared_weight_kg IS NOT NULL AND trace_status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_supply_lot_declared CHECK (record_type <> 'SupplyLot' OR ([declared_count]>(0) AND [declared_weight_kg]>(0)));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_supply_lot_trace CHECK (record_type <> 'SupplyLot' OR ([trace_status]='Disputed' OR [trace_status]='Verified' OR [trace_status]='Declared'));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_supply_record_procurementorder_required CHECK (record_type <> 'ProcurementOrder' OR (po_no IS NOT NULL AND batch_id IS NOT NULL AND supplier_party_id IS NOT NULL AND ordered_on IS NOT NULL AND agreed_spec IS NOT NULL AND quantity IS NOT NULL AND unit_price IS NOT NULL AND status IS NOT NULL AND created_by IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_procurement_order_price CHECK (record_type <> 'ProcurementOrder' OR ([unit_price]>=(0)));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_procurement_order_quantity CHECK (record_type <> 'ProcurementOrder' OR ([quantity]>(0)));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_procurement_order_status CHECK (record_type <> 'ProcurementOrder' OR ([status]='Cancelled' OR [status]='Received' OR [status]='PartiallyReceived' OR [status]='Ordered'));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_supply_record_goodsreceipt_required CHECK (record_type <> 'GoodsReceipt' OR (receipt_no IS NOT NULL AND supply_lot_id IS NOT NULL AND batch_id IS NOT NULL AND received_at IS NOT NULL AND received_by IS NOT NULL AND accepted_count IS NOT NULL AND rejected_count IS NOT NULL AND accepted_weight_g IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_goods_receipt_counts CHECK (record_type <> 'GoodsReceipt' OR ([accepted_count]>=(0) AND [rejected_count]>=(0)));
ALTER TABLE dbo.supply_record ADD CONSTRAINT ck_goods_receipt_status CHECK (record_type <> 'GoodsReceipt' OR ([status]='Cancelled' OR [status]='Completed' OR [status]='Inspecting'));
ALTER TABLE dbo.supply_record ADD CONSTRAINT df_supply_record_trace_status DEFAULT ('Declared') FOR trace_status;
ALTER TABLE dbo.supply_record ADD CONSTRAINT df_supply_record_created_at DEFAULT (sysdatetimeoffset()) FOR created_at;
ALTER TABLE dbo.supply_record ADD CONSTRAINT df_supply_record_updated_at DEFAULT (sysdatetimeoffset()) FOR updated_at;
ALTER TABLE dbo.supply_record ADD CONSTRAINT df_supply_record_accepted_count DEFAULT ((0)) FOR accepted_count;
ALTER TABLE dbo.supply_record ADD CONSTRAINT df_supply_record_rejected_count DEFAULT ((0)) FOR rejected_count;
ALTER TABLE dbo.supply_record ADD CONSTRAINT df_supply_record_accepted_weight_g DEFAULT ((0)) FOR accepted_weight_g;
GO
CREATE UNIQUE INDEX ux_supply_lot_code ON dbo.supply_record (lot_code) WHERE record_type = 'SupplyLot';
CREATE UNIQUE INDEX ux_procurement_order_no ON dbo.supply_record (po_no) WHERE record_type = 'ProcurementOrder';
CREATE UNIQUE INDEX ux_goods_receipt_no ON dbo.supply_record (receipt_no) WHERE record_type = 'GoodsReceipt';
GO
ALTER TABLE dbo.supply_record ADD CONSTRAINT fk_supply_lot_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.supply_record ADD CONSTRAINT fk_supply_lot_po FOREIGN KEY (procurement_order_id) REFERENCES dbo.supply_record(supply_record_id);
ALTER TABLE dbo.supply_record ADD CONSTRAINT fk_procurement_order_supplier FOREIGN KEY (supplier_party_id) REFERENCES dbo.party(party_id);
ALTER TABLE dbo.supply_record ADD CONSTRAINT fk_goods_receipt_lot FOREIGN KEY (supply_lot_id) REFERENCES dbo.supply_record(supply_record_id);
ALTER TABLE dbo.supply_record ADD CONSTRAINT fk_goods_receipt_site FOREIGN KEY (site_id) REFERENCES dbo.party_site(site_id);
ALTER TABLE dbo.crab_unit ADD CONSTRAINT fk_crab_unit_lot FOREIGN KEY (supply_lot_id) REFERENCES dbo.supply_record(supply_record_id);
ALTER TABLE dbo.crab_unit ADD CONSTRAINT fk_crab_unit_receipt FOREIGN KEY (goods_receipt_id) REFERENCES dbo.supply_record(supply_record_id);
ALTER TABLE dbo.qc_inspection ADD CONSTRAINT fk_qc_inspection_receipt FOREIGN KEY (goods_receipt_id) REFERENCES dbo.supply_record(supply_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
