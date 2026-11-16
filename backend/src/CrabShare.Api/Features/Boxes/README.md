# Boxes — Đánh số hộp nuôi

**Người làm:** Viên · **Use case:** UC44 **Register Boxes** (đổi tên từ *Declare Facility Layout*)

Mỗi con cua sống trong một hộp có **số**. Không vẽ sơ đồ trại: hộ nuôi chỉ cần đánh số hộp (dãy/kệ/tầng/cột là **tuỳ chọn**).

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `physical_slot` | `slot_code` duy nhất trong một hộ nuôi · `row_code`, `rack_no`, `tier_no`, `column_no` có thể để trống · `status`: `Available`, `Occupied`, `Maintenance` |
| `slot_allocation` | gán hộp cho lô: `batch_id`, `slot_id`, `allocated_at`, `released_at` (NULL = đang dùng) |

## Endpoint VI-03 và CS-44

CS-44 đã bổ sung phần đọc `GET /api/boxes` để mobile chọn hộp thật. Kết quả
phân trang gồm `slotCode`, `status`, `batchCode` (null khi không có lô đang nuôi
được gán). CRUD/đánh số hộp thuộc CS-29; gán hộp thuộc Production.

CS-71: thêm bộ lọc tùy chọn `batchCode` (tối đa 20 ký tự) trên allocation đang mở, và giữ `batchCode` cho hộp của lô `Harvesting`. Web/mobile có thể lấy đúng hộp còn cua của lô đang thu hoạch qua `GET /api/boxes?status=Occupied&batchCode=...` với phân trang hiện có.

`latestEvidence` (nullable) trả `{ id, receivedAt, reviewStatus }` của ảnh chụp
trong app mới nhất thuộc lô và lượt gán hiện tại. Mobile dùng dữ liệu này để
đánh dấu Đã gửi / Theo dõi / Cần kiểm tra / Chụp lại. Đây là trạng thái bằng
chứng; `status` của hộp vẫn là `Occupied` trong lúc nuôi.

| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/boxes/range` | Operator Owner | Tạo hàng loạt: `{ from: 1, to: 1200, width: 4 }` → `0001`…`1200` |
| POST | `/api/boxes` | Operator Owner | Thêm một hộp, có thể kèm dãy/kệ/tầng/cột |
| GET | `/api/boxes?status=&search=&page=` | OperatorMember | Danh sách hộp của hộ nuôi mình |
| PATCH | `/api/boxes/{slotCode}` | Operator Owner | Đổi `Available` ↔ `Maintenance` |

Gán hộp cho lô (`POST /api/batches/{code}/allocations`) thuộc Production, không nằm trong VI-03.

### Hợp đồng cho web/mobile
- GET trả `{ items: [{ slotCode, status, rowCode, rackNo, tierNo, columnNo, batchCode, latestEvidence }], page, pageSize, total }`; mặc định `page=1`, `pageSize=20`, tối đa 100. `search` tìm một phần số hộp, thứ tự theo `slotCode`.
- GET yêu cầu JWT có role `OperatorMember`, chặn role khác bằng 403 trước khi truy cập DB. Sau khi đăng ký hộ nuôi, cần đăng nhập lại để cập nhật role trong JWT; service tiếp tục kiểm tra membership và quyền hiện tại từ DB.
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
- Chạy lại trên SQL Server LocalDB thật, DB riêng do fixture tạo và xóa; không còn lỗi thiếu LocalDB của lần kiểm tra trước.
- `dotnet test backend/CrabShare.sln --no-restore`: 262 API + 4 SettlementEngine đều qua, không có test bị bỏ qua.
- Bộ VI-03: 22/22 ca qua, gồm 12 ca bổ sung kiểm tra dải và tạo lẻ đồng thời, trùng ở cuối dải không ghi một phần, biên from/to/width, int.MaxValue, hộ Draft/Suspended, khóa tài khoản và thu hồi role với token cũ. Tài khoản khóa trả 401 từ lớp JWT; thu hồi role trả 403.
- Chạy lặp 5 lần test tạo 1.200 hộp và hai test đồng thời: 15/15 ca qua. Thời gian toàn request POST range lần lượt 123, 189, 226, 308, 307 ms sau GET làm nóng; tất cả dưới 2 giây. Vượt sức chứa trả 422 `box.over_capacity`.
- `npm run build` qua. Sau `npm ci --include=dev` và `npx playwright install chromium`, chạy PowerShell `$env:CI='1'; npx playwright test --reporter=list`: 33/33 ca qua trên Chromium, gồm 4 ca hộp nuôi. CI=1 chọn Chromium đi kèm Playwright khi máy không có Chrome.
- Route và liên kết web dùng `/operator/boxes`; không còn tham chiếu `/operator/map` trong source web.

### Phạm vi và bàn giao KH-07
- Playwright kiểm tra UI với API giả lập; chưa chạy trình duyệt nối API/DB thật xuyên suốt, tải production hoặc mô phỏng mất kết nối giữa bulk insert và commit. Test trùng dải kiểm tra không ghi một phần khi phát hiện mã trùng, chưa mô phỏng lỗi SQL ở giữa bulk insert.
- Màn Chụp bằng chứng hiện dùng `ApiEvidenceRepository` trong `mobile/lib/features/operator/evidence/evidence_repository.dart`, gọi GET thật với `status=Occupied`, `pageSize=100` và đọc các trang đến khi đủ `total` hoặc hết kết quả.
- `BoxResponse` đã trả `batchCode` của lượt gán đang mở và `latestEvidence`. Mobile ánh xạ hai trường này, chỉ cho chọn hộp `Occupied` có `batchCode`; phụ thuộc dữ liệu hộp cho KH-07 đã được triển khai. Việc nối mobile với API/DB thật xuyên suốt cần được xác minh riêng.
