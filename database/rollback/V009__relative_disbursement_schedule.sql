-- Refuse loss of authored milestone rules. Restore a pre-V009 backup if relative schedules exist.
IF EXISTS(SELECT 1 FROM dbo.standard_cost_tranche_plan WHERE anchor_code IS NOT NULL)
    OR EXISTS(SELECT 1 FROM dbo.disbursement_tranche WHERE anchor_code IS NOT NULL)
    THROW 51009,N'Không rollback khi đã có lịch theo mốc. Cần giữ dữ liệu hoặc khôi phục backup trước V009.',1;
ALTER TABLE dbo.standard_cost_tranche_plan DROP CONSTRAINT ck_cost_plan_timing;
ALTER TABLE dbo.disbursement_tranche DROP CONSTRAINT ck_tranche_timing;
ALTER TABLE dbo.standard_cost_tranche_plan DROP COLUMN anchor_code,offset_days;
ALTER TABLE dbo.disbursement_tranche DROP COLUMN anchor_code,offset_days;
ALTER TABLE dbo.standard_cost_tranche_plan ALTER COLUMN planned_date DATE NOT NULL;
ALTER TABLE dbo.disbursement_tranche ALTER COLUMN planned_date DATE NOT NULL;
DELETE dbo.SchemaVersions WHERE ScriptName='V009__relative_disbursement_schedule.sql';
