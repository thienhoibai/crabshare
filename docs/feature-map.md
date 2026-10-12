# Bản đồ tính năng (ai làm gì, nằm ở đâu)

Mỗi **module** là một lát cắt dọc: một người làm từ bảng CSDL → API backend → màn hình web → màn hình mobile (nếu có).
Muốn tìm code của một use case: tra bảng dưới → mở đúng thư mục ở 3 cột cuối.

> Tên thư mục backend: `backend/src/CrabShare.Api/Features/<Module>/` — mỗi thư mục có README riêng liệt kê endpoint dự kiến.
> Tên use case lấy từ `Chuan_hoa/Diagram/CrabShare_Use_Case_Diagrams.drawio`. UC44 đổi tên thành **Register Boxes** (đánh số hộp, bỏ sơ đồ trại).

| Module | Người làm | Use case | Bảng chính | Web (`web/src/features/`) | Mobile (`mobile/lib/features/`) |
|---|---|---|---|---|---|
| **Auth** *(mẫu, đã xong)* | Thiện | UC01 | app_user, app_user_role, investor, customer | `auth/` | `auth/`, `core/auth/` |
| **Accounts** | Khôi | UC02, UC03, UC06 + quản lý người dùng | kyc_check, payout_account, customer_address | `admin/AdminUsers*`, `operator/OperatorKyc`, tab hồ sơ trong `investor/` | `investor/kyc/`, `account/` |
| **Operators** | Viên | UC04, UC05 | operator, operator_member | `operator/` (đăng ký hộ nuôi), `admin/AdminUsers*` (duyệt) | — |
| **Boxes** | Viên | UC44 *Register Boxes* | physical_slot, slot_allocation | `operator/OperatorFarmMap` → **thay bằng trang Hộp nuôi** | `account/` (danh sách hộp) |
| **Batches** | Viên | UC07, UC08, UC09 | batch, standard_cost_version, standard_cost_item, disbursement_tranche, fee_tier | `operator/OperatorCreateBatch`, `operator/OperatorBatch*`, `admin/AdminBatches*`, `investor/` (danh sách lô) | `investor/batches/` |
| **Funding** | Thiện | UC10, UC11, UC12 | risk_disclosure, risk_acknowledgement, batch_account, contribution, capital_share, payment_request | `investor/` (luồng góp vốn ≤ 5 màn) | `investor/batches/batch_detail_page.dart` (nút Góp vốn) |
| **Contracts** | Thiện | UC14, UC15 | contract_template, investment_contract, contract_signature | `operator/OperatorContract`, `investor/` (ký) | — |
| **Payments** | Thiện | UC18, UC40 | provider_transaction, payment_instruction, disbursement_tranche | `admin/AdminFinance`, `operator/` (yêu cầu giải ngân) | — |
| **Production** | Viên | UC17, UC21 + ingestion API | production_log, slot_event, crab_item, crab_item_event | `operator/OperatorDailyLog`, `operator/OperatorBatchDetail` (timeline) | `operator/today/`, `operator/logs/` |
| **Evidence** | Khôi | UC45, UC47, UC48 | evidence, capture_request, evidence_detection, evidence_review | `admin/` (hàng đợi thẩm định) | `operator/evidence/` |
| **Alerts** | Khôi | UC19, UC20 | alert | `operator/OperatorAlerts`, `admin/AdminAlerts` | `operator/alerts/` |
| **Harvest** (+ tem, truy xuất) | Viên | UC22, UC46, UC33 | harvest, crab_item, crab_tag, crab_item_event, tag_scan, product_grade | `operator/OperatorHarvest`, `trace/TracePage` | `operator/harvest/`, `trace/` |
| **Catalog** | Nhân | UC24, UC25 | product_listing, price_history, product_grade | `store/StorePage`, `admin/AdminStorefront` | — |
| **Orders** | Nhân | UC26–UC32, UC34 | sales_order, order_line, stock_reservation, complaint, product_rating, customer_address | `orders/CommercePage`, `admin/AdminDisputes` | `operator/` (đóng gói: quét tem — UC29) |
| **Offtake** | Nhân | UC13, UC23 | offtake_commitment | `investor/` (bao tiêu) | — |
| **Settlement** | Thiện | UC35–UC39 | settlement, settlement_line, settlement_feedback, payment_instruction | `admin/AdminFinance`, `admin/AdminSettlementDetail`, `operator/OperatorSettlement`, `investor/` (sao kê) | `investor/` (xem sao kê — mở rộng) |
| **Portfolio** (+ thông báo) | Khôi | UC16 | contribution, capital_share (đọc) | `investor/` (danh mục) | `investor/home/`, `investor/notifications/` |
| **Admin & Reports** | Khôi (UC42, UC43), Thiện (UC41) | UC41, UC42, UC43 | fee_tier, audit_log | `admin/AdminDashboard`, `admin/AdminSettings`, `operator/OperatorDashboard` | — |

## Ngoài use case

| Hạng mục | Người làm | Nằm ở đâu |
|---|---|---|
| TSK-12 Kiểm định đúng đắn quyết toán (nghiên cứu) | Viên | `backend/src/CrabShare.SettlementEngine`, `backend/tests/CrabShare.SettlementEngine.Tests` |
| TSK-13 Mô hình nhận diện cua (YOLO → ONNX) | Nhân | `ml/`, tích hợp qua `ICrabDetector` ở `backend/.../Infrastructure/Detection` |
| Nhật ký kiểm toán (append-only), job nền | Thiện | `backend/.../Infrastructure/` |
| Triển khai, CI, docker | Khôi | `.github/workflows/`, `docker-compose.yml` |

## Số lượng use case mỗi người

| Người | Use case | Thêm |
|---|---|---|
| Thiện | 13 (UC10–12, 14, 15, 18, 35–41) | Trưởng nhóm: review PR, seed dữ liệu demo, audit log |
| Viên | 11 (UC04, 05, 07–09, 17, 21, 22, 33, 44, 46) | TSK-12 nghiên cứu |
| Nhân | 12 (UC13, 23–32, 34) | TSK-13 mô hình AI, kiểm thử hệ thống |
| Khôi | 11 (UC02, 03, 06, 16, 19, 20, 42, 43, 45, 47, 48) | Khung mobile, triển khai |
