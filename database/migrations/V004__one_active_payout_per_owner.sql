-- Không sửa/xoá lịch sử tài khoản. Dữ liệu vi phạm phải được xử lý trước khi áp migration.
CREATE UNIQUE INDEX ux_payout_active_user ON dbo.payout_account(owner_user_id)
WHERE status = 'Active' AND owner_user_id IS NOT NULL;
GO
CREATE UNIQUE INDEX ux_payout_active_operator ON dbo.payout_account(owner_operator_id)
WHERE status = 'Active' AND owner_operator_id IS NOT NULL;
GO
