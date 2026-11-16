/* V022 — BR v1.5 nhóm E (G4): thiết bị IoT, API nhận dữ liệu, ảnh thiết bị, chỉ số nước, hiệu chuẩn, lệnh cho camera chạy dàn,
   lượt đo của trạm đo. BR-112…119, 151, 223…231. Theo đặc tả bản tin mục 11 của Hướng dẫn dựng trạm đo và camera chạy dàn. */

/* ---------- 1. Thiết bị (BR-116, BR-230) ---------- */
CREATE TABLE dbo.device (
    device_id                    BIGINT IDENTITY(1,1) NOT NULL,
    device_code                  VARCHAR(40) NOT NULL,
    device_type                  VARCHAR(20) NOT NULL,
    operator_id                  BIGINT NOT NULL,
    scope_type                   VARCHAR(20) NOT NULL,
    scope_slot_id                BIGINT NULL,
    scope_rack_code              VARCHAR(20) NULL,
    scope_holding_id             BIGINT NULL,
    scope_site_id                BIGINT NULL,
    key_hash                     CHAR(64) NOT NULL,
    key_prefix                   VARCHAR(8) NOT NULL,
    source                       VARCHAR(20) NOT NULL CONSTRAINT df_device_source DEFAULT ('Real'),
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_device_status DEFAULT ('Active'),
    firmware_version             VARCHAR(30) NULL,
    last_seen_at                 DATETIMEOFFSET(3) NULL,
    last_calibrated_at           DATETIMEOFFSET(3) NULL,
    calibration_period_days      SMALLINT NOT NULL CONSTRAINT df_device_calibration_period DEFAULT (30),
    queue_length                 INT NULL,
    camera_height_mm             INT NULL,
    registered_by                BIGINT NOT NULL,
    removed_at                   DATETIMEOFFSET(3) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_device_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_device_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_device PRIMARY KEY (device_id),
    CONSTRAINT ux_device_code UNIQUE (device_code),
    CONSTRAINT fk_device_operator FOREIGN KEY (operator_id) REFERENCES dbo.operator (operator_id),
    CONSTRAINT fk_device_slot FOREIGN KEY (scope_slot_id) REFERENCES dbo.physical_slot (slot_id),
    CONSTRAINT fk_device_holding FOREIGN KEY (scope_holding_id) REFERENCES dbo.holding_operation (holding_id),
    CONSTRAINT fk_device_site FOREIGN KEY (scope_site_id) REFERENCES dbo.party_site (site_id),
    CONSTRAINT ck_device_type CHECK (device_type IN ('Camera', 'RailCamera', 'WaterSensor', 'Station')),
    CONSTRAINT ck_device_scope CHECK (
        (device_type = 'Camera' AND scope_type = 'Box' AND scope_slot_id IS NOT NULL) OR
        (device_type = 'RailCamera' AND scope_type = 'Rack' AND scope_rack_code IS NOT NULL) OR
        (device_type = 'WaterSensor' AND scope_type = 'Holding' AND scope_holding_id IS NOT NULL) OR
        (device_type = 'Station' AND scope_type = 'QcStation' AND scope_site_id IS NOT NULL)),
    CONSTRAINT ck_device_source CHECK (source IN ('Real', 'Simulated')),
    CONSTRAINT ck_device_status CHECK (status IN ('Active', 'Offline', 'Removed')),
    CONSTRAINT ck_device_calibration_period CHECK (calibration_period_days > 0)
);
GO
-- Một hộp chỉ có một camera cố định đang dùng.
CREATE UNIQUE INDEX ux_device_camera_box ON dbo.device (scope_slot_id) WHERE device_type = 'Camera' AND status <> 'Removed';
GO

/* ---------- 2. Bản tin thiết bị: mỗi mã bản tin chỉ ghi một lần (BR-113, BR-230) ---------- */
CREATE TABLE dbo.device_message (
    device_message_id            BIGINT IDENTITY(1,1) NOT NULL,
    message_id                   UNIQUEIDENTIFIER NOT NULL,
    device_id                    BIGINT NULL,
    device_code                  VARCHAR(40) NOT NULL,
    kind                         VARCHAR(20) NOT NULL,
    captured_at                  DATETIMEOFFSET(3) NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL,
    reject_reason                NVARCHAR(300) NULL,
    payload_sha256               CHAR(64) NULL,
    CONSTRAINT pk_device_message PRIMARY KEY (device_message_id),
    CONSTRAINT fk_device_message_device FOREIGN KEY (device_id) REFERENCES dbo.device (device_id),
    CONSTRAINT ck_device_message_kind CHECK (kind IN ('Heartbeat', 'Measurement', 'BoxImage', 'WaterReading', 'Calibration', 'CommandAck', 'RunSummary')),
    CONSTRAINT ck_device_message_status CHECK (status IN ('Accepted', 'Rejected'))
);
GO
CREATE UNIQUE INDEX ux_device_message_accepted ON dbo.device_message (message_id) WHERE status = 'Accepted';
CREATE INDEX ix_device_message_device ON dbo.device_message (device_id, received_at);
GO

/* ---------- 3. Ảnh thiết bị (BR-114, BR-117, BR-119) ---------- */
CREATE TABLE dbo.device_image (
    device_image_id              BIGINT IDENTITY(1,1) NOT NULL,
    device_id                    BIGINT NOT NULL,
    batch_id                     BIGINT NULL,
    slot_id                      BIGINT NOT NULL,
    crab_unit_id                 BIGINT NULL,
    message_id                   UNIQUEIDENTIFIER NOT NULL,
    captured_at                  DATETIMEOFFSET(3) NOT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL,
    file_uri                     NVARCHAR(500) NOT NULL,
    sha256                       CHAR(64) NOT NULL,
    run_id                       VARCHAR(60) NULL,
    tof_mm                       INT NULL,
    illumination                 VARCHAR(20) NULL,
    crab_detected                BIT NULL,
    detection_confidence         DECIMAL(5,4) NULL,
    detection_model              VARCHAR(50) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_device_image_created_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_device_image PRIMARY KEY (device_image_id),
    CONSTRAINT fk_device_image_device FOREIGN KEY (device_id) REFERENCES dbo.device (device_id),
    CONSTRAINT fk_device_image_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_device_image_slot FOREIGN KEY (slot_id) REFERENCES dbo.physical_slot (slot_id),
    CONSTRAINT fk_device_image_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit (crab_unit_id),
    CONSTRAINT ux_device_image_message UNIQUE (message_id)
);
GO
CREATE INDEX ix_device_image_slot ON dbo.device_image (slot_id, captured_at);
CREATE INDEX ix_device_image_batch ON dbo.device_image (batch_id, captured_at);
GO

/* ---------- 4. Chỉ số nước (BR-115, BR-229) ---------- */
CREATE TABLE dbo.water_reading (
    water_reading_id             BIGINT IDENTITY(1,1) NOT NULL,
    device_id                    BIGINT NOT NULL,
    holding_id                   BIGINT NOT NULL,
    batch_id                     BIGINT NOT NULL,
    message_id                   UNIQUEIDENTIFIER NOT NULL,
    measured_at                  DATETIMEOFFSET(3) NOT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL,
    temperature_c                DECIMAL(5,2) NULL,
    salinity_ppt                 DECIMAL(5,2) NULL,
    ph                           DECIMAL(4,2) NULL,
    device_quality_flag          VARCHAR(20) NULL,
    quality                      VARCHAR(20) NOT NULL,
    CONSTRAINT pk_water_reading PRIMARY KEY (water_reading_id),
    CONSTRAINT fk_water_reading_device FOREIGN KEY (device_id) REFERENCES dbo.device (device_id),
    CONSTRAINT fk_water_reading_holding FOREIGN KEY (holding_id) REFERENCES dbo.holding_operation (holding_id),
    CONSTRAINT fk_water_reading_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT ux_water_reading_message UNIQUE (message_id),
    CONSTRAINT ck_water_reading_quality CHECK (quality IN ('Calibrated', 'Uncalibrated', 'Suspect')),
    CONSTRAINT ck_water_reading_values CHECK ((temperature_c IS NULL OR temperature_c BETWEEN -5 AND 60) AND (ph IS NULL OR ph BETWEEN 0 AND 14)
        AND (salinity_ppt IS NULL OR salinity_ppt BETWEEN 0 AND 80))
);
GO
CREATE INDEX ix_water_reading_batch ON dbo.water_reading (batch_id, measured_at);
GO

/* ---------- 5. Hiệu chuẩn (BR-225) ---------- */
CREATE TABLE dbo.device_calibration (
    device_calibration_id        BIGINT IDENTITY(1,1) NOT NULL,
    device_id                    BIGINT NOT NULL,
    message_id                   UNIQUEIDENTIFIER NULL,
    kind                         VARCHAR(20) NOT NULL,
    performed_at                 DATETIMEOFFSET(3) NOT NULL,
    details_json                 NVARCHAR(2000) NULL,
    error_g                      DECIMAL(7,3) NULL,
    passed                       BIT NULL,
    recorded_by                  BIGINT NULL,
    received_at                  DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_device_calibration PRIMARY KEY (device_calibration_id),
    CONSTRAINT fk_device_calibration_device FOREIGN KEY (device_id) REFERENCES dbo.device (device_id),
    CONSTRAINT ck_device_calibration_kind CHECK (kind IN ('scale', 'camera', 'tof', 'ph', 'ec', 'position'))
);
GO

/* ---------- 6. Lệnh cho camera chạy dàn ---------- */
CREATE TABLE dbo.device_command (
    device_command_id            BIGINT IDENTITY(1,1) NOT NULL,
    device_id                    BIGINT NOT NULL,
    command_type                 VARCHAR(20) NOT NULL,
    box_code                     VARCHAR(30) NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_device_command_status DEFAULT ('Pending'),
    reason                       NVARCHAR(300) NULL,
    created_by                   BIGINT NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_device_command_created_at DEFAULT (SYSDATETIMEOFFSET()),
    acked_at                     DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_device_command PRIMARY KEY (device_command_id),
    CONSTRAINT fk_device_command_device FOREIGN KEY (device_id) REFERENCES dbo.device (device_id),
    CONSTRAINT ck_device_command_type CHECK (command_type IN ('ScanRack', 'ScanBox', 'Park', 'Calibrate')),
    CONSTRAINT ck_device_command_status CHECK (status IN ('Pending', 'Acked', 'Cancelled')),
    CONSTRAINT ck_device_command_box CHECK (command_type <> 'ScanBox' OR box_code IS NOT NULL)
);
GO

/* ---------- 7. Lượt đo của trạm đo (BR-151, BR-224) ---------- */
CREATE TABLE dbo.measurement_session (
    measurement_session_id       BIGINT IDENTITY(1,1) NOT NULL,
    session_no                   VARCHAR(20) NOT NULL,
    batch_id                     BIGINT NOT NULL,
    crab_unit_id                 BIGINT NOT NULL,
    station_device_id            BIGINT NULL,
    measure_procedure            VARCHAR(20) NOT NULL CONSTRAINT df_measurement_session_procedure DEFAULT ('Station'),
    opened_by                    BIGINT NOT NULL,
    opened_at                    DATETIMEOFFSET(3) NOT NULL,
    status                       VARCHAR(20) NOT NULL CONSTRAINT df_measurement_session_status DEFAULT ('Open'),
    message_id                   UNIQUEIDENTIFIER NULL,
    captured_at                  DATETIMEOFFSET(3) NULL,
    received_at                  DATETIMEOFFSET(3) NULL,
    firmware_version             VARCHAR(30) NULL,
    weight_g                     DECIMAL(7,1) NULL,
    weight_samples               SMALLINT NULL,
    weight_range_g               DECIMAL(6,3) NULL,
    tof_mm                       INT NULL,
    camera_height_mm             INT NULL,
    door_closed                  BIT NULL,
    scale_calibrated_at          DATETIMEOFFSET(3) NULL,
    scale_calibration_ok         BIT NULL,
    white_image_uri              NVARCHAR(500) NULL,
    white_sha256                 CHAR(64) NULL,
    red_image_uri                NVARCHAR(500) NULL,
    red_sha256                   CHAR(64) NULL,
    presets_json                 NVARCHAR(1000) NULL,
    fail_reason                  NVARCHAR(300) NULL,
    created_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_measurement_session_created_at DEFAULT (SYSDATETIMEOFFSET()),
    updated_at                   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_measurement_session_updated_at DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT pk_measurement_session PRIMARY KEY (measurement_session_id),
    CONSTRAINT ux_measurement_session_no UNIQUE (session_no),
    CONSTRAINT fk_measurement_session_batch FOREIGN KEY (batch_id) REFERENCES dbo.batch (batch_id),
    CONSTRAINT fk_measurement_session_crab FOREIGN KEY (crab_unit_id) REFERENCES dbo.crab_unit (crab_unit_id),
    CONSTRAINT fk_measurement_session_device FOREIGN KEY (station_device_id) REFERENCES dbo.device (device_id),
    CONSTRAINT ck_measurement_session_procedure CHECK (measure_procedure IN ('Station', 'Manual')),
    CONSTRAINT ck_measurement_session_status CHECK (status IN ('Open', 'Received', 'Measured', 'Failed', 'Cancelled')),
    CONSTRAINT ck_measurement_session_station CHECK (measure_procedure <> 'Station' OR station_device_id IS NOT NULL)
);
GO
-- BR-224: mỗi trạm chỉ có một lượt đo đang mở; mỗi lượt đo nhận đúng một bản tin.
CREATE UNIQUE INDEX ux_measurement_session_open_station ON dbo.measurement_session (station_device_id) WHERE status = 'Open' AND station_device_id IS NOT NULL;
CREATE UNIQUE INDEX ux_measurement_session_message ON dbo.measurement_session (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX ix_measurement_session_crab ON dbo.measurement_session (crab_unit_id, opened_at);
GO

/* ---------- 8. Loại cảnh báo mới (BR-118, BR-119, BR-231) ---------- */
ALTER TABLE dbo.alert DROP CONSTRAINT ck_alert_alert_type;
ALTER TABLE dbo.alert ADD CONSTRAINT ck_alert_alert_type CHECK (alert_type IN ('Mortality', 'WaterQuality', 'MilestoneDelay', 'LowStock', 'DataSilence',
    'EvidenceFlag', 'DeviceOffline', 'NoCrabDetected', 'MissingCareLog'));
GO
