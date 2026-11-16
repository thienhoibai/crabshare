-- NH-10 (CS-56): thông tin gửi hàng do hộ nuôi khai (TL-31 §6.1) + mốc khách xác nhận đã nhận (UC30).
-- Nền tảng không vận chuyển, không thu phí ship (BR-52): các cột chỉ là thông tin để khách liên hệ nhà xe.
ALTER TABLE dbo.sales_order ADD
    carrier_name        NVARCHAR(150)     NULL,
    vehicle_plate       VARCHAR(20)       NULL,
    driver_phone        VARCHAR(15)       NULL,
    expected_arrival_at DATETIMEOFFSET(3) NULL,
    shipping_note       NVARCHAR(300)     NULL,
    received_at         DATETIMEOFFSET(3) NULL;
GO
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_carrier_shipped
    CHECK (carrier_name IS NULL OR shipped_at IS NOT NULL);
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_received_delivered
    CHECK (received_at IS NULL OR delivered_at IS NOT NULL);
GO
-- Job hoàn tất đơn quét status = 'Delivered' AND return_window_ends_at <= now mỗi phút.
CREATE INDEX ix_sales_order_status_return_window_ends_at ON dbo.sales_order (status, return_window_ends_at);
GO
