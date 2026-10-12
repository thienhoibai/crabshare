/* V003 — Niêm yết sản phẩm (UC24) theo TL-27.
   - product_listing: ảnh sản phẩm do người nuôi tải lên.
   - price_history: thêm giá cũ, lý do, ghi chú; bản ghi chỉ ghi thêm (không sửa, không xoá).
   - price_check: số liệu đã dùng để so giá mới với giao dịch tương đồng, để tái hiện được cờ bất thường
     sau khi đổi thuật toán hoặc ngưỡng (TL-27 mục 6.3, 6.4). */

ALTER TABLE dbo.product_listing ADD
    image_uri                    NVARCHAR(400) NULL,
    image_sha256                 CHAR(64) NULL;
GO

ALTER TABLE dbo.price_history ADD
    previous_price_per_kg        DECIMAL(18,0) NULL,
    reason_code                  VARCHAR(20) NOT NULL CONSTRAINT df_price_history_reason_code DEFAULT ('Initial'),
    note                         NVARCHAR(300) NULL;
GO

ALTER TABLE dbo.price_history ADD
    CONSTRAINT ck_price_history_reason_code CHECK (reason_code IN ('Initial', 'Market', 'Promotion', 'Clearance', 'Correction', 'Other')),
    CONSTRAINT ck_price_history_previous CHECK ((reason_code = 'Initial' AND previous_price_per_kg IS NULL)
        OR (reason_code <> 'Initial' AND previous_price_per_kg IS NOT NULL AND previous_price_per_kg > 0)),
    CONSTRAINT ck_price_history_note CHECK (reason_code <> 'Other' OR note IS NOT NULL);
GO

-- PriceCheck — Kết quả so giá mới với giao dịch tương đồng tại thời điểm đổi giá (TL-27 §6.4)
CREATE TABLE dbo.price_check (
    price_history_id             BIGINT NOT NULL,
    segment_key                  VARCHAR(100) NOT NULL,
    window_days                  SMALLINT NOT NULL,
    sample_count                 INT NOT NULL,
    operator_count               INT NOT NULL,
    has_enough_data              BIT NOT NULL,
    median_price_per_kg          DECIMAL(18,0) NULL,
    mad_per_kg                   DECIMAL(18,2) NULL,
    method                       VARCHAR(20) NOT NULL,
    score                        DECIMAL(9,3) NULL,
    threshold                    DECIMAL(9,3) NULL,
    is_flagged                   BIT NOT NULL,
    algorithm_version            VARCHAR(20) NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_price_check_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_price_check PRIMARY KEY (price_history_id),
    CONSTRAINT ck_price_check_method CHECK (method IN ('None', 'ModifiedZ', 'PercentFromMedian')),
    CONSTRAINT ck_price_check_counts CHECK (sample_count >= 0 AND operator_count >= 0 AND window_days > 0),
    CONSTRAINT ck_price_check_data CHECK (has_enough_data = 1 OR (method = 'None' AND is_flagged = 0))
);
GO

ALTER TABLE dbo.price_check ADD CONSTRAINT fk_price_check_price_history_id
    FOREIGN KEY (price_history_id) REFERENCES dbo.price_history (price_history_id);
GO

-- TL-27 §8: không xoá hoặc ghi đè lịch sử giá; sửa nhầm bằng một lần đổi giá mới có lý do Correction
CREATE TRIGGER dbo.trg_price_history_append_only ON dbo.price_history
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50006, N'Lịch sử giá chỉ cho phép ghi thêm (TL-27).', 1;
END
GO

CREATE TRIGGER dbo.trg_price_check_append_only ON dbo.price_check
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50007, N'Kết quả kiểm tra giá chỉ cho phép ghi thêm (TL-27).', 1;
END
GO
