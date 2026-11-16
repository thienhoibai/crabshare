-- Keep previously approved absolute schedules; new schedules can wait for real milestones.
ALTER TABLE dbo.standard_cost_tranche_plan ALTER COLUMN planned_date DATE NULL;
ALTER TABLE dbo.standard_cost_tranche_plan ADD anchor_code VARCHAR(20) NULL, offset_days SMALLINT NULL;
ALTER TABLE dbo.disbursement_tranche ALTER COLUMN planned_date DATE NULL;
ALTER TABLE dbo.disbursement_tranche ADD anchor_code VARCHAR(20) NULL, offset_days SMALLINT NULL;
GO
ALTER TABLE dbo.standard_cost_tranche_plan ADD CONSTRAINT ck_cost_plan_timing CHECK (
    (planned_date IS NOT NULL AND anchor_code IS NULL AND offset_days IS NULL) OR
    (planned_date IS NULL AND anchor_code IS NOT NULL AND anchor_code IN ('FundingReady','Stocked') AND offset_days IS NOT NULL AND offset_days>=0));
ALTER TABLE dbo.disbursement_tranche ADD CONSTRAINT ck_tranche_timing CHECK (
    (anchor_code IS NULL AND offset_days IS NULL AND planned_date IS NOT NULL) OR
    (anchor_code IS NOT NULL AND anchor_code IN ('FundingReady','Stocked') AND offset_days IS NOT NULL AND offset_days>=0));
GO
