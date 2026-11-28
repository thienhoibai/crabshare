-- V038: gộp chuẩn phân hạng, bộ quy tắc và từng quy tắc vào một bảng dbo.grading_rule (87 bảng còn 85).
-- Trước: grading_standard, grade_rule_set, grade_rule.
-- Sau: cột record_type cho biết loại bản ghi (Standard, RuleSet, Rule). Bộ quy tắc giữ nguyên id.
-- Đổi tên cột: grading_standard.effective_from thành standard_effective_from, grade_rule.note thành rule_note.
CREATE TABLE dbo.grading_rule (
    grading_rule_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_grading_rule PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    standard_id BIGINT NULL,
    crab_type VARCHAR(20) NULL,
    version_no INT NULL,
    effective_from DATETIMEOFFSET(3) NULL,
    near_threshold_pct DECIMAL(5,2) NULL,
    status VARCHAR(20) NULL,
    note NVARCHAR(500) NULL,
    created_by BIGINT NULL,
    approved_by BIGINT NULL,
    approved_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    standard_code NVARCHAR(40) NULL,
    revision NVARCHAR(60) NULL,
    issuer NVARCHAR(200) NULL,
    scope NVARCHAR(300) NULL,
    standard_effective_from DATE NULL,
    rule_set_id BIGINT NULL,
    rule_kind VARCHAR(20) NULL,
    metric VARCHAR(30) NULL,
    lower_bound DECIMAL(10,4) NULL,
    upper_bound DECIMAL(10,4) NULL,
    unit VARCHAR(20) NULL,
    result_label VARCHAR(20) NULL,
    boundary VARCHAR(20) NULL,
    sort_order INT NULL,
    rule_note NVARCHAR(300) NULL,
    CONSTRAINT ck_grading_rule_record_type CHECK (record_type IN ('RuleSet', 'Standard', 'Rule'))
);
GO
SET IDENTITY_INSERT dbo.grading_rule ON;
INSERT INTO dbo.grading_rule (grading_rule_id, record_type, legacy_id, standard_id, crab_type, version_no, effective_from, near_threshold_pct, status, note, created_by, approved_by, approved_at, created_at)
SELECT s.[rule_set_id], 'RuleSet', s.[rule_set_id], s.[standard_id], s.[crab_type], s.[version_no], s.[effective_from], s.[near_threshold_pct], s.[status], s.[note], s.[created_by], s.[approved_by], s.[approved_at], s.[created_at] FROM dbo.grade_rule_set s ORDER BY s.[rule_set_id];
SET IDENTITY_INSERT dbo.grading_rule OFF;
GO
INSERT INTO dbo.grading_rule (record_type, legacy_id, standard_code, revision, issuer, scope, standard_effective_from, note, created_at)
SELECT 'Standard', s.[standard_id], s.[standard_code], s.[revision], s.[issuer], s.[scope], s.[effective_from], s.[note], s.[created_at] FROM dbo.grading_standard s ORDER BY s.[standard_id];
GO
INSERT INTO dbo.grading_rule (record_type, legacy_id, rule_set_id, rule_kind, metric, lower_bound, upper_bound, unit, result_label, boundary, sort_order, rule_note)
SELECT 'Rule', s.[rule_id], s.[rule_set_id], s.[rule_kind], s.[metric], s.[lower_bound], s.[upper_bound], s.[unit], s.[result_label], s.[boundary], s.[sort_order], s.[note] FROM dbo.grade_rule s ORDER BY s.[rule_id];
GO
UPDATE c SET c.standard_id = p.grading_rule_id FROM dbo.grading_rule c JOIN dbo.grading_rule p ON p.record_type = 'Standard' AND p.legacy_id = c.standard_id WHERE c.record_type = 'RuleSet';
ALTER TABLE dbo.batch DROP CONSTRAINT fk_batch_grade_rule_set;
ALTER TABLE dbo.grade_decision DROP CONSTRAINT fk_grade_decision_rule_set;
GO
ALTER TABLE dbo.grade_rule_set DROP CONSTRAINT fk_grade_rule_set_standard;
ALTER TABLE dbo.grade_rule DROP CONSTRAINT fk_grade_rule_set;
DROP TABLE dbo.grade_rule_set;
DROP TABLE dbo.grading_standard;
DROP TABLE dbo.grade_rule;
GO
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grading_rule_ruleset_required CHECK (record_type <> 'RuleSet' OR (standard_id IS NOT NULL AND crab_type IS NOT NULL AND version_no IS NOT NULL AND effective_from IS NOT NULL AND near_threshold_pct IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_set_approved CHECK (record_type <> 'RuleSet' OR ([status]='Draft' OR [approved_at] IS NOT NULL));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_set_crab_type CHECK (record_type <> 'RuleSet' OR ([crab_type]='OilRoeCrab' OR [crab_type]='YoungFemaleCrab' OR [crab_type]='RoeCrab' OR [crab_type]='FatteningMudCrab'));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_set_near CHECK (record_type <> 'RuleSet' OR ([near_threshold_pct]>=(0) AND [near_threshold_pct]<=(20)));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_set_status CHECK (record_type <> 'RuleSet' OR ([status]='Retired' OR [status]='Active' OR [status]='Draft'));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grading_rule_standard_required CHECK (record_type <> 'Standard' OR (standard_code IS NOT NULL AND revision IS NOT NULL AND issuer IS NOT NULL AND scope IS NOT NULL AND standard_effective_from IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grading_rule_rule_required CHECK (record_type <> 'Rule' OR (rule_set_id IS NOT NULL AND rule_kind IS NOT NULL AND metric IS NOT NULL AND unit IS NOT NULL AND result_label IS NOT NULL AND boundary IS NOT NULL AND sort_order IS NOT NULL));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_boundary CHECK (record_type <> 'Rule' OR ([boundary]='BothInclusive' OR [boundary]='UpperInclusive' OR [boundary]='LowerInclusive'));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_bounds CHECK (record_type <> 'Rule' OR ([lower_bound] IS NULL OR [upper_bound] IS NULL OR [lower_bound]<[upper_bound]));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_kind CHECK (record_type <> 'Rule' OR ([rule_kind]='Exclusion' OR [rule_kind]='Sensory' OR [rule_kind]='PhysicalFactor' OR [rule_kind]='Size'));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_label CHECK (record_type <> 'Rule' OR ([result_label]='REJECT' OR [result_label]='BELOW' OR [result_label]='G1' OR [result_label]='SPECIAL' OR [result_label]='OUT' OR [result_label]='XL' OR [result_label]='L' OR [result_label]='M'));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT ck_grade_rule_metric CHECK (record_type <> 'Rule' OR ([metric]='FoodSafe' OR [metric]='Alive' OR [metric]='EdgeBandMm' OR [metric]='CIndex' OR [metric]='WeightG'));
ALTER TABLE dbo.grading_rule ADD CONSTRAINT df_grading_rule_near_threshold_pct DEFAULT ((2.00)) FOR near_threshold_pct;
ALTER TABLE dbo.grading_rule ADD CONSTRAINT df_grading_rule_status DEFAULT ('Draft') FOR status;
ALTER TABLE dbo.grading_rule ADD CONSTRAINT df_grading_rule_created_at DEFAULT (sysdatetimeoffset()) FOR created_at;
ALTER TABLE dbo.grading_rule ADD CONSTRAINT df_grading_rule_boundary DEFAULT ('LowerInclusive') FOR boundary;
ALTER TABLE dbo.grading_rule ADD CONSTRAINT df_grading_rule_sort_order DEFAULT ((0)) FOR sort_order;
GO
CREATE UNIQUE INDEX ux_grade_rule_set_version ON dbo.grading_rule (crab_type, version_no) WHERE record_type = 'RuleSet';
CREATE UNIQUE INDEX ux_grade_rule_set_active ON dbo.grading_rule (crab_type) WHERE record_type = 'RuleSet' AND [status]='Active';
CREATE UNIQUE INDEX ux_grading_standard_code ON dbo.grading_rule (standard_code, revision) WHERE record_type = 'Standard';
CREATE INDEX ix_grade_rule_set ON dbo.grading_rule (rule_set_id, rule_kind, sort_order) WHERE record_type = 'Rule';
GO
ALTER TABLE dbo.grading_rule ADD CONSTRAINT fk_grade_rule_set_approver FOREIGN KEY (approved_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.grading_rule ADD CONSTRAINT fk_grade_rule_set_creator FOREIGN KEY (created_by) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.grading_rule ADD CONSTRAINT fk_grade_rule_set_standard FOREIGN KEY (standard_id) REFERENCES dbo.grading_rule(grading_rule_id);
ALTER TABLE dbo.grading_rule ADD CONSTRAINT fk_grade_rule_set FOREIGN KEY (rule_set_id) REFERENCES dbo.grading_rule(grading_rule_id);
ALTER TABLE dbo.batch ADD CONSTRAINT fk_batch_grade_rule_set FOREIGN KEY (grade_rule_set_id) REFERENCES dbo.grading_rule(grading_rule_id);
ALTER TABLE dbo.grade_decision ADD CONSTRAINT fk_grade_decision_rule_set FOREIGN KEY (rule_set_id) REFERENCES dbo.grading_rule(grading_rule_id);
GO
-- Bộ quy tắc đã dùng (Active, Retired) không được sửa; muốn đổi thì tạo phiên bản mới (BR-038).
CREATE TRIGGER dbo.tr_grade_rule_locked ON dbo.grading_rule
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.grading_rule s
               WHERE s.record_type = 'RuleSet' AND s.status <> 'Draft'
                 AND s.grading_rule_id IN (SELECT rule_set_id FROM inserted WHERE record_type = 'Rule'
                                           UNION SELECT rule_set_id FROM deleted WHERE record_type = 'Rule'))
        THROW 50230, N'Bộ quy tắc phân hạng đã áp dụng không được sửa; hãy tạo phiên bản mới.', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
