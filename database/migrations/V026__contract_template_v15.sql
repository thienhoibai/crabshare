-- V026 — Mẫu hợp đồng hợp tác lô P theo Business Rule v1.5 (CT-2026-02): phí nền tảng trên doanh thu thực thu, cơ sở quyết toán,
-- bậc thù lao theo tỷ lệ sống, giá sàn và bên cam kết thu mua, giải ngân theo mốc có bằng chứng, biểu quyết theo vốn, không khấu trừ thuế.
-- Toàn văn ở database/reference/contract-template-CT-2026-02.md (giữ LF; mã băm phải khớp). Hợp đồng đã lập vẫn giữ mẫu cũ.

INSERT INTO dbo.contract_template (version_code, content_hash, status, effective_from)
SELECT 'CT-2026-02', '88ae0b82552b32d97d1e65d1b849f8c6560e931660304c4902f1151f44b38602', 'Active', '2026-11-01T00:00:00+07:00'
WHERE NOT EXISTS (SELECT 1 FROM dbo.contract_template WHERE version_code = 'CT-2026-02');
GO
UPDATE dbo.contract_template SET status = 'Retired', updated_at = SYSDATETIMEOFFSET() WHERE version_code = 'CT-2026-01' AND status = 'Active';
GO
