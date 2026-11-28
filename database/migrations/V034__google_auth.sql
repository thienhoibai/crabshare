/* V034 — Liên kết định danh Google (OIDC sub) cho tài khoản đăng nhập. */
ALTER TABLE dbo.app_user ADD google_subject VARCHAR(255) NULL;
GO
CREATE UNIQUE INDEX ux_app_user_google_subject ON dbo.app_user (google_subject) WHERE google_subject IS NOT NULL;
GO
