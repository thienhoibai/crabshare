/* V005 — Kiểm duyệt niêm yết (UC24, NH-04).
   - product_listing: quản trị ẩn niêm yết vi phạm. Ẩn không đổi status để người nuôi vẫn thấy trạng thái bán
     và lý do bị ẩn; cửa hàng và checkout bỏ qua mọi niêm yết có hidden_at. */

ALTER TABLE dbo.product_listing ADD
    hidden_at                    DATETIMEOFFSET(3) NULL,
    hidden_by                    BIGINT NULL,
    hidden_reason                NVARCHAR(300) NULL;
GO

ALTER TABLE dbo.product_listing ADD
    CONSTRAINT ck_product_listing_hidden CHECK ((hidden_at IS NULL AND hidden_by IS NULL AND hidden_reason IS NULL)
        OR (hidden_at IS NOT NULL AND hidden_by IS NOT NULL AND hidden_reason IS NOT NULL)),
    CONSTRAINT fk_product_listing_hidden_by FOREIGN KEY (hidden_by) REFERENCES dbo.app_user (user_id);
GO

CREATE INDEX ix_product_listing_hidden_by ON dbo.product_listing (hidden_by);
GO
