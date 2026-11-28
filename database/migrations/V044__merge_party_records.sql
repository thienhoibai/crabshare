-- V044: gộp vai trò, cơ sở, người liên quan và giấy tờ của đối tác vào một bảng dbo.party_record (68 bảng còn 65).
-- Trước: partner_role, party_site, related_party, party_document.
-- Sau: cột record_type cho biết loại bản ghi (Role, Site, RelatedParty, Document). Cơ sở giữ nguyên id.
CREATE TABLE dbo.party_record (
    party_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_party_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    party_id BIGINT NULL,
    site_code VARCHAR(30) NULL,
    site_type VARCHAR(20) NULL,
    name NVARCHAR(150) NULL,
    address_line NVARCHAR(300) NULL,
    province NVARCHAR(100) NULL,
    latitude DECIMAL(9,6) NULL,
    longitude DECIMAL(9,6) NULL,
    contact_name NVARCHAR(150) NULL,
    contact_phone VARCHAR(15) NULL,
    is_default BIT NULL,
    status VARCHAR(20) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    updated_at DATETIMEOFFSET(3) NULL,
    role_type VARCHAR(20) NULL,
    valid_from DATETIMEOFFSET(3) NULL,
    valid_to DATETIMEOFFSET(3) NULL,
    note NVARCHAR(300) NULL,
    full_name NVARCHAR(150) NULL,
    relation NVARCHAR(50) NULL,
    id_number_digest CHAR(64) NULL,
    id_number_last4 VARCHAR(4) NULL,
    linked_party_id BIGINT NULL,
    doc_type VARCHAR(30) NULL,
    file_uri NVARCHAR(500) NULL,
    content_type VARCHAR(50) NULL,
    sha256 CHAR(64) NULL,
    document_note NVARCHAR(200) NULL,
    uploaded_by BIGINT NULL,
    uploaded_at DATETIMEOFFSET(3) NULL,
    removed_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_party_record_record_type CHECK (record_type IN ('Site', 'Role', 'RelatedParty', 'Document'))
);
GO
SET IDENTITY_INSERT dbo.party_record ON;
INSERT INTO dbo.party_record (party_record_id, record_type, legacy_id, party_id, site_code, site_type, name, address_line, province, latitude, longitude, contact_name, contact_phone, is_default, status, created_at, updated_at)
SELECT s.[site_id], 'Site', s.[site_id], s.[party_id], s.[site_code], s.[site_type], s.[name], s.[address_line], s.[province], s.[latitude], s.[longitude], s.[contact_name], s.[contact_phone], s.[is_default], s.[status], s.[created_at], s.[updated_at] FROM dbo.party_site s ORDER BY s.[site_id];
SET IDENTITY_INSERT dbo.party_record OFF;
GO
INSERT INTO dbo.party_record (record_type, legacy_id, party_id, role_type, status, valid_from, valid_to, note, created_at, updated_at)
SELECT 'Role', s.[partner_role_id], s.[party_id], s.[role_type], s.[status], s.[valid_from], s.[valid_to], s.[note], s.[created_at], s.[updated_at] FROM dbo.partner_role s ORDER BY s.[partner_role_id];
GO
INSERT INTO dbo.party_record (record_type, legacy_id, party_id, full_name, relation, id_number_digest, id_number_last4, linked_party_id, created_at)
SELECT 'RelatedParty', s.[related_party_id], s.[party_id], s.[full_name], s.[relation], s.[id_number_digest], s.[id_number_last4], s.[linked_party_id], s.[created_at] FROM dbo.related_party s ORDER BY s.[related_party_id];
GO
INSERT INTO dbo.party_record (record_type, legacy_id, party_id, doc_type, file_uri, content_type, sha256, document_note, uploaded_by, uploaded_at, removed_at)
SELECT 'Document', s.[document_id], s.[party_id], s.[doc_type], s.[file_uri], s.[content_type], s.[sha256], s.[note], s.[uploaded_by], s.[uploaded_at], s.[removed_at] FROM dbo.party_document s ORDER BY s.[document_id];
GO
ALTER TABLE dbo.batch DROP CONSTRAINT fk_batch_dispatch_site;
ALTER TABLE dbo.device DROP CONSTRAINT fk_device_site;
ALTER TABLE dbo.supply_record DROP CONSTRAINT fk_goods_receipt_site;
ALTER TABLE dbo.sales_order DROP CONSTRAINT fk_sales_order_delivery_site;
GO
DROP TABLE dbo.party_site;
DROP TABLE dbo.partner_role;
DROP TABLE dbo.related_party;
DROP TABLE dbo.party_document;
GO
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_record_site_required CHECK (record_type <> 'Site' OR (party_id IS NOT NULL AND site_code IS NOT NULL AND site_type IS NOT NULL AND name IS NOT NULL AND address_line IS NOT NULL AND is_default IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_site_coords CHECK (record_type <> 'Site' OR ([latitude] IS NULL AND [longitude] IS NULL OR [latitude]>=(-90) AND [latitude]<=(90) AND ([longitude]>=(-180) AND [longitude]<=(180))));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_site_site_type CHECK (record_type <> 'Site' OR ([site_type]='DeliveryAddress' OR [site_type]='Warehouse' OR [site_type]='QcStation' OR [site_type]='Farm'));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_site_status CHECK (record_type <> 'Site' OR ([status]='Inactive' OR [status]='Active'));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_record_role_required CHECK (record_type <> 'Role' OR (party_id IS NOT NULL AND role_type IS NOT NULL AND status IS NOT NULL AND valid_from IS NOT NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_partner_role_role_type CHECK (record_type <> 'Role' OR ([role_type]='OfftakeBuyer' OR [role_type]='Supplier' OR [role_type]='Customer' OR [role_type]='Investor' OR [role_type]='Farmer'));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_partner_role_status CHECK (record_type <> 'Role' OR ([status]='Revoked' OR [status]='Suspended' OR [status]='Active' OR [status]='Pending'));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_partner_role_validity CHECK (record_type <> 'Role' OR ([valid_to] IS NULL OR [valid_to]>[valid_from]));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_record_relatedparty_required CHECK (record_type <> 'RelatedParty' OR (party_id IS NOT NULL AND full_name IS NOT NULL AND relation IS NOT NULL AND id_number_digest IS NOT NULL AND id_number_last4 IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_record_document_required CHECK (record_type <> 'Document' OR (party_id IS NOT NULL AND doc_type IS NOT NULL AND file_uri IS NOT NULL AND content_type IS NOT NULL AND sha256 IS NOT NULL AND uploaded_by IS NOT NULL AND uploaded_at IS NOT NULL));
ALTER TABLE dbo.party_record ADD CONSTRAINT ck_party_document_doc_type CHECK (record_type <> 'Document' OR ([doc_type]='Other' OR [doc_type]='Authorization' OR [doc_type]='License' OR [doc_type]='BusinessRegistration'));
GO
CREATE UNIQUE INDEX ux_party_site_code ON dbo.party_record (party_id, site_code) WHERE record_type = 'Site';
CREATE UNIQUE INDEX ux_party_site_default ON dbo.party_record (party_id, site_type) WHERE record_type = 'Site' AND [is_default]=(1) AND [status]='Active';
CREATE UNIQUE INDEX ux_partner_role ON dbo.party_record (party_id, role_type, valid_from) WHERE record_type = 'Role';
CREATE UNIQUE INDEX ux_partner_role_open ON dbo.party_record (party_id, role_type) WHERE record_type = 'Role' AND [valid_to] IS NULL;
CREATE UNIQUE INDEX ux_related_party ON dbo.party_record (party_id, id_number_digest) WHERE record_type = 'RelatedParty';
CREATE INDEX ix_party_document_party ON dbo.party_record (party_id) WHERE record_type = 'Document' AND [removed_at] IS NULL;
GO
ALTER TABLE dbo.party_record ADD CONSTRAINT fk_party_site_party FOREIGN KEY (party_id) REFERENCES dbo.party(party_id);
ALTER TABLE dbo.party_record ADD CONSTRAINT fk_related_party_linked FOREIGN KEY (linked_party_id) REFERENCES dbo.party(party_id);
ALTER TABLE dbo.party_record ADD CONSTRAINT fk_party_document_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.batch ADD CONSTRAINT fk_batch_dispatch_site FOREIGN KEY (dispatch_site_id) REFERENCES dbo.party_record(party_record_id);
ALTER TABLE dbo.device ADD CONSTRAINT fk_device_site FOREIGN KEY (scope_site_id) REFERENCES dbo.party_record(party_record_id);
ALTER TABLE dbo.supply_record ADD CONSTRAINT fk_goods_receipt_site FOREIGN KEY (site_id) REFERENCES dbo.party_record(party_record_id);
ALTER TABLE dbo.sales_order ADD CONSTRAINT fk_sales_order_delivery_site FOREIGN KEY (delivery_site_id) REFERENCES dbo.party_record(party_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
