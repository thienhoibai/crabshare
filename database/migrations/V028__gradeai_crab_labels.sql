ALTER TABLE dbo.batch ADD gradeai_prefix varchar(16) NULL;
ALTER TABLE dbo.crab_unit ADD gradeai_tag varchar(23) NULL;
GO

CREATE UNIQUE INDEX ux_batch_gradeai_prefix ON dbo.batch (gradeai_prefix)
    WHERE gradeai_prefix IS NOT NULL;
CREATE UNIQUE INDEX ux_crab_unit_gradeai_tag ON dbo.crab_unit (gradeai_tag)
    WHERE gradeai_tag IS NOT NULL;
GO
