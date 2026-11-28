-- V042: gộp sự kiện tồn, xếp hộp và phân bổ cho đơn vào một bảng dbo.inventory_record (76 bảng còn 74).
-- Trước: inventory_event, box_assignment, inventory_allocation.
-- Sau: cột record_type cho biết loại bản ghi (Event, BoxAssignment, Allocation). Sự kiện tồn giữ nguyên id và vẫn chỉ ghi thêm (BR-102).
CREATE TABLE dbo.inventory_record (
    inventory_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_inventory_record PRIMARY KEY,
    record_type VARCHAR(30) NOT NULL,
    legacy_id BIGINT NULL,
    crab_unit_id BIGINT NULL,
    batch_id BIGINT NULL,
    event_type VARCHAR(20) NULL,
    occurred_at DATETIMEOFFSET(3) NULL,
    quantity INT NULL,
    weight_g DECIMAL(7,1) NULL,
    reason NVARCHAR(300) NULL,
    source VARCHAR(20) NULL,
    slot_id BIGINT NULL,
    site_id BIGINT NULL,
    evidence_id BIGINT NULL,
    actor_id BIGINT NULL,
    created_at DATETIMEOFFSET(3) NULL,
    assigned_at DATETIMEOFFSET(3) NULL,
    left_at DATETIMEOFFSET(3) NULL,
    box_reason VARCHAR(20) NULL,
    leave_reason VARCHAR(20) NULL,
    order_id BIGINT NULL,
    line_id BIGINT NULL,
    tranche_id BIGINT NULL,
    grade_decision_id BIGINT NULL,
    crab_spec_id BIGINT NULL,
    is_substitution BIT NULL,
    status VARCHAR(20) NULL,
    allocated_at DATETIMEOFFSET(3) NULL,
    released_at DATETIMEOFFSET(3) NULL,
    release_reason NVARCHAR(300) NULL,
    CONSTRAINT ck_inventory_record_record_type CHECK (record_type IN ('Event', 'BoxAssignment', 'Allocation'))
);
GO
SET IDENTITY_INSERT dbo.inventory_record ON;
INSERT INTO dbo.inventory_record (inventory_record_id, record_type, legacy_id, crab_unit_id, batch_id, event_type, occurred_at, quantity, weight_g, reason, source, slot_id, site_id, evidence_id, actor_id, created_at)
SELECT s.[inventory_event_id], 'Event', s.[inventory_event_id], s.[crab_unit_id], s.[batch_id], s.[event_type], s.[occurred_at], s.[quantity], s.[weight_g], s.[reason], s.[source], s.[slot_id], s.[site_id], s.[evidence_id], s.[actor_id], s.[created_at] FROM dbo.inventory_event s ORDER BY s.[inventory_event_id];
SET IDENTITY_INSERT dbo.inventory_record OFF;
GO
INSERT INTO dbo.inventory_record (record_type, legacy_id, crab_unit_id, batch_id, slot_id, assigned_at, left_at, box_reason, leave_reason, evidence_id, actor_id, created_at)
SELECT 'BoxAssignment', s.[box_assignment_id], s.[crab_unit_id], s.[batch_id], s.[slot_id], s.[assigned_at], s.[left_at], s.[reason], s.[leave_reason], s.[evidence_id], s.[actor_id], s.[created_at] FROM dbo.box_assignment s ORDER BY s.[box_assignment_id];
GO
INSERT INTO dbo.inventory_record (record_type, legacy_id, crab_unit_id, batch_id, order_id, line_id, tranche_id, grade_decision_id, crab_spec_id, is_substitution, status, allocated_at, released_at, release_reason, actor_id, created_at)
SELECT 'Allocation', s.[allocation_id], s.[crab_unit_id], s.[batch_id], s.[order_id], s.[line_id], s.[tranche_id], s.[grade_decision_id], s.[crab_spec_id], s.[is_substitution], s.[status], s.[allocated_at], s.[released_at], s.[release_reason], s.[actor_id], s.[created_at] FROM dbo.inventory_allocation s ORDER BY s.[allocation_id];
GO
DROP TABLE dbo.inventory_event;
DROP TABLE dbo.box_assignment;
DROP TABLE dbo.inventory_allocation;
GO
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_record_event_required CHECK (record_type <> 'Event' OR (crab_unit_id IS NOT NULL AND batch_id IS NOT NULL AND event_type IS NOT NULL AND occurred_at IS NOT NULL AND quantity IS NOT NULL AND source IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_event_quantity CHECK (record_type <> 'Event' OR ([quantity]>(0)));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_event_source CHECK (record_type <> 'Event' OR ([source]='Qc' OR [source]='System' OR [source]='Device' OR [source]='Station' OR [source]='App'));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_event_type CHECK (record_type <> 'Event' OR ([event_type]='Returned' OR [event_type]='Destroyed' OR [event_type]='Sold' OR [event_type]='Delivered' OR [event_type]='Shipped' OR [event_type]='Released' OR [event_type]='Allocated' OR [event_type]='Downgraded' OR [event_type]='Graded' OR [event_type]='Molted' OR [event_type]='Died' OR [event_type]='Inspected' OR [event_type]='AbnormalFeeding' OR [event_type]='Moved' OR [event_type]='Boxed' OR [event_type]='Received'));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_record_boxassignment_required CHECK (record_type <> 'BoxAssignment' OR (crab_unit_id IS NOT NULL AND batch_id IS NOT NULL AND slot_id IS NOT NULL AND assigned_at IS NOT NULL AND box_reason IS NOT NULL AND actor_id IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_box_assignment_leave CHECK (record_type <> 'BoxAssignment' OR ([leave_reason] IS NULL OR ([leave_reason]='Destroyed' OR [leave_reason]='Harvested' OR [leave_reason]='Died' OR [leave_reason]='Moved')));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_box_assignment_reason CHECK (record_type <> 'BoxAssignment' OR ([box_reason]='Move' OR [box_reason]='Restock' OR [box_reason]='Stock'));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_box_assignment_window CHECK (record_type <> 'BoxAssignment' OR ([left_at] IS NULL OR [left_at]>=[assigned_at]));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_record_allocation_required CHECK (record_type <> 'Allocation' OR (crab_unit_id IS NOT NULL AND batch_id IS NOT NULL AND order_id IS NOT NULL AND grade_decision_id IS NOT NULL AND is_substitution IS NOT NULL AND status IS NOT NULL AND allocated_at IS NOT NULL AND created_at IS NOT NULL));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_allocation_line CHECK (record_type <> 'Allocation' OR ([line_id] IS NULL AND [tranche_id] IS NULL OR [line_id] IS NOT NULL AND [tranche_id] IS NOT NULL));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_allocation_released CHECK (record_type <> 'Allocation' OR (([status]='Returned' OR [status]='Released') AND [released_at] IS NOT NULL OR NOT ([status]='Returned' OR [status]='Released') AND [released_at] IS NULL));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT ck_inventory_allocation_status CHECK (record_type <> 'Allocation' OR ([status]='Returned' OR [status]='Released' OR [status]='Delivered' OR [status]='Shipped' OR [status]='Active'));
ALTER TABLE dbo.inventory_record ADD CONSTRAINT df_inventory_record_quantity DEFAULT ((1)) FOR quantity;
ALTER TABLE dbo.inventory_record ADD CONSTRAINT df_inventory_record_is_substitution DEFAULT ((0)) FOR is_substitution;
ALTER TABLE dbo.inventory_record ADD CONSTRAINT df_inventory_record_status DEFAULT ('Active') FOR status;
GO
CREATE INDEX ix_inventory_event_crab ON dbo.inventory_record (crab_unit_id, occurred_at) WHERE record_type = 'Event';
CREATE INDEX ix_inventory_event_batch ON dbo.inventory_record (batch_id, event_type, occurred_at) WHERE record_type = 'Event';
CREATE UNIQUE INDEX ux_box_assignment_open_crab ON dbo.inventory_record (crab_unit_id) WHERE record_type = 'BoxAssignment' AND [left_at] IS NULL;
CREATE UNIQUE INDEX ux_box_assignment_open_slot ON dbo.inventory_record (slot_id) WHERE record_type = 'BoxAssignment' AND [left_at] IS NULL;
CREATE UNIQUE INDEX ux_inventory_allocation_crab ON dbo.inventory_record (crab_unit_id) WHERE record_type = 'Allocation' AND [released_at] IS NULL;
CREATE INDEX ix_inventory_allocation_tranche ON dbo.inventory_record (tranche_id, line_id, status) WHERE record_type = 'Allocation';
CREATE INDEX ix_inventory_allocation_order ON dbo.inventory_record (order_id, status) WHERE record_type = 'Allocation';
GO
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_event_crab FOREIGN KEY (crab_unit_id, batch_id) REFERENCES dbo.crab_unit(crab_unit_id, batch_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_event_evidence FOREIGN KEY (evidence_id) REFERENCES dbo.evidence(evidence_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_event_slot FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot(slot_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_decision FOREIGN KEY (grade_decision_id) REFERENCES dbo.grade_decision(grade_decision_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_line FOREIGN KEY (line_id) REFERENCES dbo.sales_order_line(line_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_spec FOREIGN KEY (crab_spec_id) REFERENCES dbo.product_specification(spec_id);
ALTER TABLE dbo.inventory_record ADD CONSTRAINT fk_inventory_allocation_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_record(delivery_record_id);
GO
CREATE TRIGGER dbo.tr_inventory_event_append_only ON dbo.inventory_record AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE record_type = 'Event')
        THROW 51022, N'Sự kiện tồn không sửa, không xoá được (BR-102).', 1;
END;
GO
-- Cột legacy_id giữ id cũ của bản ghi trước khi gộp, để tra nhật ký kiểm toán ghi trước lần gộp này; bản ghi mới để trống.
GO
