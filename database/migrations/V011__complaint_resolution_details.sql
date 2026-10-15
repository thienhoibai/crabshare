-- NH-11 (CS-60): Khiếu nại và giải quyết tranh chấp (UC31, UC32).
-- Bổ sung thông tin giải trình của hộ nuôi, bằng chứng và ghi chú phân xử của Admin.
ALTER TABLE dbo.complaint ADD
    operator_response     NVARCHAR(1000)    NULL,
    operator_evidence_uri NVARCHAR(400)     NULL,
    responded_at          DATETIMEOFFSET(3) NULL,
    escalated_at          DATETIMEOFFSET(3) NULL,
    admin_notes           NVARCHAR(1000)    NULL;
GO

-- Index hỗ trợ job quét khiếu nại Open để leo thang Escalated khi quá hạn phản hồi
CREATE INDEX ix_complaint_status_opened_at ON dbo.complaint (status, opened_at);
GO
