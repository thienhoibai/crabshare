# Batches — Lô nuôi và chi phí chuẩn

**Người làm:** Viên · **Use case:** UC07 Create Batch and Define Standard Cost · UC08 Review and Approve Batch · UC09 Explore Batch Offerings

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `batch` | `batch_code` · `crab_type` (`FatteningMudCrab`, `RoeCrab`, `SoftShellCrab`) · `seed_quantity`, `cycle_days`, `restock_cutoff_days` · vốn: `min_viable_capital` ≤ `target_capital` ≤ `max_capital` · `min_contribution` (mặc định 1.000.000) · `operator_share_pct` 5–10 (mặc định 7) · `status` theo state machine (xem `docs/architecture.md`) |
| `standard_cost_version` | `Draft` → `Submitted` → `Approved` → `Locked`; bản cũ `Superseded` |
| `standard_cost_item` | `category`: `Seed`, `Feed`, `Utilities`, `Labour`, `MortalityReserve`, `Depreciation`, `Other` · `tranche_no` (trừ `Depreciation`) |
| `disbursement_tranche` | kế hoạch giải ngân theo đợt (`planned_amount`, `planned_date`, `unlock_condition`) |
| `fee_tier` | phí nền tảng theo quy mô vốn (đọc khi duyệt lô) |

## Endpoint UC07 đã triển khai

- `POST /api/batches`, `GET/PUT /api/batches/{code}`, `PUT /api/batches/{code}/standard-cost`, `POST /api/batches/{code}/submit`, `GET /api/operators/me/batches?status=&page=&pageSize=`.
- GET trong UC07 dành cho Owner/Staff của chính hộ nuôi. UC08 Admin đã triển khai bên dưới; quyền xem công khai UC09 vẫn là phần riêng.
- Quyền lấy từ tài khoản Active, vai trò OperatorMember và membership hiện hành trong DB. Token có claim hộ nuôi khác bị từ chối. Chỉ Owner của hộ nuôi Approved được ghi; Staff chỉ xem.
- Sửa thông tin/chi phí và gửi duyệt chỉ khi Draft. Admin yêu cầu bổ sung bằng request-revision sẽ trả PendingApproval về Draft kèm lý do; hộ nuôi sửa rồi gửi lại. Rejected là từ chối dứt điểm, không sửa/gửi lại.
- Dùng `InTransactionAsync` Serializable và `IAuditLog`: khóa audit trước hộ nuôi/lô, cùng thứ tự VI-02; mọi thay đổi dữ liệu/chi phí/trạng thái và audit cùng commit hoặc rollback.
- Chi phí Draft được thay items trong cùng phiên bản. Khi bổ sung hồ sơ được trả về Draft với bản Submitted, giữ items/lịch cũ, đánh dấu Superseded và tạo bản Draft kế tiếp. Locked/Approved không được sửa. Cấu hình EF viết tay giữ đúng quan hệ nhiều phiên bản theo index unique có filter.
- Body thông tin: `title`, `crabType`, `seedQuantity`, `expectedOutputKg`, `cycleDays`, `restockCutoffDays`, `minViableCapital`, `targetCapital`, `maxCapital`, `minContribution`, `operatorSharePct`. Không nhận quyền sở hữu/trạng thái từ client. Phần trăm dùng 5–10, mặc định 7.
- Body chi phí: `{ "items": [{ "category": "MortalityReserve", "description": "Dự phòng hao hụt", "quantity": 1, "unit": "khoản", "unitPrice": 5000000, "trancheNo": 1 }] }`. Giá nguyên đồng ≥ 0; quantity > 0 và tối đa 3 chữ số thập phân; giới hạn theo DECIMAL của schema. Khấu hao có trancheNo null, khoản khác 0–255 theo TINYINT hiện có (schema không yêu cầu > 0).
- Thiếu MortalityReserve trả 422 `batch.mortality_reserve_required`, cả lưu và gửi duyệt. Dữ liệu sai định dạng/range trả 400 kèm field errors; chuyển trạng thái sai trả 422 `batch.invalid_transition`.
- Tổng do server tính, bỏ qua tổng từ client. Quy ước làm tròn: quantity × unitPrice làm tròn từng dòng đến đồng, midpoint away from zero, rồi cộng tổng; schema hiện tại chưa quy định làm tròn cho tích có phần lẻ.
- Response có thông tin lô, `standardCost` (phiên bản, status, total, items có amount), `canEdit`, `canSubmit`. Danh sách trả `PagedResult`, không tải chi tiết khoản chi; GET theo code tải bản mới nhất.
- Web `/operator/create-batch?code=...` xem/sửa lô đã lưu, `/operator/batch` tải danh sách và lọc/phân trang từ server. Luồng gửi chờ lưu thông tin → chi phí → submit; giữ form/mã lô và URL khi bước sau thất bại; cập nhật cache chi tiết sau lưu/gửi.
- Không migration, dependency mới hoặc trường lợi suất kỳ vọng.

## Endpoint và kế hoạch các UC liên quan
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches` | Operator Owner | Tạo lô `Draft` (hộ nuôi phải `Approved`) |
| PUT | `/api/batches/{code}` | Operator Owner | Chỉ sửa khi còn `Draft` |
| GET | `/api/operators/me/batches?status=` | OperatorMember | Lô của hộ nuôi mình |
| PUT | `/api/batches/{code}/standard-cost` | Operator Owner | Ghi đè danh sách khoản chi của phiên bản nháp |
| POST | `/api/batches/{code}/submit` | Operator Owner | → `PendingApproval`, chi phí → `Submitted` |
| GET | `/api/admin/batches?status=PendingApproval` | PlatformAdmin | Hàng đợi duyệt |
| POST | `/api/admin/batches/{code}/approve` | PlatformAdmin | Nhận `fundingOpenAt`, `fundingDeadline` → `Funding`; **khoá** chi phí chuẩn (`Locked`, `locked_at`); chọn `fee_tier`, ghi `platform_fee_amount`; sinh `disbursement_tranche` theo `tranche_no` |
| POST | `/api/admin/batches/{code}/reject` | PlatformAdmin | Kèm lý do → `Rejected` |
| POST | `/api/admin/batches/{code}/request-revision` | PlatformAdmin | Kèm lý do → `Draft`, bổ sung rồi gửi lại |
| GET | `/api/batches?status=Funding&crabType=&page=` | Ai cũng xem | UC09 — điều khoản đã công bố |
| GET | `/api/batches/{code}` | Owner/Staff của hộ nuôi (UC07) | Bản nháp và chi phí; quyền công khai UC09 chưa triển khai ở task này |

## Quy tắc phải giữ
- Chi phí chuẩn **khoá khi mở gọi vốn**; sau khi khoá không sửa được (TL-11). Trigger CSDL cũng chặn.
- Chuyển trạng thái sai → 422 `batch.invalid_transition`.
- Khoản dự phòng hao hụt (`MortalityReserve`) phải có trong chi phí chuẩn (TL-12, TL-21).
- **Không** có trường lợi suất kỳ vọng ở bất kỳ response nào (BR-49).

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_batch_funding_progress` | số vốn đã giữ chỗ / đã xác nhận để hiển thị thanh tiến độ |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Web: `operator/OperatorCreateBatch.tsx`, `operator/OperatorBatchStatus.tsx`, `operator/OperatorBatchDetail.tsx`, `admin/AdminBatches.tsx`, `admin/AdminBatchDetail.tsx`, danh sách lô trong `investor/`.
- Mobile: `investor/batches/` (khám phá + chi tiết lô).

## Tài liệu
TL-11 Ngân sách chuẩn và cơ chế khoá · TL-03 Giải ngân theo mốc · TL-15 Thù lao Operator và phí nền tảng · TL-17 Hạn mức góp, dải vốn khả thi.

## UC08 đã triển khai — VI-05

V009 và [bản sửa theo vận hành thực tế](../../../../../docs/validation/vi05-relative-schedule-and-revision.md): lịch mới dùng `anchorCode` FundingReady/Stocked + `offsetDays`; `plannedDate` chỉ có sau mốc thực tế. Lịch ngày cũ được giữ. Job xác định ngày một lần và ghi audit, không thay ngân sách đã khóa hoặc tự chi tiền. Request-revision trả hồ sơ về Draft; Rejected không còn chỉnh sửa được.

Các endpoint Admin ở bảng trên nay đã chạy API thật; có thêm GET `/api/admin/batches/{code}`. Chi tiết triển khai, migration, quy tắc phí/tranche và cách thử nằm ở [vi05-batch-review.md](../../../../../docs/validation/vi05-batch-review.md).

PUT standard-cost nhận `tranches: [{trancheNo,anchorCode,offsetDays,unlockCondition}]` cho lịch theo mốc; `plannedDate` vẫn hỗ trợ lịch ngày cũ. Hộ nuôi tự chọn mốc và khoảng ngày; hệ thống xác định ngày từ sự kiện thực tế, không áp tỷ lệ đợt. Draft có thể lưu thiếu lịch, submit cần đủ lịch cho các khoản chi thường, tranche 1–255 và tổng đợt dương. MortalityReserve không đi theo lịch; Depreciation trả khi quyết toán. Tổng Standard Cost phải dương khi submit/approve và không vượt DECIMAL(18,0).

V008 tạo standard_cost_tranche_plan, rejection_reason, cờ biên bậc phí và trigger khóa version/items/lịch. Service chặn mọi version Locked/Approved của lô. Admin cấu hình phí cố định qua GET/POST `/api/admin/fee-tiers`, PUT `/{id}`. UC08 chọn đúng một tier có hiệu lực, không thu phí theo %, không khấu trừ vào vốn. Sandbox tạo account Open và audit trong cùng transaction; gateway thật cần triển khai provisioning idempotent. Chưa xác nhận thanh toán phí khởi tạo.

Các ghi chú UC07 phía trên về giới hạn tổng long, tranche 0 và UC08 chưa triển khai được thay bằng quy tắc này. Tranche 0 chỉ còn có thể lưu nháp theo schema cũ; không được submit nếu là khoản chi theo lịch. Dữ liệu legacy MortalityReserve.tranche_no được giữ và bỏ qua khi sinh tranche.
