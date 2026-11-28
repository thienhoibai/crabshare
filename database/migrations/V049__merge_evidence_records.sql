-- V049: gộp ảnh bằng chứng, kết quả nhận diện, lượt duyệt ảnh và yêu cầu chụp vào một bảng dbo.evidence_record (49 bảng còn 46).
-- Trước: evidence, evidence_detection, evidence_review, capture_request.
-- Sau: cột record_type cho biết loại bản ghi (Evidence, Detection, Review, CaptureRequest). Ảnh bằng chứng giữ nguyên id.
CREATE TABLE dbo.evidence_record (
    evidence_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_evidence_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    batch_id BIGINT NULL,
    slot_event_id BIGINT NULL,
    tranche_id BIGINT NULL,
    slot_id BIGINT NULL,
    capture_request_id BIGINT NULL,
    media_type VARCHAR(20) NULL,
    file_uri NVARCHAR(400) NULL,
    sha256 CHAR(64) NULL,
    perceptual_hash VARCHAR(64) NULL,
    captured_at DATETIMEOFFSET(3) NULL,
    received_at DATETIMEOFFSET(3) NULL,
    latitude DECIMAL(9,6) NULL,
    longitude DECIMAL(9,6) NULL,
    source VARCHAR(20) NULL,
    partner_label NVARCHAR(100) NULL,
    risk_score DECIMAL(5,2) NULL,
    review_status VARCHAR(20) NULL,
    explanation NVARCHAR(1000) NULL,
    explained_at DATETIMEOFFSET(3) NULL,
    created_at DATETIMEOFFSET(3) NULL,
    crab_item_id BIGINT NULL,
    crab_unit_id BIGINT NULL,
    evidence_kind VARCHAR(20) NULL,
    evidence_id BIGINT NULL,
    model_version VARCHAR(50) NULL,
    crab_detected BIT NULL,
    confidence DECIMAL(5,4) NULL,
    bbox_json NVARCHAR(400) NULL,
    detected_at DATETIMEOFFSET(3) NULL,
    reviewer_id BIGINT NULL,
    verdict VARCHAR(20) NULL,
    note NVARCHAR(500) NULL,
    reviewed_at DATETIMEOFFSET(3) NULL,
    requested_at DATETIMEOFFSET(3) NULL,
    due_at DATETIMEOFFSET(3) NULL,
    status VARCHAR(20) NULL,
    fulfilled_at DATETIMEOFFSET(3) NULL,
    CONSTRAINT ck_evidence_record_record_type CHECK (record_type IN ('Evidence', 'Detection', 'Review', 'CaptureRequest'))
);
GO
SET IDENTITY_INSERT dbo.evidence_record ON;
INSERT INTO dbo.evidence_record (evidence_record_id, record_type, legacy_id, batch_id, slot_event_id, tranche_id, slot_id, capture_request_id, media_type, file_uri, sha256, perceptual_hash, captured_at, received_at, latitude, longitude, source, partner_label, risk_score, review_status, explanation, explained_at, created_at, crab_item_id, crab_unit_id, evidence_kind)
SELECT s.[evidence_id], 'Evidence', s.[evidence_id], s.[batch_id], s.[slot_event_id], s.[tranche_id], s.[slot_id], s.[capture_request_id], s.[media_type], s.[file_uri], s.[sha256], s.[perceptual_hash], s.[captured_at], s.[received_at], s.[latitude], s.[longitude], s.[source], s.[partner_label], s.[risk_score], s.[review_status], s.[explanation], s.[explained_at], s.[created_at], s.[crab_item_id], s.[crab_unit_id], s.[evidence_kind] FROM dbo.evidence s ORDER BY s.[evidence_id];
SET IDENTITY_INSERT dbo.evidence_record OFF;
GO
INSERT INTO dbo.evidence_record (record_type, legacy_id, evidence_id, model_version, crab_detected, confidence, bbox_json, detected_at)
SELECT 'Detection', s.[detection_id], s.[evidence_id], s.[model_version], s.[crab_detected], s.[confidence], s.[bbox_json], s.[detected_at] FROM dbo.evidence_detection s ORDER BY s.[detection_id];
GO
INSERT INTO dbo.evidence_record (record_type, legacy_id, evidence_id, reviewer_id, verdict, note, reviewed_at)
SELECT 'Review', s.[evidence_review_id], s.[evidence_id], s.[reviewer_id], s.[verdict], s.[note], s.[reviewed_at] FROM dbo.evidence_review s ORDER BY s.[evidence_review_id];
GO
INSERT INTO dbo.evidence_record (record_type, legacy_id, batch_id, slot_id, requested_at, due_at, status, fulfilled_at, created_at)
SELECT 'CaptureRequest', s.[capture_request_id], s.[batch_id], s.[slot_id], s.[requested_at], s.[due_at], s.[status], s.[fulfilled_at], s.[created_at] FROM dbo.capture_request s ORDER BY s.[capture_request_id];
GO
UPDATE c SET c.capture_request_id = p.evidence_record_id FROM dbo.evidence_record c JOIN dbo.evidence_record p ON p.record_type = 'CaptureRequest' AND p.legacy_id = c.capture_request_id WHERE c.record_type = 'Evidence';
ALTER TABLE dbo.cost_record DROP CONSTRAINT fk_cost_actual_evidence;
ALTER TABLE dbo.crab_tag DROP CONSTRAINT fk_crab_tag_activation_evidence_id;
ALTER TABLE dbo.inventory_record DROP CONSTRAINT fk_inventory_event_evidence;
GO
ALTER TABLE dbo.evidence DROP CONSTRAINT fk_evidence_capture_request_id;
ALTER TABLE dbo.evidence_detection DROP CONSTRAINT fk_evidence_detection_evidence_id;
ALTER TABLE dbo.evidence_review DROP CONSTRAINT fk_evidence_review_evidence_id;
DROP TABLE dbo.evidence;
DROP TABLE dbo.evidence_detection;
DROP TABLE dbo.evidence_review;
DROP TABLE dbo.capture_request;
GO
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_record_evidence_required CHECK (record_type <> 'Evidence' OR (batch_id IS NOT NULL AND media_type IS NOT NULL AND file_uri IS NOT NULL AND sha256 IS NOT NULL AND received_at IS NOT NULL AND source IS NOT NULL AND review_status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_document_upload CHECK (record_type <> 'Evidence' OR ([source]<>'DocumentUpload' OR [media_type]='Invoice'));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_in_app_capture CHECK (record_type <> 'Evidence' OR ([source]<>'InAppCapture' OR ([media_type]='Video' OR [media_type]='Photo') AND [captured_at] IS NOT NULL));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_kind CHECK (record_type <> 'Evidence' OR ([evidence_kind]='Grading' OR [evidence_kind]='Claim' OR [evidence_kind]='Document' OR [evidence_kind]='ScaleTicket' OR [evidence_kind]='SiteVisit' OR [evidence_kind]='Retake' OR [evidence_kind]='CaptureResponse' OR [evidence_kind]='AlertCheck' OR [evidence_kind]='Restock' OR [evidence_kind]='Mortality' OR [evidence_kind]='Stocking'));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_latitude CHECK (record_type <> 'Evidence' OR ([latitude]>=(-90) AND [latitude]<=(90)));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_longitude CHECK (record_type <> 'Evidence' OR ([longitude]>=(-180) AND [longitude]<=(180)));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_media_type CHECK (record_type <> 'Evidence' OR ([media_type]='Invoice' OR [media_type]='Video' OR [media_type]='Photo'));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_review_status CHECK (record_type <> 'Evidence' OR ([review_status]='Rejected' OR [review_status]='Flagged' OR [review_status]='Watch' OR [review_status]='Accepted'));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_source CHECK (record_type <> 'Evidence' OR ([source]='DocumentUpload' OR [source]='InAppCapture' OR [source]='FarmApi'));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_record_detection_required CHECK (record_type <> 'Detection' OR (evidence_id IS NOT NULL AND model_version IS NOT NULL AND detected_at IS NOT NULL));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_detection_confidence CHECK (record_type <> 'Detection' OR ([confidence]>=(0) AND [confidence]<=(1)));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_record_review_required CHECK (record_type <> 'Review' OR (evidence_id IS NOT NULL AND reviewer_id IS NOT NULL AND verdict IS NOT NULL AND reviewed_at IS NOT NULL));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_review_verdict CHECK (record_type <> 'Review' OR ([verdict]='NeedMoreEvidence' OR [verdict]='Fail' OR [verdict]='Pass'));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_evidence_record_capturerequest_required CHECK (record_type <> 'CaptureRequest' OR (batch_id IS NOT NULL AND slot_id IS NOT NULL AND requested_at IS NOT NULL AND due_at IS NOT NULL AND status IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_capture_request_due_at CHECK (record_type <> 'CaptureRequest' OR ([due_at]>[requested_at]));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_capture_request_fulfilled CHECK (record_type <> 'CaptureRequest' OR ([status]<>'Fulfilled' OR [fulfilled_at] IS NOT NULL));
ALTER TABLE dbo.evidence_record ADD CONSTRAINT ck_capture_request_status CHECK (record_type <> 'CaptureRequest' OR ([status]='Expired' OR [status]='Fulfilled' OR [status]='Open'));
GO
CREATE INDEX ix_evidence_batch_id ON dbo.evidence_record (batch_id) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_sha256 ON dbo.evidence_record (sha256) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_slot_event_id ON dbo.evidence_record (slot_event_id) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_tranche_id ON dbo.evidence_record (tranche_id) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_slot_id ON dbo.evidence_record (slot_id) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_capture_request_id ON dbo.evidence_record (capture_request_id) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_perceptual_hash ON dbo.evidence_record (perceptual_hash) WHERE record_type = 'Evidence';
CREATE INDEX ix_evidence_crab_item_id ON dbo.evidence_record (crab_item_id) WHERE record_type = 'Evidence';
CREATE UNIQUE INDEX ux_evidence_detection_model ON dbo.evidence_record (evidence_id, model_version) WHERE record_type = 'Detection';
CREATE UNIQUE INDEX ux_evidence_review_reviewer ON dbo.evidence_record (evidence_id, reviewer_id) WHERE record_type = 'Review';
CREATE INDEX ix_evidence_review_reviewer_id ON dbo.evidence_record (reviewer_id) WHERE record_type = 'Review';
CREATE INDEX ix_capture_request_batch_id_status ON dbo.evidence_record (batch_id, status) WHERE record_type = 'CaptureRequest';
CREATE INDEX ix_capture_request_slot_id ON dbo.evidence_record (slot_id) WHERE record_type = 'CaptureRequest';
GO
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_capture_request_id FOREIGN KEY (capture_request_id) REFERENCES dbo.evidence_record(evidence_record_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_crab_item_id FOREIGN KEY (crab_item_id) REFERENCES dbo.crab_item(crab_item_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_crab_unit FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_slot_event_id FOREIGN KEY (slot_event_id) REFERENCES dbo.slot_event(slot_event_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_slot_id FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot(slot_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_tranche_id FOREIGN KEY (tranche_id) REFERENCES dbo.payment_record(payment_record_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_detection_evidence_id FOREIGN KEY (evidence_id) REFERENCES dbo.evidence_record(evidence_record_id);
ALTER TABLE dbo.evidence_record ADD CONSTRAINT fk_evidence_review_reviewer_id FOREIGN KEY (reviewer_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.cost_record ADD CONSTRAINT fk_cost_actual_evidence FOREIGN KEY (document_evidence_id) REFERENCES dbo.evidence_record(evidence_record_id);
ALTER TABLE dbo.crab_tag ADD CONSTRAINT fk_crab_tag_activation_evidence_id FOREIGN KEY (activation_evidence_id) REFERENCES dbo.evidence_record(evidence_record_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_event_evidence FOREIGN KEY (evidence_id) REFERENCES dbo.evidence_record(evidence_record_id);
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
