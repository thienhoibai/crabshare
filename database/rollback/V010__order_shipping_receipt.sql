-- Chạy tay khi cần gỡ V010. Từ chối nếu đã có dữ liệu giao hàng thật để không mất thông tin nhà xe.
IF EXISTS (SELECT 1 FROM dbo.sales_order WHERE carrier_name IS NOT NULL OR received_at IS NOT NULL)
    THROW 51010, N'Không rollback khi đã có thông tin giao/nhận hàng. Khôi phục backup trước V010.', 1;
DROP INDEX ix_sales_order_status_return_window_ends_at ON dbo.sales_order;
ALTER TABLE dbo.sales_order DROP CONSTRAINT ck_sales_order_carrier_shipped;
ALTER TABLE dbo.sales_order DROP CONSTRAINT ck_sales_order_received_delivered;
ALTER TABLE dbo.sales_order DROP COLUMN carrier_name, vehicle_plate, driver_phone, expected_arrival_at, shipping_note, received_at;
DELETE dbo.SchemaVersions WHERE ScriptName = 'V010__order_shipping_receipt.sql';
