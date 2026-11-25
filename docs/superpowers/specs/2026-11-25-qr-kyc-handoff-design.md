# Thiết kế luồng QR handoff cho KYC

Ngày: 2026-11-25
Phạm vi: nối phiên hoàn thiện KYC từ web đã đăng nhập sang app CrabShare, có kiểm tra cùng tài khoản.

## Mục tiêu

Người dùng tạo QR trên web sau khi đăng nhập. Quét QR mở thẳng màn KYC trong app; nếu app chưa đăng nhập, đường dẫn phải được giữ qua bước đăng nhập. Chỉ tài khoản tạo QR mới được tiếp tục. Tài khoản khác nhận lỗi rõ ràng, không bị tự đăng xuất hay chuyển tài khoản. Web nhận trạng thái đã mở/đã nhận và kết quả KYC.

## Các cách đã cân nhắc

1. JWT có thời hạn: hiện đã có phác thảo và xác thực chữ ký, nhưng không có trạng thái để thu hồi, dùng một lần hoặc cho web biết tiến độ. Không chọn.
2. Mã tham chiếu ngẫu nhiên, lưu hash và trạng thái trong cơ sở dữ liệu: được chọn. Hỗ trợ hết hạn, hủy, kiểm tra chủ sở hữu, nhận mã nguyên tử và chạy được qua nhiều App Service instance.
3. Memory cache: loại vì dữ liệu mất khi app khởi động lại và không đồng bộ giữa nhiều instance.

## Hành vi

- Web tạo phiên gắn với `userId` lấy từ access token. QR chỉ mang deep link CrabShare và secret ngẫu nhiên; không mang JWT đăng nhập, email, số điện thoại hay CCCD.
- Phiên chưa nhận có trạng thái `Pending`, hết hạn sau 5 phút. Người dùng có thể hủy và tạo mã khác.
- App gọi API bằng access token riêng của app. Backend kiểm tra secret, thời hạn và so user đang đăng nhập với user sở hữu phiên. Sai tài khoản trả mã ổn định `kyc.handoff_account_mismatch`, không đổi trạng thái phiên.
- Nhận thành công đặt trạng thái `Claimed` theo cách nguyên tử. Nhận lại từ cùng user là idempotent; user khác không thể lấy phiên.
- Web đọc trạng thái phiên và trạng thái KYC hiện có, dừng polling khi phiên/hồ sơ vào trạng thái cuối.
- Không thay provider eKYC trong thay đổi này. Hệ thống tiếp tục dùng luồng KYC đang có; `FakeEkycProvider` không được xem là xác minh danh tính thật.
- Ảnh CCCD/selfie eKYC vẫn chỉ chuyển tới provider, không lưu vào DB hay Cloudinary theo quy ước hiện tại. Tài liệu đăng ký tổ chức là luồng upload riêng.

## Phạm vi thay đổi

- Backend: migration và entity phiên handoff; service phát hành/đọc/hủy/claim; route tạo phiên chỉ cho Investor, route claim cho mọi tài khoản đã đăng nhập để trả được lỗi mismatch; kiểm tra chủ sở hữu khi đọc/hủy.
- Web: tạo QR từ API, hiển thị trạng thái/hết hạn/hủy/tạo lại và lấy kết quả KYC.
- Mobile: giữ deep link qua login mọi vai trò; cho phép route KYC chạy trước guard vai trò; claim phiên trước khi hiển thị form; hiển thị mismatch/expired/revoked bằng tiếng Việt.
- Không thay quy tắc quyền khác hoặc thêm provider eKYC.

## Rủi ro và giới hạn

QR là bearer reference trong thời gian ngắn, nên vẫn có thể bị chụp/chia sẻ. Cần HTTPS, secret entropy cao, lưu hash, TTL, one-time claim, account binding, rate limit nếu middleware hiện có hỗ trợ và không log secret. NFC/liveness thật phụ thuộc provider chưa được chọn.

## Nguồn

- Project owner: giữ web login; tài khoản quét phải trùng với tài khoản tạo QR; sai tài khoản phải báo lỗi, 2026-11-25.
- [Nghiên cứu luồng QR/eKYC](../../research/qr-kyc-cross-device-flows.md).
- Quy ước dữ liệu cá nhân và không lưu ảnh giấy tờ eKYC: `docs/conventions.md`; yêu cầu nghiệp vụ eKYC: BR-009/BR-014.
