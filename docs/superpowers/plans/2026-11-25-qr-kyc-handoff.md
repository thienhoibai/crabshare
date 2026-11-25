# Kế hoạch: QR handoff KYC

Đưa luồng QR vào PR riêng dựa trên `develop`; không kéo các thay đổi khác ngoài phạm vi KYC vào PR. Chia theo các lát backend → web → mobile → tích hợp và kiểm chứng.

## Bản đồ file

- `database/migrations/V033__kyc_handoff.sql`: bảng trạng thái phiên, FK đến user, unique hash và chỉ mục phục vụ dọn/lọc phiên.
- `backend/src/CrabShare.Api/Infrastructure/Persistence/Entities/KycHandoff.cs`: entity phiên.
- `backend/src/CrabShare.Api/Infrastructure/Persistence/AppDbContext.cs`: DbSet và mapping.
- `backend/src/CrabShare.Api/Features/Accounts/AccountDtos.cs`, `KycHandoffService.cs`, `KycHandoffsController.cs`: phát hành/đọc/hủy/claim, giới hạn đúng quyền.
- `web/src/features/accounts/kycApi.ts`, `KycVerification.tsx`: QR thật và trạng thái từ API; giữ lại form gửi ảnh eKYC hiện có.
- `mobile/lib/app/router.dart`, `features/investor/investor_routes.dart`, `features/investor/kyc/kyc_repository.dart`, `kyc_page.dart`: giữ ref qua login, claim và báo lỗi đúng.
- `docs/business-context.md`, `docs/business-open-questions.md`: account binding đã được chủ dự án chốt; nhà cung cấp eKYC vẫn để mở.

## Các lát triển khai

1. Thêm kho phiên bền vững, secret ngẫu nhiên có entropy cao, hash SHA-256, hết hạn 5 phút trước khi claim; claim nguyên tử và idempotent đúng chủ tài khoản. Thêm route đọc/hủy có kiểm tra ownership và claim yêu cầu đăng nhập nhưng không buộc Investor.
2. Nối web vào endpoint tạo/đọc/hủy. Tạo deeplink từ secret phiên hiện tại; hiển thị QR, mã lỗi/hết hạn, trạng thái và cho tạo lại. Poll theo chu kỳ vừa phải và dừng khi kết thúc.
3. Nối app vào endpoint claim trước khi tải form KYC. Giữ query `ref` qua login cho mọi role; bypass role redirect chỉ cho trang KYC để API trả mismatch có chủ đích. Kết quả đúng tài khoản mở form; mã hết hạn/sai/đã thu hồi có thông báo riêng.
4. Rà lại luồng hoàn chỉnh, chạy build backend/web/mobile, đối chiếu diff và bảo đảm ảnh eKYC không bị lưu. Không đụng các thay đổi upload giấy tờ tổ chức ngoài phạm vi.

## Tiêu chí hoàn tất

- QR được tạo từ phiên server-side, không còn URI tĩnh.
- App chưa đăng nhập có thể đăng nhập rồi quay lại cùng QR.
- Đúng account claim được; account khác thấy `kyc.handoff_account_mismatch`, không tiêu thụ phiên.
- Hết hạn/hủy/dùng lại có kết quả xác định; web thấy trạng thái app đã nhận.
- QR không lộ PII hay access/refresh token; không lưu ảnh CCCD/selfie.
- Backend, Web và các test luồng QR/KYC đạt; Flutter analyze/test được xác nhận trong CI do máy phát triển không có Flutter SDK.
- Mọi giới hạn do provider chưa chọn được nêu rõ.

## Kết quả thực hiện

- Backend: `dotnet build backend/CrabShare.sln -c Release` thành công, 6 warning / 0 error; cảnh báo hiện hữu nằm ở các file khác trong repo.
- Backend KYC: 19/19 test API và SQL LocalDB đạt, gồm sai tài khoản không tiêu thụ mã, claim lặp idempotent, hash-only, hết hạn và hủy/thay mã.
- Web: `npm run build` thành công; `npm run test:kyc -- tests/kyc.spec.ts` đạt 6/6, gồm tạo QR, deep link và hủy mã.
- Mobile: test router đã thêm; chưa thể chạy formatter/analyzer/test tại máy phát triển vì không có `dart` hoặc Flutter SDK trên PATH. CI có job Flutter analyze/test.
- CI PR chưa chạy ở thời điểm ghi kế hoạch.
- Migration `V033__kyc_handoff.sql` cần được áp dụng vào database development trước khi gọi các API phiên QR; chưa chạy migration trên Azure.
- Nhà cung cấp eKYC thật vẫn chưa được chọn; luồng hiện dùng provider hiện có và không coi `FakeEkycProvider` là xác minh thật.
