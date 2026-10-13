-- Explicit local test fixtures, not a migration or production lifecycle action.
-- Run via backend/scripts/seed-evidence-demo.ps1 after migrations and demo account seeding.
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'CrabShareDev'
    THROW 51000, 'Evidence demo fixtures may only be added to CrabShareDev.', 1;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;
BEGIN TRY
    DECLARE @operatorId BIGINT, @batchId BIGINT;
    DECLARE @now DATETIMEOFFSET(3) = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');
    DECLARE @batchCode VARCHAR(20) = 'CS44-DEMO-01';
    DECLARE @slots TABLE (slot_code VARCHAR(30) NOT NULL PRIMARY KEY);
    INSERT INTO @slots VALUES ('0014'), ('0015'), ('0016');

    SELECT @operatorId = o.operator_id
    FROM dbo.operator o
    JOIN dbo.operator_member m ON m.operator_id = o.operator_id
    JOIN dbo.app_user u ON u.user_id = m.user_id
    WHERE u.email = 'operator@crabshare.local' AND u.status = 'Active'
      AND m.member_role = 'Owner' AND o.status = 'Approved' AND o.tax_code = '2001234567'
      AND EXISTS (SELECT 1 FROM dbo.app_user_role r WHERE r.user_id = u.user_id AND r.role_code = 'OperatorMember');
    IF @operatorId IS NULL
        THROW 51001, 'The approved demo farm and operator account must exist first.', 1;

    SELECT @batchId = batch_id FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = @batchCode;
    IF @batchId IS NOT NULL AND EXISTS (
        SELECT 1 FROM dbo.batch WHERE batch_id = @batchId AND
        (operator_id <> @operatorId OR title <> N'[DEMO CS-44] Lô thử camera/GPS' OR status NOT IN ('Stocked', 'InProduction')))
        THROW 51002, 'The demo batch code is already used or its lifecycle has changed; no data was reset.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.physical_slot s JOIN @slots codes ON codes.slot_code = s.slot_code
        WHERE s.operator_id = @operatorId AND (s.status = 'Maintenance' OR
          (s.status = 'Occupied' AND NOT EXISTS (SELECT 1 FROM dbo.slot_allocation a
             WHERE a.slot_id = s.slot_id AND a.released_at IS NULL AND a.batch_id = @batchId)) OR
          EXISTS (SELECT 1 FROM dbo.slot_allocation a WHERE a.slot_id = s.slot_id
             AND a.released_at IS NULL AND (@batchId IS NULL OR a.batch_id <> @batchId))))
        THROW 51003, 'A demo box is unavailable or belongs to another batch; no allocation was replaced.', 1;

    IF (SELECT COUNT(*) FROM dbo.physical_slot WHERE operator_id = @operatorId) +
       (SELECT COUNT(*) FROM @slots codes WHERE NOT EXISTS (SELECT 1 FROM dbo.physical_slot s
          WHERE s.operator_id = @operatorId AND s.slot_code = codes.slot_code)) >
       (SELECT ISNULL(approved_slot_capacity, 0) FROM dbo.operator WHERE operator_id = @operatorId)
        THROW 51004, 'The demo farm has insufficient approved box capacity.', 1;

    IF @batchId IS NULL
    BEGIN
        INSERT INTO dbo.batch (batch_code, operator_id, crab_type, title, seed_quantity, expected_output_kg,
            cycle_days, restock_cutoff_days, min_viable_capital, target_capital, max_capital, min_contribution,
            operator_share_pct, frozen_stock_cap_months, offtake_preorder_cap_pct, offtake_deposit_pct,
            status, stocked_at, expected_harvest_date, created_at, updated_at)
        VALUES (@batchCode, @operatorId, 'FatteningMudCrab', N'[DEMO CS-44] Lô thử camera/GPS', 3, 0.9,
            90, 10, 1000000, 2000000, 3000000, 100000,
            5, 1, 0, 10, 'InProduction', @now, CONVERT(DATE, DATEADD(DAY, 90, @now)), @now, @now);
        SET @batchId = SCOPE_IDENTITY();
    END;

    INSERT INTO dbo.physical_slot (operator_id, slot_code, status, created_at, updated_at)
    SELECT @operatorId, codes.slot_code, 'Available', @now, @now FROM @slots codes
    WHERE NOT EXISTS (SELECT 1 FROM dbo.physical_slot s WHERE s.operator_id = @operatorId AND s.slot_code = codes.slot_code);

    INSERT INTO dbo.slot_allocation (batch_id, slot_id, allocated_at, created_at)
    SELECT @batchId, s.slot_id, @now, @now FROM dbo.physical_slot s JOIN @slots codes ON codes.slot_code = s.slot_code
    WHERE s.operator_id = @operatorId AND NOT EXISTS (
        SELECT 1 FROM dbo.slot_allocation a WHERE a.slot_id = s.slot_id AND a.released_at IS NULL);

    UPDATE s SET status = 'Occupied', updated_at = @now FROM dbo.physical_slot s
    JOIN @slots codes ON codes.slot_code = s.slot_code WHERE s.operator_id = @operatorId AND s.status = 'Available';

    COMMIT TRANSACTION;
    SELECT b.batch_code, b.status AS batch_status, s.slot_code, s.status AS slot_status
    FROM dbo.slot_allocation a JOIN dbo.batch b ON b.batch_id = a.batch_id
    JOIN dbo.physical_slot s ON s.slot_id = a.slot_id JOIN @slots codes ON codes.slot_code = s.slot_code
    WHERE a.batch_id = @batchId AND a.released_at IS NULL ORDER BY s.slot_code;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
