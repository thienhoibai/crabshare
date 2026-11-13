/* V020 — BR v1.5 nhóm C (G2): đặt trước sỉ theo quy cách, theo số con hoặc theo kg, có hạng tối thiểu; giữ đơn chờ cọc;
   đơn cọc trong lúc gọi vốn; chia đợt giao. BR-084…097, BR-234.
   Dòng đơn mới nằm ở bảng sales_order_line (BR SalesOrderLine); bảng order_line cũ chỉ còn cho đơn bán lẻ cũ. */

ALTER TABLE dbo.sales_order ADD
    customer_party_id            BIGINT NULL CONSTRAINT fk_sales_order_customer_party FOREIGN KEY REFERENCES dbo.party (party_id),
    delivery_site_id             BIGINT NULL CONSTRAINT fk_sales_order_delivery_site FOREIGN KEY REFERENCES dbo.party_site (site_id),
    delivery_distance_km         DECIMAL(7,1) NULL,
    estimated_value              DECIMAL(18,0) NULL,
    deposit_rate_pct             DECIMAL(5,2) NULL,
    hold_expires_at              DATETIMEOFFSET(3) NULL,
    deposited_at                 DATETIMEOFFSET(3) NULL,
    confirmed_at                 DATETIMEOFFSET(3) NULL,
    cancel_requested_at          DATETIMEOFFSET(3) NULL,
    forfeited_at                 DATETIMEOFFSET(3) NULL,
    refunded_at                  DATETIMEOFFSET(3) NULL;
GO
ALTER TABLE dbo.sales_order DROP CONSTRAINT ck_sales_order_status;
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_status CHECK (status IN (
    'PendingPayment', 'DepositPaid', 'Paid', 'Packed', 'Shipping', 'Delivered', 'Completed', 'Cancelled', 'Returned',
    'PendingDeposit', 'Deposited', 'Confirmed', 'CancelRequested', 'Forfeited', 'Refunded', 'Delivering'));
ALTER TABLE dbo.sales_order DROP CONSTRAINT ck_sales_order_order_type;
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_order_type
    CHECK (order_type IN ('Retail', 'PreOrder', 'Offtake', 'InvoicedSale', 'FinalOrder'));
ALTER TABLE dbo.sales_order ADD CONSTRAINT ck_sales_order_deposit_rate CHECK (deposit_rate_pct IS NULL OR deposit_rate_pct BETWEEN 0 AND 100);
GO
CREATE INDEX ix_sales_order_batch_status ON dbo.sales_order (batch_id, order_type, status);
GO

CREATE TABLE dbo.sales_order_line (
    line_id                      BIGINT IDENTITY(1,1) NOT NULL,
    order_id                     BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    offer_id                     BIGINT NOT NULL,
    spec_id                      BIGINT NOT NULL,
    order_mode                   VARCHAR(10) NOT NULL,
    qty_crabs                    INT NULL,
    qty_kg                       DECIMAL(12,3) NULL,
    converted_crabs              INT NOT NULL,
    price_per_kg                 DECIMAL(18,0) NOT NULL,
    conversion_weight_g          INT NOT NULL,
    min_grade_code               VARCHAR(10) NULL,
    estimated_kg                 DECIMAL(12,3) NOT NULL,
    estimated_value              DECIMAL(18,0) NOT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sales_order_line_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_sales_order_line PRIMARY KEY (line_id),
    CONSTRAINT fk_sales_order_line_order FOREIGN KEY (order_id, batch_id) REFERENCES dbo.sales_order (order_id, batch_id),
    CONSTRAINT fk_sales_order_line_offer FOREIGN KEY (offer_id) REFERENCES dbo.offer (offer_id),
    CONSTRAINT fk_sales_order_line_spec FOREIGN KEY (spec_id) REFERENCES dbo.product_specification (spec_id),
    CONSTRAINT ux_sales_order_line_spec UNIQUE (order_id, spec_id),
    CONSTRAINT ck_sales_order_line_mode CHECK (
        (order_mode = 'ByCount' AND qty_crabs > 0 AND qty_kg IS NULL) OR
        (order_mode = 'ByKg' AND qty_kg > 0 AND qty_crabs IS NULL)),
    CONSTRAINT ck_sales_order_line_converted CHECK (converted_crabs > 0),
    CONSTRAINT ck_sales_order_line_price CHECK (price_per_kg > 0 AND conversion_weight_g > 0),
    CONSTRAINT ck_sales_order_line_grade CHECK (min_grade_code IS NULL OR min_grade_code IN ('SPECIAL', 'G1'))
);
GO

/* Đợt giao (BR-164, BR-234): đơn lớn chia đợt có số lượng và ngày đến hạn; mỗi đợt giao bằng một chuyến. */
CREATE TABLE dbo.delivery_tranche (
    tranche_id                   BIGINT IDENTITY(1,1) NOT NULL,
    order_id                     BIGINT NOT NULL,
    seq                          TINYINT NOT NULL,
    due_date                     DATE NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_delivery_tranche_status DEFAULT ('Planned'),
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_delivery_tranche_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_delivery_tranche_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_delivery_tranche PRIMARY KEY (tranche_id),
    CONSTRAINT fk_delivery_tranche_order FOREIGN KEY (order_id) REFERENCES dbo.sales_order (order_id),
    CONSTRAINT ux_delivery_tranche_seq UNIQUE (order_id, seq),
    CONSTRAINT ck_delivery_tranche_seq CHECK (seq > 0),
    CONSTRAINT ck_delivery_tranche_status CHECK (status IN ('Planned', 'Allocated', 'Dispatched', 'Accepted', 'Completed', 'Cancelled'))
);
GO
CREATE TABLE dbo.delivery_tranche_line (
    tranche_id                   BIGINT NOT NULL,
    line_id                      BIGINT NOT NULL,
    qty_crabs                    INT NULL,
    qty_kg                       DECIMAL(12,3) NULL,
    converted_crabs              INT NOT NULL,
    CONSTRAINT pk_delivery_tranche_line PRIMARY KEY (tranche_id, line_id),
    CONSTRAINT fk_delivery_tranche_line_tranche FOREIGN KEY (tranche_id) REFERENCES dbo.delivery_tranche (tranche_id),
    CONSTRAINT fk_delivery_tranche_line_line FOREIGN KEY (line_id) REFERENCES dbo.sales_order_line (line_id),
    CONSTRAINT ck_delivery_tranche_line_qty CHECK ((qty_crabs > 0 AND qty_kg IS NULL) OR (qty_kg > 0 AND qty_crabs IS NULL)),
    CONSTRAINT ck_delivery_tranche_line_converted CHECK (converted_crabs > 0)
);
GO
