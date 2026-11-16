-- V023 — BR v1.5 nhóm G5: chuẩn phân hạng, bộ quy tắc, số đo, suy luận AI, quyết định phân hạng.
-- BR-038 (chuẩn và bộ quy tắc), BR-151 (lượt đo và số đo), BR-153 (size theo cân, C = khối lượng ÷ CL³),
-- BR-154 (năm thuộc tính kiểm phẩm), BR-155 (Draft → Hold → Approved/Rejected, AI không tự duyệt),
-- BR-156 (cua chết, yếu nặng, không an toàn: Rejected, tiêu huỷ), BR-157 (đổi size/hạng = phiên bản mới),
-- BR-158 (ngoài quy cách, dưới ngưỡng C là dưới chuẩn), BR-226 (AI tìm mốc, CL, CW, diện tích, dải xuyên sáng),
-- BR-227 (dải xuyên sáng là đề xuất, QC kiểm cảm quan rồi mới duyệt).
-- Chỉ thêm bảng và cột, không xoá dữ liệu cũ.

CREATE TABLE dbo.grading_standard (
    standard_id      BIGINT IDENTITY(1,1) NOT NULL,
    standard_code    NVARCHAR(40)  NOT NULL,
    revision         NVARCHAR(60)  NOT NULL,
    issuer           NVARCHAR(200) NOT NULL,
    scope            NVARCHAR(300) NOT NULL,
    effective_from   DATE          NOT NULL,
    note             NVARCHAR(500) NULL,
    created_at       DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_grading_standard_created DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_grading_standard PRIMARY KEY (standard_id),
    CONSTRAINT ux_grading_standard_code UNIQUE (standard_code, revision)
);
GO
CREATE TABLE dbo.grade_rule_set (
    rule_set_id         BIGINT IDENTITY(1,1) NOT NULL,
    standard_id         BIGINT        NOT NULL,
    crab_type           VARCHAR(20)   NOT NULL,
    version_no          INT           NOT NULL,
    effective_from      DATETIMEOFFSET(3) NOT NULL,
    -- Dải cận ngưỡng (% của ngưỡng): số đo nằm trong dải này thì quyết định vào Hold chờ QC (BR-155).
    near_threshold_pct  DECIMAL(5,2)  NOT NULL CONSTRAINT df_grade_rule_set_near DEFAULT (2.00),
    status              VARCHAR(20)   NOT NULL CONSTRAINT df_grade_rule_set_status DEFAULT ('Draft'),
    note                NVARCHAR(500) NULL,
    created_by          BIGINT        NULL,
    approved_by         BIGINT        NULL,
    approved_at         DATETIMEOFFSET(3) NULL,
    created_at          DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_grade_rule_set_created DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_grade_rule_set PRIMARY KEY (rule_set_id),
    CONSTRAINT fk_grade_rule_set_standard FOREIGN KEY (standard_id) REFERENCES dbo.grading_standard(standard_id),
    CONSTRAINT fk_grade_rule_set_creator FOREIGN KEY (created_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT fk_grade_rule_set_approver FOREIGN KEY (approved_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ux_grade_rule_set_version UNIQUE (crab_type, version_no),
    CONSTRAINT ck_grade_rule_set_crab_type CHECK (crab_type IN ('FatteningMudCrab', 'RoeCrab', 'YoungFemaleCrab', 'OilRoeCrab')),
    CONSTRAINT ck_grade_rule_set_status CHECK (status IN ('Draft', 'Active', 'Retired')),
    CONSTRAINT ck_grade_rule_set_near CHECK (near_threshold_pct >= 0 AND near_threshold_pct <= 20),
    CONSTRAINT ck_grade_rule_set_approved CHECK (status = 'Draft' OR approved_at IS NOT NULL)
);
CREATE UNIQUE INDEX ux_grade_rule_set_active ON dbo.grade_rule_set(crab_type) WHERE status = 'Active';
GO
CREATE TABLE dbo.grade_rule (
    rule_id        BIGINT IDENTITY(1,1) NOT NULL,
    rule_set_id    BIGINT        NOT NULL,
    -- Size (bảng 3.2), PhysicalFactor (mức C, bảng 3.3), Sensory (dải xuyên sáng viền mai, BR-227), Exclusion (điều kiện loại trừ).
    rule_kind      VARCHAR(20)   NOT NULL,
    metric         VARCHAR(30)   NOT NULL,
    lower_bound    DECIMAL(10,4) NULL,
    upper_bound    DECIMAL(10,4) NULL,
    unit           VARCHAR(20)   NOT NULL,
    result_label   VARCHAR(20)   NOT NULL,
    -- LowerInclusive = [cận dưới, cận trên); UpperInclusive = (cận dưới, cận trên]; BothInclusive = [cận dưới, cận trên].
    boundary       VARCHAR(20)   NOT NULL CONSTRAINT df_grade_rule_boundary DEFAULT ('LowerInclusive'),
    sort_order     INT           NOT NULL CONSTRAINT df_grade_rule_sort DEFAULT (0),
    note           NVARCHAR(300) NULL,
    CONSTRAINT pk_grade_rule PRIMARY KEY (rule_id),
    CONSTRAINT fk_grade_rule_set FOREIGN KEY (rule_set_id) REFERENCES dbo.grade_rule_set(rule_set_id),
    CONSTRAINT ck_grade_rule_kind CHECK (rule_kind IN ('Size', 'PhysicalFactor', 'Sensory', 'Exclusion')),
    CONSTRAINT ck_grade_rule_metric CHECK (metric IN ('WeightG', 'CIndex', 'EdgeBandMm', 'Alive', 'FoodSafe')),
    CONSTRAINT ck_grade_rule_boundary CHECK (boundary IN ('LowerInclusive', 'UpperInclusive', 'BothInclusive')),
    CONSTRAINT ck_grade_rule_bounds CHECK (lower_bound IS NULL OR upper_bound IS NULL OR lower_bound < upper_bound),
    CONSTRAINT ck_grade_rule_label CHECK (result_label IN ('M', 'L', 'XL', 'OUT', 'SPECIAL', 'G1', 'BELOW', 'REJECT'))
);
CREATE INDEX ix_grade_rule_set ON dbo.grade_rule(rule_set_id, rule_kind, sort_order);
GO
-- Bộ quy tắc đã dùng (Active, Retired) không được sửa; muốn đổi thì tạo phiên bản mới (BR-038).
CREATE TRIGGER dbo.tr_grade_rule_locked ON dbo.grade_rule
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.grade_rule_set s
               WHERE s.status <> 'Draft'
                 AND s.rule_set_id IN (SELECT rule_set_id FROM inserted UNION SELECT rule_set_id FROM deleted))
        THROW 50230, N'Bộ quy tắc phân hạng đã áp dụng không được sửa; hãy tạo phiên bản mới.', 1;
END;
GO
ALTER TABLE dbo.batch ADD grade_rule_set_id BIGINT NULL
    CONSTRAINT fk_batch_grade_rule_set FOREIGN KEY REFERENCES dbo.grade_rule_set(rule_set_id);
GO
CREATE TABLE dbo.ai_inference (
    ai_inference_id        BIGINT IDENTITY(1,1) NOT NULL,
    measurement_session_id BIGINT        NOT NULL,
    image_kind             VARCHAR(10)   NOT NULL,
    model_name             VARCHAR(50)   NOT NULL,
    model_version          VARCHAR(30)   NOT NULL,
    is_simulated           BIT           NOT NULL CONSTRAINT df_ai_inference_simulated DEFAULT (0),
    status                 VARCHAR(20)   NOT NULL,
    image_quality          VARCHAR(20)   NULL,
    landmarks_json         NVARCHAR(2000) NULL,
    carapace_length_cm     DECIMAL(6,2)  NULL,
    carapace_width_cm      DECIMAL(6,2)  NULL,
    carapace_area_cm2      DECIMAL(8,2)  NULL,
    edge_band_mm           DECIMAL(6,2)  NULL,
    confidence             DECIMAL(5,4)  NULL,
    error_reason           NVARCHAR(300) NULL,
    created_at             DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_ai_inference PRIMARY KEY (ai_inference_id),
    CONSTRAINT fk_ai_inference_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_session(measurement_session_id),
    CONSTRAINT ck_ai_inference_image CHECK (image_kind IN ('White', 'Red')),
    CONSTRAINT ck_ai_inference_status CHECK (status IN ('Succeeded', 'LowConfidence', 'Failed')),
    CONSTRAINT ck_ai_inference_quality CHECK (image_quality IS NULL OR image_quality IN ('Good', 'Poor', 'Unusable')),
    CONSTRAINT ck_ai_inference_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    CONSTRAINT ck_ai_inference_failed CHECK (status <> 'Failed' OR error_reason IS NOT NULL)
);
CREATE INDEX ix_ai_inference_session ON dbo.ai_inference(measurement_session_id);
GO
CREATE TABLE dbo.measurement_value (
    measurement_value_id   BIGINT IDENTITY(1,1) NOT NULL,
    measurement_session_id BIGINT        NOT NULL,
    metric                 VARCHAR(30)   NOT NULL,
    value                  DECIMAL(10,4) NOT NULL,
    unit                   VARCHAR(10)   NOT NULL,
    -- Scale (cân của trạm), AI (từ ảnh), Caliper (thước kẹp), ManualScale (cân tay), Computed (tính từ số khác).
    method                 VARCHAR(20)   NOT NULL,
    confidence             DECIMAL(5,4)  NULL,
    -- Unverified, Verified (QC đối chứng), Disputed.
    verification_status    VARCHAR(20)   NOT NULL CONSTRAINT df_measurement_value_verification DEFAULT ('Unverified'),
    ai_inference_id        BIGINT        NULL,
    recorded_by            BIGINT        NULL,
    recorded_at            DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_measurement_value PRIMARY KEY (measurement_value_id),
    CONSTRAINT fk_measurement_value_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_session(measurement_session_id),
    CONSTRAINT fk_measurement_value_inference FOREIGN KEY (ai_inference_id) REFERENCES dbo.ai_inference(ai_inference_id),
    CONSTRAINT fk_measurement_value_user FOREIGN KEY (recorded_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_measurement_value_metric CHECK (metric IN ('WeightG', 'CarapaceLengthCm', 'CarapaceWidthCm', 'CarapaceAreaCm2', 'EdgeBandMm', 'CIndex')),
    CONSTRAINT ck_measurement_value_method CHECK (method IN ('Scale', 'AI', 'Caliper', 'ManualScale', 'Computed')),
    CONSTRAINT ck_measurement_value_verification CHECK (verification_status IN ('Unverified', 'Verified', 'Disputed')),
    CONSTRAINT ck_measurement_value_positive CHECK (value >= 0),
    CONSTRAINT ck_measurement_value_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE INDEX ix_measurement_value_session ON dbo.measurement_value(measurement_session_id, metric, recorded_at);
GO
-- Số đo là bằng chứng gốc của hạng: chỉ ghi thêm, không sửa, không xoá.
CREATE TRIGGER dbo.tr_measurement_value_append_only ON dbo.measurement_value
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50231, N'Số đo đã ghi không được sửa hoặc xoá; hãy đo lại hoặc ghi số mới.', 1;
END;
GO
CREATE TABLE dbo.grade_decision (
    grade_decision_id      BIGINT IDENTITY(1,1) NOT NULL,
    decision_no            VARCHAR(20)   NOT NULL,
    crab_unit_id           BIGINT        NOT NULL,
    batch_id               BIGINT        NOT NULL,
    measurement_session_id BIGINT        NOT NULL,
    rule_set_id            BIGINT        NOT NULL,
    version_no             INT           NOT NULL,
    -- Draft (hệ thống đề xuất), Hold (cận ngưỡng, ảnh lỗi, AI không chắc, chờ thước kẹp, QC giữ lại), Approved, Rejected, Superseded.
    status                 VARCHAR(20)   NOT NULL,
    weight_g               DECIMAL(7,1)  NULL,
    carapace_length_cm     DECIMAL(6,2)  NULL,
    c_index                DECIMAL(6,4)  NULL,
    edge_band_mm           DECIMAL(6,2)  NULL,
    proposed_size          VARCHAR(10)   NULL,
    proposed_c_level       VARCHAR(10)   NULL,
    proposed_sensory       VARCHAR(10)   NULL,
    proposed_grade         VARCHAR(10)   NULL,
    hold_reasons           VARCHAR(200)  NULL,
    final_size             VARCHAR(10)   NULL,
    final_grade            VARCHAR(10)   NULL,
    spec_id                BIGINT        NULL,
    is_substandard         BIT           NOT NULL CONSTRAINT df_grade_decision_substandard DEFAULT (0),
    live_status            VARCHAR(10)   NULL,
    food_safety            VARCHAR(10)   NULL,
    sensory_note           NVARCHAR(300) NULL,
    reason                 NVARCHAR(300) NULL,
    photo_uri              NVARCHAR(500) NULL,
    photo_sha256           VARCHAR(64)   NULL,
    decided_by             BIGINT        NULL,
    decided_at             DATETIMEOFFSET(3) NULL,
    held_by                BIGINT        NULL,
    held_at                DATETIMEOFFSET(3) NULL,
    second_qc_id           BIGINT        NULL,
    second_confirmed_at    DATETIMEOFFSET(3) NULL,
    qc_inspection_id       BIGINT        NULL,
    supersedes_decision_id BIGINT        NULL,
    is_current             BIT           NOT NULL CONSTRAINT df_grade_decision_current DEFAULT (1),
    created_at             DATETIMEOFFSET(3) NOT NULL,
    updated_at             DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_grade_decision PRIMARY KEY (grade_decision_id),
    CONSTRAINT ux_grade_decision_no UNIQUE (decision_no),
    CONSTRAINT ux_grade_decision_version UNIQUE (crab_unit_id, version_no),
    CONSTRAINT fk_grade_decision_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id),
    CONSTRAINT fk_grade_decision_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_grade_decision_session FOREIGN KEY (measurement_session_id) REFERENCES dbo.measurement_session(measurement_session_id),
    CONSTRAINT fk_grade_decision_rule_set FOREIGN KEY (rule_set_id) REFERENCES dbo.grade_rule_set(rule_set_id),
    CONSTRAINT fk_grade_decision_spec FOREIGN KEY (spec_id) REFERENCES dbo.product_specification(spec_id),
    CONSTRAINT fk_grade_decision_decider FOREIGN KEY (decided_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT fk_grade_decision_holder FOREIGN KEY (held_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT fk_grade_decision_second FOREIGN KEY (second_qc_id) REFERENCES dbo.app_user(user_id),
    CONSTRAINT fk_grade_decision_inspection FOREIGN KEY (qc_inspection_id) REFERENCES dbo.qc_inspection(qc_inspection_id),
    CONSTRAINT fk_grade_decision_supersedes FOREIGN KEY (supersedes_decision_id) REFERENCES dbo.grade_decision(grade_decision_id),
    CONSTRAINT ck_grade_decision_status CHECK (status IN ('Draft', 'Hold', 'Approved', 'Rejected', 'Superseded')),
    CONSTRAINT ck_grade_decision_size CHECK ((proposed_size IS NULL OR proposed_size IN ('M', 'L', 'XL', 'OUT'))
                                         AND (final_size IS NULL OR final_size IN ('M', 'L', 'XL', 'OUT'))),
    CONSTRAINT ck_grade_decision_grade CHECK ((proposed_c_level IS NULL OR proposed_c_level IN ('SPECIAL', 'G1', 'BELOW'))
                                          AND (proposed_sensory IS NULL OR proposed_sensory IN ('SPECIAL', 'G1', 'BELOW'))
                                          AND (proposed_grade IS NULL OR proposed_grade IN ('SPECIAL', 'G1', 'BELOW'))
                                          AND (final_grade IS NULL OR final_grade IN ('SPECIAL', 'G1', 'BELOW'))),
    CONSTRAINT ck_grade_decision_live CHECK (live_status IS NULL OR live_status IN ('Alive', 'Weak', 'Dead')),
    CONSTRAINT ck_grade_decision_safety CHECK (food_safety IS NULL OR food_safety IN ('Pass', 'Fail')),
    -- BR-155: chỉ Nhân viên kiểm phẩm duyệt; cua duyệt bán phải sống và an toàn.
    CONSTRAINT ck_grade_decision_approved CHECK (status <> 'Approved' OR (final_size IS NOT NULL AND final_grade IS NOT NULL
                                             AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND live_status = 'Alive' AND food_safety = 'Pass')),
    -- BR-156: loại bỏ phải có lý do và ảnh.
    CONSTRAINT ck_grade_decision_rejected CHECK (status <> 'Rejected' OR (reason IS NOT NULL AND photo_uri IS NOT NULL
                                             AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
    -- BR-017: người xác nhận giữ lại phải là Nhân viên kiểm phẩm thứ hai.
    CONSTRAINT ck_grade_decision_second CHECK (second_qc_id IS NULL OR held_by IS NULL OR second_qc_id <> held_by),
    CONSTRAINT ck_grade_decision_current CHECK (status <> 'Superseded' OR is_current = 0)
);
CREATE UNIQUE INDEX ux_grade_decision_current ON dbo.grade_decision(crab_unit_id) WHERE is_current = 1;
CREATE INDEX ix_grade_decision_batch ON dbo.grade_decision(batch_id, status) INCLUDE (is_current, spec_id);
GO

-- Chuẩn T/SCFA 0014-2024 và bộ quy tắc ban đầu theo bảng 3.2, 3.3 của BR (giá trị từ bảng thầy gửi).
INSERT INTO dbo.grading_standard (standard_code, revision, issuer, scope, effective_from, note)
VALUES (N'T/SCFA 0014-2024', N'Bản sửa đổi hiệu lực 01/08/2026', N'Hiệp hội Thuỷ sản Trung Quốc',
        N'Cua bùn sống (Scylla paramamosain): size theo khối lượng, mức C, cảm quan', '2026-08-01',
        N'Chuẩn nội bộ tham chiếu, không phải chứng nhận (BR-038). Áp dụng theo từng con; tiêu chuẩn gốc lấy trung bình 5 con.');
GO
DECLARE @standard BIGINT = (SELECT standard_id FROM dbo.grading_standard WHERE standard_code = N'T/SCFA 0014-2024');
INSERT INTO dbo.grade_rule_set (standard_id, crab_type, version_no, effective_from, near_threshold_pct, status, note)
VALUES (@standard, 'FatteningMudCrab', 1, '2026-01-01T00:00:00+07:00', 2.00, 'Draft', N'Cua thịt: size theo bảng 3.2, mức C theo bảng 3.3. Ngưỡng dải xuyên sáng (mm) do Admin đặt (BR-227).'),
       (@standard, 'YoungFemaleCrab', 1, '2026-01-01T00:00:00+07:00', 2.00, 'Draft', N'Cua cái non: size theo bảng 3.2, mức C theo bảng 3.3.'),
       (@standard, 'RoeCrab', 1, '2026-01-01T00:00:00+07:00', 2.00, 'Draft', N'Cua gạch: chỉ size và cảm quan (BR-038); dải xuyên sáng viền mai theo BR-227.'),
       (@standard, 'OilRoeCrab', 1, '2026-01-01T00:00:00+07:00', 2.00, 'Draft', N'Cua gạch dầu: chỉ size và cảm quan (BR-038); QC kiểm cảm quan.');

INSERT INTO dbo.grade_rule (rule_set_id, rule_kind, metric, lower_bound, upper_bound, unit, result_label, boundary, sort_order, note)
SELECT s.rule_set_id, r.kind, r.metric, r.lo, r.hi, r.unit, r.label, r.boundary, r.sort, r.note
FROM dbo.grade_rule_set s
JOIN (VALUES
    -- Bảng 3.2: ngưỡng size (gram mỗi con, không tính dây trói).
    ('FatteningMudCrab', 'Size', 'WeightG', 200, 300,  'g', 'M',  'LowerInclusive', 1, N'Bảng 3.2'),
    ('FatteningMudCrab', 'Size', 'WeightG', 300, 350,  'g', 'L',  'LowerInclusive', 2, N'Bảng 3.2'),
    ('FatteningMudCrab', 'Size', 'WeightG', 350, NULL, 'g', 'XL', 'LowerInclusive', 3, N'Bảng 3.2'),
    ('RoeCrab',          'Size', 'WeightG', 200, 250,  'g', 'M',  'LowerInclusive', 1, N'Bảng 3.2'),
    ('RoeCrab',          'Size', 'WeightG', 250, 350,  'g', 'L',  'LowerInclusive', 2, N'Bảng 3.2'),
    ('RoeCrab',          'Size', 'WeightG', 350, NULL, 'g', 'XL', 'LowerInclusive', 3, N'Bảng 3.2'),
    ('YoungFemaleCrab',  'Size', 'WeightG', 125, 150,  'g', 'M',  'LowerInclusive', 1, N'Bảng 3.2'),
    ('YoungFemaleCrab',  'Size', 'WeightG', 150, 200,  'g', 'L',  'LowerInclusive', 2, N'Bảng 3.2'),
    ('YoungFemaleCrab',  'Size', 'WeightG', 200, NULL, 'g', 'XL', 'LowerInclusive', 3, N'Bảng 3.2'),
    ('OilRoeCrab',       'Size', 'WeightG', 150, 200,  'g', 'M',  'LowerInclusive', 1, N'Bảng 3.2'),
    ('OilRoeCrab',       'Size', 'WeightG', 200, 300,  'g', 'L',  'LowerInclusive', 2, N'Bảng 3.2'),
    ('OilRoeCrab',       'Size', 'WeightG', 300, NULL, 'g', 'XL', 'LowerInclusive', 3, N'Bảng 3.2'),
    -- Bảng 3.3: mức C = khối lượng (g) ÷ CL (cm)³; cua gạch và cua gạch dầu không xếp theo C (BR-038).
    ('FatteningMudCrab', 'PhysicalFactor', 'CIndex', 0.66, NULL, 'g/cm3', 'SPECIAL', 'LowerInclusive', 1, N'Bảng 3.3'),
    ('FatteningMudCrab', 'PhysicalFactor', 'CIndex', 0.62, 0.66, 'g/cm3', 'G1',      'LowerInclusive', 2, N'Bảng 3.3'),
    ('FatteningMudCrab', 'PhysicalFactor', 'CIndex', NULL, 0.62, 'g/cm3', 'BELOW',   'LowerInclusive', 3, N'Bảng 3.3: dưới ngưỡng (Cấp 2 tạm), dưới chuẩn'),
    ('YoungFemaleCrab',  'PhysicalFactor', 'CIndex', 0.66, NULL, 'g/cm3', 'SPECIAL', 'LowerInclusive', 1, N'Bảng 3.3'),
    ('YoungFemaleCrab',  'PhysicalFactor', 'CIndex', 0.62, 0.66, 'g/cm3', 'G1',      'LowerInclusive', 2, N'Bảng 3.3'),
    ('YoungFemaleCrab',  'PhysicalFactor', 'CIndex', NULL, 0.62, 'g/cm3', 'BELOW',   'LowerInclusive', 3, N'Bảng 3.3: dưới ngưỡng (Cấp 2 tạm), dưới chuẩn'),
    -- BR-227: cua gạch đặc cấp dải xuyên sáng dưới 2 mm, cấp 1 từ 2 đến 4 mm.
    ('RoeCrab', 'Sensory', 'EdgeBandMm', NULL, 2, 'mm', 'SPECIAL', 'LowerInclusive', 1, N'BR-227: dưới 2 mm'),
    ('RoeCrab', 'Sensory', 'EdgeBandMm', 2,    4, 'mm', 'G1',      'BothInclusive',  2, N'BR-227: từ 2 đến 4 mm'),
    ('RoeCrab', 'Sensory', 'EdgeBandMm', 4, NULL, 'mm', 'BELOW',   'UpperInclusive', 3, N'Trên 4 mm: không đạt cấp 1'),
    -- Điều kiện loại trừ (BR-156): cua chết, yếu nặng hoặc không an toàn thì Rejected.
    ('FatteningMudCrab', 'Exclusion', 'Alive',    1, NULL, 'flag', 'REJECT', 'LowerInclusive', 1, N'Phải còn sống, khoẻ'),
    ('FatteningMudCrab', 'Exclusion', 'FoodSafe', 1, NULL, 'flag', 'REJECT', 'LowerInclusive', 2, N'Phải an toàn thực phẩm'),
    ('RoeCrab',          'Exclusion', 'Alive',    1, NULL, 'flag', 'REJECT', 'LowerInclusive', 1, N'Phải còn sống, khoẻ'),
    ('RoeCrab',          'Exclusion', 'FoodSafe', 1, NULL, 'flag', 'REJECT', 'LowerInclusive', 2, N'Phải an toàn thực phẩm'),
    ('YoungFemaleCrab',  'Exclusion', 'Alive',    1, NULL, 'flag', 'REJECT', 'LowerInclusive', 1, N'Phải còn sống, khoẻ'),
    ('YoungFemaleCrab',  'Exclusion', 'FoodSafe', 1, NULL, 'flag', 'REJECT', 'LowerInclusive', 2, N'Phải an toàn thực phẩm'),
    ('OilRoeCrab',       'Exclusion', 'Alive',    1, NULL, 'flag', 'REJECT', 'LowerInclusive', 1, N'Phải còn sống, khoẻ'),
    ('OilRoeCrab',       'Exclusion', 'FoodSafe', 1, NULL, 'flag', 'REJECT', 'LowerInclusive', 2, N'Phải an toàn thực phẩm')
) r(crab_type, kind, metric, lo, hi, unit, label, boundary, sort, note) ON r.crab_type = s.crab_type
WHERE s.version_no = 1;

UPDATE dbo.grade_rule_set SET status = 'Active', approved_at = '2026-01-01T00:00:00+07:00' WHERE version_no = 1 AND status = 'Draft';
GO
-- Lô đã duyệt trước V023 dùng bộ quy tắc đầu tiên của loại cua (BR-038).
UPDATE b SET grade_rule_set_id = s.rule_set_id
FROM dbo.batch b JOIN dbo.grade_rule_set s ON s.crab_type = b.crab_type AND s.version_no = 1
WHERE b.grade_rule_set_id IS NULL AND b.approved_at IS NOT NULL;
GO
