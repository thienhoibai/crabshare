# CS-71 / VI-14 — Thu hoạch: cân, phân hạng và tạo tem

Ngày kiểm chứng: 21/10/2026. Nhánh: `feature/CS-71-thu-hoach-can-hang`. Không đổi nhánh, commit, push hoặc merge.

## Hành vi đã triển khai

Owner mở đợt có tên/ghi chú, Owner/Staff chọn hộp và ghi cân từng cá thể; Owner sửa thông tin hoặc chốt đợt. Mỗi lô có tối đa một đợt Open, nhiều đợt Completed. Chốt đợt không đóng lô và không cộng tồn lần hai. Các con chưa thu hoạch tiếp tục Growing trong lô Harvesting.

Sau khi ghi thành công, cua giữ nguyên crab_item_id/item_uuid; cập nhật InStock, weight_g, grade_id, harvest_id; tạo một tem Printed; đóng allocation cũ và giải phóng hộp Available. Registry, tem, tổng cân, sự kiện cua/hộp, snapshot và audit nằm trong cùng transaction Serializable. Khóa theo audit → Operator → batch → harvest → hộp. Lỗi giữa transaction rollback toàn bộ.

Request ID chống ghi lặp; expectedCrabItemId chặn dùng cân nặng cho cá thể mới khi hộp đã thay cua. Replay lấy snapshot bất biến, kể cả sau khi đợt Completed, hộp đã tái sử dụng, cua Packed hay tem đổi trạng thái. Trạng thái tem trong kết quả cân là snapshot Printed tại lúc ghi, không giả lập kích hoạt.

## Quy tắc sản phẩm và cân nặng

- Gram nguyên JSON 1–32767; không nhận chuỗi số, số lẻ, 0, âm hoặc vượt SMALLINT. Tổng kg dùng decimal và 3 chữ số thập phân.
- Bắt buộc Operator xác nhận `shellCondition` tại lúc cân: HardShell hoặc SoftShell. SOFT được quyết định theo xác nhận hiện tại của từng cá thể, không suy từ màu hộp, loại lô hoặc chỉ từ sự kiện Molted trong quá khứ. Không tự đặt thời hạn sau lột hoặc yêu cầu API trại chưa tồn tại.
- HardShell phân theo product_grade: min/max bao gồm hai đầu; null là không có cận. Với V002: L4 1–249, L3 250–349, L2 350–499, L1 500–32767 gram. Kiểm tra đủ L1–L4, không chồng/khoảng hở trên miền gram hợp lệ; không chọn theo thứ tự DB.
- SoftShell lấy dòng SOFT, áp dụng cận nếu có; SOFT là tập sản phẩm riêng. Cấu hình thiếu/sai hoặc không khớp trả 422 và không ghi dữ liệu một phần. Không sửa V002/ngưỡng đã có.
- Client không tính hạng, không gửi gradeId/status để quyết định kết quả. `grading.dart` và test ngưỡng cục bộ đã bỏ khỏi mobile; test mới kiểm chứng hạng trả từ server.

## Mã tem và migration

Mã dài đúng 12 ký tự, sinh bằng RandomNumberGenerator với alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. Không có 0/O/1/I/L/chữ thường. Giữ unique `uq_crab_tag_tag_code`; thêm unique `ux_crab_tag_non_void` theo cá thể khi status khác Void để bảo vệ cả Printed và Active. Vẫn giữ lịch sử Void và không xây luồng thay tem trong task này.

Va chạm mã tem duy nhất được nhận diện theo constraint tag_code; rollback transaction rồi thử lại tối đa 5 lần. Hết lần thử trả 409 `harvest.tag_generation_conflict`. Lỗi unique/concurrency khác không bị nhầm thành va chạm mã ngẫu nhiên.

Migration mới: [V016__harvest_recording.sql](../../database/migrations/V016__harvest_recording.sql).

- Thêm tên, lifecycle_status, completed_at/by, revision_no cho harvest; trạng thái dữ liệu cũ để null, hiển thị Legacy chỉ đọc. Không dựng thời điểm chốt lịch sử.
- harvest_start_request lưu mọi lần mở/tiếp tục thành công để gửi lại sau khi chốt vẫn trỏ đúng đợt cũ.
- harvest_record gắn với SlotEventDetail hiện có, giữ snapshot lần cân, chống sửa/xóa và unique cá thể/tem.
- Có unique một đợt Open/lô, FK và CHECK tương ứng. Nếu dữ liệu cũ có nhiều tem chưa Void cùng cá thể, migration dừng và yêu cầu đối chiếu; không xóa/sửa dữ liệu để vượt constraint. Alphabet mới không áp hồi tố lên tem lịch sử.

Đã áp V016 thành công vào LocalDB `CrabShareDev`, không dùng reset. Khi kiểm tra DB dev hiện có 0 cá thể/0 đợt thu hoạch; vì vậy bảo toàn dữ liệu Legacy có mẫu được xác minh trong test SQL riêng, không tuyên bố đã thử trên dữ liệu production.

Áp trên môi trường phát triển khác từ gốc repository:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator
```

Lệnh đã dùng trong phiên này chỉ định rõ LocalDB để tránh ảnh hưởng biến môi trường trỏ DB khác:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator -- 'Server=(localdb)\MSSQLLocalDB;Database=CrabShareDev;Trusted_Connection=True;TrustServerCertificate=True'
```

## API và JSON Bruno

Authorization: Bearer JWT OperatorMember còn quyền trong DB, user Active và Operator Approved. Owner tạo/sửa/chốt, Owner/Staff ghi và đọc. Giữ convention ProblemDetails `{status,code,detail}`; 400 DTO/kiểu, 403 quyền, 404 không tồn tại, 409 conflict/replay khác nội dung, 422 nghiệp vụ/cấu hình.

| Method | URL | Body / kết quả |
|---|---|---|
| GET | `/api/batches/{code}/harvest-context` | quyền, activeHarvest, tổng con/kg |
| GET | `/api/batches/{code}/harvest-context?slotCode=0006` | thêm currentCrab `{id,itemUuid,allocationId}`, slotStatus, latestMoltedAt |
| GET | `/api/batches/{code}/harvests?page=1&pageSize=20` | PagedResult các đợt |
| POST | `/api/batches/{code}/harvests` | start bên dưới; 201 tạo, 200 tiếp tục/replay |
| GET | `/api/harvests/{id}` | thông tin đợt, revision và quyền hiện tại |
| GET | `/api/harvests/{id}/crabs?page=1&pageSize=20` | PagedResult các kết quả cân |
| POST | `/api/harvests/{id}/crabs` | record bên dưới; 201 ghi mới, 200 replay |
| PATCH | `/api/harvests/{id}` | metadata bên dưới |
| POST | `/api/harvests/{id}/complete` | `{ "expectedRevision": 2 }` |
| GET | `/api/boxes?status=Occupied&batchCode={code}&page=1&pageSize=100` | lọc đúng allocation đang mở, hỗ trợ Harvesting |

Mở đợt (UUID mới cho một lần thao tác mới; giữ nguyên khi gửi lại vì lỗi mạng):

```json
{
  "requestId": "618af0b2-a2eb-4b07-9e5f-b349ba8fd129",
  "name": "Thu hoạch buổi sáng",
  "note": "Khu A"
}
```

Lấy `id` đợt từ response và `currentCrab.id` từ context hộp, rồi ghi cân. Đây là mẫu minh họa; thay ID/mã hộp bằng dữ liệu thật:

```json
{
  "requestId": "cda874e7-9fa5-405e-b581-ceae1f0aeb81",
  "slotCode": "0006",
  "expectedCrabItemId": 123,
  "weightG": 250,
  "shellCondition": "SoftShell"
}
```

Response chứa `crabItemId,itemUuid,harvestId,batchCode,slotCode,weightG,shellCondition,gradeCode,gradeName,tagCode,tagStatus,tracePath,recordedAt,harvestedCount,totalWeightKg,remainingGrowingCount`. Với ví dụ SoftShell, server trả SOFT nếu cấu hình cho phép; HardShell 250 g trả L3. tracePath là `/truy-xuat/{tagCode}` để tạo QR; chưa phải xác nhận API truy xuất/kích hoạt đã có trong CS-71.

Sửa thông tin/chốt dùng revision vừa đọc lại, không lấy revision cũ trước lần cân:

```json
{
  "expectedRevision": 2,
  "name": "Thu hoạch khu A",
  "note": "Đã đối chiếu số hộp"
}
```

Tên tối đa 100, ghi chú 300, mã hộp 30 ký tự. Không nhận chỉnh tùy ý trạng thái/tổng cân/người ghi. Chốt lặp không tạo audit hoặc cộng tồn lại. Nếu muốn cân tiếp sau khi chốt, dùng UUID mới để mở đợt mới; UUID mở đợt cũ luôn replay đợt cũ.

## Catalog, bao tiêu và API trại

Catalog hiện cho niêm yết cua InStock của lô Harvesting theo batch+hạng. Thu hoạch từng phần không phải chờ hết lô. Web có liên kết quản lý niêm yết và nút làm mới tồn bằng endpoint Catalog có sẵn. Lỗi refresh tồn sau commit được báo riêng, không biến lần cân đã thành công thành một yêu cầu ghi mới. Chốt đợt không cộng dồn tồn từ tổng đợt lần hai; không thay giá hoặc tự đăng bán.

NH-15/CS-75 chưa triển khai cửa sổ ưu tiên. Lần lô chuyển InProduction → Harvesting lưu `harvest_started_at` trong cùng transaction; các đợt sau không đặt lại mốc. Với lô Harvesting lịch sử thiếu mốc đầu, giữ unknown. Không tự đổi PendingHarvest sang WindowOpen, đặt expiresAt hay xử lý claim/cọc. Điều phối ưu tiên bao tiêu khi bán vẫn là phụ thuộc NH-15.

API bên trại chưa có contract; hiện dùng nhập tay thật và lịch sử Molted. Không suy ý nghĩa màu từ ảnh hoặc dựng kết nối giả. Sau này adapter ingestion cần ánh xạ hộp/cá thể/thời điểm/idempotency vào service đã có. Kích hoạt tem bằng ảnh, thay/in lại tem và máy in vật lý nằm ngoài CS-71; mobile không còn nút kích hoạt giả.

## File chính

- Backend: `Features/Harvest/Harvest{Controller,Dtos,Grading,TagCode,Service,Service.Read,Service.Record}.cs`; `AppDbContext.Harvest.cs`, `HarvestEntities.Custom.cs`; đăng ký service và bộ lọc Boxes.
- SQL: `database/migrations/V016__harvest_recording.sql`.
- Web: `OperatorHarvest.tsx`, `harvestApi.ts`, `tests/harvest.spec.ts`.
- Mobile: `harvest_page.dart`, `harvest_repository.dart`, `harvest_models.dart`, `harvest_actions.dart`, method repository/data model liên quan và tests.
- Kiểm thử backend: sáu file `HarvestTests*.cs`; tài liệu spec/plan cùng ngày.

## Kiểm chứng backend

- TDD: test HTTP đầu tiên thất bại 404 trước khi thêm API; test nguồn cũ Stocking/SlotEvent 103/103 qua.
- `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~HarvestTests --no-restore --verbosity quiet`: lượt riêng 62/62 qua. Lượt solution sau bổ sung bốn ca cuối có **66/66 Harvest qua**.
- `dotnet test backend/CrabShare.sln --no-restore --verbosity quiet --logger 'trx;LogFilePrefix=cs71' --results-directory <TEMP>/crabshare-cs71-results`: API **1011 qua / 23 lỗi / 1034 tổng**, SettlementEngine **4/4 qua**.
- Đã xuất nguyên HEAD gốc bằng `git archive` vào thư mục TEMP riêng, chạy BatchesTests/BatchReviewTests trên source gốc: **31 qua / 23 lỗi**. Đối chiếu từng testName trong TRX khớp hoàn toàn 23 lỗi hiện tại; không sửa các module đó ngoài phạm vi. Danh sách cụ thể trong file JSON kết quả kèm tài liệu này.
- Lượt full có thông báo SqlException khi dọn DB fixture DashboardDatabaseTests. Chạy riêng `dotnet test ... --no-build --no-restore --filter FullyQualifiedName~DashboardDatabaseTests --verbosity normal`: **4/4 qua**, dọn DB thành công. Ghi nhận đây là bất thường của lượt full; không gộp vào kết luận mọi kiểm tra đều xanh.
- Test Harvest gồm tất cả biên hạng, SOFT quan sát độc lập loại lô, kiểu/độ chính xác gram, cấu hình thiếu/chồng/khoảng hở, giữ ID/lịch sử/counts, quyền DB bị thu hồi, cạnh tranh start/cân/sửa/chốt, replay sau tái sử dụng hộp, rollback ba điểm lỗi, unique/immutable SQL, **1.000 mã đúng bộ ký tự/12 ký tự/không trùng**, va chạm và hết 5 lần thử.

## Demo web/mobile

Kiểm chứng client cuối cùng:

- Trong web: `npm run build` qua (TypeScript + Vite).
- `$env:CI='1'; npx playwright test tests/harvest.spec.ts --reporter=line`: **11/11 qua**. Test gồm luồng cân, mất response/gửi lại, Staff, metadata/chốt/mở tiếp, 403/409, phân trang/màn hẹp, hộp nhập sai và đổi cá thể khi đang xác nhận.
- `$env:CI='1'; npx playwright test --reporter=line`: **149 qua, 2 skipped, 0 lỗi** (toàn bộ 151 ca).
- Dùng `C:/Users/ziend/AppData/Local/Temp/crabshare-flutter-sdk/bin/flutter.bat analyze --no-pub`: **No issues found**.
- Cùng SDK, `flutter test --no-pub --reporter expanded`: **207/207 qua**, gồm repository/widget/smoke và mở lại màn khi request còn đang gửi rồi mất response. Đã đọc log đầy đủ phần kết quả; không suy kết quả từ compile.
- Review độc lập đã kiểm tra backend và clients; hai P2 về xác nhận nhầm cá thể trên web và trạng thái retry khi mở lại mobile đã có regression RED → GREEN và được đọc lại sau sửa. Không còn P1/P2 được xác nhận trong review.
- Đã xem ảnh Playwright ở desktop và viewport 390px; không có tràn ngang trong ca kiểm tra màn hẹp. Ảnh dùng HTTP fixture, không phải dữ liệu trại thật.

1. Dùng lô thật đã thả giống và đang InProduction, thuộc Operator Approved. Owner mở Thu hoạch; web chọn lô, mobile đi từ lô trên màn Hôm nay.
2. Owner nhập tên/ghi chú và bắt đầu. Staff tiếp tục đợt Open đã có; Staff không được mở/sửa/chốt.
3. Chọn/nhập đúng hộp còn cua; kiểm tra danh tính đang chiếm hộp. Nhập gram nguyên, xác nhận vỏ lúc cân và xác nhận lưu.
4. Xem hạng/mã tem/Printed trả về; số còn nuôi giảm một, số thu hoạch và kg tăng, hộp được giải phóng. Mở lại màn hình vẫn đọc được lịch sử.
5. Thử cân lặp, hộp sai hoặc đổi cá thể; xem lỗi conflict, không tạo thêm cua/tem. Lỗi mạng chưa rõ kết quả có nút gửi lại đúng request cũ. Khi cá thể trong hộp đổi trong lúc xác nhận, UI buộc cân/xác nhận lại.
6. Owner chốt đợt; lô vẫn Harvesting, cua khác vẫn Growing. Mở đợt kế tiếp để tiếp tục cân. Vào Niêm yết để tạo/đăng bán tồn đã cân, hoặc làm mới tồn listing đã có bằng chức năng Catalog hiện tại.

Backend đã kiểm thử HTTP/SQL thật trong DB test riêng. Playwright/widget tests dùng HTTP fixtures có kiểm soát; chưa chạy demo xuyên suốt web/mobile nối API trên thiết bị thật, thử tải production hoặc phần cứng in. Không coi screenshot fixture là bằng chứng giao dịch dữ liệu trại thật.
