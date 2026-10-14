# VI-04 — UC07: tạo lô và soạn chi phí chuẩn

Ngày kiểm tra: 14/10/2026. Nhánh `feature/CS-33-tao-lo-chi-phi-chuan`. Không commit/push/PR; không migration hoặc dependency mới.

## Thay đổi

- Backend `Features/Batches`: DTO, service, controller cho tạo Draft, sửa, xem chi tiết, danh sách của hộ nuôi, lưu chi phí và gửi duyệt. Đăng ký service trong FeatureRegistry.
- Tái sử dụng quyền từ DB như Operators/Boxes, `ICurrentUser`, `IAuditLog`, `InTransactionAsync`, `PageQuery`/`PagedResult` và ProblemDetails của team. Owner của hộ nuôi Approved được ghi; Owner/Staff xem dữ liệu của hộ mình. Không tin operatorId/status từ client.
- Khóa audit trước hộ nuôi/lô, transaction Serializable bao trùm kiểm tra quyền/trạng thái, dữ liệu và audit. Thiếu MortalityReserve trả 422 khi lưu và submit. Tổng tính từ items trên server; giới hạn số được kiểm tra trước khi có thể tràn số.
- Sửa ánh xạ EF chi phí thành nhiều phiên bản trong AppDbContext.Custom (schema không đổi), cập nhật seeder tương ứng và thêm test bảo vệ chi phí của cả 6 lô demo.
- Web dùng API thật, component operator hiện có; thêm/sửa/xóa khoản chi, tổng chi phí, lưu nháp/gửi duyệt tuần tự. Giữ form và mã lô trong URL khi bước sau thất bại; retry cập nhật cùng lô. Cập nhật cache chi tiết/danh sách, chặn gửi lặp; hỗ trợ loading/error/empty, lọc và phân trang phía server.
- Không thêm trường lợi suất kỳ vọng.

## Endpoint

| Method | Path | Kết quả |
|---|---|---|
| POST | `/api/batches` | 201 Draft |
| GET / PUT | `/api/batches/{code}` | 200 chi tiết / cập nhật |
| PUT | `/api/batches/{code}/standard-cost` | 200 chi phí chuẩn mới nhất |
| POST | `/api/batches/{code}/submit` | 200 PendingApproval, chi phí Submitted |
| GET | `/api/operators/me/batches?status=&page=&pageSize=` | PagedResult, scope theo membership DB |

## Kết quả kiểm tra thực tế

- `dotnet test backend/CrabShare.sln --verbosity quiet`: **471 API + 4 SettlementEngine pass, 0 fail/skip**, bao gồm test SQL Server LocalDB. VI-04 có 32 ca API: trạng thái hộ nuôi, luồng đầy đủ, biên vốn/thù lao/chu kỳ, reserve, category/tranche/số lượng/tiền, cách ly hộ nuôi, Staff/thu hồi membership/token cũ, phiên bản Rejected, submit đồng thời, rollback và giới hạn số.
- `dotnet build backend/CrabShare.sln --no-restore --verbosity quiet`: pass, không warning/error.
- Trong `web`, `npm run lint` và `npm run build`: pass. `lint` của repo là TypeScript typecheck.
- Trong `web`, đặt `$env:CI='1'`, `$env:VI04_API_URL='http://127.0.0.1:5238'`, chạy `npx playwright test tests/batches.spec.ts --reporter=line`: **5 pass**. Bốn ca kiểm thử UI dùng phản hồi API có kiểm soát; ca thứ năm dùng HTTP tới backend thật, không mock dữ liệu/nghiệp vụ.
- Ca API thật: đăng nhập Owner demo → tạo/lưu nháp → reload form/items từ DB → gửi duyệt → kiểm tra API trả PendingApproval/Submitted, tổng 35.000.000 đồng. Chụp và xem ảnh desktop/390px; xác nhận không tràn ngang toàn trang, bảng chi phí cuộn trong panel.
- Backend thật chạy trên CSDL riêng `CrabShareVI04BrowserTests_20261014` tạo bằng migrator/seed hiện có. API đã dừng và CSDL này đã xóa sau kiểm thử. Không dùng CrabShareDev cho ca này.
- Môi trường: chạy `npm ci --ignore-scripts --no-audit --no-fund` để khôi phục dependency qrcode.react đã có trong lockfile; không đổi package/lockfile. Dùng Chromium qua CI=1 vì Chrome không có ở đường dẫn mặc định. Một lần build bị khóa exe bởi API kiểm thử; đã dừng API rồi chạy lại toàn bộ test thành công.
- Rà soát chéo phát hiện và sửa giới hạn Range chuyển sang double, cache Draft sau submit, ảnh hưởng seeder và tổng chi phí có thể tràn decimal; test hồi quy đã tái hiện lỗi trước khi sửa.

## Quy tắc và giả định

- Theo README Batches: sửa Draft/Rejected. Theo state machine hiện tại: chỉ Draft gửi duyệt, Rejected chưa có luồng gửi lại; không tự thêm chuyển trạng thái.
- Phần trăm 5–10 (mặc định 7), không phải 0.05–0.10. Khấu hao có trancheNo null; các khoản khác 0–255 theo schema TINYINT, không tự bắt đầu từ 1.
- Schema cho phép quantity lẻ nhưng tiền nguyên đồng: chọn làm tròn quantity × unitPrice từng dòng đến đồng, midpoint away from zero, rồi cộng tổng. Quy ước này được ghi trong UI/API docs và có test.
- GET chi tiết trong task này bảo vệ bản nháp cho hộ nuôi; API công khai UC09 và Admin UC08 nằm ngoài phạm vi VI-04.

## Chạy thử

1. Chạy migrator/API theo `backend/README.md`, web bằng `npm run dev` trong `web`.
2. Đăng nhập Owner của hộ nuôi Approved (dữ liệu demo: `operator@crabshare.local`, mật khẩu demo trong DevDataSeeder).
3. Mở `/operator/batch` → **Mở lô nuôi mới**, nhập thông tin, sửa các khoản chi và giữ ít nhất một **Dự phòng hao hụt**.
4. **Lưu nháp**: URL có mã lô, tải lại vẫn có dữ liệu từ API. Có thể mở lại lô từ danh sách.
5. **Gửi duyệt**: chuyển về danh sách, trạng thái **Chờ duyệt**. Lô/chi phí không còn được sửa. Xóa reserve trước khi lưu để kiểm tra frontend; gọi PUT chi phí không reserve trực tiếp để kiểm tra HTTP 422.

Ca trình duyệt API thật là opt-in bằng VI04_API_URL; nếu chạy mặc định không đặt biến, ca này được skip để không ghi dữ liệu vào API dev ngoài ý muốn. Muốn chạy lại, tạo một CSDL kiểm thử riêng bằng DbMigrator, bật seed, chạy API với ConnectionStrings__Default trỏ vào CSDL đó và tắt các job nền.
