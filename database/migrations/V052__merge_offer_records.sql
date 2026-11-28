-- V052: gộp quy cách sản phẩm và chào bán vào một bảng dbo.offer_record (41 bảng còn 40).
-- Trước: product_specification, offer.
-- Sau: cột record_type cho biết loại bản ghi (Specification, Offer). Quy cách sản phẩm giữ nguyên id.
CREATE TABLE dbo.offer_record (
    offer_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_offer_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    spec_code VARCHAR(40) NULL,
    species NVARCHAR(60) NULL,
    crab_type VARCHAR(20) NULL,
    size_code VARCHAR(10) NULL,
    grade_code VARCHAR(10) NULL,
    live_condition VARCHAR(20) NULL,
    name NVARCHAR(150) NULL,
    size_rank TINYINT NULL,
    grade_rank TINYINT NULL,
    status VARCHAR(20) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    batch_id BIGINT NULL,
    spec_id BIGINT NULL,
    price_per_kg DECIMAL(18,0) NULL,
    conversion_weight_g INT NULL,
    offered_quantity INT NULL,
    valid_from DATETIMEOFFSET(3) NULL,
    valid_to DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_offer_record_record_type CHECK (record_type IN ('Specification', 'Offer'))
);
GO
SET IDENTITY_INSERT dbo.offer_record ON;
INSERT INTO dbo.offer_record (offer_record_id, record_type, legacy_id, spec_code, species, crab_type, size_code, grade_code, live_condition, name, size_rank, grade_rank, status, created_at)
SELECT s.[spec_id], 'Specification', s.[spec_id], s.[spec_code], s.[species], s.[crab_type], s.[size_code], s.[grade_code], s.[live_condition], s.[name], s.[size_rank], s.[grade_rank], s.[status], s.[created_at] FROM dbo.product_specification s ORDER BY s.[spec_id];
SET IDENTITY_INSERT dbo.offer_record OFF;
GO
INSERT INTO dbo.offer_record (record_type, legacy_id, batch_id, spec_id, price_per_kg, conversion_weight_g, offered_quantity, valid_from, valid_to, created_at)
SELECT 'Offer', s.[offer_id], s.[batch_id], s.[spec_id], s.[price_per_kg], s.[conversion_weight_g], s.[offered_quantity], s.[valid_from], s.[valid_to], s.[created_at] FROM dbo.offer s ORDER BY s.[offer_id];
GO
ALTER TABLE dbo.grade_decision DROP CONSTRAINT fk_grade_decision_spec;
ALTER TABLE dbo.inventory_record DROP CONSTRAINT fk_inventory_allocation_spec;
ALTER TABLE dbo.sales_record DROP CONSTRAINT fk_sales_order_line_spec;
ALTER TABLE dbo.sales_record DROP CONSTRAINT fk_sales_order_line_offer;
ALTER TABLE dbo.sales_record DISABLE TRIGGER ALL;
UPDATE x SET x.offer_id = p.offer_record_id FROM dbo.sales_record x JOIN dbo.offer_record p ON p.record_type = 'Offer' AND p.legacy_id = x.offer_id;
ALTER TABLE dbo.sales_record ENABLE TRIGGER ALL;
GO
ALTER TABLE dbo.offer DROP CONSTRAINT fk_offer_spec;
DROP TABLE dbo.product_specification;
DROP TABLE dbo.offer;
GO
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_offer_record_specification_required CHECK (record_type <> 'Specification' OR (spec_code IS NOT NULL AND species IS NOT NULL AND crab_type IS NOT NULL AND size_code IS NOT NULL AND grade_code IS NOT NULL AND live_condition IS NOT NULL AND name IS NOT NULL AND size_rank IS NOT NULL AND grade_rank IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_product_specification_crab_type CHECK (record_type <> 'Specification' OR ([crab_type]='OilRoeCrab' OR [crab_type]='YoungFemaleCrab' OR [crab_type]='RoeCrab' OR [crab_type]='FatteningMudCrab'));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_product_specification_grade CHECK (record_type <> 'Specification' OR ([grade_code]='G1' OR [grade_code]='SPECIAL'));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_product_specification_size CHECK (record_type <> 'Specification' OR ([size_code]='XL' OR [size_code]='L' OR [size_code]='M' OR [size_code]='OUT'));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_product_specification_status CHECK (record_type <> 'Specification' OR ([status]='Retired' OR [status]='Active'));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_offer_record_offer_required CHECK (record_type <> 'Offer' OR (batch_id IS NOT NULL AND spec_id IS NOT NULL AND price_per_kg IS NOT NULL AND conversion_weight_g IS NOT NULL AND offered_quantity IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_offer_conversion CHECK (record_type <> 'Offer' OR ([conversion_weight_g]>(0)));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_offer_price CHECK (record_type <> 'Offer' OR ([price_per_kg]>(0)));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_offer_quantity CHECK (record_type <> 'Offer' OR ([offered_quantity]>(0)));
ALTER TABLE dbo.offer_record ADD CONSTRAINT ck_offer_validity CHECK (record_type <> 'Offer' OR ([valid_to] IS NULL OR [valid_from] IS NULL OR [valid_to]>[valid_from]));
GO
CREATE UNIQUE INDEX ux_product_specification_key ON dbo.offer_record (species, crab_type, size_code, grade_code, live_condition) WHERE record_type = 'Specification';
CREATE UNIQUE INDEX ux_product_specification_code ON dbo.offer_record (spec_code) WHERE record_type = 'Specification';
CREATE UNIQUE INDEX ux_offer_batch_spec ON dbo.offer_record (batch_id, spec_id) WHERE record_type = 'Offer';
GO
ALTER TABLE dbo.offer_record ADD CONSTRAINT fk_offer_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.offer_record ADD CONSTRAINT fk_offer_spec FOREIGN KEY (spec_id) REFERENCES dbo.offer_record(offer_record_id);
ALTER TABLE dbo.grade_decision ADD CONSTRAINT fk_grade_decision_spec FOREIGN KEY (spec_id) REFERENCES dbo.offer_record(offer_record_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_spec FOREIGN KEY (crab_spec_id) REFERENCES dbo.offer_record(offer_record_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_sales_order_line_spec FOREIGN KEY (spec_id) REFERENCES dbo.offer_record(offer_record_id);
ALTER TABLE dbo.sales_record ADD CONSTRAINT fk_sales_order_line_offer FOREIGN KEY (offer_id) REFERENCES dbo.offer_record(offer_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
