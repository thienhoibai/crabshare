# Boxes — Đánh số hộp nuôi

**Người làm:** Viên · **Use case:** UC44 **Register Boxes** (đổi tên từ *Declare Facility Layout*)

Mỗi con cua sống trong một hộp có **số**. Không vẽ sơ đồ trại: hộ nuôi chỉ cần đánh số hộp (dãy/kệ/tầng/cột là **tuỳ chọn**).

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `physical_slot` | `slot_code` duy nhất trong một hộ nuôi · `row_code`, `rack_no`, `tier_no`, `column_no` có thể để trống · `status`: `Available`, `Occupied`, `Maintenance` |
| `slot_allocation` | gán hộp cho lô: `batch_id`, `slot_id`, `allocated_at`, `released_at` (NULL = đang dùng) |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/boxes/range` | Operator Owner | Tạo hàng loạt: `{ from: 1, to: 1200, width: 4 }` → `0001`…`1200` |
| POST | `/api/boxes` | Operator Owner | Thêm một hộp, có thể kèm dãy/kệ/tầng/cột |
| GET | `/api/boxes?status=&search=&page=` | OperatorMember | Danh sách hộp của hộ nuôi mình |
| PATCH | `/api/boxes/{slotCode}` | Operator Owner | Đổi `Available` ↔ `Maintenance` |
| POST | `/api/batches/{code}/allocations` | Operator Owner | Gán hộp cho lô khi thả giống (một hộp một con) — Production gọi lại khi thả giống |

## Quy tắc phải giữ
- Tổng số hộp ≤ `operator.approved_slot_capacity`.
- Một hộp chỉ có **một** `slot_allocation` đang mở (`released_at IS NULL`); giải phóng khi thu hoạch hoặc cua chết.
- Nếu có nhập vị trí thì `rack_no`, `tier_no`, `column_no` > 0 (CHECK `ck_physical_slot_layout`).

## Màn hình
- Web: **thay** `operator/OperatorFarmMap.tsx` (sơ đồ trại) bằng trang **Hộp nuôi**: lưới số hộp + nút tạo hàng loạt + lọc trạng thái.
- Mobile: màn Chụp bằng chứng (`operator/evidence/`) lấy danh sách hộp từ `GET /api/boxes`.
