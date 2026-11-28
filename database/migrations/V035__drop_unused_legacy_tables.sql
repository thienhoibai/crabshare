-- V035: rút gọn CSDL, bỏ 16 bảng thế hệ đầu không còn dịch vụ nào đọc hay ghi (109 bảng còn 93) và 5 view chỉ đọc các bảng đó.
-- Nhóm bán lẻ cũ: product_listing, product_grade, price_history, price_check, order_line, stock_reservation, product_rating
--   (luồng bán hiện nay: offer, product_specification, sales_order_line, delivery_tranche, order_rating).
-- Nhóm thu hoạch cũ: harvest, harvest_record, harvest_start_request (hiện nay: grade_decision, inventory_event).
-- Nhóm theo dõi từng con cũ: crab_item_event, tag_scan, slot_event_policy_version (hiện nay: crab_unit, inventory_event).
-- Khác: complaint (đã có claim), fee_tier (phí nền tảng nằm ở platform_parameter và trên batch), batch_offtake_price (đã có offer).
-- LƯU Ý: dữ liệu trong các bảng này bị xoá hẳn. Sao lưu CSDL trước khi chạy trên máy chủ.
-- Mọi lệnh đều có IF EXISTS để chạy lại được nếu lần trước dừng giữa chừng.

-- 1. View chỉ dựa trên các bảng bị bỏ (không dịch vụ nào đọc)
DROP VIEW IF EXISTS dbo.v_traceability;
DROP VIEW IF EXISTS dbo.v_crab_count_reconciliation;
DROP VIEW IF EXISTS dbo.v_batch_actual_revenue;
DROP VIEW IF EXISTS dbo.v_operator_reputation;
DROP VIEW IF EXISTS dbo.v_batch_commitment_cap;
GO

-- 2. Cột ở bảng còn dùng đang trỏ sang bảng bị bỏ
ALTER TABLE dbo.batch DROP CONSTRAINT IF EXISTS fk_batch_fee_tier_id;
DROP INDEX IF EXISTS ix_batch_fee_tier_id ON dbo.batch;
ALTER TABLE dbo.batch DROP COLUMN IF EXISTS fee_tier_id;
GO
ALTER TABLE dbo.crab_item DROP CONSTRAINT IF EXISTS fk_crab_item_grade_id, fk_crab_item_harvest_id_batch_id, fk_crab_item_order_line_id_batch_id, ck_crab_item_harvest_fields;
DROP INDEX IF EXISTS ix_crab_item_harvest_id ON dbo.crab_item;
DROP INDEX IF EXISTS ix_crab_item_order_line_id ON dbo.crab_item;
DROP INDEX IF EXISTS ix_crab_item_grade_id ON dbo.crab_item;
DROP INDEX IF EXISTS ix_crab_item_harvest_id_batch_id ON dbo.crab_item;
DROP INDEX IF EXISTS ix_crab_item_order_line_id_batch_id ON dbo.crab_item;
ALTER TABLE dbo.crab_item DROP COLUMN IF EXISTS harvest_id, grade_id, order_line_id;
GO
ALTER TABLE dbo.offtake_commitment DROP CONSTRAINT IF EXISTS fk_offtake_commitment_grade_id;
DROP INDEX IF EXISTS ix_offtake_commitment_grade_id ON dbo.offtake_commitment;
ALTER TABLE dbo.offtake_commitment DROP COLUMN IF EXISTS grade_id;
GO
ALTER TABLE dbo.slot_event_detail DROP CONSTRAINT IF EXISTS fk_slot_event_detail_policy;
ALTER TABLE dbo.slot_event_detail DROP COLUMN IF EXISTS policy_version_id;
GO

-- 3. Bỏ bảng, bảng con trước
DROP TABLE IF EXISTS dbo.harvest_record;
DROP TABLE IF EXISTS dbo.harvest_start_request;
DROP TABLE IF EXISTS dbo.harvest;
DROP TABLE IF EXISTS dbo.crab_item_event;
DROP TABLE IF EXISTS dbo.tag_scan;
DROP TABLE IF EXISTS dbo.stock_reservation;
DROP TABLE IF EXISTS dbo.order_line;
DROP TABLE IF EXISTS dbo.price_check;
DROP TABLE IF EXISTS dbo.price_history;
DROP TABLE IF EXISTS dbo.batch_offtake_price;
DROP TABLE IF EXISTS dbo.product_listing;
DROP TABLE IF EXISTS dbo.product_grade;
DROP TABLE IF EXISTS dbo.product_rating;
DROP TABLE IF EXISTS dbo.complaint;
DROP TABLE IF EXISTS dbo.slot_event_policy_version;
DROP TABLE IF EXISTS dbo.fee_tier;
GO
