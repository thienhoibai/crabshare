# CS-59 / VI-11 — Timeline sản xuất

## Mục tiêu và phạm vi

NĐT theo dõi dữ liệu sản xuất thật của lô đã góp vốn; Operator và PlatformAdmin
xem theo quyền hiện hành. Web và mobile có trải nghiệm nhất quán, dễ đọc và
làm nổi bật bằng chứng. Chỉ đọc production_log, slot_event, evidence, alert.
Làm trên feature/CS-59-timeline-san-xuat; không commit/push/merge.

## Quyền

Kiểm tra tài khoản Active, role trong token và DB. Investor có Contribution
Confirmed hoặc CapitalShare của đúng batch (quy tắc ProductionLog/Alerts).
OperatorMember Owner/Staff có membership đúng Operator của batch và claim
operator_id nhất quán. PlatformAdmin có role hiện hành. Kiểm tra trước truy vấn
nội dung. Chưa đăng nhập 401; batch không tồn tại 404; không có quyền 403.
API chi tiết lô công bố giữ nguyên.

## Contract

GET /api/batches/{code}/timeline?days=7&before=2026-10-20

days mặc định 7, miền 1–30; before là ngày ISO loại trừ, không có nghĩa lấy
một khoảng ngày liên tục. Chọn tối đa days ngày CÓ dữ liệu sau hợp nhất bốn
nguồn tại DB, lấy thêm một ngày để biết hasMore. Đọc trọn các ngày đã chọn,
không giới hạn số mục trong một ngày. nextBefore là ngày cuối trang khi còn
dữ liệu, null ở cuối. Refresh bắt đầu lại từ trang đầu. Đây là live cursor,
không phải snapshot: bản ghi bổ sung vào ngày đã xem xuất hiện khi refresh.

Response: {batchCode,timeZone:"Asia/Ho_Chi_Minh",groups:[{date,items:[]}],
nextBefore,hasMore}. Item: {id,type,sourceId,businessDate,occurredAt,
timeBasis,productionLog,slotEvent,evidence,alert}. Đúng một payload khác null.
ID type:sourceId; sourceId là chuỗi để giữ chính xác SQL bigint.

## Thời gian và thứ tự

Nhóm ngày UTC+7. ProductionLog dùng LogDate và occurredAt=null, timeBasis=Date.
SlotEvent dùng OccurredAt; Evidence CapturedAt hoặc ReceivedAt (timeBasis cho
biết Capture/Received); Alert RaisedAt. Ngày giảm dần; trong ngày mục có giờ
giảm dần, nhật ký chỉ có ngày ở cuối; trùng giờ dùng type rồi sourceId số giảm
dần. Không tạo mục từ crab_item_event.

## Payload và file

Nhật ký có pH, °C, ppt, kg, nguồn, cờ đánh giá và ghi chú; không đưa người ghi.
SlotEvent có loại, số lượng, hộp nguồn/đích, ghi chú; không đưa actor/request hash.
Evidence chỉ Accepted, metadata nguồn/loại/hộp và URL API được bảo vệ.
Alert dùng phạm vi của ListInvestorAsync: cảnh báo đúng lô; type, severity,
message, status, raisedAt, acknowledgedAt, escalatedAt; không có actor,
resolution note, audit hoặc nội dung thẩm định.

GET /api/batches/{code}/timeline/evidence/{id}/file kiểm tra lại quyền và Accepted,
đọc IFileStorage; ảnh dùng EvidenceImageReader hiện có. Nội dung loại file khác
chỉ được tải dưới attachment với MIME an toàn; không redirect URI trong DB.
No-store và nosniff; không trả FileUri/storage key/GPS/hash/risk/reviewer.

## Truy vấn

Hợp nhất ngày trong SQL; lọc batch và before ở từng nhánh. Fetch payload bằng
projection trong khoảng các ngày đã chọn. Không đọc toàn bộ lịch sử về app,
không N+1, không ghi dữ liệu nguồn. Giữ các index hiện có, chỉ bổ sung khi có
bằng chứng truy vấn cần cải thiện; không sửa migration cũ.

## Trải nghiệm

Một vùng "Nhật trình sản xuất" với phần giới thiệu ngắn, múi giờ, nút làm mới.
Đường timeline dọc, ngày tách rõ; nhãn/icon riêng cho bốn loại.
Nhật ký có lưới số đo; ảnh bằng chứng giữ tỉ lệ, xem lớn khi bấm;
sự kiện chuyển hộp hiển thị nguồn → đích; cảnh báo có mức độ và trạng thái.
Không suy diễn sức khỏe hay lợi nhuận từ dữ liệu thiếu.

Dùng màu/chữ/spacing hiện có; giao diện thoáng trên desktop và điện thoại,
focus bàn phím, trạng thái loading/empty/error/403 rõ ràng, giảm chuyển động.
Tải thêm nhóm ngày, khóa thao tác đang chạy, không nhân đôi. Đổi lô/tài khoản
hoặc mất quyền phải xóa nội dung cũ và thu hồi URL ảnh.
Web chia sẻ component ở hai trang chi tiết; mobile repository riêng theo
pattern hiện hành, nhóm ngày và payload cùng contract.

## Xác minh

HTTP/SQL Server tests: quyền hiện hành, cả bốn nguồn, Accepted-only, file riêng tư,
ngày UTC+7, nhật ký không giờ, thứ tự ổn định, phân trang trọn ngày/empty/end,
không rò lô khác và trạng thái khoản góp không hợp lệ.
Playwright: rendering/units/images, load more, refresh, đổi lô, 403, phone.
Flutter repository/widget tests cùng các trạng thái. Chạy dotnet test,
npm run build, Playwright, flutter analyze/test; báo giới hạn môi trường thực tế.
