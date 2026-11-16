# VI-09 Công cụ ghi nhận sự kiện hộp

## Ý định và nguồn quy tắc

Người dùng yêu cầu triển khai ngay trên nhánh hiện tại, không đổi nhánh, commit, push hay merge. Cập nhật sau cùng: CrabShare là công cụ cho trại; không áp đặt đánh giá sinh học về cua chết. Hạn thả bù và cảnh báo do Owner của trại cấu hình. Ảnh chết/thả bù bắt buộc chụp trực tiếp bằng app mobile, tận dụng camera/GPS và EvidenceService hiện có. Không kiểm tra hoặc điều chỉnh tài chính trong VI-09.

TL-21/TL-22 là tài liệu tham khảo; các con số 5%, 20%, 30%, 7/14 ngày không trở thành mặc định của sản phẩm. Thay đổi này tuân theo chỉ dẫn trực tiếp của người dùng. Thả bù cùng hộp có cua chết theo luồng TL-21; phải chỉ rõ cá thể được thay thế, không chọn tùy tiện lịch sử.

## Quy tắc dữ liệu

Owner/Staff của Operator Approved ghi Molted, Mortality, Restocked, Relocated cho Stocked/InProduction/Harvesting khi còn cua Growing. Cua hiện tại là Growing trong allocation đang mở của đúng hộp/lô. quantity = 1. Molted giữ Growing và chiếm hộp; Mortality đổi Dead, đóng allocation, giải phóng hộp; Restocked tạo cua mới và allocation mới; Relocated giữ ID cua, đóng allocation nguồn rồi chuyển sang allocation mới. Không tự quyết định nghiệp vụ thu hoạch hay đóng lô.

occurredAt bắt buộc có offset, không tương lai, không trước stockedAt, allocation hiện tại hoặc sự kiện cuối của cá thể/hộp; kiểm tra cả lịch sử hộp đích. Thả bù kiểm tra cả thời điểm khai báo và giờ server với hạn theo ngày Việt Nam, cho phép hết ngày hạn. Không cho nhập lùi để né hạn. Mỗi request có requestId UUID; retry cùng payload trả cùng sự kiện, khác payload trả 409. Molted thật khác nhau dùng requestId khác nhau.

Phiên bản cấu hình bất biến gồm restockCutoffBasis (AfterStocking hoặc BeforeHarvest), restockCutoffDays do trại chọn; số ngày hiện có của batch chỉ là gợi ý, không ngầm kích hoạt một chính sách. Có thể đặt mortalityWindowHours, mortalityThresholdPercent, mortalitySeverity, mortalityAckWithinHours; cả bốn cùng có hoặc cùng null. Mẫu số công khai là số cua giống ban đầu seedQuantity, tử số là số Mortality trong cửa sổ tính đến giờ server. Chưa cấu hình ngưỡng thì vẫn ghi nhận, không tự phát cảnh báo. Owner thay đổi tạo phiên bản mới, không sửa đánh giá lịch sử. Dùng expectedVersionNo chặn ghi đè. Trại chọn được cả hai cách tính hạn thay vì phần mềm chọn hộ. BeforeHarvest lấy ngày thả giống Việt Nam + cycleDays làm ngày dự kiến để thời hạn luôn gắn chu kỳ đã khai. Giao diện trình bày công thức và ngày hạn.

Evidence Mortality/Restocked phải Photo/InAppCapture, đúng hộp/lô, có capturedAt/GPS, chưa gắn sự kiện khác, không Rejected và được chụp trong lượt sử dụng hộp liên quan; ảnh thả bù phải sau sự kiện chết. Không bắt chờ thẩm định Accepted mới ghi nhận. Mở rộng upload evidence tối thiểu bằng slotEventType=Restocked để nhận ảnh hộp Available đã có cua Dead chưa thay của lô; giữ nguyên giới hạn kênh chụp thường. Web chọn ảnh đã chụp từ app, không nhập ID thủ công hoặc chọn file.

## Contract chung

- GET /api/batches/{code}/slot-event-policy -> { batchCode, canConfigure, current: Policy|null, restockDeadline: yyyy-MM-dd|null, suggestedRestockCutoffDays, businessDate }
- PUT cùng URL: { expectedVersionNo, restockCutoffBasis, restockCutoffDays, mortalityWindowHours:null|number, mortalityThresholdPercent:null|number, mortalitySeverity:null|string, mortalityAckWithinHours:null|number }. Policy trả {id,versionNo,...request fields trừ expectedVersionNo,createdBy,createdAt}.
- GET /api/batches/{code}/slot-event-context?slotCode=... -> { batchCode, slotCode, status, currentCrab: {id,itemUuid,status}|null, replacementCandidates:[{id,itemUuid,diedAt}], availableEvidence:[{id,capturedAt,reviewStatus}], restockDeadline:null|string, canRecord, aliveCount }. slotCode phải đúng hộ nuôi; danh sách replacement chỉ cùng lô và hộp, Dead và chưa được thay.
- GET /api/batches/{code}/slot-events?page=1&pageSize=10 -> phân trang chuẩn; items Event.
- POST /api/batches/{code}/slot-events -> 201 Event. Request { requestId, slotCode, eventType, occurredAt, quantity:1, note?, destinationSlotCode?, replacesCrabItemId?, evidenceId? }. Hai trường cuối bắt buộc cho Restocked, evidenceId bắt buộc cho Mortality. destinationSlotCode bắt buộc cho Relocated. Trường không liên quan phải null/không gửi.
- Event { id,batchCode,slotCode,eventType,occurredAt,quantity,note,crabItemId,itemUuid,destinationSlotCode:null|string,replacesCrabItemId:null|number,evidenceId:null|number,actorId:null|number,aliveCount }. Với lịch sử cũ (Stocked/Harvested cũng xuất hiện trong GET), crabItemId/itemUuid/actorId/aliveCount có thể null khi không có liên kết cá thể hoặc snapshot tại lúc ghi. Không dựng số 0 hay dùng số hiện tại làm số lịch sử. POST mới luôn có cá thể và aliveCount thật.
- Hộp đích dùng GET /api/boxes?status=Available&search=... phân trang; không mock.
- POST /api/evidence thêm multipart slotEventType tùy chọn, giá trị Restocked cho chụp ảnh cua bù vào hộp đã được giải phóng. API mobile vẫn truyền ảnh camera; không bổ sung chọn thư viện.

## Database và concurrency

Migration V015: bảng phiên bản policy, bảng chi tiết sự kiện liên kết crab/actor/requestId/destination allocation/policy; thêm Molted và Relocated vào CHECK crab_item_event; unique replaces_crab_item_id chỉ khi khác null. Dữ liệu trùng cũ khiến migration dừng kèm thông báo, không xóa dữ liệu. ux_slot_active và ux_crab_item_growing_slot giữ nguyên. Không sửa migration đã áp dụng. Entity/mapping mới ở partial riêng, không sửa generated files.

Transaction Serializable, thứ tự khóa audit -> Operator -> batch -> hộp theo thứ tự ID; trạng thái hộp claim bằng update có điều kiện; AlertService cùng transaction. SlotEvent nguồn + detail đích giữ lịch sử chuyển, CrabItemEvent.ActorId/evidenceId giữ người và bằng chứng. Lỗi unique/deadlock/concurrency đổi 409 không lộ SQL. View reconciliation giữ nguyên: stocked_total đã bao gồm restocked; stocked_total - dead - harvested = growing; harvested đã gồm cả cua mất sau thu hoạch (Lost), không trừ Lost lần nữa và không cộng restocked hai lần.

## Giao diện và kiểm chứng

Cập nhật phạm vi lưu trữ theo yêu cầu tiếp theo: nối Cloudinary cho ảnh mới bằng authenticated upload và signed download nội bộ qua IFileStorage; cấu hình riêng trong User Secrets, không commit thông tin kết nối. Đọc ảnh local cũ vẫn được hỗ trợ. Không đổi các thiết lập Security của tài khoản khi chưa cần, vì kiểm tra upload/download thật đã qua. Xem docs/cloudinary.md.

Web OperatorBatchDetail có Sự kiện hộp, cấu hình Owner riêng, chọn hộp thật, hiện cua/trạng thái/hạn và ảnh từ app; form theo loại, xác nhận trước submit, disable đang gửi, lỗi 422/409/403, refresh batch/count/boxes/history/alerts. Mobile đi từ thẻ Hôm nay đúng batchCode, màn mới, camera cho chết/thả bù, API repository thật, cùng validation và refresh. Không yêu cầu màn cấu hình Owner mobile: hiển thị cấu hình do trại đã đặt trên web.

Kiểm tra HTTP/LocalDB: bốn sự kiện, lịch sử, quantity, quyền/lô/trạng thái, biên ngày, retry, cùng cua/hộp đích/replacement đồng thời, rollback lỗi giữa chừng (kể cả alert), reconciliation sau chuỗi. Web Playwright form, policy, 422, refresh. Mobile thêm smoke, repository/widget tests; chạy nếu có SDK, báo chính xác khi thiếu. Baseline trước sửa: 153 VI07/08 tests qua, web build qua, flutter chưa nằm PATH.
