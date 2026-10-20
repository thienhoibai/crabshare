# Nhật ký ngày và ngưỡng do Operator cấu hình

## Mục tiêu và phạm vi

Hoàn thiện CS-48 / VI-08 trên nhánh feature/CS-48-nhat-ky-ngay: Operator nhập nhật ký thủ công trên web hoặc mobile; dữ liệu được lưu và hiển thị thống nhất; mỗi lô/ngày/nguồn chỉ có một bản ghi; số đo ngoài ngưỡng vẫn được lưu và sinh cảnh báo WaterQuality qua AlertService hiện có.

Người dùng đã xác nhận hướng sản phẩm: CrabShare cung cấp hệ thống cho bên nuôi tự đặt cấu hình. Không coi các ngưỡng dev trong appsettings.json hoặc mobile là tiêu chuẩn an toàn cho mọi lô.

Thiết kế đề xuất giữ bốn trường số hiện có: pH, nhiệt độ nước (°C), độ mặn (ppt), lượng thức ăn (kg), cùng ghi chú. Cấu hình ngưỡng áp dụng cho ba chỉ số nước. Thêm/bớt loại chỉ số động, cấu hình khẩu phần ăn, IoT, ingestion API, sự kiện từng hộp và chỉnh sửa/xóa nhật ký nằm ngoài phạm vi này.

## Các lựa chọn và phương án đề xuất

1. Cấu hình chung theo Operator: ít thao tác nhưng không thể hiện khác biệt loại cua/giai đoạn giữa các lô.
2. Cấu hình theo lô, có phiên bản: đáp ứng khác biệt vận hành; truy vết được cấu hình tại thời điểm đo. Đây là phương án đề xuất.
3. Bộ chỉ số động và mẫu quy trình tùy biến: mở rộng đáng kể schema, validation và giao diện; không cần cho VI-08 hiện tại.

## Quyền và vòng đời

- Owner hiện tại của Operator Approved được tạo phiên bản ngưỡng cho lô của mình ở trạng thái Draft, PendingApproval, Funding, Stocked, InProduction hoặc Harvesting.
- Staff được xem cấu hình và ghi nhật ký; không được đổi ngưỡng.
- Owner/Staff được ghi nhật ký khi lô InProduction hoặc Harvesting. Kiểm tra tài khoản Active, role và membership hiện hành trong DB; token có claim Operator khác bị từ chối.
- Investor có vốn Confirmed hoặc capital_share của lô và PlatformAdmin được đọc nhật ký cùng phiên bản ngưỡng đã áp dụng. Operator khác không được đọc hoặc ghi.
- Không cho cấu hình mới với lô Rejected, Cancelled, Settlement hoặc Closed trong phạm vi VI-08. Dữ liệu lịch sử vẫn đọc được.

Các lựa chọn trạng thái và quyền là quy ước triển khai VI-08; VI-07 xác nhận sau thả giống lô chuyển sang InProduction. Giữ Harvesting để tiếp tục chăm sóc khi thu hoạch từng phần.

## Cấu hình ngưỡng

Owner nhập đầy đủ phMin/phMax, waterTempMinC/waterTempMaxC, salinityMinPpt/salinityMaxPpt. Giao diện để trống ban đầu, không tự điền giá trị dev. Min và max là biên bao gồm: số đo bằng biên vẫn nằm trong ngưỡng.

Mỗi lần lưu tạo phiên bản mới bất biến với batchId, versionNo, sáu ngưỡng, createdBy và createdAt. Client gửi expectedVersionNo (0 khi chưa có cấu hình); backend trả 409 nếu phiên bản hiện tại đã thay đổi. Lưu lại cùng nội dung không tạo thêm phiên bản. Phiên bản mới chỉ áp dụng cho các nhật ký ghi sau đó.

Đề xuất yêu cầu Owner cấu hình trước nhật ký đầu tiên. Nếu chưa có cấu hình, API ghi trả 422 production.thresholds_required; web/mobile giải thích rõ và dẫn Owner đến form cấu hình. Staff được hướng dẫn liên hệ Owner. Không đánh dấu Ok khi chưa thực hiện được việc so sánh ngưỡng.

Validation tách biệt ngưỡng vận hành với miền dữ liệu: pH từ 0 đến 14; độ mặn và lượng thức ăn không âm; nhiệt độ nước không dưới -273,1 °C (giới hạn dữ liệu vật lý, không phải ngưỡng an toàn). Giá trị phải vừa kiểu DECIMAL của schema. pH/nhiệt độ/độ mặn tối đa một chữ số thập phân; thức ăn tối đa ba chữ số thập phân. Ngưỡng dùng cùng miền và độ chính xác của chỉ số tương ứng, min <= max. Các giới hạn miền dữ liệu này là đề xuất validation, không phải ngưỡng nuôi an toàn; không áp đặt quy trình nuôi.

## Ngày và nhật ký

Đề xuất chỉ ghi hôm nay theo ngày lịch Việt Nam UTC+7, lấy từ TimeProvider phía server. Không nhận ngày từ thiết bị, không mở chức năng nhập bù trong VI-08. Response cấu hình trả businessDate dạng yyyy-MM-dd để UI hiển thị; POST tự tính lại ngày tại thời điểm lưu, kể cả khi form mở qua nửa đêm.

POST nhận ph, waterTempC, salinityPpt, feedKg bắt buộc và note tùy chọn tối đa 500 ký tự. Không nhận source, recordedBy, plausibilityFlag hoặc phiên bản ngưỡng từ client. Server đặt source=Manual, người ghi từ ICurrentUser và thời điểm UTC từ TimeProvider.

Nhật ký tham chiếu phiên bản cấu hình hiện hành được chốt trong transaction. Response chứa thresholdVersion và thresholdsApplied để người đọc hiểu số đo được đánh giá theo cấu hình nào. Giao diện giữ nguyên số đo bất thường, hiển thị rõ ngày, nguồn, người ghi và trạng thái.

PlausibilityFlag=OutOfRange nếu bất kỳ chỉ số nước nào nằm ngoài ngưỡng của lô; các chỉ số nước trong ngưỡng thì Ok. Không suy diễn Inconsistent từ lượng thức ăn hoặc số cua vì chưa có công thức nghiệp vụ. Các bản ghi legacy có Inconsistent vẫn hiển thị đúng nhãn.

## API

- GET /api/batches/{code}/production-thresholds: cấu hình hiện tại hoặc trạng thái chưa cấu hình, businessDate, canConfigure và canRecord.
- PUT /api/batches/{code}/production-thresholds: Owner tạo phiên bản mới bằng expectedVersionNo cùng sáu ngưỡng. Trả phiên bản đã lưu; 409 khi cấu hình đổi đồng thời.
- POST /api/batches/{code}/production-logs: trả 201 và nhật ký đã lưu; 409 production.log_exists khi trùng Manual cùng ngày; 422 khi chưa cấu hình hoặc trạng thái lô không cho ghi.
- GET /api/batches/{code}/production-logs?from=&to=&page=&pageSize=: PagedResult theo convention hiện có; ngày lọc bao gồm hai biên; thứ tự logDate giảm dần, productionLogId giảm dần. from > to hoặc ngày/phân trang sai trả 400.
- GET /api/operators/me/production-logs?from=&to=&page=&pageSize=: cùng contract phân trang, chỉ nhật ký thuộc Operator hiện tại; phục vụ tab nhật ký tổng hợp trên mobile.

JSON camelCase. Các response nhật ký gồm id, batchCode, logDate, ph, waterTempC, salinityPpt, feedKg, note, source, plausibilityFlag, recordedBy, createdAt, thresholdVersion, thresholdsApplied. Suffix C/Ppt/Kg quy định đơn vị thống nhất.

Giữ endpoint danh sách lô hiện có. Thêm GET /api/operators/me/production-batches?page=&pageSize= trả PagedResult các lô Stocked/InProduction/Harvesting của Operator, gồm batchCode, title, crabType, status, cycleDays, seedQuantity, aliveCount (đếm cua Growing), dayOfCycle, latestLog, loggedToday, canRecord và businessDate. dayOfCycle tính theo ngày lịch Việt Nam từ stockedAt, ngày đầu là 1, null khi chưa có stockedAt. latestLog là bản ghi mới nhất theo logDate rồi id, loggedToday chỉ tính Manual. canRecord chỉ true khi InProduction/Harvesting và có cấu hình. Mobile tải đủ các trang theo nhu cầu tập lô đang chạy; form ghi lọc trạng thái riêng và hiển thị hướng dẫn cấu hình khi thiếu, không loại bỏ Harvesting khỏi dữ liệu màn Thu hoạch.

## Database và tính nhất quán

Migration mới V014, không sửa migration đã áp dụng và không xóa dữ liệu. Thêm bảng phiên bản ngưỡng có unique (batch_id, version_no), FK người tạo và lô, CHECK min/max và miền dữ liệu. Thêm threshold_version_id nullable cho production_log để giữ dữ liệu legacy; liên kết ghép batch_id và threshold_version_id nhằm không gắn cấu hình của lô khác. Mọi bản ghi Manual mới qua API bắt buộc có tham chiếu phiên bản.

Giữ unique ux_production_log_day hiện có trên (batch_id, log_date, source). Bắt đúng SQL unique conflict của nhật ký và chuyển thành thông báo 409 dễ hiểu, không lộ SQL.

Ghi nhật ký: transaction Serializable, khóa audit trước operator/batch theo convention hiện hành, chốt phiên bản ngưỡng, lưu log rồi gọi AlertService.RaiseAsync trong cùng transaction nếu cần. Request trùng bị chặn trước khi gọi AlertService; lỗi unique ở DB vẫn rollback toàn bộ. Lỗi tạo cảnh báo hoặc audit khiến nhật ký cũng rollback; không nuốt lỗi.

Cảnh báo WaterQuality chứa chỉ số, giá trị, đơn vị và khoảng cấu hình bị vượt. Đề xuất mức Medium với hạn phản hồi 24 giờ cho mọi lần vượt ngưỡng trong VI-08, phù hợp nhóm cảnh báo chỉ số nước thông thường trong TL-22; chưa tự phân cấp nghiêm trọng bằng công thức mới. Dùng cơ chế gom Open/Escalated hiện có. Việc đổi ngưỡng không sửa plausibility lịch sử, không tự đóng hoặc xóa cảnh báo cũ.

Owner đổi cấu hình cũng trong transaction, kiểm tra phiên bản kỳ vọng và ghi audit trước/sau cùng commit. Chưa có tác động ngoài DB trong AlertService nên không cần thêm hệ thống outbox cho luồng này.

Các lựa chọn chưa có quy tắc chi tiết trong Phiếu (ghi hôm nay, bắt buộc cấu hình trước, miền validation, mức cảnh báo/hạn phản hồi) là quy ước triển khai tạm VI-08, được nêu minh bạch trong tài liệu bàn giao; không khẳng định Phiếu đã ấn định các giá trị đó.

## Web và mobile

Web OperatorDailyLog dùng TanStack Query và http hiện có: chọn lô thật; form ngưỡng cho Owner; form nhật ký có đơn vị; lịch sử phân trang/lọc ngày; loading/empty/error; chống gửi lặp; 409 giữ form. Sau submit invalidate nhật ký, tóm tắt lô và cảnh báo. Thay các tab demo ảnh/QR bằng luồng nhật ký trong phạm vi VI-08, không triển khai upload ảnh tại đây.

Mobile viết ApiOperatorRepository bằng Dio theo contract chung; dùng API thật cho logs, submitLog, activeBatches và trạng thái đã ghi hôm nay. Giữ các lô Harvesting trong tập lô đang chạy nếu màn Thu hoạch cần, nhưng form nhật ký chỉ chọn lô được phép ghi. Không chuyển những chức năng ngoài phạm vi sang mock mới. Dùng provider theo phiên đăng nhập để dữ liệu không bị giữ giữa hai tài khoản.

Mobile có màn/section cấu hình ngưỡng cho Owner và hiển thị cấu hình hiện tại cho Staff. Bỏ các ngưỡng tạm trong log_thresholds.dart khỏi luồng thực. Sau ghi refresh tab Nhật ký, thẻ lô, tiến độ nhật ký và Cảnh báo; thông báo thành công xác nhận đã lưu lên máy chủ.

## Kiểm chứng và bàn giao

Backend API/LocalDB: cấu hình Owner và cách ly Operator; Staff chỉ đọc cấu hình nhưng ghi được nhật ký; thay đổi role/membership; xung đột cấu hình; lưu phiên bản lịch sử; thiếu cấu hình; validation/precision; một bản ghi/ngày/nguồn cả khi đồng thời; khác lô/khác nguồn; số đo ở biên/ngoài ngưỡng; rollback khi alert/audit lỗi; ngày UTC+7 qua nửa đêm; phân trang và quyền Investor/Admin.

Web Playwright: cấu hình, gửi đúng contract, pending, 409, lịch sử, số đo bất thường và tab Cảnh báo; kiểm tra desktop/điện thoại. Mobile repository/widget: mapping JSON, cấu hình/quyền, lỗi 409, refresh, ngày không phụ thuộc múi giờ thiết bị, không mất lô Harvesting của màn Thu hoạch.

Chạy dotnet test backend/CrabShare.sln, npm run build và lint cùng Playwright theo cấu hình repo, flutter analyze và flutter test nếu có SDK. Báo đúng lệnh đã chạy, lỗi nền và giới hạn; không dùng kết quả cũ để tuyên bố thành công.

Bàn giao tài liệu contract, JSON Bruno, migration/cách áp dụng, luồng demo web/mobile và kết quả kiểm thử. Không commit, push, merge hoặc đổi nhánh.
