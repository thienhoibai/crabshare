# CS-52 VI-09 Sự kiện từng hộp

## Phạm vi và quyết định của người dùng

CrabShare cung cấp công cụ cho trại tự vận hành. Người dùng đã xác nhận không dùng phần mềm để tự kết luận mức chết nào là nguy hiểm, và ảnh bằng chứng phải chụp trực tiếp trong app mobile. Vì vậy VI-09 không áp ngưỡng sinh học cố định 5%, 20%, 30% hoặc mốc 7/14 ngày từ TL-21/TL-22.

Owner cấu hình riêng cho lô trên web: cách tính hạn thả bù, số ngày, và tùy chọn cửa sổ/tỷ lệ/mức cảnh báo/hạn phản hồi. Chưa cấu hình ngưỡng thì không tự sinh Mortality; vẫn ghi được lột xác, chết, chuyển hộp. Thả bù cần quy tắc hạn rõ ràng trước lần đầu. Thay đổi tạo phiên bản mới và audit, không sửa đánh giá cũ. Đây là quy ước theo chỉ dẫn mới nhất của người dùng, thay cho các ngưỡng mẫu trong tài liệu tham khảo.

Không thực hiện điều chỉnh ngân sách/chi phí, giải ngân, thu hoạch, bán hàng hoặc quyết toán. Không kiểm tra tiêu hao dự phòng giống trong VI-09. Các nghiệp vụ tài chính của TL-21 cần được xử lý riêng.

## Quy tắc đã triển khai

- Owner/Staff có role OperatorMember hiện tại trong DB; tài khoản Active, Operator Approved, đúng chủ lô. Ghi cho Stocked/InProduction/Harvesting. Chỉ cá thể Growing trong allocation đang mở mới là cua hiện tại. Không tự khóa vận hành do hao hụt.
- Quantity luôn bằng 1. Molted chỉ thêm lịch sử, không đổi Growing, không giải phóng hộp hay tạo cua.
- Mortality đổi cua thành Dead, đóng allocation, trả hộp về Available. Lịch sử cá thể dùng event Died theo enum sẵn có.
- Restocked tạo cá thể và allocation mới, lưu replacesCrabItemId đến cua Dead chưa được thay. Theo luồng cùng hộp của TL-21, hộp phải Available và lượt gán cuối chính là lượt của cua chết đó. Không thay một cua hai lần, không lấy ngẫu nhiên cá thể gần nhất. Lịch sử cá thể mới dùng Stocked; quan hệ thay thế và slot event Restocked phân biệt với giống ban đầu.
- Relocated giữ nguyên ID/UUID và ngày thả của cua, đóng allocation nguồn, gán allocation đích, giải phóng nguồn/chiếm đích. Detail sự kiện giữ cả allocation nguồn và đích sau khi con cua đã chuyển tiếp.
- occurredAt phải là ISO 8601 có offset, không tương lai, không trước ngày thả, allocation hoặc sự kiện đã ghi của cá thể/các hộp liên quan. Cua ở hộp đích khác Operator, Occupied/Maintenance hoặc hộp nguồn đều bị chặn.
- requestId UUID là khóa chống gửi lặp theo lô. Cùng người và cùng payload trả cùng sự kiện/snapshot; dùng lại khóa với dữ liệu khác trả 409. Các lần lột xác thực tế khác nhau dùng UUID khác nhau.

### Hạn và cảnh báo do trại đặt

`AfterStocking`: ngày thả giống theo UTC+7 + restockCutoffDays.

`BeforeHarvest`: ngày thả giống theo UTC+7 + cycleDays − restockCutoffDays. UI ghi rõ “ngày dự kiến thu hoạch = ngày thả giống + chu kỳ”, không dùng một ngày dự kiến có thể rỗng/khác nguồn để ngầm đổi hạn. Ngày thả là mốc 0; deadline hiển thị thành ngày cụ thể. Cho phép hết ngày deadline theo lịch Việt Nam; cả occurredAt và ngày máy chủ phải trong hạn. Sau hạn trả 422 `slot_events.restock_expired`, kể cả cố tình nhập lùi ngày.

Các trường Mortality phải cùng được điền hoặc cùng null. Tử số là số slot event Mortality trong cửa sổ `(serverNow − mortalityWindowHours, serverNow]`; mẫu số là `batch.seed_quantity`, công khai trên UI. So sánh **lớn hơn** mortalityThresholdPercent. Không giảm mẫu số sau khi chết, không dùng tất cả dòng crab_item làm cua sống. Severity và SLA do Owner đặt. Tỷ lệ có thể vượt 100% vì có thể thả bù rồi lại có hao hụt; hệ thống không áp định mức sinh học. AlertService gom cảnh báo Open/Escalated, không hạ severity hoặc kéo dài SLA; alert/audit và registry nằm cùng transaction.

## API thực tế và Bruno

Các endpoint yêu cầu Bearer token OperatorMember. PUT policy chỉ Owner. Mã lô trên URL dùng batchCode; mã hộp là nhãn thật, giữ số 0 đầu.

| Method | Endpoint | Ý nghĩa |
|---|---|---|
| GET / PUT | `/api/batches/{code}/slot-event-policy` | Đọc / tạo phiên bản quy tắc do trại đặt |
| GET | `/api/batches/{code}/slot-event-context?slotCode=0001` | Trạng thái hộp, cua hiện tại, cá thể chết có thể thay, ảnh app đủ điều kiện, hạn và số sống |
| GET | `/api/batches/{code}/slot-events?page=1&pageSize=10` | Lịch sử phân trang, gồm cả Stocked/Harvested cũ |
| POST | `/api/batches/{code}/slot-events` | Ghi một trong bốn sự kiện, trả 201 |
| GET | `/api/boxes?status=Available&search=0002&page=1&pageSize=20` | Chọn hộp đích thật |

Ví dụ cấu hình **do trại chọn để thử**, không phải chuẩn nuôi. `expectedVersionNo=0` khi chưa cấu hình; các lần tiếp theo dùng versionNo hiện tại. Muốn bật cảnh báo thì điền đủ mortalityWindowHours, mortalityThresholdPercent, mortalitySeverity (Low/Medium/High/Critical), mortalityAckWithinHours (1–720 giờ).

```json
{
  "expectedVersionNo": 0,
  "restockCutoffBasis": "AfterStocking",
  "restockCutoffDays": 10,
  "mortalityWindowHours": null,
  "mortalityThresholdPercent": null,
  "mortalitySeverity": null,
  "mortalityAckWithinHours": null
}
```

Các mẫu sau cần đổi mã hộp, thời điểm và ID theo dữ liệu thật. occurredAt có thể dùng biến thời gian của Bruno; không gửi thời gian tương lai hoặc trước sự kiện cuối. requestId phải giữ nguyên khi retry **cùng** thao tác, đổi UUID cho thao tác mới.

Lột xác:

```json
{
  "requestId": "4934a920-5bdd-4a8b-82a2-a64268ed0321",
  "slotCode": "0001",
  "eventType": "Molted",
  "occurredAt": "2026-10-20T15:00:00+07:00",
  "quantity": 1,
  "note": "Trại ghi nhận lột xác khi kiểm tra hộp"
}
```

Cua chết, evidenceId lấy từ ảnh chụp trực tiếp trong app cho đúng hộp/lô:

```json
{
  "requestId": "8b359876-dce7-4bcd-875e-397201e78891",
  "slotCode": "0001",
  "eventType": "Mortality",
  "occurredAt": "2026-10-20T15:10:00+07:00",
  "quantity": 1,
  "evidenceId": 101,
  "note": "Phát hiện cua chết khi kiểm tra"
}
```

Thả bù, chọn rõ replacesCrabItemId từ context; dùng **ảnh mới** chụp sau lần chết cho cùng hộp:

```json
{
  "requestId": "5131f7af-e867-4296-afc9-346f2a4df790",
  "slotCode": "0001",
  "eventType": "Restocked",
  "occurredAt": "2026-10-20T15:20:00+07:00",
  "quantity": 1,
  "replacesCrabItemId": 501,
  "evidenceId": 102,
  "note": "Thả cá thể giống mới thay cá thể đã chết"
}
```

Chuyển hộp, hộp đích nằm trong trường có cấu trúc:

```json
{
  "requestId": "9391febf-6163-421e-9fc6-561fbc046ba4",
  "slotCode": "0001",
  "eventType": "Relocated",
  "occurredAt": "2026-10-20T15:30:00+07:00",
  "quantity": 1,
  "destinationSlotCode": "0002",
  "note": "Chuyển cá thể sang hộp khác"
}
```

Response Event: id, batchCode, slotCode, eventType, occurredAt, quantity, note, crabItemId, itemUuid, destinationSlotCode, replacesCrabItemId, evidenceId, actorId, aliveCount. Cá thể/snapshot/actor có thể null ở lịch sử cũ chưa có liên kết; UI không giả số 0 hoặc gán số hiện tại thành số lịch sử. POST mới luôn có cá thể và snapshot.

400: sai định dạng, thiếu UUID/offset, quantity khác 1, trường không đúng loại sự kiện. 401/403: quyền. 404: lô/hộp không tìm thấy trong phạm vi được phép. 422: trạng thái, thời gian, ảnh không hợp lệ, hết hạn hoặc chưa cấu hình hạn. 409: requestId đổi payload, ảnh đã gắn, version policy cũ, unique/conditional claim/deadlock. Với hai request đồng thời, request thua cũng có thể nhận 422 nếu sau khi lấy khóa thấy trạng thái đã đổi; không ghi thêm dữ liệu.

### Ảnh trực tiếp từ mobile

Camera/GPS tái sử dụng `evidenceCameraProvider` và endpoint multipart `POST /api/evidence`. Thêm `slotEventType=Restocked` để chụp ảnh cho hộp Available có cua Dead chưa thay trong lượt gán cuối của lô; không mở chụp tùy ý cho mọi hộp trống. Không nhận captureRequestId của yêu cầu chụp thường cho nhánh này. Camera capture thường nay hỗ trợ cả Harvesting.

Khi ghi sự kiện, server kiểm tra Photo/InAppCapture, đúng hộp/lô, capturedAt/GPS, thời gian thuộc lượt nuôi (hoặc sau chết cho thả bù), chưa gắn sự kiện khác và không Rejected. Watch/Flagged vẫn ghi nhận để người thẩm định xử lý theo luồng hiện có. Không thêm chọn ảnh thư viện trên web/mobile. Không khẳng định API upload hiện có chứng thực phần cứng camera; nó giữ nguồn và metadata theo contract capture đang có.

## Database và đối chiếu

V015 thêm `slot_event_policy_version` bất biến và `slot_event_detail` bất biến: actor/request UUID/hash, cá thể, policy version, allocation đích và snapshot sống. Mở CHECK `crab_item_event` cho Molted/Relocated, thêm unique filtered replacement và FK thay thế cùng lô. Giữ index `ux_slot_active` (`released_at IS NULL`) và `ux_crab_item_growing_slot`; không unique hộp vĩnh viễn. Nếu lịch sử cũ đã có hai replacement cho một cua hoặc replacement khác lô thì migration dừng với thông báo, không xóa/sửa dữ liệu để vượt lỗi.

Chạy từ gốc repo:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator
```

Không dùng `--reset`. V015 đã được áp dụng thành công trên LocalDB dev trong phiên triển khai này. Các extension entity/mapping nằm ở file riêng và được giữ ngoài generated AppDbContext.cs, theo cách V014 đang dùng; không chạy scaffold toàn repo để tránh ghi đè các phần khác.

`v_crab_count_reconciliation` không sửa. stocked_total đếm tất cả cá thể bao gồm restocked; growing đếm Status=Growing; dead đếm Dead; harvested đếm mọi cá thể có harvest_id. Lost sau thu hoạch **đã nằm trong harvested**, không trừ lần nữa. Trong luồng hợp lệ: `growing = stocked_total − dead − harvested`. Số thả giống ban đầu trong registry = stocked_total − restocked; không lấy stocked_total làm số đang nuôi.

Chuỗi một cua: ban đầu total=1,dead=0,growing=1; chết total=1,dead=1,growing=0; thả bù total=2,restocked=1,dead=1,growing=1; chuyển hộp giữ nguyên số. Molted giữ mọi số. Sau ghi kiểm tra Growing trong view và registry khớp, Growing không trỏ allocation đã đóng, mỗi allocation đang mở có đúng một cua Growing. Transaction Serializable khóa audit → Operator → batch → hộp theo ID; trạng thái hộp claim có điều kiện và unique DB bảo vệ mọi writer. Alert lỗi thì registry, allocation, events, liên kết ảnh và audit rollback.

## Demo

1. Owner đăng nhập web → Lô nuôi → chọn lô đã thả → Sự kiện hộp. Đặt cách tính hạn/số ngày và tùy chọn ngưỡng do trại quyết định. Mở lại bằng Staff để thấy chỉ Owner sửa quy tắc.
2. Web nhập nhãn hộp → tải thông tin → chọn Lột xác → thời điểm/ghi chú → xác nhận. Kiểm tra lịch sử và số sống không đổi.
3. Mobile Hôm nay → thẻ đúng lô → Sự kiện hộp → chọn hộp/cua chết → Chụp bằng chứng → cho quyền camera/GPS → xác nhận ghi. Hộp được giải phóng, số sống giảm một.
4. Cùng màn chọn Thả bù → hộp vừa chết → chọn đúng cá thể được thay → chụp ảnh mới → xác nhận trước hạn. Cá thể mới có UUID khác và lịch sử thay thế; số sống tăng một. Ngoài hạn server trả 422, không cập nhật registry.
5. Chọn Chuyển hộp → chọn hộp Available cùng trại → xác nhận. Cua giữ ID/UUID, nguồn Available, đích Occupied. Kiểm tra web/mobile refresh trạng thái, số cua và lịch sử.
6. Web cho chọn ảnh camera đã được gửi từ mobile để ghi chết/thả bù; không có chọn file hoặc nhập ID bằng chứng thủ công.

## Kiểm chứng

Mốc trước sửa: 153 test VI-07/VI-08 qua, web build qua.

- VI-09 HTTP/SQL: 54/54 qua. Bao gồm chết/thả bù/chuyển/lột, giữ lịch sử và snapshot, policy không có ngưỡng sinh học mặc định, quyền/định dạng, cutoff hết ngày UTC+7 và nhập lùi sau hạn, upload camera thật qua HTTP, ba race và rollback ở audit/alert. Test Lost sau thu hoạch đã tái hiện 422 trước khi sửa, rồi qua; history cũ không có snapshot trả null.
- Cloudinary và các bộ lưu ảnh/evidence/VI-09 liên quan: 120/120 qua sau khi nối adapter; test DB dùng kho local riêng, không gửi fixture lên cloud thật.
- Lượt toàn backend cuối `dotnet test backend/CrabShare.sln --no-restore` sau tích hợp Cloudinary: API **932 qua/23 lỗi**, không skip, 1 phút 46 giây; SettlementEngine **4/4 qua**. 23 lỗi BatchesTests/BatchReviewTests được chạy lại trên nguyên HEAD gốc xuất bằng git archive sang thư mục temp: cũng 23 lỗi, 31 qua; so sánh tên ca lỗi khớp hoàn toàn. Không sửa nghiệp vụ ngoài phạm vi để che lỗi cũ. Lượt trước có thêm 16 timeout fixture AlertDatabaseTests do chạy nhiều kiểm tra đồng thời; chạy riêng 16/16 qua và lượt cuối toàn backend không còn các lỗi timeout đó.
- Web VI-09 cuối: `CI=1 npx playwright test tests/slot-events.spec.ts --reporter=list`: 9/9 qua. Có form theo loại, xác nhận/loading/quyền, UUID retry, ảnh/đích/cá thể thay thế, policy tùy chỉnh, 422/409, refresh và lịch sử Stocked/Harvested cũ. Kiểm tra không tràn ở 320/768/1024/1440px.
- Lượt toàn Playwright cuối chạy tuần tự, không chồng runner: 135 qua, 2 skip (ca yêu cầu API thật chưa bật), 0 lỗi. Lượt trước chạy chồng runner có timeout/va chạm artifact nên không dùng để kết luận về hồi quy sản phẩm.
- Flutter SDK tìm thấy tại `C:/Users/ziend/AppData/Local/Temp/crabshare-flutter-sdk/bin/flutter.bat`: `flutter analyze --no-pub` không có vấn đề; `flutter test --no-pub` 188/188 qua, bao gồm smoke màn mới, repository, camera → upload → event, retry khi đã đổi occupant và lịch sử cũ.
- Kiểm tra Cloudinary thật bằng một PNG thử: upload authenticated, download có chữ ký, byte/SHA-256 trùng, URL không chữ ký trả 401; đã xóa đúng ảnh thử. Thông tin kết nối lưu User Secrets ngoài repo; hướng dẫn: [cloudinary.md](../cloudinary.md).

Chưa thử bằng camera/GPS trên điện thoại vật lý hoặc một phiên web/mobile cùng nối API thật xuyên suốt. Không khẳng định các bài Playwright fixture thay thế kiểm tra thiết bị. Chưa deploy lên production. Không đổi nhánh, commit, push hoặc merge.

## File chính

- Backend: `Features/Production/SlotEventDtos.cs`, `SlotEventsController.cs`, `SlotEventService.cs`, `SlotEventService.Read.cs`, `SlotEventService.Record.cs`; `AppDbContext.SlotEvents.cs` và hai entity mở rộng.
- Schema: `database/migrations/V015__slot_events.sql`.
- Ảnh: `Infrastructure/Storage/CloudinaryFileStorage.cs`, đăng ký provider trong DependencyInjection; mở rộng tối thiểu EvidenceService/Dtos cho chụp thả bù.
- Web: `SlotEventsSection.tsx`, `SlotEventPolicyForm.tsx`, `slotEventsApi.ts`, tích hợp OperatorBatchDetail và làm rõ trường gợi ý trong OperatorCreateBatch.
- Mobile: `operator/slot_events/slot_event_repository.dart`, `slot_events_page.dart`, route và nút ở thẻ Hôm nay; mở rộng tùy chọn upload camera.
- Kiểm thử: bảy file `SlotEvent*Tests.cs`, `CloudinaryStorageTests.cs`, `web/tests/slot-events.spec.ts`, repository/widget/smoke mobile. Ảnh kiểm tra web: [desktop](assets/vi09-slot-events-desktop.png), [điện thoại](assets/vi09-slot-events-mobile.png).
