-- V024 — BR v1.5 nhóm G6: phân bổ hàng, chuyến giao, nghiệm thu, hoá đơn, phần còn lại, khiếu nại, đánh giá,
-- đơn có hoá đơn, đơn hàng cuối, mã QR đơn, dòng doanh thu.
-- BR-160 (phân bổ, thay cua cùng size hạng cao hơn), BR-161, BR-162/163 (QR đơn), BR-164 (đợt giao, chuyến giao, cân lần 1),
-- BR-165 (cân lần 2, biên bản nghiệm thu), BR-166/167/168 (tiền hàng, phần còn lại), BR-169 (mất cọc, bán lại), BR-170/171 (hoá đơn),
-- BR-172/173/174 (khiếu nại), BR-175 (hoàn tất), BR-176 (đánh giá), BR-177/178 (đơn có hoá đơn), BR-179/180/181 (đơn hàng cuối),
-- BR-184/185 (dòng doanh thu), BR-234 (đợt giao).
-- Chỉ thêm bảng và cột; bảng đơn bán lẻ cũ giữ nguyên.

ALTER TABLE dbo.sales_order ADD
    -- Đơn có hoá đơn (BR-177): LowGrade (dưới chuẩn), ForfeitResale (bán lại do mất cọc), Surplus (phần dư sau quyết định tập thể).
    sale_reason          VARCHAR(20)   NULL,
    -- Bên mua của đơn có hoá đơn và đơn hàng cuối; customer_id của các đơn này là người lập đơn.
    buyer_party_id       BIGINT        NULL CONSTRAINT fk_sales_order_buyer_party FOREIGN KEY REFERENCES dbo.party(party_id),
    buyer_name           NVARCHAR(200) NULL,
    sale_kg              DECIMAL(12,3) NULL,
    sale_price_per_kg    DECIMAL(18,0) NULL,
    source_order_id      BIGINT        NULL CONSTRAINT fk_sales_order_source FOREIGN KEY REFERENCES dbo.sales_order(order_id),
    -- Mã QR đơn (BR-162): phát khi lập chuyến giao đầu tiên; ai có mã đều xem được trại và Lô (BR-163).
    trace_code           VARCHAR(20)   NULL;
GO
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_sale_reason
    CHECK (sale_reason IS NULL OR sale_reason IN ('LowGrade', 'ForfeitResale', 'Surplus'));
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_invoiced_reason
    CHECK (order_type <> 'InvoicedSale' OR sale_reason IS NOT NULL);
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_sale_amounts
    CHECK ((sale_kg IS NULL OR sale_kg > 0) AND (sale_price_per_kg IS NULL OR sale_price_per_kg > 0));
CREATE UNIQUE INDEX ux_sales_order_trace_code ON dbo.sales_order(trace_code) WHERE trace_code IS NOT NULL;
-- BR-181: mỗi Lô tối đa một đơn hàng cuối còn hiệu lực.
CREATE UNIQUE INDEX ux_sales_order_final_order ON dbo.sales_order(batch_id) WHERE order_type = 'FinalOrder' AND status <> 'Cancelled';
GO

ALTER TABLE dbo.payment_request ADD tranche_id BIGINT NULL
    CONSTRAINT fk_payment_request_tranche FOREIGN KEY REFERENCES dbo.delivery_tranche(tranche_id);
GO

CREATE TABLE dbo.inventory_allocation (
    allocation_id     BIGINT IDENTITY(1,1) NOT NULL,
    crab_unit_id      BIGINT        NOT NULL,
    batch_id          BIGINT        NOT NULL,
    order_id          BIGINT        NOT NULL,
    -- Dòng đơn và đợt giao của đơn đặt trước; đơn có hoá đơn và đơn hàng cuối không có dòng theo quy cách.
    line_id           BIGINT        NULL,
    tranche_id        BIGINT        NULL,
    grade_decision_id BIGINT        NOT NULL,
    crab_spec_id      BIGINT        NULL,
    -- BR-160: thiếu cua đúng quy cách thì giao cua cùng size, hạng cao hơn, với giá của dòng đơn.
    is_substitution   BIT           NOT NULL CONSTRAINT df_inventory_allocation_substitution DEFAULT (0),
    -- Active (đã phân bổ), Shipped (đã xuất), Delivered (khách đã nhận), Released (nhả), Returned (khách trả lại).
    status            VARCHAR(20)   NOT NULL CONSTRAINT df_inventory_allocation_status DEFAULT ('Active'),
    allocated_at      DATETIMEOFFSET(3) NOT NULL,
    released_at       DATETIMEOFFSET(3) NULL,
    release_reason    NVARCHAR(300) NULL,
    actor_id          BIGINT        NULL,
    created_at        DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_inventory_allocation PRIMARY KEY (allocation_id),
    CONSTRAINT fk_inventory_allocation_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit(crab_unit_id),
    CONSTRAINT fk_inventory_allocation_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_inventory_allocation_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT fk_inventory_allocation_line FOREIGN KEY (line_id) REFERENCES dbo.sales_order_line(line_id),
    CONSTRAINT fk_inventory_allocation_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_tranche(tranche_id),
    CONSTRAINT fk_inventory_allocation_decision FOREIGN KEY (grade_decision_id) REFERENCES dbo.grade_decision(grade_decision_id),
    CONSTRAINT fk_inventory_allocation_spec FOREIGN KEY (crab_spec_id) REFERENCES dbo.product_specification(spec_id),
    CONSTRAINT ck_inventory_allocation_status CHECK (status IN ('Active', 'Shipped', 'Delivered', 'Released', 'Returned')),
    CONSTRAINT ck_inventory_allocation_released CHECK ((status IN ('Released', 'Returned') AND released_at IS NOT NULL)
                                                   OR (status NOT IN ('Released', 'Returned') AND released_at IS NULL)),
    CONSTRAINT ck_inventory_allocation_line CHECK ((line_id IS NULL AND tranche_id IS NULL) OR (line_id IS NOT NULL AND tranche_id IS NOT NULL))
);
-- BR-160: mỗi con có tối đa một phân bổ còn hiệu lực.
CREATE UNIQUE INDEX ux_inventory_allocation_crab ON dbo.inventory_allocation(crab_unit_id) WHERE released_at IS NULL;
CREATE INDEX ix_inventory_allocation_tranche ON dbo.inventory_allocation(tranche_id, line_id, status);
CREATE INDEX ix_inventory_allocation_order ON dbo.inventory_allocation(order_id, status);
GO

CREATE TABLE dbo.shipment (
    shipment_id            BIGINT IDENTITY(1,1) NOT NULL,
    shipment_no            VARCHAR(20)   NOT NULL,
    order_id               BIGINT        NOT NULL,
    tranche_id             BIGINT        NOT NULL,
    batch_id               BIGINT        NOT NULL,
    scheduled_at           DATETIMEOFFSET(3) NOT NULL,
    dispatched_at          DATETIMEOFFSET(3) NULL,
    delivered_at           DATETIMEOFFSET(3) NULL,
    return_window_ends_at  DATETIMEOFFSET(3) NULL,
    transport_condition    NVARCHAR(300) NULL,
    -- Scheduled, Dispatched, Accepted (đã nghiệm thu), Refused (khách từ chối nhận), Cancelled.
    status                 VARCHAR(20)   NOT NULL CONSTRAINT df_shipment_status DEFAULT ('Scheduled'),
    created_by             BIGINT        NOT NULL,
    created_at             DATETIMEOFFSET(3) NOT NULL,
    updated_at             DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_shipment PRIMARY KEY (shipment_id),
    CONSTRAINT ux_shipment_no UNIQUE (shipment_no),
    CONSTRAINT fk_shipment_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT fk_shipment_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_tranche(tranche_id),
    CONSTRAINT fk_shipment_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_shipment_creator FOREIGN KEY (created_by) REFERENCES dbo.app_user(user_id),
    CONSTRAINT ck_shipment_status CHECK (status IN ('Scheduled', 'Dispatched', 'Accepted', 'Refused', 'Cancelled'))
);
-- BR-164: mỗi đợt giao một lần bằng một chuyến giao.
CREATE UNIQUE INDEX ux_shipment_tranche ON dbo.shipment(tranche_id) WHERE status <> 'Cancelled';
GO

CREATE TABLE dbo.shipment_line (
    shipment_line_id  BIGINT IDENTITY(1,1) NOT NULL,
    shipment_id       BIGINT        NOT NULL,
    line_id           BIGINT        NOT NULL,
    dispatched_crabs  INT           NULL,
    dispatched_kg     DECIMAL(12,3) NULL,
    received_crabs    INT           NULL,
    received_kg       DECIMAL(12,3) NULL,
    accepted_crabs    INT           NULL,
    accepted_kg       DECIMAL(12,3) NULL,
    rejected_crabs    INT           NULL,
    price_per_kg      DECIMAL(18,0) NOT NULL,
    goods_value       DECIMAL(18,0) NULL,
    CONSTRAINT pk_shipment_line PRIMARY KEY (shipment_line_id),
    CONSTRAINT fk_shipment_line_shipment FOREIGN KEY (shipment_id) REFERENCES dbo.shipment(shipment_id),
    CONSTRAINT fk_shipment_line_line FOREIGN KEY (line_id) REFERENCES dbo.sales_order_line(line_id),
    CONSTRAINT ux_shipment_line UNIQUE (shipment_id, line_id),
    CONSTRAINT ck_shipment_line_counts CHECK ((dispatched_crabs IS NULL OR dispatched_crabs >= 0) AND (received_crabs IS NULL OR received_crabs >= 0)
        AND (accepted_crabs IS NULL OR accepted_crabs >= 0) AND (rejected_crabs IS NULL OR rejected_crabs >= 0)),
    CONSTRAINT ck_shipment_line_kg CHECK ((dispatched_kg IS NULL OR dispatched_kg >= 0) AND (received_kg IS NULL OR received_kg >= 0)
        AND (accepted_kg IS NULL OR accepted_kg >= 0)),
    CONSTRAINT ck_shipment_line_accept CHECK (accepted_kg IS NULL OR received_kg IS NULL OR accepted_kg <= received_kg)
);
GO

CREATE TABLE dbo.delivery_acceptance (
    acceptance_id          BIGINT IDENTITY(1,1) NOT NULL,
    shipment_id            BIGINT        NOT NULL,
    order_id               BIGINT        NOT NULL,
    tranche_id             BIGINT        NOT NULL,
    accepted_crabs         INT           NOT NULL,
    accepted_kg            DECIMAL(12,3) NOT NULL,
    rejected_crabs         INT           NOT NULL,
    discrepancy_reason     NVARCHAR(300) NULL,
    -- Pending (người nuôi đã ghi cân lần hai), Confirmed (khách xác nhận), Refused (khách từ chối nhận).
    status                 VARCHAR(20)   NOT NULL CONSTRAINT df_delivery_acceptance_status DEFAULT ('Pending'),
    operator_recorded_by   BIGINT        NOT NULL,
    operator_recorded_at   DATETIMEOFFSET(3) NOT NULL,
    customer_confirmed_by  BIGINT        NULL,
    customer_confirmed_at  DATETIMEOFFSET(3) NULL,
    goods_value            DECIMAL(18,0) NULL,
    deposit_applied        DECIMAL(18,0) NULL,
    balance_due            DECIMAL(18,0) NULL,
    balance_due_at         DATETIMEOFFSET(3) NULL,
    balance_paid_at        DATETIMEOFFSET(3) NULL,
    created_at             DATETIMEOFFSET(3) NOT NULL,
    updated_at             DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_delivery_acceptance PRIMARY KEY (acceptance_id),
    CONSTRAINT ux_delivery_acceptance_shipment UNIQUE (shipment_id),
    CONSTRAINT fk_delivery_acceptance_shipment FOREIGN KEY (shipment_id) REFERENCES dbo.shipment(shipment_id),
    CONSTRAINT fk_delivery_acceptance_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT fk_delivery_acceptance_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_tranche(tranche_id),
    CONSTRAINT ck_delivery_acceptance_status CHECK (status IN ('Pending', 'Confirmed', 'Refused')),
    CONSTRAINT ck_delivery_acceptance_counts CHECK (accepted_crabs >= 0 AND rejected_crabs >= 0 AND accepted_kg >= 0),
    CONSTRAINT ck_delivery_acceptance_money CHECK ((goods_value IS NULL OR goods_value >= 0) AND (deposit_applied IS NULL OR deposit_applied >= 0)
        AND (balance_due IS NULL OR balance_due >= 0)),
    CONSTRAINT ck_delivery_acceptance_confirmed CHECK (status <> 'Confirmed' OR (customer_confirmed_at IS NOT NULL AND goods_value IS NOT NULL))
);
GO

CREATE TABLE dbo.invoice (
    invoice_id        BIGINT IDENTITY(1,1) NOT NULL,
    invoice_no        VARCHAR(20)   NOT NULL,
    order_id          BIGINT        NOT NULL,
    tranche_id        BIGINT        NULL,
    batch_id          BIGINT        NOT NULL,
    -- BR-170: bên bán pháp lý theo chế độ lô (đơn vị thực hiện của Lô).
    seller_party_id   BIGINT        NOT NULL,
    buyer_party_id    BIGINT        NULL,
    buyer_name        NVARCHAR(200) NOT NULL,
    amount            DECIMAL(18,0) NOT NULL,
    status            VARCHAR(20)   NOT NULL CONSTRAINT df_invoice_status DEFAULT ('Active'),
    issued_at         DATETIMEOFFSET(3) NOT NULL,
    cancelled_at      DATETIMEOFFSET(3) NULL,
    cancel_reason     NVARCHAR(300) NULL,
    CONSTRAINT pk_invoice PRIMARY KEY (invoice_id),
    CONSTRAINT ux_invoice_no UNIQUE (invoice_no),
    CONSTRAINT fk_invoice_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT fk_invoice_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_tranche(tranche_id),
    CONSTRAINT fk_invoice_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_invoice_seller FOREIGN KEY (seller_party_id) REFERENCES dbo.party(party_id),
    CONSTRAINT fk_invoice_buyer FOREIGN KEY (buyer_party_id) REFERENCES dbo.party(party_id),
    CONSTRAINT ck_invoice_status CHECK (status IN ('Active', 'Cancelled')),
    CONSTRAINT ck_invoice_amount CHECK (amount >= 0),
    CONSTRAINT ck_invoice_cancelled CHECK (status <> 'Cancelled' OR cancelled_at IS NOT NULL)
);
-- BR-170: mỗi đơn (mỗi đợt giao của đơn đặt trước) đúng một hoá đơn đang hiệu lực.
CREATE UNIQUE INDEX ux_invoice_active ON dbo.invoice(order_id, tranche_id) WHERE status = 'Active';
GO

CREATE TABLE dbo.claim (
    claim_id               BIGINT IDENTITY(1,1) NOT NULL,
    claim_no               VARCHAR(20)   NOT NULL,
    order_id               BIGINT        NOT NULL,
    shipment_id            BIGINT        NOT NULL,
    line_id                BIGINT        NOT NULL,
    claim_type             VARCHAR(20)   NOT NULL,
    issue_type             VARCHAR(20)   NOT NULL,
    affected_crabs         INT           NULL,
    affected_kg            DECIMAL(12,3) NULL,
    description            NVARCHAR(1000) NOT NULL,
    photo_uri              NVARCHAR(500) NOT NULL,
    photo_sha256           VARCHAR(64)   NOT NULL,
    -- Open → OperatorAccepted | OperatorRejected → Accepted | Rejected; quá hạn hoặc khách không đồng ý → Escalated → Admin quyết.
    status                 VARCHAR(20)   NOT NULL CONSTRAINT df_claim_status DEFAULT ('Open'),
    response_due_at        DATETIMEOFFSET(3) NOT NULL,
    operator_response      NVARCHAR(500) NULL,
    operator_responded_by  BIGINT        NULL,
    operator_responded_at  DATETIMEOFFSET(3) NULL,
    customer_agreed        BIT           NULL,
    admin_decision         NVARCHAR(500) NULL,
    decided_by             BIGINT        NULL,
    decided_at             DATETIMEOFFSET(3) NULL,
    refund_kg              DECIMAL(12,3) NULL,
    refund_amount          DECIMAL(18,0) NULL,
    refund_instruction_id  BIGINT        NULL,
    created_by             BIGINT        NOT NULL,
    created_at             DATETIMEOFFSET(3) NOT NULL,
    updated_at             DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_claim PRIMARY KEY (claim_id),
    CONSTRAINT ux_claim_no UNIQUE (claim_no),
    CONSTRAINT fk_claim_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT fk_claim_shipment FOREIGN KEY (shipment_id) REFERENCES dbo.shipment(shipment_id),
    CONSTRAINT fk_claim_line FOREIGN KEY (line_id) REFERENCES dbo.sales_order_line(line_id),
    CONSTRAINT fk_claim_refund FOREIGN KEY (refund_instruction_id) REFERENCES dbo.payment_instruction(instruction_id),
    CONSTRAINT ck_claim_type CHECK (claim_type IN ('Return', 'Complaint')),
    CONSTRAINT ck_claim_issue CHECK (issue_type IN ('Dead', 'Weak', 'WrongSize', 'WrongWeight', 'Late', 'FoodSafety')),
    CONSTRAINT ck_claim_status CHECK (status IN ('Open', 'OperatorAccepted', 'OperatorRejected', 'Escalated', 'Accepted', 'Rejected')),
    CONSTRAINT ck_claim_affected CHECK ((affected_crabs IS NOT NULL AND affected_crabs > 0) OR (affected_kg IS NOT NULL AND affected_kg > 0)),
    CONSTRAINT ck_claim_refund CHECK (refund_amount IS NULL OR refund_amount >= 0)
);
-- BR-172: trong hạn đổi trả, mỗi chuyến giao một khiếu nại.
CREATE UNIQUE INDEX ux_claim_shipment ON dbo.claim(shipment_id);
CREATE INDEX ix_claim_status ON dbo.claim(status, response_due_at);
GO

CREATE TABLE dbo.order_rating (
    order_id     BIGINT        NOT NULL,
    stars        TINYINT       NOT NULL,
    comment      NVARCHAR(1000) NULL,
    created_by   BIGINT        NOT NULL,
    created_at   DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_order_rating PRIMARY KEY (order_id),
    CONSTRAINT fk_order_rating_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT ck_order_rating_stars CHECK (stars BETWEEN 1 AND 5)
);
GO

CREATE TABLE dbo.revenue_line (
    revenue_line_id  BIGINT IDENTITY(1,1) NOT NULL,
    batch_id         BIGINT        NOT NULL,
    -- BR-185: bốn loại dòng doanh thu.
    source_type      VARCHAR(20)   NOT NULL,
    order_id         BIGINT        NOT NULL,
    amount           DECIMAL(18,0) NOT NULL,
    recognized_at    DATETIMEOFFSET(3) NOT NULL,
    note             NVARCHAR(300) NULL,
    CONSTRAINT pk_revenue_line PRIMARY KEY (revenue_line_id),
    CONSTRAINT fk_revenue_line_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch(batch_id),
    CONSTRAINT fk_revenue_line_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order(order_id),
    CONSTRAINT ck_revenue_line_source CHECK (source_type IN ('PreOrderDelivered', 'InvoicedSale', 'ForfeitedDeposit', 'FinalOrder')),
    CONSTRAINT ck_revenue_line_amount CHECK (amount >= 0),
    -- BR-185: mỗi khoản (mỗi đơn, mỗi khoản cọc bị mất) tính đúng một lần.
    CONSTRAINT ux_revenue_line_source UNIQUE (source_type, order_id)
);
CREATE INDEX ix_revenue_line_batch ON dbo.revenue_line(batch_id);
GO
-- Dòng doanh thu là căn cứ quyết toán: chỉ ghi thêm.
CREATE TRIGGER dbo.tr_revenue_line_append_only ON dbo.revenue_line
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50240, N'Dòng doanh thu đã ghi không được sửa hoặc xoá.', 1;
END;
GO
