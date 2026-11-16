-- Manual rollback, only after backing up schedules/reasons. DbUp does not run this folder.
-- Does not unlock any existing cost version. Reverting removes SQL immutability protection.
DROP TRIGGER IF EXISTS dbo.tr_cost_plan_locked;
DROP TRIGGER IF EXISTS dbo.tr_cost_item_locked;
DROP TRIGGER IF EXISTS dbo.tr_cost_version_locked;
DROP TABLE dbo.standard_cost_tranche_plan;
ALTER TABLE dbo.batch DROP COLUMN rejection_reason;
ALTER TABLE dbo.fee_tier DROP CONSTRAINT df_fee_min_inclusive,df_fee_max_inclusive;
ALTER TABLE dbo.fee_tier DROP COLUMN min_inclusive,max_inclusive;
DELETE dbo.SchemaVersions WHERE ScriptName='V008__batch_approval_and_cost_lock.sql';
