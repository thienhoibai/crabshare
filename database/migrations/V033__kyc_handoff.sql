/* V033 — Phiên QR ngắn hạn nối xác minh danh tính từ web sang app. */
CREATE TABLE dbo.kyc_handoff (
    handoff_id BIGINT IDENTITY(1,1) NOT NULL,
    user_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL CONSTRAINT df_kyc_handoff_status DEFAULT ('Pending'),
    created_at DATETIMEOFFSET(3) NOT NULL,
    expires_at DATETIMEOFFSET(3) NOT NULL,
    claimed_at DATETIMEOFFSET(3) NULL,
    cancelled_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_kyc_handoff PRIMARY KEY (handoff_id),
    CONSTRAINT fk_kyc_handoff_user_id FOREIGN KEY (user_id) REFERENCES dbo.app_user (user_id),
    CONSTRAINT ck_kyc_handoff_status CHECK (status IN ('Pending', 'Claimed', 'Cancelled', 'Expired')),
    CONSTRAINT ck_kyc_handoff_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_kyc_handoff_claimed CHECK ((status <> 'Claimed') OR claimed_at IS NOT NULL),
    CONSTRAINT ck_kyc_handoff_cancelled CHECK ((status <> 'Cancelled') OR cancelled_at IS NOT NULL)
);
GO
CREATE UNIQUE INDEX ux_kyc_handoff_token_hash ON dbo.kyc_handoff (token_hash);
CREATE UNIQUE INDEX ux_kyc_handoff_pending_user ON dbo.kyc_handoff (user_id) WHERE status = 'Pending';
CREATE INDEX ix_kyc_handoff_user_id_created_at ON dbo.kyc_handoff (user_id, created_at DESC);
GO
