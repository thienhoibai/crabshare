-- Giá chốt bao tiêu theo hạng trên từng lô (TL-30 BR-32/33). Công khai trước/trong Funding.
CREATE TABLE dbo.batch_offtake_price (
    batch_id    BIGINT NOT NULL,
    grade_id    BIGINT NOT NULL,
    unit_price  DECIMAL(18,0) NOT NULL,
    created_at  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_offtake_price_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_batch_offtake_price_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_batch_offtake_price PRIMARY KEY (batch_id, grade_id),
    CONSTRAINT ck_batch_offtake_price_unit_price CHECK (unit_price > 0),
    CONSTRAINT fk_batch_offtake_price_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_batch_offtake_price_grade_id FOREIGN KEY (grade_id) REFERENCES dbo.product_grade (grade_id)
);
GO
CREATE INDEX ix_batch_offtake_price_grade_id ON dbo.batch_offtake_price (grade_id);
GO
EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'Giá chốt bao tiêu (đồng/kg) theo hạng, công khai trên lô',
    @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'batch_offtake_price';
GO
