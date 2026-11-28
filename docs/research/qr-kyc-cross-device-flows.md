# Nghiên cứu luồng QR xác minh trên thiết bị khác

**Ngày nghiên cứu:** 25/11/2026
**Phạm vi:** Luồng người dùng đã đăng nhập trên web, quét QR bằng app di động để tiếp tục xác minh danh tính/CCCD có NFC.

## Kết luận nhanh

Có các luồng tương tự để học, nhưng không có tài liệu công khai cho biết mã nguồn nội bộ của TikTok Shop hay các ngân hàng. Tài liệu gần nhất về **QR để chuyển một phiên giữa hai thiết bị** là [RFC 10027 – Best Current Practice for Security of Cross-Device Flows](https://www.rfc-editor.org/rfc/rfc10027.html). Nó có cả ví dụ **remote onboarding** dùng QR để mở ví số trên điện thoại và xuất trình giấy tờ định danh.

Các tham chiếu thực tế:

1. **TikTok Login Kit QR Authorization** — tài liệu chính thức mô tả tạo QR, trạng thái `new` / `scanned` / `confirmed` / `expired` / `utilised`, polling, kiểm tra `client_ticket`, rồi đổi authorization code phía máy chủ. Đây là luồng cấp quyền đăng nhập TikTok cho ứng dụng bên thứ ba, **không phải tài liệu về KYC của TikTok Shop**. Học được cách quản lý trạng thái và ràng buộc QR; không nên bê nguyên nghiệp vụ OAuth vào CrabShare. [Tài liệu TikTok](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization?enter_method=left_navigation)
2. **Microsoft Entra Authentication Transfer** — người dùng đã đăng nhập app trên PC quét QR bằng app được hỗ trợ trên điện thoại; hệ thống xét chính sách cho thiết bị đích, rồi chuyển claims hoặc yêu cầu đăng nhập lại. Tài liệu nói rõ chỉ hỗ trợ ứng dụng Microsoft. Đây là ví dụ chuyển trạng thái đăng nhập, không phải xác minh CCCD. [Tài liệu Microsoft](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-authentication-transfer)
3. **VNPT eKYC** — nhà cung cấp tại Việt Nam công khai các năng lực OCR giấy tờ, NFC, đối chiếu khuôn mặt, liveness và API/SDK đa nền tảng. Tài liệu này giúp tham khảo các bước eKYC, nhưng không công bố luồng QR nối web với app. [VNPT eKYC](https://vnpt.vn/doanh-nghiep/san-pham-dich-vu/nen-tang-dinh-danh-dien-tu-vnpt-ekyc/)
4. **OAuth Device Authorization Grant (RFC 8628)** — chuẩn cho thiết bị thiếu trình duyệt/khó nhập liệu, thiết bị hiển thị code còn người dùng xác thực trên thiết bị thứ hai. Nó có mã ngắn hạn, trạng thái chờ/đồng ý/từ chối/hết hạn và polling. Điện thoại của CrabShare có trình duyệt và app nên RFC này là tham khảo state/polling, không nên coi là giao thức bắt buộc. [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html)

Ảnh TikTok Shop do người dùng cung cấp vẫn là mẫu giao diện mục tiêu: chọn loại chủ thể, tải giấy đăng ký khi áp dụng, xác minh chủ sở hữu trên điện thoại. Không thể từ ảnh hoặc tài liệu QR Login Kit kết luận chính xác kiến trúc phía sau TikTok Shop.

## Mẫu cần áp dụng cho CrabShare

Luồng của CrabShare nên được xem là **nối một tác vụ KYC có phạm vi hẹp giữa web và app**, không phải đăng nhập web vào app hoặc chuyển toàn bộ session. Web giữ session hiện tại; app phải đăng nhập và xác thực CCCD/NFC trong đúng tài khoản đó.

1. Web gọi API tạo một phiên KYC đang chờ, gắn với `userId` lấy từ access token phía server. Sinh mã ngẫu nhiên khó đoán, lưu hash của mã và thông tin `userId`, mục đích `identity-kyc`, thời hạn, trạng thái và thời điểm sử dụng. Không nhận `userId` từ body để quyết định chủ tài khoản.
2. QR chỉ chứa deep link CrabShare và mã tham chiếu ngắn hạn, không chứa access token, refresh token, số CCCD, ảnh giấy tờ hoặc PII.
3. Web hiển thị QR cùng mục đích xác minh, thời hạn, trạng thái `Đang chờ quét` / `Đã mở app` / `Đang xác minh` / `Hoàn tất` / `Hết hạn` và nút hủy/tạo mã mới. Poll có nhịp giới hạn hoặc dùng push channel; dừng poll khi phiên kết thúc.
4. App mở deep link, yêu cầu đăng nhập nếu chưa có session, rồi gọi API redeem bằng access token của app. Backend so sánh user của app với `userId` đã gắn phiên QR. Nếu khác, trả mã lỗi ổn định `kyc.handoff_account_mismatch`; UI yêu cầu chuyển sang đúng tài khoản, không tiết lộ thông tin tài khoản kia.
5. Chỉ sau khi đúng tài khoản mới bắt đầu bước CCCD/NFC/selfie; người dùng thấy rõ đang xác minh cho tài khoản của họ và có quyền hủy. Quy trình cá nhân vẫn có bước xác minh CCCD; lựa chọn loại chủ thể chỉ quyết định thêm giấy đăng ký hộ kinh doanh/doanh nghiệp.
6. Hoàn tất redeem bằng thao tác nguyên tử để cùng một mã không thể được dùng để mở nhiều tác vụ. Thêm giới hạn tần suất tạo phiên/redeem và timeout. Mã hết hạn/hủy/đã dùng phải báo trạng thái phù hợp.

RFC 10027 cảnh báo mã QR là kênh không xác thực: kẻ xấu có thể đưa QR của phiên do họ khởi tạo cho nạn nhân để nạn nhân vô tình cấp quyền. Chuẩn khuyến nghị nhiều lớp giảm thiểu: mã có thời hạn ngắn, dùng một lần hoặc giới hạn lượt, ràng buộc mã riêng cho từng phiên, giới hạn tần suất và giữ ngữ cảnh rõ ràng trên app về dịch vụ/thiết bị/lý do đang yêu cầu thao tác. Tài liệu cũng nêu trải nghiệm người dùng đơn thuần không thay thế được biện pháp kỹ thuật. [RFC 10027, §4 và §6](https://www.rfc-editor.org/rfc/rfc10027.html)

## Đối chiếu với code CrabShare hiện tại

Tại thời điểm nghiên cứu, handoff dùng JWT HMAC ký và hết hạn sau 5 phút. Cách này có xác thực chữ ký và thời hạn, nhưng JWT tự nó không dùng một lần: cùng mã có thể được redeem lại cho tới khi hết hạn nếu không có trạng thái server-side. Thiết kế được chọn sau đó là phiên tham chiếu ngẫu nhiên lưu server-side, redeem nguyên tử theo đúng tài khoản; không dùng memory cache cục bộ vì App Service có thể chạy nhiều instance.

Handoff phải có test cho: QR đúng tài khoản; khác tài khoản; chưa đăng nhập; mã sai/hết hạn; hủy; redeem hai lần đồng thời; QR thuộc phiên đã hoàn tất; loại chủ thể cá nhân và tổ chức; web tự dừng polling. Việc chuyển KYC provider (VNPT hay nhà cung cấp khác) là câu hỏi riêng, chưa được giải quyết bởi các nguồn công khai này.

## Nguồn chính thức

- [TikTok for Developers — QR Code Authorization](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization?enter_method=left_navigation)
- [Microsoft Learn — Authentication transfer](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-authentication-transfer)
- [IETF RFC 10027 — Best Current Practice for Security of Cross-Device Flows](https://www.rfc-editor.org/rfc/rfc10027.html)
- [IETF RFC 8628 — OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628.html)
- [VNPT — Nền tảng định danh điện tử VNPT eKYC](https://vnpt.vn/doanh-nghiep/san-pham-dich-vu/nen-tang-dinh-danh-dien-tu-vnpt-ekyc/)
