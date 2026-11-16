-- UC08: author schedules before approval; immutable once Locked.
ALTER TABLE dbo.batch ADD rejection_reason NVARCHAR(300) NULL;
ALTER TABLE dbo.fee_tier ADD min_inclusive BIT NOT NULL CONSTRAINT df_fee_min_inclusive DEFAULT(1),
    max_inclusive BIT NOT NULL CONSTRAINT df_fee_max_inclusive DEFAULT(0);
GO
-- TL-15: 50m belongs to T2; exactly 200m still belongs to T2.
UPDATE dbo.fee_tier SET max_inclusive=1 WHERE tier_code='T2';
UPDATE dbo.fee_tier SET min_inclusive=0 WHERE tier_code='T3';
GO
CREATE TABLE dbo.standard_cost_tranche_plan (
    cost_version_id BIGINT NOT NULL,
    tranche_no TINYINT NOT NULL,
    planned_date DATE NOT NULL,
    unlock_condition NVARCHAR(300) NOT NULL,
    CONSTRAINT pk_standard_cost_tranche_plan PRIMARY KEY(cost_version_id,tranche_no),
    CONSTRAINT fk_cost_tranche_plan_version FOREIGN KEY(cost_version_id) REFERENCES dbo.standard_cost_version(cost_version_id),
    CONSTRAINT ck_cost_tranche_plan_no CHECK(tranche_no>0),
    CONSTRAINT ck_cost_tranche_plan_condition CHECK(LEN(LTRIM(RTRIM(unlock_condition)))>0)
);
GO
CREATE TRIGGER dbo.tr_cost_item_locked ON dbo.standard_cost_item AFTER INSERT,UPDATE,DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM dbo.standard_cost_version v WITH(UPDLOCK,HOLDLOCK)
        JOIN (SELECT cost_version_id FROM inserted UNION SELECT cost_version_id FROM deleted) affected
        ON affected.cost_version_id=v.cost_version_id WHERE v.status='Locked')
        THROW 51008,N'Chi phí đã khóa, không thể thay đổi khoản chi.',1;
END;
GO
CREATE TRIGGER dbo.tr_cost_plan_locked ON dbo.standard_cost_tranche_plan AFTER INSERT,UPDATE,DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM dbo.standard_cost_version v WITH(UPDLOCK,HOLDLOCK)
        JOIN (SELECT cost_version_id FROM inserted UNION SELECT cost_version_id FROM deleted) affected
        ON affected.cost_version_id=v.cost_version_id WHERE v.status='Locked')
        THROW 51008,N'Chi phí đã khóa, không thể thay đổi lịch giải ngân.',1;
END;
GO
CREATE TRIGGER dbo.tr_cost_version_locked ON dbo.standard_cost_version AFTER INSERT,UPDATE,DELETE AS
BEGIN
    SET NOCOUNT ON;
    -- Checking deleted prevents unlock, move, update, and delete, including multirow statements.
    IF EXISTS(SELECT 1 FROM deleted WHERE status='Locked')
        THROW 51008,N'Phiên bản chi phí đã khóa là bất biến.',1;
    -- Do not create/move/update another version to replace a batch's locked cost.
    IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.standard_cost_version v WITH(UPDLOCK,HOLDLOCK)
        ON v.batch_id=i.batch_id AND v.cost_version_id<>i.cost_version_id WHERE v.status='Locked')
        THROW 51008,N'Lô đã có chi phí khóa, không thể thay thế phiên bản.',1;
END;
GO
