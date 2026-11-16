IF COL_LENGTH('dbo.evidence', 'crab_item_id') IS NULL
BEGIN
    ALTER TABLE dbo.evidence ADD crab_item_id BIGINT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_evidence_crab_item_id')
BEGIN
    ALTER TABLE dbo.evidence WITH CHECK
        ADD CONSTRAINT fk_evidence_crab_item_id FOREIGN KEY (crab_item_id)
        REFERENCES dbo.crab_item (crab_item_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.evidence') AND name = 'ix_evidence_crab_item_id')
BEGIN
    CREATE INDEX ix_evidence_crab_item_id ON dbo.evidence (crab_item_id);
END;
GO
