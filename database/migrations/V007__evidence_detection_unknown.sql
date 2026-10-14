-- Noop/detector unavailable means unknown, not "no crab detected".
-- Preserve all existing detections while allowing the provider's nullable result.
ALTER TABLE dbo.evidence_detection ALTER COLUMN crab_detected BIT NULL;
ALTER TABLE dbo.evidence_detection ALTER COLUMN confidence DECIMAL(5,4) NULL;
GO
