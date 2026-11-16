# CS-59 / VI-11 — Nhật trình sản xuất

Ngày xác minh: 21/10/2026. Không commit, push, merge hoặc thay đổi nhánh.

## Phạm vi đã triển khai

- API đọc tổng hợp `production_log`, `slot_event`, bằng chứng `Accepted`, `alert`.
- Web dùng chung `web/src/features/timeline/` tại OperatorBatchDetail, chi tiết lô khám phá và chi tiết danh mục của NĐT.
- Mobile dùng `timeline_models.dart`, `timeline_repository.dart`, `batch_timeline.dart`, `timeline_entry.dart`, `timeline_media.dart` tại chi tiết lô và chi tiết danh mục.
- Giao diện tiếng Việt: nhóm theo ngày, biểu tượng từng loại, chỉ số có đơn vị, hộp nguồn → đích, mức độ/trạng thái cảnh báo, ảnh riêng tư có phóng to, loading/empty/error/403, làm mới và tải ngày trước.
- Không thêm nghiệp vụ ghi hoặc lợi suất. Không thêm migration/index.

## Quyền và file

Tài khoản phải Active; vai trò phải còn trong DB và token. NĐT có Contribution Confirmed **hoặc** CapitalShare đúng lô mới được xem. Reserved/Expired/Refunded riêng lẻ không cấp quyền. OperatorMember phải là Owner/Staff thuộc operator sở hữu lô; claim operator nếu có phải khớp. PlatformAdmin được xem theo vai trò hiện hành.

Kiểm tra quyền trước truy vấn nội dung. Không đăng nhập: 401; không có quan hệ hợp lệ: 403; không tìm thấy lô: 404. File kiểm tra lại quyền và Accepted mỗi lần đọc, ràng buộc cả batch và evidence ID; trả no-store, nosniff. Không trả URI kho lưu trữ, actor, reviewer hoặc ghi chú xử lý nội bộ.

Web lấy blob qua Axios có token, hủy request và revoke URL khi bỏ component. Mobile lấy bytes ảnh qua Dio. Đổi phiên/lô hoặc refresh xóa state; lỗi quyền xóa mục cũ. Dialog ảnh mobile vô hiệu hóa khi widget nguồn bị bỏ, phiên đổi hoặc refresh.

## Contract / Bruno

GET `{{baseUrl}}/api/batches/{{batchCode}}/timeline?days=7`

Header: `Authorization: Bearer {{token}}`. Không có request body.

`days` mặc định 7, hợp lệ 1–30: số **ngày có dữ liệu**, không phải số mục. Trang tiếp theo: `?days=7&before=2026-10-20` với before lấy nguyên từ `nextBefore`. Before exclusive. Trang cuối: hasMore=false, nextBefore=null. Rỗng: groups=[].

Ví dụ response (dữ liệu minh họa, không phải seed production):

```json
{
  "batchCode": "CS59", "timeZone": "Asia/Ho_Chi_Minh",
  "groups": [{"date": "2026-10-20", "items": [
    {"id":"Alert:4","type":"Alert","sourceId":"4","businessDate":"2026-10-20","occurredAt":"2026-10-20T01:30:00Z","timeBasis":"Raised","productionLog":null,"slotEvent":null,"evidence":null,"alert":{"type":"WaterQuality","severity":"Medium","message":"Kiểm tra nước","status":"Acknowledged","acknowledgedAt":"2026-10-20T02:00:00Z","escalatedAt":null}},
    {"id":"Evidence:3","type":"Evidence","sourceId":"3","businessDate":"2026-10-20","occurredAt":"2026-10-20T01:30:00Z","timeBasis":"Capture","productionLog":null,"slotEvent":null,"evidence":{"mediaType":"Photo","source":"InAppCapture","slotCode":"002","reviewStatus":"Accepted","fileUrl":"/api/batches/CS59/timeline/evidence/3/file"},"alert":null},
    {"id":"SlotEvent:2","type":"SlotEvent","sourceId":"2","businessDate":"2026-10-20","occurredAt":"2026-10-20T01:30:00Z","timeBasis":"Occurred","productionLog":null,"slotEvent":{"eventType":"Relocated","slotCode":"001","destinationSlotCode":"002","quantity":1,"note":null},"evidence":null,"alert":null},
    {"id":"ProductionLog:1","type":"ProductionLog","sourceId":"1","businessDate":"2026-10-20","occurredAt":null,"timeBasis":"Date","productionLog":{"ph":7.5,"waterTempC":28,"salinityPpt":20,"feedKg":1.25,"source":"Manual","plausibilityFlag":"Ok","note":"Kiểm tra nước"},"slotEvent":null,"evidence":null,"alert":null}
  ]}], "nextBefore":"2026-10-20", "hasMore":true
}
```

File: GET `{{baseUrl}}/api/batches/{{batchCode}}/timeline/evidence/{{evidenceId}}/file` cùng Bearer token. Photo trả image; file khác trả attachment octet-stream với tên an toàn. ID nguồn là chuỗi để tránh mất chính xác bigint trên client.

## Thời gian và truy vấn

| Nguồn | Thời gian |
|---|---|
| Nhật ký | log_date; occurredAt=null, timeBasis=Date; không dựng giờ giả |
| Sự kiện hộp | occurred_at; Occurred |
| Bằng chứng | captured_at; Capture; thiếu thì received_at, Received |
| Cảnh báo | raised_at; Raised |

Ngày nghiệp vụ UTC+7. Ngày giảm dần, trong ngày timestamp giảm dần (mục chỉ có ngày ở cuối), sau đó type ordinal tăng dần, numeric source ID giảm dần. SQL UNION chọn tối đa days+1 ngày trước; bốn projection chỉ lấy khoảng ngày được chọn, không nạp toàn bộ lịch sử vào bộ nhớ. Sự kiện lấy từ slot_event một lần, không cộng thêm lịch sử cua. Không N+1; quan hệ hộp đích nằm trong query projection.

Dùng index hiện hữu theo batch/date của nhật ký và sự kiện, theo batch của evidence, batch/status của alert. Chưa đo execution plan/throughput trên dữ liệu lớn. Một ngày rất nhiều mục vẫn được trả nguyên ngày. Cursor không phải snapshot: dữ liệu thêm lùi ngày cần refresh để thấy nhất quán.

## Xác minh

- `dotnet test backend/CrabShare.sln --no-restore --logger 'trx;LogFileName=cs59.trx' --verbosity quiet`: API 937 đạt / 31 lỗi / 968 ca. 23 lỗi BatchesTests/BatchReviewTests báo thiếu offtake price; 8 AdminAccountDatabaseTests timeout SQL.
- Xuất HEAD bằng git archive ra thư mục tạm, chạy filter BatchesTests/BatchReviewTests: 31 đạt / 23 lỗi. So sánh tên test thất bại trong TRX: trùng hoàn toàn 23 ca của nhánh làm việc, xác nhận baseline. Không sửa các nghiệp vụ ngoài phạm vi.
- Chạy lại `ProductionLogTests.Timeline_` và `AdminAccountDatabaseTests` bằng filter: **21/21 đạt**, gồm 13 ca mới timeline; 8 timeout không tái hiện trong lượt tập trung.
- `npm run build`: đạt sau tích hợp portfolio.
- PowerShell `$env:CI='1'; npx playwright test tests/timeline.spec.ts`: **3/3 đạt**. Kiểm tra payload/đơn vị, ảnh qua token+blob, dialog, tải thêm/refresh, 403 xóa dữ liệu, empty, viewport 1440/390/320 không tràn ngang. Mặc định cấu hình chọn Chrome không có trên máy; CI dùng Chromium đã cài.
- Chạy toàn bộ Playwright: 133 đạt, 2 skipped, 5 lỗi do fixture slot-events chưa mock endpoint timeline mới, dẫn đến hai role=alert. Đã thêm mock empty timeline vào fixture và kiểm tra tích hợp trang danh mục. Chạy lại `tests/slot-events.spec.ts tests/portfolio.spec.ts tests/timeline.spec.ts`: **21/21 đạt**. Không chạy lại toàn bộ 140 ca sau sửa fixture.
- `flutter analyze` và `flutter test`: không chạy được vì không có executable Flutter. Có test repository/model và regression widget cho việc đóng ảnh khi mất widget nguồn; chưa xác minh chúng chạy được.
- Review độc lập phát hiện dialog mobile giữ ảnh sau khi widget nguồn bị bỏ; đã thêm lifetime notifier và thông báo sau frame để tránh setState trong dispose. Cần chạy regression Flutter khi SDK sẵn sàng.
- Review lại tĩnh sau sửa: không phát hiện compile blocker hoặc notifier bị dùng sau dispose; không thay thế Flutter analyze/test.
- `git diff --check`: đạt. Log cục bộ lưu trong `backend/tests/CrabShare.Api.Tests/TestResults/cs59-logs/` (gitignored).

## Demo

1. Đăng nhập NĐT có Contribution Confirmed hoặc CapitalShare, mở Danh mục → chi tiết lô → Nhật trình sản xuất. Cũng có ở chi tiết lô khám phá.
2. Đọc số đo và đơn vị, mở ảnh Accepted, xem hộp nguồn/đích, cảnh báo và thời điểm phản hồi.
3. Tải ngày trước, refresh; kiểm tra cùng dữ liệu không bị nhân đôi. Thử màn hình 390px.
4. Đăng nhập NĐT không góp lô, gọi API cùng mã: 403; mở trang không lộ timeline cũ.
5. Hộ nuôi mở OperatorBatchDetail; operator khác gọi API bị 403.
6. Mobile: chi tiết lô/danh mục → Nhật trình, mở ảnh và phóng to; pull-to-refresh hoặc đổi phiên phải xóa ảnh cũ.

## Giới hạn còn lại

Mobile video/chứng từ mở trang web bảo vệ và yêu cầu đăng nhập cùng tài khoản; chưa có trình xem native. Flutter chưa được build/analyze/test. Chưa chạy kiểm thử race đổi account/batch trên thiết bị thật. Bộ backend toàn cục chưa xanh như số liệu trên; không đánh dấu sẵn sàng phát hành trước khi xử lý hoặc xác nhận baseline các lỗi đó.
