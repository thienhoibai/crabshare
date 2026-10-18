# Offtake — Cam kết bao tiêu

**Người làm:** Nhân · **Use case:** UC13 Register Offtake Commitment · UC23 Claim Priority Offtake Volume

## Trạng thái implement
- **CS-72 / NH-14 / UC13:** POST commitments + GET mine + GET offtake-cap + webhook Held + hết hạn cọc. ✅
- **CS-75 / NH-15 / UC23:** claim / WindowOpen / Expired+Forfeited — chưa làm.

Nhà đầu tư bao tiêu cam kết mua một lượng cua (kg, hạng) với giá cố định, trả cọc; khi thu hoạch được quyền lấy hàng trước trong một **cửa sổ ưu tiên**.

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `offtake_commitment` | gắn với `contribution_id` + `batch_id` + `grade_id` · `committed_qty_kg`, `fixed_unit_price`, `deposit_amount` · `deposit_status`: `Pending`, `Held`, `Applied`, `Forfeited`, `Refunded` · `status`: `PendingHarvest` → `WindowOpen` → `Fulfilled` / `Expired`; `Cancelled` · `window_opens_at`, `window_expires_at` |
| `batch` (đọc) | `offtake_preorder_cap_pct` (≤ 60%), `offtake_deposit_pct` (10–20%, mặc định 15%) |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches/{code}/offtake-commitments` | Investor (có góp vốn lô này) | UC13: `{ contributionId, gradeCode, qtyKg, fixedUnitPrice }` → tạo `payment_request` cọc (`OfftakeDeposit`) |
| GET | `/api/me/offtake-commitments` | Investor | |
| POST | `/api/offtake-commitments/{id}/claim` | Investor | UC23: trong cửa sổ ưu tiên → tạo `sales_order` loại `Offtake` (trừ cọc) |

Job nền: mở cửa sổ khi lô thu hoạch; hết cửa sổ chưa lấy → `Expired`, xử lý cọc theo TL-30.

## Quy tắc phải giữ
- **Cấm** hộ nuôi (hoặc bên liên quan) bao tiêu lô của chính mình → 422 `offtake.related_party`.
- Tổng bao tiêu + đặt trước ≤ `offtake_preorder_cap_pct` × sản lượng dự kiến.
- Cọc = `offtake_deposit_pct` × giá trị cam kết.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_batch_commitment_cap` | tổng bao tiêu + đặt trước so với trần của lô |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Web: tab Bao tiêu trong `investor/`.

## Tài liệu
TL-30 Cam kết bao tiêu.
