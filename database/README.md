# Database — SQL Server

```
database/
├── migrations/
│   ├── V001__initial_schema.sql     ← 52 bảng + 9 view + trigger (từ Chuan_hoa/Database/crabshare_sqlserver.sql)
│   ├── V002__reference_data.sql     ← hạng cua, bậc phí, bản công bố rủi ro, mẫu hợp đồng
│   ├── ...
│   ├── V035__drop_unused_legacy_tables.sql ← bỏ 16 bảng thế hệ đầu không còn dùng + 5 view (109 bảng còn 93)
│   └── V036 … V053__merge_*.sql        ← gộp các bảng cùng nhóm vào 18 bảng có cột record_type (93 bảng còn 39)
├── reference/                        ← nội dung bản công bố rủi ro / mẫu hợp đồng (hash đã ghi trong V002)
└── seed/                             ← (dự phòng) dữ liệu demo dạng SQL nếu cần
```

## Chạy migration

```bash
dotnet run --project backend/tools/CrabShare.DbMigrator                 # CSDL dev mặc định (LocalDB CrabShareDev)
dotnet run --project backend/tools/CrabShare.DbMigrator -- --reset      # XOÁ rồi tạo lại (chỉ dev)
dotnet run --project backend/tools/CrabShare.DbMigrator -- "<chuỗi kết nối>"
```

Hoặc đặt biến môi trường `CRABSHARE_DB` = chuỗi kết nối. DbUp ghi file đã chạy vào bảng `dbo.SchemaVersions`, chạy lại sẽ bỏ qua.

## Rút gọn bảng (V035)

V035 bỏ các bảng thế hệ đầu mà không dịch vụ nào còn đọc hay ghi: bán lẻ cũ (`product_listing`, `product_grade`, `price_history`, `price_check`, `order_line`, `stock_reservation`, `product_rating`), thu hoạch cũ (`harvest`, `harvest_record`, `harvest_start_request`), theo dõi từng con cũ (`crab_item_event`, `tag_scan`, `slot_event_policy_version`), cùng `complaint`, `fee_tier`, `batch_offtake_price`. Kèm theo: bỏ view `v_traceability`, `v_crab_count_reconciliation`, `v_batch_actual_revenue`, `v_operator_reputation`, `v_batch_commitment_cap`; bỏ cột `batch.fee_tier_id`, `crab_item.harvest_id / grade_id / order_line_id`, `offtake_commitment.grade_id`, `slot_event_detail.policy_version_id`. Dữ liệu trong các bảng đó bị xoá hẳn, nên sao lưu CSDL trước khi chạy trên máy chủ. Không có file rollback: muốn quay lại thì khôi phục bản sao lưu.

## Gộp bảng (V036–V053)

18 migration `V036` … `V053` gộp các bảng con cùng nhóm vào một bảng chung, phân biệt bằng cột `record_type`. Chức năng và API giữ nguyên; CSDL còn **39 bảng** (trước là 93). Dữ liệu cũ được chép sang đầy đủ.

| Bảng gộp | Gộp từ | `record_type` | Giữ nguyên id |
|---|---|---|---|
| `device_record` | device_message, device_image, water_reading, device_calibration, device_command | Message, Image, WaterReading, Calibration, Command | Command |
| `measurement_record` | measurement_session, ai_inference, measurement_value | Session, AiInference, Value | Session |
| `grading_rule` | grading_standard, grade_rule_set, grade_rule | Standard, RuleSet, Rule | RuleSet |
| `delivery_record` | delivery_tranche, delivery_tranche_line, shipment, shipment_line, delivery_acceptance, invoice | Tranche, TrancheLine, Shipment, ShipmentLine, Acceptance, Invoice | Tranche |
| `supply_record` | procurement_order, supply_lot, goods_receipt | ProcurementOrder, SupplyLot, GoodsReceipt | SupplyLot |
| `qc_record` | qc_assignment, qc_inspection, site_visit_report | Assignment, Inspection, SiteVisitReport | Inspection |
| `inventory_record` | inventory_event, box_assignment, inventory_allocation | Event, BoxAssignment, Allocation | Event |
| `batch_record` | batch_account, batch_participant, remuneration_tier, production_threshold_version, holding_operation, collective_decision, vote | Account, Participant, RemunerationTier, ThresholdVersion, HoldingOperation, CollectiveDecision, Vote | Account |
| `party_record` | partner_role, party_site, related_party, party_document | Role, Site, RelatedParty, Document | Site |
| `user_record` | app_user_role, customer_address, kyc_check, kyc_handoff, payout_account | Role, Address, KycCheck, KycHandoff, PayoutAccount | PayoutAccount |
| `cost_record` | standard_cost_version, standard_cost_item, standard_cost_tranche_plan, cost_actual | Version, Item, TranchePlan, Actual | Version |
| `payment_record` | payment_request, payment_instruction, provider_transaction, payment_application, disbursement_tranche | Request, Instruction, Transaction, Application, Disbursement | Instruction (mã gửi cổng thanh toán là `CHI` + id) |
| `contract_record` | investment_contract, contract_template, contract_signature, risk_disclosure, risk_acknowledgement, offtake_commitment | Contract, Template, Signature, RiskDisclosure, RiskAcknowledgement, Offtake | Contract |
| `evidence_record` | evidence, evidence_detection, evidence_review, capture_request | Evidence, Detection, Review, CaptureRequest | Evidence |
| `sales_record` | sales_order_line, claim, order_rating, revenue_line | Line, Claim, Rating, Revenue | Line |
| `settlement_record` | settlement, settlement_line, settlement_feedback | Settlement, Line, Feedback | Settlement |
| `offer_record` | product_specification, offer | Specification, Offer | Specification |
| `care_record` | production_log, alert | Log, Alert | Alert (ghi chú xử lý cảnh báo tra theo id) |

21 bảng không đổi: `app_user`, `party`, `investor`, `operator`, `operator_member`, `customer`, `batch`, `platform_parameter`, `contribution`, `capital_share`, `crab_unit`, `physical_slot`, `slot_allocation`, `device`, `grade_decision`, `crab_item`, `crab_tag`, `slot_event`, `slot_event_detail`, `sales_order`, `audit_log`.

Cần biết khi làm việc với bảng gộp:

- Mỗi loại chỉ dùng các cột của mình; cột của loại khác để trống. Ràng buộc cũ (CHECK, UNIQUE, khoá ngoại) giữ nguyên tên và chỉ áp cho đúng loại (điều kiện `record_type = ...`). Truy vấn SQL viết tay phải lọc `record_type`.
- Trigger khoá dữ liệu (chi phí đã khoá, quyết toán đã duyệt, số đo, sự kiện tồn, phiếu kiểm phẩm, dòng doanh thu, chi phí thực tế, phiên bản ngưỡng, phân bổ giao dịch) được viết lại trên bảng gộp, cùng mã lỗi và thông báo. Ba view `v_investor_portfolio`, `v_settlement_reconciliation`, `v_overdue_alerts` viết lại, giữ nguyên cột.
- Mỗi loại có một lớp C# riêng kế thừa lớp gốc của bảng (ví dụ `PaymentRequest : PaymentRecord`). Khoá chính trong code là `<Bảng>RecordId` (ví dụ `PaymentRecordId`).
- Cột `legacy_id` giữ id cũ của bản ghi trước lần gộp, để tra các dòng `audit_log` ghi trước đó (nhật ký kiểm toán chỉ ghi thêm nên không sửa được). Bản ghi mới để trống.
- Bảng gộp không còn giá trị mặc định ở CSDL; code luôn gửi giá trị (lớp C# có giá trị khởi tạo). Ghi tay bằng SQL thì nhớ điền `created_at`, `updated_at`.
- Đổi tên cột: `payment_request.tranche_id` thành `delivery_tranche_id`, `provider_transaction.reference_code` thành `txn_reference_code`, `revenue_line.batch_id` thành `revenue_batch_id`, `box_assignment.reason` thành `box_reason`, `kyc_handoff.status` thành `handoff_status`, `party_document.note` thành `document_note`, `grade_rule.note` thành `rule_note`, `grading_standard.effective_from` thành `standard_effective_from`.
- Bỏ xoá dây chuyền ở các quan hệ nội bộ (khoản chi theo phiên bản, chữ ký theo hợp đồng, dòng quyết toán theo bảng quyết toán) và ở địa chỉ theo khách hàng. Code hiện không xoá hợp đồng, bảng quyết toán hay khách hàng; khi sửa phiên bản chi phí, code tự xoá khoản chi cũ trước.
- File `rollback/V008`, `rollback/V009` chỉ đúng với lược đồ trước V036.
- Trước khi chạy trên máy chủ: sao lưu CSDL. Merge vào `develop` sẽ tự chạy các migration này trên Azure SQL.

Đã thử chuyển dữ liệu (28/11/2026): 41 CSDL do bộ kiểm thử bản 93 bảng tạo ra, 37.731 dòng; số dòng từng loại khớp, 58 khoá ngoại trỏ vào bảng gộp đều trỏ đúng loại bản ghi.

## Quy tắc

V009 thêm lịch theo mốc (`anchor_code`, `offset_days`, `planned_date` nullable) cho cost plan và tranche. Lịch cũ giữ nguyên; rollback V009 bị chặn nếu đã có lịch mới để tránh mất dữ liệu. Xem [bản sửa VI-05](../docs/validation/vi05-relative-schedule-and-revision.md). Rollback theo thứ tự mới nhất trước.

VI-05 thêm `V008__batch_approval_and_cost_lock.sql`: lịch đợt theo cost version, lý do từ chối, cờ biên fee_tier, trigger bất biến cho cost/version/lịch. Rollback thủ công ở `rollback/V008__batch_approval_and_cost_lock.sql`; không được DbUp tự chạy. Xem [báo cáo VI-05](../docs/validation/vi05-batch-review.md). Chạy migrator trước API mới; không chỉ copy code khi DB còn schema cũ.

1. **Không sửa** file migration đã có trên `main`. Muốn đổi → file mới `V003__...sql`, `V004__...`.
2. Tên file: `V` + 3 chữ số + `__` + mô tả không dấu.
3. Không viết `CREATE DATABASE` / `USE` trong migration (DbMigrator tự tạo CSDL).
4. Không dùng chuỗi `/*` bên trong comment `/* ... */` (SQL Server hiểu là comment lồng → lỗi 113).
5. Sau khi thêm migration: sửa tay lớp thực thể tương ứng (`backend/README.md` mục *Đổi CSDL*) và commit cả hai.
6. File trong `reference/` giữ xuống dòng **LF** (`.gitattributes` đã ép) — đổi nội dung là đổi hash, phải tạo bản mới (RD/CT mới) chứ không sửa bản cũ.

## Dữ liệu demo

`DevDataSeeder` + `DemoLifecycleSeeder` (`backend/src/CrabShare.Api/Infrastructure/Persistence/`) tạo khi API chạy ở Development và CSDL chưa có người dùng (khoảng 5 giây). Làm lại từ đầu:

```bash
dotnet run --project backend/tools/CrabShare.DbMigrator -- --reset
```

rồi chạy API (F5). Mốc thời gian tính lùi từ lúc seed nên dữ liệu luôn "đang diễn ra"; số liệu cố định giữa các lần seed.

**Tài khoản** (mật khẩu chung: hằng `DemoPassword` trong `DevDataSeeder.cs`): `admin`, `reviewer`, `operator` (chủ hộ nuôi), `staff`, `investor1`–`investor4` (đã Verified, đã xác nhận bản công bố rủi ro RD-2026-01, có tài khoản nhận tiền), `customer` (có địa chỉ giao hàng). Email dạng `<tên>@crabshare.local`.

**Người nuôi:** HTX Nuôi cua Năm Căn (Approved, sức chứa 2.000) — 1.700 hộp `0001`–`1700`, tài khoản nhận tiền VCB.

| Lô | Trạng thái | Dùng cho | Có sẵn |
|---|---|---|---|
| `CS-2611-01` | PendingApproval | VI-05 duyệt lô | Chi phí chuẩn đã gửi (Submitted); chưa có bậc phí, tài khoản lô |
| `CS-2610-03` | Funding | TH-04 giữ chỗ, TH-05 VietQR, NH-13 đặt trước | Cua lột. Mục tiêu 120 tr (tối thiểu 90, trần 150); đã Confirmed 50 tr (investor1 30, investor2 20); hạn gọi vốn còn 11 ngày; tài khoản lô Open; 3 đợt giải ngân Planned |
| `CS-2610-02` | Funding | như trên (lô thứ hai cho danh sách gọi vốn) | Cua gạch. Mục tiêu 60 tr (tối thiểu 45, trần 75); đã Confirmed 25 tr (investor3 15, investor4 10); hạn gọi vốn còn 10 ngày |
| `CS-2610-01` | InProduction | VI-08/09/11 nhật ký, sự kiện hộp, timeline · KH-07..10 bằng chứng · KH-11 danh mục | 1.200 con ở hộp 0001–1200 (20 chết → 1.180 còn sống), đang "ngày 45/90"; nhật ký 30 ngày (một ngày pH vượt ngưỡng); 30 lần lột xác; 9 ảnh bằng chứng (1 ảnh Flagged); vốn 180 tr từ 4 nhà đầu tư; đã giải ngân đợt 1–2 |
| `CS-2609-04` | Harvesting | NH-02..10 bán hàng · VI-15/17 tem, truy xuất · TH-10 giải ngân | 288 con InStock (≈125 kg) có tem Active và ảnh kích hoạt; đợt giải ngân 3 đang Requested |
| `CS-2605-01` | Settlement | TH-12..14 quyết toán · KH-14 dashboard | Cua gạch, 192 con bán hết qua 12 đơn Completed: doanh thu thực ≈ 55,3 tr, chi phí chuẩn đã khoá 33,99 tr; capital_share 3 nhà đầu tư (48 tr); đã giải ngân đủ 3 đợt |

- Mỗi khoản góp Confirmed có hợp đồng FullySigned (người nuôi ký trước, nhà đầu tư ký sau), `payment_request` Paid và `provider_transaction` đã khớp. Mỗi đơn Completed có `payment_request` Paid với mã đối chiếu = `order_no`.
- `DemoSeedDatabaseTests` kiểm tra các con số trên (chạy cùng `dotnet test`).
- Mã lô trùng dữ liệu mẫu (mock) của app mobile (`CS-2610-01` đang nuôi, `CS-2610-02/03` gọi vốn, `CS-2609-04` thu hoạch) để khi đổi màn sang API thật không lệch mã.
- Mỗi lô demo dùng một dải hộp riêng. VI-07 đã sửa mapping EF `physical_slot ↔ slot_allocation` trong AppDbContext.Custom thành quan hệ một-nhiều để giữ lịch sử và tái sử dụng hộp đã trả; index `ux_slot_active` vẫn chỉ cho một allocation đang mở trên mỗi hộp.
- Cần thêm dữ liệu mẫu cho tính năng của mình: bổ sung vào `DemoLifecycleSeeder` (PR riêng).

Để thử camera/GPS của CS-44 trên CSDL dev đã có tài khoản demo:

```powershell
powershell -ExecutionPolicy Bypass -File backend/scripts/seed-evidence-demo.ps1
```

Script thêm lô `[DEMO CS-44]` mã `CS44-DEMO-01` ở trạng thái `InProduction`
và gán ba hộp `0014`, `0015`, `0016` thành `Occupied` cho hộ nuôi demo.
Tài khoản `operator@crabshare.local` và `staff@crabshare.local` đều chọn được
các hộp này trên màn Chụp bằng chứng. Chạy lại không nhân đôi dữ liệu; script
không thay allocation của lô khác và không đặt lại lô đã đổi trạng thái.
Chỉ chạy trên LocalDB `CrabShareDev`; đây là fixture để thử upload, không phải
luồng gọi vốn/thả giống thật. Dữ liệu seed không tạo audit nghiệp vụ; các lần
gửi ảnh sau đó vẫn dùng audit chuẩn của API.

## Dùng Docker thay LocalDB (máy macOS / không có LocalDB)

```bash
docker compose up -d sqlserver
```

Rồi đặt chuỗi kết nối (thay mật khẩu bằng giá trị bạn đặt trong `MSSQL_SA_PASSWORD`):
`Server=localhost,1433;Database=CrabShareDev;User Id=sa;Password=<...>;TrustServerCertificate=True`
cho cả `CRABSHARE_DB` (migrator) và `ConnectionStrings__Default` (API).
