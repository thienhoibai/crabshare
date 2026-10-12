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

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches` | Operator Owner | Tạo lô `Draft` (hộ nuôi phải `Approved`) |
| PUT | `/api/batches/{code}` | Operator Owner | Sửa khi còn `Draft` / `Rejected` |
| GET | `/api/operators/me/batches?status=` | OperatorMember | Lô của hộ nuôi mình |
| PUT | `/api/batches/{code}/standard-cost` | Operator Owner | Ghi đè danh sách khoản chi của phiên bản nháp |
| POST | `/api/batches/{code}/submit` | Operator Owner | → `PendingApproval`, chi phí → `Submitted` |
| GET | `/api/admin/batches?status=PendingApproval` | PlatformAdmin | Hàng đợi duyệt |
| POST | `/api/admin/batches/{code}/approve` | PlatformAdmin | Nhận `fundingOpenAt`, `fundingDeadline` → `Funding`; **khoá** chi phí chuẩn (`Locked`, `locked_at`); chọn `fee_tier`, ghi `platform_fee_amount`; sinh `disbursement_tranche` theo `tranche_no` |
| POST | `/api/admin/batches/{code}/reject` | PlatformAdmin | Kèm lý do → `Rejected` |
| GET | `/api/batches?status=Funding&crabType=&page=` | Ai cũng xem | UC09 — điều khoản đã công bố |
| GET | `/api/batches/{code}` | Ai cũng xem | Chi tiết + tóm tắt chi phí chuẩn đã khoá |

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
