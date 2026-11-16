/* V021 — BR v1.5 nhóm D (G3): nguồn hàng, kiểm đầu vào, con cua có mã nội bộ, sự kiện tồn, đợt lưu nuôi, xếp hộp.
   BR-017, 022–024, 098–111, 120–121, 127–128. Bảng crab_item/slot_event cũ giữ cho dữ liệu cũ; luồng mới dùng crab_unit. */

/* ---------- 1. Đơn mua nguồn, lô nguồn, phiếu nhận hàng (BR-098, BR-099) ---------- */
CREATE TABLE dbo.procurement_order (
    procurement_order_id         BIGINT IDENTITY(1,1) NOT NULL,
    po_no                        VARCHAR(20) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    supplier_party_id            BIGINT NOT NULL,
    ordered_on                   DATE NOT NULL,
    agreed_spec                  NVARCHAR(300) NOT NULL,
    quantity                     INT NOT NULL,
    unit_price                   DECIMAL(18,0) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_procurement_order_status DEFAULT ('Ordered'),
    created_by                   BIGINT NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_procurement_order_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_procurement_order_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_procurement_order PRIMARY KEY (procurement_order_id),
    CONSTRAINT ux_procurement_order_no UNIQUE (po_no),
    CONSTRAINT fk_procurement_order_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_procurement_order_supplier FOREIGN KEY (supplier_party_id) REFERENCES dbo.party (party_id),
    CONSTRAINT ck_procurement_order_quantity CHECK (quantity > 0),
    CONSTRAINT ck_procurement_order_price CHECK (unit_price >= 0),
    CONSTRAINT ck_procurement_order_status CHECK (status IN ('Ordered', 'PartiallyReceived', 'Received', 'Cancelled'))
);
GO
CREATE TABLE dbo.supply_lot (
    supply_lot_id                BIGINT IDENTITY(1,1) NOT NULL,
    lot_code                     VARCHAR(30) NOT NULL,
    procurement_order_id         BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    origin_region                NVARCHAR(150) NOT NULL,
    harvested_on                 DATE NOT NULL,
    declared_species             NVARCHAR(60) NOT NULL,
    declared_count               INT NOT NULL,
    declared_weight_kg           DECIMAL(12,3) NOT NULL,
    trace_status                 VARCHAR(20) NOT NULL CONSTRAINT df_supply_lot_trace_status DEFAULT ('Declared'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_supply_lot_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_supply_lot PRIMARY KEY (supply_lot_id),
    CONSTRAINT ux_supply_lot_code UNIQUE (lot_code),
    CONSTRAINT fk_supply_lot_po FOREIGN KEY (procurement_order_id) REFERENCES dbo.procurement_order (procurement_order_id),
    CONSTRAINT fk_supply_lot_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT ck_supply_lot_declared CHECK (declared_count > 0 AND declared_weight_kg > 0),
    CONSTRAINT ck_supply_lot_trace CHECK (trace_status IN ('Declared', 'Verified', 'Disputed'))
);
GO
CREATE TABLE dbo.goods_receipt (
    goods_receipt_id             BIGINT IDENTITY(1,1) NOT NULL,
    receipt_no                   VARCHAR(20) NOT NULL,
    supply_lot_id                BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    site_id                      BIGINT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL,
    received_by                  BIGINT NOT NULL,
    qc_user_id                   BIGINT NULL,
    accepted_count               INT NOT NULL CONSTRAINT df_goods_receipt_accepted DEFAULT (0),
    rejected_count               INT NOT NULL CONSTRAINT df_goods_receipt_rejected DEFAULT (0),
    accepted_weight_g            BIGINT NOT NULL CONSTRAINT df_goods_receipt_weight DEFAULT (0),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_goods_receipt_status DEFAULT ('Inspecting'),
    completed_at                 DATETIMEOFFSET(3) NULL,
    note                         NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_goods_receipt_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_goods_receipt PRIMARY KEY (goods_receipt_id),
    CONSTRAINT ux_goods_receipt_no UNIQUE (receipt_no),
    CONSTRAINT fk_goods_receipt_lot FOREIGN KEY (supply_lot_id) REFERENCES dbo.supply_lot (supply_lot_id),
    CONSTRAINT fk_goods_receipt_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_goods_receipt_site FOREIGN KEY (site_id) REFERENCES dbo.party_site (site_id),
    CONSTRAINT ck_goods_receipt_status CHECK (status IN ('Inspecting', 'Completed', 'Cancelled')),
    CONSTRAINT ck_goods_receipt_counts CHECK (accepted_count >= 0 AND rejected_count >= 0)
);
GO

/* ---------- 2. Con cua có mã nội bộ (BR-100) ---------- */
CREATE TABLE dbo.crab_unit (
    crab_unit_id                 BIGINT IDENTITY(1,1) NOT NULL,
    crab_code                    VARCHAR(12) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    supply_lot_id                BIGINT NOT NULL,
    goods_receipt_id             BIGINT NOT NULL,
    species                      NVARCHAR(60) NOT NULL,
    sex                          VARCHAR(10) NOT NULL,
    maturity                     VARCHAR(20) NOT NULL,
    received_weight_g            DECIMAL(7,1) NOT NULL,
    condition                    VARCHAR(20) NOT NULL CONSTRAINT df_crab_unit_condition DEFAULT ('Healthy'),
    inventory_status             VARCHAR(20) NOT NULL CONSTRAINT df_crab_unit_inventory_status DEFAULT ('Received'),
    replaces_crab_unit_id        BIGINT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_unit_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_crab_unit_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_crab_unit PRIMARY KEY (crab_unit_id),
    CONSTRAINT ux_crab_unit_code UNIQUE (crab_code),
    CONSTRAINT ak_crab_unit_batch UNIQUE (crab_unit_id, batch_id),
    CONSTRAINT fk_crab_unit_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_crab_unit_lot FOREIGN KEY (supply_lot_id) REFERENCES dbo.supply_lot (supply_lot_id),
    CONSTRAINT fk_crab_unit_receipt FOREIGN KEY (goods_receipt_id) REFERENCES dbo.goods_receipt (goods_receipt_id),
    -- Thả bù chỉ thay con cùng Lô (BR-128: không chuyển cua giữa các Lô).
    CONSTRAINT fk_crab_unit_replaces FOREIGN KEY (replaces_crab_unit_id, batch_id) REFERENCES dbo.crab_unit (crab_unit_id, batch_id),
    CONSTRAINT ck_crab_unit_sex CHECK (sex IN ('Male', 'Female')),
    CONSTRAINT ck_crab_unit_maturity CHECK (maturity IN ('Immature', 'Mature', 'Unknown')),
    CONSTRAINT ck_crab_unit_weight CHECK (received_weight_g > 0),
    CONSTRAINT ck_crab_unit_condition CHECK (condition IN ('Healthy', 'Weak', 'Molting', 'Dead')),
    CONSTRAINT ck_crab_unit_inventory CHECK (inventory_status IN ('Received', 'Holding', 'Graded', 'Allocated', 'Shipped',
        'Delivered', 'Sold', 'Dead', 'Destroyed', 'Returned')),
    CONSTRAINT ck_crab_unit_replaces CHECK (replaces_crab_unit_id IS NULL OR replaces_crab_unit_id <> crab_unit_id)
);
GO
CREATE INDEX ix_crab_unit_batch_status ON dbo.crab_unit (batch_id, inventory_status);
CREATE UNIQUE INDEX ux_crab_unit_replacement ON dbo.crab_unit (replaces_crab_unit_id) WHERE replaces_crab_unit_id IS NOT NULL;
GO

/* ---------- 3. Kiểm phẩm QC và phân công ngẫu nhiên (BR-017, BR-101, BR-154) ---------- */
CREATE TABLE dbo.qc_assignment (
    qc_assignment_id             BIGINT IDENTITY(1,1) NOT NULL,
    assignment_kind              VARCHAR(20) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    target_type                  VARCHAR(30) NOT NULL,
    target_id                    BIGINT NOT NULL,
    qc_user_id                   BIGINT NOT NULL,
    assigned_at                  DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_qc_assignment_status DEFAULT ('Assigned'),
    completed_at                 DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_qc_assignment PRIMARY KEY (qc_assignment_id),
    CONSTRAINT fk_qc_assignment_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_qc_assignment_user FOREIGN KEY (qc_user_id) REFERENCES dbo.app_user (user_id),
    CONSTRAINT ck_qc_assignment_kind CHECK (assignment_kind IN ('IncomingInspection', 'GradingSession', 'SecondReview', 'SiteVisit', 'Dispatch', 'Dispute')),
    CONSTRAINT ck_qc_assignment_status CHECK (status IN ('Assigned', 'Completed', 'Reassigned', 'Cancelled'))
);
GO
CREATE UNIQUE INDEX ux_qc_assignment_active ON dbo.qc_assignment (assignment_kind, target_type, target_id) WHERE status = 'Assigned';
CREATE INDEX ix_qc_assignment_user ON dbo.qc_assignment (qc_user_id, status);
GO
CREATE TABLE dbo.qc_inspection (
    qc_inspection_id             BIGINT IDENTITY(1,1) NOT NULL,
    inspection_no                VARCHAR(20) NOT NULL,
    inspection_kind              VARCHAR(20) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    goods_receipt_id             BIGINT NULL,
    crab_unit_id                 BIGINT NULL,
    inspector_id                 BIGINT NOT NULL,
    inspected_at                 DATETIMEOFFSET(3) NOT NULL,
    species                      NVARCHAR(60) NULL,
    sex                          VARCHAR(10) NULL,
    maturity                     VARCHAR(20) NULL,
    species_ok                   BIT NULL,
    alive                        BIT NULL,
    healthy                      BIT NULL,
    two_claws                    BIT NULL,
    food_safe                    BIT NULL,
    weight_g                     DECIMAL(7,1) NULL,
    sensory_result               NVARCHAR(300) NULL,
    conclusion                   VARCHAR(20) NOT NULL,
    reject_reason                NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_qc_inspection_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_qc_inspection PRIMARY KEY (qc_inspection_id),
    CONSTRAINT ux_qc_inspection_no UNIQUE (inspection_no),
    CONSTRAINT fk_qc_inspection_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_qc_inspection_receipt FOREIGN KEY (goods_receipt_id) REFERENCES dbo.goods_receipt (goods_receipt_id),
    CONSTRAINT fk_qc_inspection_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit (crab_unit_id),
    CONSTRAINT fk_qc_inspection_user FOREIGN KEY (inspector_id) REFERENCES dbo.app_user (user_id),
    CONSTRAINT ck_qc_inspection_kind CHECK (inspection_kind IN ('Incoming', 'Grading', 'Dispatch', 'Dispute')),
    CONSTRAINT ck_qc_inspection_conclusion CHECK (conclusion IN ('Accepted', 'Rejected', 'Hold')),
    CONSTRAINT ck_qc_inspection_reason CHECK (conclusion <> 'Rejected' OR reject_reason IS NOT NULL)
);
GO
CREATE TRIGGER dbo.tr_qc_inspection_append_only ON dbo.qc_inspection AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    THROW 51021, N'Phiếu kiểm phẩm không sửa, không xoá được.', 1;
END;
GO

/* ---------- 4. Sự kiện tồn (BR-102) ---------- */
CREATE TABLE dbo.inventory_event (
    inventory_event_id           BIGINT IDENTITY(1,1) NOT NULL,
    crab_unit_id                 BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    event_type                   VARCHAR(20) NOT NULL,
    occurred_at                  DATETIMEOFFSET(3) NOT NULL,
    quantity                     INT NOT NULL CONSTRAINT df_inventory_event_quantity DEFAULT (1),
    weight_g                     DECIMAL(7,1) NULL,
    reason                       NVARCHAR(300) NULL,
    source                       VARCHAR(20) NOT NULL,
    slot_id                      BIGINT NULL,
    site_id                      BIGINT NULL,
    evidence_id                  BIGINT NULL,
    actor_id                     BIGINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_inventory_event_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_inventory_event PRIMARY KEY (inventory_event_id),
    CONSTRAINT fk_inventory_event_crab FOREIGN KEY (crab_unit_id, batch_id) REFERENCES dbo.crab_unit (crab_unit_id, batch_id),
    CONSTRAINT fk_inventory_event_slot FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot (slot_id),
    CONSTRAINT fk_inventory_event_evidence FOREIGN KEY (evidence_id) REFERENCES dbo.evidence (evidence_id),
    CONSTRAINT ck_inventory_event_type CHECK (event_type IN ('Received', 'Boxed', 'Moved', 'AbnormalFeeding', 'Inspected', 'Died',
        'Molted', 'Graded', 'Downgraded', 'Allocated', 'Released', 'Shipped', 'Delivered', 'Sold', 'Destroyed', 'Returned')),
    CONSTRAINT ck_inventory_event_source CHECK (source IN ('App', 'Station', 'Device', 'System', 'Qc')),
    CONSTRAINT ck_inventory_event_quantity CHECK (quantity > 0)
);
GO
CREATE INDEX ix_inventory_event_crab ON dbo.inventory_event (crab_unit_id, occurred_at);
CREATE INDEX ix_inventory_event_batch ON dbo.inventory_event (batch_id, event_type, occurred_at);
GO
CREATE TRIGGER dbo.tr_inventory_event_append_only ON dbo.inventory_event AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    THROW 51022, N'Sự kiện tồn không sửa, không xoá được (BR-102).', 1;
END;
GO

/* ---------- 5. Đợt lưu nuôi và xếp hộp (BR-105, BR-106, BR-107) ---------- */
CREATE TABLE dbo.holding_operation (
    holding_id                   BIGINT IDENTITY(1,1) NOT NULL,
    holding_code                 VARCHAR(20) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    method                       NVARCHAR(100) NOT NULL,
    stocked_at                   DATETIMEOFFSET(3) NOT NULL,
    expected_end_date            DATE NOT NULL,
    actual_end_at                DATETIMEOFFSET(3) NULL,
    responsible_user_id          BIGINT NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_holding_operation_status DEFAULT ('Active'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_holding_operation_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_holding_operation PRIMARY KEY (holding_id),
    CONSTRAINT ux_holding_operation_code UNIQUE (holding_code),
    CONSTRAINT ux_holding_operation_batch UNIQUE (batch_id),
    CONSTRAINT fk_holding_operation_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT ck_holding_operation_status CHECK (status IN ('Active', 'Harvesting', 'Closed'))
);
GO
CREATE TABLE dbo.box_assignment (
    box_assignment_id            BIGINT IDENTITY(1,1) NOT NULL,
    crab_unit_id                 BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    slot_id                      BIGINT NOT NULL,
    assigned_at                  DATETIMEOFFSET(3) NOT NULL,
    left_at                      DATETIMEOFFSET(3) NULL,
    reason                       VARCHAR(20) NOT NULL,
    leave_reason                 VARCHAR(20) NULL,
    evidence_id                  BIGINT NULL,
    actor_id                     BIGINT NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_box_assignment_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_box_assignment PRIMARY KEY (box_assignment_id),
    CONSTRAINT fk_box_assignment_crab FOREIGN KEY (crab_unit_id, batch_id) REFERENCES dbo.crab_unit (crab_unit_id, batch_id),
    CONSTRAINT fk_box_assignment_slot FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot (slot_id),
    CONSTRAINT fk_box_assignment_evidence FOREIGN KEY (evidence_id) REFERENCES dbo.evidence (evidence_id),
    CONSTRAINT ck_box_assignment_reason CHECK (reason IN ('Stock', 'Restock', 'Move')),
    CONSTRAINT ck_box_assignment_leave CHECK (leave_reason IS NULL OR leave_reason IN ('Moved', 'Died', 'Harvested', 'Destroyed')),
    CONSTRAINT ck_box_assignment_window CHECK (left_at IS NULL OR left_at >= assigned_at)
);
GO
-- BR-024, BR-106, BR-128: một con không ở hai hộp cùng lúc; mỗi hộp tối đa một con còn sống.
CREATE UNIQUE INDEX ux_box_assignment_open_crab ON dbo.box_assignment (crab_unit_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX ux_box_assignment_open_slot ON dbo.box_assignment (slot_id) WHERE left_at IS NULL;
GO

/* ---------- 6. Nhật ký chăm sóc (BR-111) và bằng chứng gắn con cua mới ---------- */
ALTER TABLE dbo.production_log ADD
    health_observation           NVARCHAR(500) NULL,
    incident_note                NVARCHAR(500) NULL;
ALTER TABLE dbo.evidence ADD
    crab_unit_id                 BIGINT NULL CONSTRAINT fk_evidence_crab_unit FOREIGN KEY REFERENCES dbo.crab_unit (crab_unit_id),
    evidence_kind                VARCHAR(20) NULL CONSTRAINT ck_evidence_kind CHECK (evidence_kind IN ('Stocking', 'Mortality', 'Restock',
        'AlertCheck', 'CaptureResponse', 'Retake', 'SiteVisit', 'ScaleTicket', 'Document', 'Claim', 'Grading'));
GO
