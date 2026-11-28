-- V041: gộp phân công kiểm phẩm, phiếu kiểm phẩm và báo cáo thăm trại vào một bảng dbo.qc_record (78 bảng còn 76).
-- Trước: qc_assignment, qc_inspection, site_visit_report.
-- Sau: cột record_type cho biết loại bản ghi (Assignment, Inspection, SiteVisitReport). Phiếu kiểm phẩm giữ nguyên id và vẫn không sửa, không xoá được.
CREATE TABLE dbo.qc_record (
    qc_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_qc_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    inspection_no VARCHAR(20) NULL,
    inspection_kind VARCHAR(20) NULL,
    batch_id BIGINT NULL,
    goods_receipt_id BIGINT NULL,
    crab_unit_id BIGINT NULL,
    inspector_id BIGINT NULL,
    inspected_at DATETIMEOFFSET(3) NULL,
    species NVARCHAR(60) NULL,
    sex VARCHAR(10) NULL,
    maturity VARCHAR(20) NULL,
    species_ok BIT NULL,
    alive BIT NULL,
    healthy BIT NULL,
    two_claws BIT NULL,
    food_safe BIT NULL,
    weight_g DECIMAL(7,1) NULL,
    sensory_result NVARCHAR(300) NULL,
    conclusion VARCHAR(20) NULL,
    reject_reason NVARCHAR(300) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    assignment_kind VARCHAR(20) NULL,
    target_type VARCHAR(30) NULL,
    target_id BIGINT NULL,
    qc_user_id BIGINT NULL,
    assigned_at DATETIMEOFFSET(3) NULL,
    status VARCHAR(20) NULL,
    completed_at DATETIMEOFFSET(3) NULL,
    report_no VARCHAR(20) NULL,
    qc_assignment_id BIGINT NULL,
    visited_at DATETIMEOFFSET(3) NULL,
    latitude DECIMAL(9,6) NULL,
    longitude DECIMAL(9,6) NULL,
    distance_to_farm_m INT NULL,
    box_codes VARCHAR(400) NULL,
    crabs_seen INT NULL,
    findings NVARCHAR(1000) NULL,
    photo_uri NVARCHAR(500) NULL,
    photo_sha256 VARCHAR(64) NULL,
    CONSTRAINT ck_qc_record_record_type CHECK (record_type IN ('Inspection', 'Assignment', 'SiteVisitReport'))
);
GO
SET IDENTITY_INSERT dbo.qc_record ON;
INSERT INTO dbo.qc_record (qc_record_id, record_type, legacy_id, inspection_no, inspection_kind, batch_id, goods_receipt_id, crab_unit_id, inspector_id, inspected_at, species, sex, maturity, species_ok, alive, healthy, two_claws, food_safe, weight_g, sensory_result, conclusion, reject_reason, created_at)
SELECT s.[qc_inspection_id], 'Inspection', s.[qc_inspection_id], s.[inspection_no], s.[inspection_kind], s.[batch_id], s.[goods_receipt_id], s.[crab_unit_id], s.[inspector_id], s.[inspected_at], s.[species], s.[sex], s.[maturity], s.[species_ok], s.[alive], s.[healthy], s.[two_claws], s.[food_safe], s.[weight_g], s.[sensory_result], s.[conclusion], s.[reject_reason], s.[created_at] FROM dbo.qc_inspection s ORDER BY s.[qc_inspection_id];
SET IDENTITY_INSERT dbo.qc_record OFF;
GO
INSERT INTO dbo.qc_record (record_type, legacy_id, assignment_kind, batch_id, target_type, target_id, qc_user_id, assigned_at, status, completed_at)
SELECT 'Assignment', s.[qc_assignment_id], s.[assignment_kind], s.[batch_id], s.[target_type], s.[target_id], s.[qc_user_id], s.[assigned_at], s.[status], s.[completed_at] FROM dbo.qc_assignment s ORDER BY s.[qc_assignment_id];
GO
INSERT INTO dbo.qc_record (record_type, legacy_id, report_no, batch_id, qc_assignment_id, qc_user_id, visited_at, latitude, longitude, distance_to_farm_m, box_codes, crabs_seen, findings, photo_uri, photo_sha256, created_at)
SELECT 'SiteVisitReport', s.[report_id], s.[report_no], s.[batch_id], s.[qc_assignment_id], s.[qc_user_id], s.[visited_at], s.[latitude], s.[longitude], s.[distance_to_farm_m], s.[box_codes], s.[crabs_seen], s.[findings], s.[photo_uri], s.[photo_sha256], s.[created_at] FROM dbo.site_visit_report s ORDER BY s.[report_id];
GO
UPDATE c SET c.qc_assignment_id = p.qc_record_id FROM dbo.qc_record c JOIN dbo.qc_record p ON p.record_type = 'Assignment' AND p.legacy_id = c.qc_assignment_id WHERE c.record_type = 'SiteVisitReport';
ALTER TABLE dbo.grade_decision DROP CONSTRAINT fk_grade_decision_inspection;
GO
ALTER TABLE dbo.site_visit_report DROP CONSTRAINT fk_site_visit_report_assignment;
DROP TABLE dbo.qc_inspection;
DROP TABLE dbo.qc_assignment;
DROP TABLE dbo.site_visit_report;
GO
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_record_inspection_required CHECK (record_type <> 'Inspection' OR (inspection_no IS NOT NULL AND inspection_kind IS NOT NULL AND batch_id IS NOT NULL AND inspector_id IS NOT NULL AND inspected_at IS NOT NULL AND conclusion IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_inspection_conclusion CHECK (record_type <> 'Inspection' OR ([conclusion]='Hold' OR [conclusion]='Rejected' OR [conclusion]='Accepted'));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_inspection_kind CHECK (record_type <> 'Inspection' OR ([inspection_kind]='Dispute' OR [inspection_kind]='Dispatch' OR [inspection_kind]='Grading' OR [inspection_kind]='Incoming'));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_inspection_reason CHECK (record_type <> 'Inspection' OR ([conclusion]<>'Rejected' OR [reject_reason] IS NOT NULL));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_record_assignment_required CHECK (record_type <> 'Assignment' OR (assignment_kind IS NOT NULL AND batch_id IS NOT NULL AND target_type IS NOT NULL AND target_id IS NOT NULL AND qc_user_id IS NOT NULL AND assigned_at IS NOT NULL AND status IS NOT NULL));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_assignment_kind CHECK (record_type <> 'Assignment' OR ([assignment_kind]='Dispute' OR [assignment_kind]='Dispatch' OR [assignment_kind]='SiteVisit' OR [assignment_kind]='SecondReview' OR [assignment_kind]='GradingSession' OR [assignment_kind]='IncomingInspection'));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_assignment_status CHECK (record_type <> 'Assignment' OR ([status]='Cancelled' OR [status]='Reassigned' OR [status]='Completed' OR [status]='Assigned'));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_qc_record_sitevisitreport_required CHECK (record_type <> 'SiteVisitReport' OR (report_no IS NOT NULL AND batch_id IS NOT NULL AND qc_assignment_id IS NOT NULL AND qc_user_id IS NOT NULL AND visited_at IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL AND box_codes IS NOT NULL AND crabs_seen IS NOT NULL AND findings IS NOT NULL AND photo_uri IS NOT NULL AND photo_sha256 IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.qc_record ADD CONSTRAINT ck_site_visit_report_crabs CHECK (record_type <> 'SiteVisitReport' OR ([crabs_seen]>=(0)));
ALTER TABLE dbo.qc_record ADD CONSTRAINT df_qc_record_status DEFAULT ('Assigned') FOR status;
GO
CREATE UNIQUE INDEX ux_qc_inspection_no ON dbo.qc_record (inspection_no) WHERE record_type = 'Inspection';
CREATE UNIQUE INDEX ux_qc_assignment_active ON dbo.qc_record (assignment_kind, target_type, target_id) WHERE record_type = 'Assignment' AND [status]='Assigned';
CREATE INDEX ix_qc_assignment_user ON dbo.qc_record (qc_user_id, status) WHERE record_type = 'Assignment';
CREATE UNIQUE INDEX ux_site_visit_report_assignment ON dbo.qc_record (qc_assignment_id) WHERE record_type = 'SiteVisitReport';
CREATE UNIQUE INDEX ux_site_visit_report_no ON dbo.qc_record (report_no) WHERE record_type = 'SiteVisitReport';
GO
ALTER TABLE dbo.qc_record ADD CONSTRAINT fk_qc_inspection_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.qc_record ADD CONSTRAINT fk_qc_inspection_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id);
ALTER TABLE dbo.qc_record ADD CONSTRAINT fk_qc_inspection_receipt FOREIGN KEY (goods_receipt_id) REFERENCES dbo.supply_record(supply_record_id);
ALTER TABLE dbo.qc_record ADD CONSTRAINT fk_qc_inspection_user FOREIGN KEY (inspector_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.qc_record ADD CONSTRAINT fk_qc_assignment_user FOREIGN KEY (qc_user_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.qc_record ADD CONSTRAINT fk_site_visit_report_assignment FOREIGN KEY (qc_assignment_id) REFERENCES dbo.qc_record(qc_record_id);
ALTER TABLE dbo.grade_decision ADD CONSTRAINT fk_grade_decision_inspection FOREIGN KEY (qc_inspection_id) REFERENCES dbo.qc_record(qc_record_id);
GO
CREATE TRIGGER dbo.tr_qc_inspection_append_only ON dbo.qc_record AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'Inspection')
        THROW 51021, N'Phiếu kiểm phẩm không sửa, không xoá được.', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
