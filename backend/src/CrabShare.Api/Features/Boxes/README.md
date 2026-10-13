# Boxes — Đánh số hộp nuôi

**Người làm:** Viên · **Use case:** UC44 **Register Boxes** (đổi tên từ *Declare Facility Layout*)

Mỗi con cua sống trong một hộp có **số**. Không vẽ sơ đồ trại: hộ nuôi chỉ cần đánh số hộp (dãy/kệ/tầng/cột là **tuỳ chọn**).

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `physical_slot` | `slot_code` duy nhất trong một hộ nuôi · `row_code`, `rack_no`, `tier_no`, `column_no` có thể để trống · `status`: `Available`, `Occupied`, `Maintenance` |
| `slot_allocation` | gán hộp cho lô: `batch_id`, `slot_id`, `allocated_at`, `released_at` (NULL = đang dùng) |

## Endpoint VI-03
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/boxes/range` | Operator Owner | Tạo hàng loạt: `{ from: 1, to: 1200, width: 4 }` → `0001`…`1200` |
| POST | `/api/boxes` | Operator Owner | Thêm một hộp, có thể kèm dãy/kệ/tầng/cột |
| GET | `/api/boxes?status=&search=&page=` | OperatorMember | Danh sách hộp của hộ nuôi mình |
| PATCH | `/api/boxes/{slotCode}` | Operator Owner | Đổi `Available` ↔ `Maintenance` |

Gán hộp cho lô (`POST /api/batches/{code}/allocations`) thuộc Production, không nằm trong VI-03.

### Hợp đồng cho web/mobile
- GET trả `{ items: [{ slotCode, status, rowCode, rackNo, tierNo, columnNo }], page, pageSize, total }`; mặc định `page=1`, `pageSize=20`, tối đa 100. `search` tìm một phần số hộp, thứ tự theo `slotCode`.
- POST một hộp nhận `{ slotCode, rowCode?, rackNo?, tierNo?, columnNo? }`, trả 201 với hộp vừa tạo, trạng thái `Available`.
- POST range trả 201 `{ created: 1200, from: "0001", to: "1200" }`. `from/to` là số nguyên dương, `to >= from`; `width` mặc định 4, từ 1 đến 30 và không cắt số có nhiều chữ số hơn.
- PATCH nhận `{ status: "Available" | "Maintenance" }`, trả hộp đã cập nhật. Hộp `Occupied` hoặc có allocation đang mở trả 422 `box.in_use`.
- Tạo/đổi trạng thái yêu cầu Owner của hộ nuôi `Approved`; quyền và membership được kiểm tra từ DB, kể cả khi token chưa được cấp lại sau đăng ký.
- Vượt sức chứa: 422 `box.over_capacity`; trùng mã: 409 `box.duplicate`; không tìm thấy trong hộ nuôi của mình: 404 `box.not_found`; dữ liệu sai: 400.
- Tạo hàng loạt là toàn bộ hoặc không có gì, dùng `SqlBulkCopy` trong transaction; mọi thao tác tạo khóa cùng hàng `operator` trước khi đếm hộp để chặn vượt sức chứa khi gọi đồng thời.

## Quy tắc phải giữ
- Tổng số hộp ≤ `operator.approved_slot_capacity`.
- Một hộp chỉ có **một** `slot_allocation` đang mở (`released_at IS NULL`); giải phóng khi thu hoạch hoặc cua chết.
- Nếu có nhập vị trí thì `rack_no`, `tier_no`, `column_no` > 0 (CHECK `ck_physical_slot_layout`).

## Màn hình
- Web: `operator/OperatorFarmMap.tsx` hiển thị **Hộp nuôi** tại `/operator/boxes`: lưới số hộp, tạo một hộp/hàng loạt, tìm kiếm, lọc trạng thái, phân trang và đổi bảo trì.
- Mobile: màn Chụp bằng chứng (`operator/evidence/`) lấy danh sách hộp từ `GET /api/boxes`.

## Kiểm thử
`dotnet test backend/tests/CrabShare.Api.Tests --filter FullyQualifiedName~Boxes` chạy kiểm thử API, quyền, cô lập hộ nuôi, trạng thái, transaction và đồng thời. Các test có Category=Database cần SQL Server LocalDB, dùng DB riêng qua `OperatorDatabaseFixture`. Test range đo thời gian toàn request tạo 1.200 hộp sau khi làm nóng GET và yêu cầu dưới 2 giây.

`cd web && npx playwright test tests/boxes.spec.ts` kiểm tra giao diện với API giả lập; không thay thế phép đo DB thật.

### Kết quả kiểm tra 13/10/2026
- Backend build: 0 lỗi, 0 cảnh báo. Test không cần DB: 152 API + 4 SettlementEngine đều qua.
- Web production build qua; toàn bộ 33 Playwright test qua, gồm 4 test hộp nuôi.
- Chạy toàn bộ backend: 98 test DB không chạy được do thiếu SQL Server LocalDB (SQL Network Interfaces error 52), gồm `BoxesTests`, `OperatorsControllerTests`, `OperatorReviewTests`, `CheckoutConcurrencyTests`, `ListingModerationDatabaseTests`, `AlertDatabaseTests`, `KycDatabaseTests`, `AdminAccountDatabaseTests`, `MixedAuditDatabaseTests`, `PaymentProfileDatabaseTests`.
- Chưa xác minh các thao tác trên DB thật và tiêu chí 1.200 hộp dưới 2 giây; cần chạy lại test DB trước nghiệm thu.
