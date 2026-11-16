-- V027 — Giấy tờ pháp lý của đối tác tổ chức để Admin xác minh (BR-009, BR-016).
-- Chỉ dành cho hộ kinh doanh, hợp tác xã, doanh nghiệp: ảnh giấy chứng nhận đăng ký, giấy phép, văn bản uỷ quyền.
-- Không dùng cho eKYC cá nhân: hệ thống không lưu ảnh giấy tờ tuỳ thân (BR-010).
-- Chỉ thêm, không xoá hay đổi bảng cũ.
CREATE TABLE dbo.party_document (
    document_id                  BIGINT IDENTITY(1,1) NOT NULL,
    party_id                     BIGINT NOT NULL,
    doc_type                     VARCHAR(30) NOT NULL,
    file_uri                     NVARCHAR(500) NOT NULL,
    content_type                 VARCHAR(50) NOT NULL,
    sha256                       CHAR(64) NOT NULL,
    note                         NVARCHAR(200) NULL,
    uploaded_by                  BIGINT NOT NULL,
    uploaded_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_party_document_uploaded_at DEFAULT (SYSDATETIMEOFFSET()),
    removed_at                   DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_party_document PRIMARY KEY (document_id),
    CONSTRAINT fk_party_document_party FOREIGN KEY (party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT fk_party_document_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.app_user (user_id),
    CONSTRAINT ck_party_document_doc_type CHECK (doc_type IN ('BusinessRegistration', 'License', 'Authorization', 'Other'))
);
GO
CREATE INDEX ix_party_document_party ON dbo.party_document (party_id) WHERE removed_at IS NULL;
GO
