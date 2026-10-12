/* V002 — Dữ liệu danh mục cần có ở mọi môi trường (không phải dữ liệu demo).
   - Phân loại cua theo cân nặng: bản mẫu, chỉnh lại theo cách trại thật đang phân loại.
   - Bậc phí khởi tạo lô (TL-15): 500.000đ / 1.000.000đ / 2.000.000đ theo ngưỡng vốn 50 triệu và 200 triệu.
   - Bản công bố rủi ro RD-2026-01 (TL-09) và mẫu hợp đồng CT-2026-01 (TL-19).
     Toàn văn nằm ở thư mục database/reference (file .md); content_hash là SHA-256 của file đó (xuống dòng LF).
     Sửa nội dung thì tạo PHIÊN BẢN MỚI (file mới + migration mới), không sửa bản đã dùng. */

INSERT INTO dbo.product_grade (grade_code, grade_name, min_weight_g, max_weight_g) VALUES
    ('L1',   N'Loại 1 (từ 500 g)',     500,  NULL),
    ('L2',   N'Loại 2 (350–499 g)',    350,  499),
    ('L3',   N'Loại 3 (250–349 g)',    250,  349),
    ('L4',   N'Loại 4 (dưới 250 g)',   NULL, 249),
    ('SOFT', N'Cua lột',               NULL, NULL);

INSERT INTO dbo.fee_tier (tier_code, min_capital, max_capital, fee_amount, effective_from) VALUES
    ('T1', 0,         50000000,  500000,  '2026-09-01'),
    ('T2', 50000000,  200000000, 1000000, '2026-09-01'),
    ('T3', 200000000, NULL,      2000000, '2026-09-01');

INSERT INTO dbo.risk_disclosure (version_code, content_hash, effective_from, status) VALUES
    ('RD-2026-01', '96efa752518d0affc851fe219b0bd49a139b668d7a2c5b151c471e7187a83c91', '2026-09-01T00:00:00+07:00', 'Active');

INSERT INTO dbo.contract_template (version_code, content_hash, status, effective_from) VALUES
    ('CT-2026-01', '01bf695cc2a032af1dd82cbad12a97a1431b50730eef75af909c69a98974edc7', 'Active', '2026-09-01T00:00:00+07:00');
