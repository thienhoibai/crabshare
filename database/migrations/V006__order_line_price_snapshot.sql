/* V006 — Chụp phiên bản giá vào dòng đơn (UC26, NH-05; TL-27 §6.1, §6.3, §8).
   - order_line.price_history_id: phiên bản giá đang hiệu lực lúc đặt; unit_price bằng price_per_kg của chính bản ghi đó.
     Người nuôi đổi giá sau đó tạo bản ghi mới, dòng đơn cũ vẫn trỏ bản ghi cũ.
   - Khóa ngoại kép (price_history_id, listing_id) để dòng đơn không trỏ nhầm lịch sử giá của niêm yết khác.
   - Dòng đơn có sẵn: lấy bản ghi mới nhất có effective_from không sau placed_at của đơn. */

ALTER TABLE dbo.order_line ADD price_history_id BIGINT NULL;
GO

UPDATE ol SET price_history_id = h.price_history_id
FROM dbo.order_line ol
JOIN dbo.sales_order o ON o.order_id = ol.order_id
CROSS APPLY (
    SELECT TOP 1 x.price_history_id
    FROM dbo.price_history x
    WHERE x.listing_id = ol.listing_id AND x.effective_from <= o.placed_at
    ORDER BY x.effective_from DESC, x.price_history_id DESC
) h;
GO

IF EXISTS (SELECT 1 FROM dbo.order_line WHERE price_history_id IS NULL)
    THROW 50008, N'Có dòng đơn không tìm được phiên bản giá hiệu lực lúc đặt; kiểm tra price_history trước khi chạy lại V006.', 1;
GO

ALTER TABLE dbo.order_line ALTER COLUMN price_history_id BIGINT NOT NULL;
GO

ALTER TABLE dbo.price_history ADD CONSTRAINT ux_price_history_listing UNIQUE (price_history_id, listing_id);
GO

ALTER TABLE dbo.order_line ADD CONSTRAINT fk_order_line_price_history_id_listing_id
    FOREIGN KEY (price_history_id, listing_id) REFERENCES dbo.price_history (price_history_id, listing_id);
GO

CREATE INDEX ix_order_line_price_history_id ON dbo.order_line (price_history_id);
GO
