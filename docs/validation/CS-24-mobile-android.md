# CS-24 / KH-01 — Mobile Android

Ngày kiểm tra: **12/10/2026**, Flutter **3.47.7**, Dart **3.13.5**.
Nhánh: `feature/CS-24-mobile-android`.

## Thay đổi

- Thêm `mobile_scanner` 7.4.2 và `geolocator` 14.1.1, cập nhật lockfile.
- Khai báo INTERNET, camera, vị trí gần đúng/chính xác trên Android; mô tả quyền
  camera, ảnh và vị trí khi dùng trên iOS. HTTP chỉ được bật trong manifest debug.
- Đóng gói DM Sans 400/500/600/700 có giấy phép OFL; bỏ `google_fonts` và sử dụng
  cùng theme asset trong app/widget test.
- Tên app CrabShare; icon cua thường/adaptive/monochrome Android và bộ icon iOS.
  Có script tạo lại icon từ mã vector và cấu hình launcher icons.
- Hướng dẫn nhóm chạy Android Studio, USB (`adb reverse`), LAN, build và cài APK
  trong `mobile/README.md`.

## Kết quả đã kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `flutter analyze` | Đạt, không có issue |
| `flutter test` | Đạt, 27 test (gồm 18 màn ở khổ 360×780) |
| Build APK debug, `API_URL=http://localhost:5233` | Đạt |
| Cài APK bằng `adb install -r` lên điện thoại thật | Đạt (`Success`) |
| Chuyển tiếp cổng API qua USB | Đạt, `tcp:5233 → tcp:5233` |
| Manifest debug đã merge | Có tên CrabShare, camera/vị trí/INTERNET và HTTP dev |
| Font trong APK | Đủ 4 file TTF và các độ đậm tương ứng trong FontManifest |
| Chữ tiếng Việt trong font | Có glyph cho các chữ trong tên/màn hình demo |
| Script tái tạo icon | Đạt, giữ nguyên build settings Xcode |

Đăng nhập chủ hộ nuôi đã được Khôi xác nhận trên điện thoại trước khi cập nhật
APK. Bản APK mới đã cài; cần mở khóa điện thoại để xác nhận trực quan màn hình.
Không chạy thử đăng nhập nhà đầu tư hoặc máy ảo Android theo yêu cầu của Khôi.
iOS mới được cấu hình; chưa build trên Windows.

## Bàn giao

APK ở `mobile/build/app/outputs/flutter-apk/app-debug.apk` (không commit file build).
Mở PR vào `develop`; task chỉ chuyển Done sau khi PR được một người khác duyệt,
CI xanh và merge theo `docs/git-workflow.md`. Hai bước thử được Khôi giữ lại tự làm
cần được ghi rõ khi xác nhận hoàn thành task trên Jira.
