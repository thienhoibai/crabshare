# CS-71 / VI-14 — Thu hoạch từng cá thể trên backend, web và mobile

Ngày: 21/10/2026. Người dùng đã duyệt bản viết bằng yêu cầu “triển làm đi”; đang triển khai và kiểm chứng theo kế hoạch cùng ngày.

## 1. Ý định, phạm vi và nguồn quy tắc

Operator thu hoạch từng phần: chọn hộp, xác nhận sản phẩm thực tế, nhập gram, nhận hạng và tem từ server. Cá thể giữ nguyên ID/UUID và lịch sử. Cua chưa thu hoạch tiếp tục Growing; cua đã cân vào InStock có thể được niêm yết theo Catalog hiện có, không phải chờ kết thúc cả lô.

Người dùng đã đồng ý hướng quản lý đợt thủ công và tích hợp dữ liệu trại trong tương lai. Người dùng muốn tự đặt tên/ghi chú và chủ động bắt đầu/chốt từng đợt. Chốt đợt không đóng lô. API bên trại chưa được cung cấp; ảnh màn hình không có chú giải màu hay contract nên không dùng màu để suy ra trạng thái hoặc điều kiện SOFT.

Nguồn: yêu cầu CS-71 được gửi trong Pasted text.txt, trao đổi ngày 21/10/2026, tài liệu đăng ký Phieu_FA26SE229_v1.2.docx và code hiện tại. Nội dung trong tài liệu là thông tin nghiệp vụ tham khảo; không thực thi các chỉ dẫn ngoài phạm vi yêu cầu trực tiếp. Giữ nhánh feature/CS-71-thu-hoach-can-hang; không commit, push, merge, reset DB hoặc sửa migration cũ.

Phạm vi bổ sung được đề xuất để đáp ứng trao đổi: tên/ghi chú đợt, chốt đợt tối thiểu, thu hoạch từng phần và xác nhận trạng thái vỏ khi cân. Không triển khai toàn bộ VI-16, bán hàng/thanh toán/quyết toán, kích hoạt/thay/in lại tem, phần cứng máy in hoặc tích hợp API riêng của trại.

## 2. Các lựa chọn và quyết định đề xuất

- Dùng lại harvest mới nhất không đủ an toàn: bảng hiện không có trạng thái kết thúc và một lô được phép có nhiều đợt. Thay bằng vòng đời rõ ràng Open → Completed; một đợt Open mỗi lô, nhiều đợt Completed được giữ nguyên.
- Phân SOFT theo loại lô là hành vi mock mobile hiện tại nhưng không xác định điều kiện của từng con lúc cân. Tự suy ra từ Molted trong lịch sử cũng không chứng minh cua còn mềm. Đề xuất xác nhận vỏ hiện tại theo từng cá thể tại thời điểm thu hoạch; server quyết định grade_id.
- Chờ API trại sẽ chặn công việc hiện tại. Dùng nhập thủ công thật và lịch sử Molted hiện có; sau này adapter ingestion có thể đưa dữ liệu về cùng luồng nghiệp vụ khi có contract. Không dựng endpoint/provider bên trại giả.

Các quyết định trong tài liệu, gồm phần mở rộng request xác nhận vỏ, đã được người dùng duyệt sau khi bản viết được trình bày. Contract thực tế và kết quả kiểm chứng được ghi trong tài liệu bàn giao.

## 3. Phân quyền và vòng đời

Kiểm tra JWT OperatorMember cùng membership, vai trò DB, user Active, Operator Approved và claim operator_id hiện tại; không chỉ tin token cũ. Owner tạo đợt mới, sửa tên/ghi chú và chốt đợt. Owner/Staff xem, tiếp tục và ghi từng con vào đợt Open thuộc Operator mình.

Lô InProduction được mở đợt đầu tiên và chuyển Harvesting. Lô Harvesting được tiếp tục đợt Open hoặc mở đợt mới khi đợt trước Completed. Không chuyển ngược lô về InProduction; nhật ký và sự kiện hộp hiện đã hỗ trợ Harvesting khi còn Growing. Chặn bắt đầu/ghi/chốt mới ở trạng thái lô khác.

Start khóa lô, tìm đợt Open và trả lại nếu đã có; không thay tên/ghi chú của đợt đang mở từ một lần bấm Start lặp. Khi chưa có Open, tạo một đợt mới, tổng con và tổng kg bằng 0. Owner có thể chốt cả đợt rỗng; kết quả 0 con được ghi đúng, không xóa đợt để che lịch sử. Chốt lặp trả lại cùng kết quả, không thêm audit hay cộng tồn lần hai. Không mở lại Completed; tạo đợt tiếp theo khi cần cân tiếp.

Tên đợt tùy chọn tối đa 100 ký tự, ghi chú tối đa 300 ký tự, trim khoảng trắng. Nếu không nhập tên, UI hiển thị “Đợt #<id>”; không tự đặt lịch, hạn hoặc ngày kết thúc. Metadata chỉ sửa khi Open, có revision chống ghi đè và audit. Server giữ các trạng thái kỹ thuật cố định; người dùng tùy chỉnh thông tin và thời điểm thao tác.

## 4. Quy tắc cân và SOFT

weightG phải là số nguyên JSON từ 1 đến 32767, theo SMALLINT hiện có. Số thập phân, chuỗi, 0, âm, null, thiếu trường và vượt kiểu bị 400; không ép kiểu hay làm tròn ngầm. Tổng kg dùng decimal, cộng weightG / 1000m và lưu DECIMAL(12,3).

Mỗi lần cân cần shellCondition: HardShell hoặc SoftShell. Đây là xác nhận quan sát lúc thu hoạch của Operator, không phải gradeCode/gradeId do client chọn. Trường bắt buộc, không tự lấy từ crab_type hoặc một lần Molted trong quá khứ. Lô cua lột vẫn phải xác nhận; cua của lô khác có thể được xác nhận SoftShell theo thực tế. Đây là lựa chọn sản phẩm cần người dùng duyệt, không được suy diễn thành quy định đã có.

HardShell: đọc L1–L4 trong product_grade; min/max bao gồm hai đầu, null là không có cận. Với dữ liệu V002 và miền gram nguyên: L4 = 1–249; L3 = 250–349; L2 = 350–499; L1 = 500–32767. Kiểm tra cấu hình sau khi sắp cận: đủ các mã cần dùng, không đảo cận, không chồng lấn, phủ liên tục miền gram hợp lệ. Khoảng kế tiếp bắt đầu tại max trước + 1. Không dùng thứ tự trả về của DB hoặc fallback sang SOFT.

SoftShell: lấy đúng dòng SOFT từ product_grade. Cấu hình hiện tại có min/max null; nếu cấu hình thay đổi có cận thì phải khớp trọng lượng. Thiếu SOFT, cấu hình không hợp lệ hoặc không có hạng phù hợp trả 422, không ghi một phần. L1–L4 là tập phân cỡ HardShell; SOFT là tập sản phẩm SoftShell riêng, không bị coi là khoảng cân nặng chồng lên L1–L4.

Không tự đặt thời hạn sau lột, không yêu cầu Molted trước đó khi chưa có quy tắc này và không tự tạo một sự kiện lột để hợp thức hóa lần cân. Ghi xác nhận vỏ vào lịch sử/audit lần thu hoạch. Trên web/mobile, bỏ gradeFor và mọi dự đoán hạng từ cân nặng; hiển thị hạng server trả sau khi lưu.

## 5. Contract HTTP và khả năng gửi lại

API dùng JSON camelCase, response trực tiếp hoặc PagedResult và ProblemDetails theo conventions.md. Trường gradeId, gradeCode và status không thuộc DTO ghi nhận và không quyết định dữ liệu lưu.

### Đọc dữ liệu

- GET /api/batches/{code}/harvests?page=1&pageSize=20: PagedResult các đợt; mỗi item có thông tin đợt và quyền canRecord/canComplete hiện tại. Quyền canStart cấp lô được trả trong context ở endpoint tiếp theo.
- GET /api/batches/{code}/harvest-context?slotCode=...: batchCode, batchStatus, activeHarvest nullable, canStart, canRecord, canComplete, remainingGrowingCount, harvestedCount, totalWeightKg; khi có slotCode, thêm slotStatus, currentCrab {id,itemUuid,allocationId} nullable và latestMoltedAt nullable. latestMoltedAt tìm theo crab_item_event/slot_event_detail của đúng cá thể, không theo mọi cua từng ở hộp.
- GET /api/harvests/{id}: thông tin đợt, revision, tổng hợp và quyền hiện tại.
- GET /api/harvests/{id}/crabs?page=1&pageSize=20: các cá thể đã ghi, thông tin hộp lịch sử, trọng lượng, hạng và tem; có thể tải lại sau khi đóng màn hình.

Danh sách hộp dùng GET /api/boxes hiện có với status Occupied và lọc đúng batchCode. Server của POST vẫn xác thực lại allocation và cá thể. Không tải một trang rồi coi là toàn bộ dữ liệu.

### Tạo hoặc tiếp tục đợt

POST /api/batches/{code}/harvests, body:

```json
{"requestId":"618af0b2-a2eb-4b07-9e5f-b349ba8fd129","name":"Thu hoạch sáng 21/10","note":"Khu A"}
```

Trả 201 khi tạo, 200 khi tiếp tục hoặc replay. Response: {id,batchCode,name,note,status,startedAt,completedAt,declaredBy,completedBy,harvestedCount,totalWeightKg,revision,canRecord,canComplete}. Start lần đầu đặt batch.harvest_started_at; những đợt sau không thay mốc đầu tiên.

requestId UUID khác rỗng là định danh lần bấm Start. Lưu mọi lần Start thành công trong harvest_start_request, kể cả khi kết quả là tiếp tục Open. Cùng requestId/actor/payload trả đúng đợt đã liên kết kể cả sau khi đợt đã chốt; payload/actor khác bị 409. Start bằng requestId mới khi đã có Open chỉ tiếp tục Open; không tạo thêm đợt. Ghi liên kết request và tạo/tiếp tục đợt trong cùng transaction; một lần retry sau complete không được tự mở đợt mới.

### Sửa thông tin đợt

PATCH /api/harvests/{id}, body {expectedRevision,name,note}. Owner, Open, đúng revision. Tăng revision và audit. Không cho sửa tổng cân, thời điểm bắt đầu/kết thúc hoặc trạng thái bằng PATCH này.

### Ghi từng con

POST /api/harvests/{id}/crabs, body:

```json
{"requestId":"cda874e7-9fa5-405e-b581-ceae1f0aeb81","slotCode":"0006","expectedCrabItemId":123,"weightG":250,"shellCondition":"SoftShell"}
```

Hai trường slotCode/weightG của task gốc được giữ. Bổ sung shellCondition để xác nhận sản phẩm, expectedCrabItemId để chặn hộp đã đổi cá thể và requestId để gửi lại an toàn. Client giữ nguyên requestId và payload sau lỗi mạng, không tạo UUID mới trước khi biết kết quả yêu cầu cũ.

Trả 201 khi ghi mới, 200 khi replay cùng actor/payload. Response gồm {crabItemId,itemUuid,harvestId,batchCode,slotCode,weightG,shellCondition,gradeCode,gradeName,tagCode,tagStatus,tracePath,recordedAt,harvestedCount,totalWeightKg,remainingGrowingCount}. tracePath là /truy-xuat/{tagCode}, không tuyên bố API truy xuất/kích hoạt đã được triển khai.

Replay được kiểm tra sau xác thực quyền nhưng trước điều kiện Open/hộp hiện tại: một yêu cầu đã thành công vẫn trả đúng cá thể cũ nếu đợt đã chốt, hộp đã tái sử dụng hoặc cua đã được đóng hàng. Dữ liệu lần ghi được trả từ lịch sử; không lấy trạng thái hiện tại làm snapshot lúc thu hoạch. requestId dùng lại với nội dung khác hoặc actor khác bị 409. Một requestId mới nhắm cá thể đã thu hoạch bị 409, không tạo tem thứ hai.

### Chốt đợt tối thiểu

POST /api/harvests/{id}/complete, body {expectedRevision}. Owner chốt Open, lưu Completed/completedAt/completedBy và tăng revision trong transaction. Chốt lặp cùng đợt Completed trả kết quả đã lưu. Response như GET đợt. Không chuyển lô sang Settlement, không tự chốt cả lô và không cộng dồn tồn Catalog từ tổng đợt. VI-16 có thể mở rộng endpoint này sau mà không thay nghĩa trạng thái đã chốt.

Lỗi: 400 dữ liệu DTO; 401 chưa đăng nhập; 403 sai quyền; 404 không tồn tại; 409 request_reused, crab_changed, already_harvested, harvest_changed hoặc concurrent_change; 422 invalid_state, invalid_grade_configuration, grade_not_found và reconciliation_failed. Không lộ SQL.

## 6. Transaction và lịch sử

Dùng db.InTransactionAsync với Serializable và thứ tự khóa audit → Operator → batch → harvest → physical_slot theo ID. Cùng nguyên tắc quyền và khóa của StockingService/SlotEventService. Bắt unique/deadlock/lock timeout/concurrency theo convention; xóa tracking khi thất bại. Retry va chạm tem chỉ áp dụng đúng unique tag_code; các lỗi unique khác không được coi nhầm là va chạm ngẫu nhiên.

Trong một transaction ghi nhận:

1. Kiểm tra quyền hiện tại, đợt/lô và replay.
2. Khóa đúng hộp của Operator. Tìm allocation released_at null của đúng lô, xác nhận hộp Occupied và đúng một cá thể Growing. So ID với expectedCrabItemId. Chặn Dead, InStock, Packed, Sold, Lost và mọi cá thể đã có harvest_id.
3. Đọc cấu hình và xác định hạng; xác nhận giờ server không trước stockedAt/allocation hoặc sự kiện đã ghi.
4. Cập nhật có điều kiện cá thể hiện có sang InStock, weight_g, grade_id, harvest_id và updated_at; không đổi ID/UUID hay tạo crab_item mới.
5. Tạo đúng một tem Printed, cập nhật tổng con/tổng kg đợt, đóng allocation hiện tại và giải phóng hộp bằng update có điều kiện.
6. Ghi SlotEvent Harvested trên allocation cũ, SlotEventDetail với actor/request/hash/crab và snapshot alive_count. Ghi CrabItemEvent Harvested và TagPrinted; lịch sử/audit lưu shellCondition, trọng lượng, hạng, tem, harvest và nguồn Manual.
7. Kiểm tra v_crab_count_reconciliation, ghi audit và commit. Bất kỳ lỗi nào rollback toàn bộ, kể cả lỗi tem, lịch sử hoặc audit.

SlotEventDetail hiện có tái sử dụng cho idempotency và liên kết cá thể. Bảng chi tiết harvest_record gắn một-một với slot_event_detail giữ snapshot kết quả lần cân: harvestId, crabItemId, tagId, slotCode, weightG, shellCondition, gradeCode/gradeName, tagCode, tagStatus lúc ghi, recordedAt, harvestedCount/totalWeightKg của đợt lúc ghi. remainingGrowingCount dùng snapshot alive_count trong SlotEventDetail; ID/UUID cá thể được giữ nguyên. Bảng này chỉ bổ sung chi tiết cho sự kiện Harvested, không thay thế luồng lịch sử hiện có. Snapshot bất biến và được ghi cùng transaction; replay lấy kết quả từ đây, không suy đoán các trường đã thay đổi của cá thể/tem/đợt. Đọc lịch sử mới dùng snapshot; lịch sử Legacy chỉ trả dữ liệu thật sẵn có và các trường chưa được ghi là null.

Tổng cá thể lịch sử giữ nguyên. Kiểm tra growing = stocked_total − dead − harvested và declared_harvested = tổng harvested_count. Không trừ Lost sau thu hoạch lần thứ hai. harvested_without_active_tag có thể tăng khi tem mới Printed; đây là chỉ số chờ kích hoạt, không được ép Active để làm số bằng 0.

## 7. Mã tem và ràng buộc DB

Sinh 12 ký tự bằng RandomNumberGenerator, alphabet 23456789ABCDEFGHJKMNPQRSTUVWXYZ: không có 0/O/1/I/L hoặc chữ thường. Generator injectable để test va chạm. Không dùng generator mã đơn vì có prefix/độ dài và alphabet khác.

Giữ uq_crab_tag_tag_code hiện có. Thêm unique filtered index trên crab_item_id WHERE status <> 'Void'. CHECK trạng thái hiện có chỉ cho Printed/Active/Void, nên index này bảo đảm không có hai tem Printed/Active cho cùng cá thể và vẫn cho phép task thay tem tương lai giữ lịch sử Void. Giữ index Active cũ để không gây thay đổi ngoài phạm vi; không dùng unique crab_item_id vĩnh viễn để chặn luồng thay tem ngoài phạm vi.

Nếu insert va chạm tag_code: rollback toàn bộ transaction, bỏ tracking, sinh mã mới và chạy lại nghiệp vụ tối đa 5 lần. Trước mỗi retry kiểm tra replay/quyền/cá thể dưới khóa; không tiếp tục ghi trong một transaction đã lỗi. Hết lần thử trả 409 harvest.tag_generation_conflict, không lộ SQL hoặc ghi dở dang.

## 8. Migration và dữ liệu cũ

Tạo V016__harvest_recording.sql nếu tại thời điểm triển khai V016 chưa tồn tại. Không sửa V001–V015. Mở rộng entity/mapping bằng partial riêng, không sửa generated files hoặc scaffold cả repo.

Bổ sung harvest: name nullable, lifecycle_status nullable (Open/Completed), completed_at/by nullable và revision_no dương. Unique filtered batch_id khi Open. CHECK bảo đảm Open chưa có completed_at/by; Completed phải có đủ hai trường, completed_at >= harvested_at; Legacy null không có metadata hoàn tất giả. FK completed_by đến app_user.

Tạo harvest_start_request: request_id UUID khác rỗng duy nhất, harvest_id/batch_id, actor_id, request_hash SHA-256 và created_at; FK liên kết harvest cùng lô và actor. Lưu mọi request Start đã thành công để replay ổn định cả khi tiếp tục một đợt do request khác tạo. Nội dung bản ghi chỉ thêm, không sửa/xóa.

Tạo harvest_record: slot_event_id PK/FK slot_event_detail, harvest_id/batch_id, crab_item_id, tag_id và các snapshot tại mục 6. FK cùng lô cho harvest/cá thể/sự kiện; unique crab_item_id và tag_id để mỗi cá thể chỉ có một lần ghi nhận thu hoạch. CHECK weightG/đơn vị/tổng, shellCondition thuộc HardShell/SoftShell, tagStatus snapshot Printed và tagCode mới có đúng 12 ký tự thuộc alphabet đã chọn. Trigger chặn sửa/xóa snapshot, như slot_event_detail. Không lưu requestId/hash lần hai vì đã có trong slot_event_detail.

Các harvest cũ có lifecycle_status null, hiển thị Legacy (Lịch sử chưa xác định), chỉ đọc qua module mới; không tự gán giờ chốt hoặc diễn giải là Open. Tổng cân/ID/FK cũ giữ nguyên. Không có writer Harvest thật trong nhánh hiện tại, nên không nhận ghi tiếp vào Legacy; người dùng mở đợt mới có quản lý vòng đời khi lô Harvesting còn Growing. Đây không phải tuyên bố đợt cũ đã được chốt.

Kiểm tra trước khi thêm constraint: nhiều tem Printed/Active cùng cá thể, dữ liệu FK hoặc tổng cân không hợp lệ. Gặp dữ liệu cũ bất tương thích với constraint được thêm phải dừng kèm lỗi rõ; không xóa/sửa/tạo giờ giả để vượt migration. Alphabet mới được kiểm tra tại generator/DTO nội bộ và CHECK snapshot harvest_record mới; không áp hồi tố để làm hỏng các tem demo/lịch sử đang lưu bằng alphabet khác. Không thay ngưỡng product_grade hay thêm deadline NH-15.

## 9. Catalog và NH-15

Thu hoạch từng con tạo tồn thật InStock. Chủ hộ dùng luồng Catalog hiện có để tạo/đăng niêm yết theo batch + grade khi lô Harvesting; không tự Published một listing, tự đổi giá hoặc bỏ qua tồn đang giữ cho đơn.

Khi listing đã tồn tại, UI cung cấp làm mới tồn bằng POST /api/listings/{id}/refresh-stock hiện có và làm mới options/listings sau cân. Việc tính lại tồn vẫn do Catalog chịu trách nhiệm; không cộng tổng đợt lần nữa khi complete. Nếu đồng bộ Catalog sau commit thất bại, báo “Đã lưu thu hoạch; chưa làm mới tồn niêm yết”, không gửi lại lần cân như một yêu cầu mới. Phần này không thay thiết kế chống oversell của Orders.

NH-15/CS-75 chưa có job mở cửa sổ hoặc chính sách duration. Start đợt đầu lưu batch.harvest_started_at đúng giờ server cùng transaction chuyển Harvesting; đây là mốc tích hợp bền cho NH-15. Giữ nguyên PendingHarvest/window fields hiện có; không báo cửa sổ đã mở, tự đặt expiresAt hoặc triển khai claim/cọc. Khả năng ưu tiên bao tiêu khi bán là phụ thuộc phải báo rõ, không được coi hoàn tất NH-15.

## 10. Web và mobile

Web OperatorHarvest: danh sách lô thật InProduction/Harvesting, các đợt và tổng hợp thật; form Owner tạo/sửa/chốt đợt, Staff tiếp tục Open; chọn/nhập hộp, tải context cá thể, nhập gram, xác nhận vỏ hiện tại rồi bấm ghi. Chỉ hiện grade sau response; hiển thị cua/hộp/trọng lượng/hạng/tem và đường dẫn truy xuất. Giữ component/style hiện có, loading/empty/error, disable đang gửi; không tự submit con tiếp theo. Thay nội dung demo đóng gói bằng liên kết đến màn đơn hiện có.

Mobile: repository thật cho start/context/history/record/complete/metadata; recordHarvestedCrab nhận harvestId, slotCode, expectedCrabItemId, weightG, shellCondition, requestId và trả model đầy đủ thay vì String. Dùng provider/refresh theo session, không để response của tài khoản cũ cập nhật màn mới. Chọn hộp thật của lô; cân tuần tự và hiển thị hạng/tem server. Bỏ mock harvest và camera activation giả; chức năng kích hoạt chưa có API không được hiện thành công.

Sau ghi thành công refresh context, lịch sử, batch counts, hộp và dữ liệu liên quan. Nếu response mất, giữ pending payload/requestId để retry chính xác. Đổi hộp/sửa payload sau yêu cầu không rõ kết quả phải tải lại kết quả/context trước, tránh ghi vào occupant mới. Reload màn vẫn đọc được lịch sử từ API.

## 11. Kiểm chứng và bàn giao

Backend HTTP/SQL thật theo fixture LocalDB hiện có: quyền/Operator/state, đợt đầu/tiếp tục/nhiều đợt, start đồng thời/replay sau complete, chốt và sửa metadata đồng thời, Legacy chỉ đọc; giữ ID cua; hộp/allocation/cua sai hoặc chết; trọng lượng kiểu/biên; mọi biên L1–L4 và xác nhận SoftShell trên các loại lô; Molted không tự đưa vào SOFT; cấu hình thiếu/chồng/khoảng hở; cùng cua hai request chỉ một lần ghi; stale occupant/replay sau đổi hộp; rollback lỗi tem/event/audit; tổng và reconciliation.

Test generator 1.000 mã đúng alphabet/độ dài/không trùng, cưỡng bức va chạm để kiểm tra retry và hết lần thử; insert SQL trực tiếp kiểm chứng unique mã và unique tem Printed/Active. Test complete không cộng tồn lần hai và không đóng batch; NH-15 timestamp không reset khi mở đợt sau.

Web Playwright theo hạ tầng sẵn có: start → chọn hộp → nhập gram/xác nhận vỏ → lưu → thấy hạng/tem; Staff, validation/409/403, gửi lặp, tải lại lịch sử, chốt/mở đợt tiếp và lỗi refresh Catalog sau thành công. Mobile repository/widget test cùng contract và retry/session; cập nhật smoke và loại test mock gradeFor khỏi luồng harvest.

Chạy dotnet test backend/CrabShare.sln; npm run build và Playwright liên quan trong web; flutter analyze và flutter test trong mobile. Flutter đã từng được tìm thấy tại C:/Users/ziend/AppData/Local/Temp/crabshare-flutter-sdk/bin/flutter.bat; phải kiểm tra lại trước khi dùng. Chưa có kết quả test sản phẩm cho CS-71 ở thời điểm viết thiết kế. Báo đúng lệnh/kết quả và đối chiếu baseline nếu có lỗi ngoài phạm vi.

Bàn giao docs/validation/CS-71-harvest.md: file thay đổi, JSON Bruno thực tế, quy tắc hạng/vỏ/đợt/tem, migration và cách áp dụng không reset, demo web/mobile, kết quả kiểm tra và phụ thuộc NH-15/API trại/kích hoạt tem. Giữ nguyên yêu cầu không commit/push/merge.

## 12. Trạng thái quy trình

- Đã khảo sát code, schema, luồng thả giống/sự kiện hộp/Catalog và UI hiện tại.
- Đã nhận đồng ý hướng thiết kế trong hội thoại.
- Đã viết bản thiết kế này và tự kiểm tra tính nhất quán.
- Người dùng đã duyệt bản viết và yêu cầu thực hiện trực tiếp.
- Kế hoạch tại ../plans/2026-10-21-harvest.md; đang thực hiện trên nhánh hiện tại. Kết quả xác minh thực tế được lưu trong ../../validation/CS-71-harvest.md.
