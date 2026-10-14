# Mobile — Flutter

CS-61: Tổng quan nhà đầu tư và chi tiết danh mục dùng `/api/investor/portfolio`.
Vốn đã chốt lấy từ view; vốn mới xác nhận hiển thị tỷ lệ tạm tính. Không dùng khoản
góp mock hay lợi suất. Chạm thẻ khoản góp để xem hợp đồng, nhật ký và hành trình
thật; tài khoản chưa góp vốn có danh mục trống. Test: `flutter test test/portfolio_test.dart`.

KH-03: Tài khoản → Tài khoản nhận tiền đã dùng `GET/PUT /api/me/payout-account`.
Hai vai có thể chọn Cá nhân/Hộ nuôi; quyền chủ hộ kiểm tra trên backend. Form dùng
AppCard, AppColors, AppRadius và theme chung. Test luồng: `flutter test test/payout_test.dart`.

App cho **nhà đầu tư** (theo dõi lô, eKYC, thông báo, quét tem) và **hộ nuôi** (nhật ký, chụp bằng chứng, cảnh báo, thu hoạch & in tem).
Giao diện theo mẫu *AI calorie tracker*: nền be ấm, nhấn cam, thẻ trắng bo lớn, đồng hồ bán nguyệt chia vạch, thanh điều hướng tối có nút tròn cam ở giữa.

## Chạy

```bash
cd mobile
flutter pub get
flutter run -d chrome --web-port 8080                                        # xem nhanh trên trình duyệt
flutter run -d emulator-5554 --dart-define=API_URL=http://10.0.2.2:5233      # máy ảo Android
flutter run --dart-define=API_URL=http://192.168.1.10:5233                   # điện thoại thật (IP LAN máy chạy API)
```

- API phải đang chạy (`backend/README.md`). Cổng web của Flutter phải nằm trong `Cors:Origins` của API (mặc định có `http://localhost:8080`).
- Bản debug có nút **đăng nhập nhanh** tài khoản demo. Bản build demo muốn có nút này: thêm `--dart-define=DEMO_ACCOUNTS=true`.
- Luồng làm trên web (góp vốn) mở bằng trình duyệt tại `WEB_URL` (mặc định `http://localhost:5173`). Máy ảo Android: thêm `--dart-define=WEB_URL=http://10.0.2.2:5173`; điện thoại thật: IP LAN của máy chạy web.

## Android: chuẩn bị và kết nối API

Dùng Flutter **3.47.7** (Dart **3.13.5**, cùng phiên bản CI), Android Studio với plugin
Flutter/Dart và Android SDK. Trong SDK Manager, cài **Android SDK Command-line Tools
(latest)**, Platform-Tools và Build-Tools. Chạy `flutter doctor` để kiểm tra; nếu báo
thiếu giấy phép Android, đọc và xác nhận bằng `flutter doctor --android-licenses`.

Mở thư mục **`mobile/`** trong Android Studio. Flutter SDK path là thư mục chứa
`bin/flutter`, Dart SDK đi kèm tại `<flutter-sdk>/bin/cache/dart-sdk`.

### Điện thoại thật qua USB

1. Bật Developer options → USB debugging, nối USB, chấp nhận hộp thoại cho phép
   máy tính gỡ lỗi trên điện thoại.
2. Chạy API từ gốc repo (lần đầu phải chạy DbMigrator như hướng dẫn backend):
   ```powershell
   dotnet run --project backend/src/CrabShare.Api --launch-profile http
   ```
3. Trong terminal khác, kiểm tra thiết bị và chuyển tiếp cổng API:
   ```powershell
   adb devices
   adb -s <device-id> reverse tcp:5233 tcp:5233
   ```
4. Chạy app từ `mobile/`:
   ```powershell
   flutter pub get
   flutter run -d <device-id> --dart-define=API_URL=http://localhost:5233
   ```

Nếu `adb` chưa có trong PATH, dùng đường dẫn đầy đủ trên Windows:
`& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices`.
Chạy lại `adb reverse` sau khi nối lại USB hoặc khởi động lại điện thoại.

### Điện thoại thật qua mạng LAN

Máy tính và điện thoại cần cùng mạng LAN. Xem IPv4 của máy tính bằng `ipconfig`.
Chạy API để nhận kết nối từ điện thoại:

```powershell
dotnet run --project backend/src/CrabShare.Api --launch-profile http --urls http://0.0.0.0:5233
```

Trên trình duyệt điện thoại, mở `http://<IP-LAN>:5233/api/health/live`; cần nhận
`{"status":"ok"}` trước khi thử đăng nhập. Nếu không mở được, kiểm tra mạng và cho
phép cổng TCP 5233 của API qua Windows Firewall trên mạng riêng.

```powershell
flutter run -d <device-id> --dart-define=API_URL=http://<IP-LAN>:5233
```

### Cấu hình chạy trong Android Studio

**Run → Edit Configurations → + → Flutter**:

| Trường | Giá trị |
|---|---|
| Name | CrabShare Android |
| Dart entrypoint | `lib/main.dart` |
| Additional run args — USB | `--dart-define=API_URL=http://localhost:5233` |
| Additional run args — LAN | `--dart-define=API_URL=http://<IP-LAN>:5233` |
| Additional run args — máy ảo Android | `--dart-define=API_URL=http://10.0.2.2:5233` |
| Build flavor | Để trống |

Chọn thiết bị trên thanh công cụ và Run. Đổi `API_URL` cần **Stop rồi Run lại**;
hot reload không đổi hằng compile-time. `10.0.2.2` chỉ dùng cho máy ảo Android;
điện thoại thật dùng USB forwarding hoặc IP LAN.

### Build và cài APK debug

Từ `mobile/`, cho kết nối USB:

```powershell
flutter analyze
flutter test
flutter build apk --debug --dart-define=API_URL=http://localhost:5233
adb -s <device-id> reverse tcp:5233 tcp:5233
adb -s <device-id> install -r build/app/outputs/flutter-apk/app-debug.apk
```

Bản LAN dùng `--dart-define=API_URL=http://<IP-LAN>:5233` lúc build. Bản debug
cho phép HTTP tới API dev; bản release cần API HTTPS. `INTERNET` được khai báo
trong manifest chính để bản release cũng kết nối mạng được.

## Font, icon và quyền thiết bị

- **DM Sans** 400/500/600/700 nằm trong `assets/fonts/`, có giấy phép OFL đi kèm.
  Theme dùng font asset trực tiếp; không tải font khi mở app hoặc khi chạy test.
- Tên hiển thị Android/iOS là **CrabShare**. Icon cua có bản Android thường,
  adaptive, monochrome và bộ icon iOS. Nguồn ở `assets/icon/`; để tạo lại trên
  Windows: `powershell -File tools/generate-launcher-icons.ps1`. Script vẽ lại
  asset, sinh icon và giữ nguyên cấu hình Xcode (công cụ 0.14.4 đổi nhầm một
  setting `ASSETCATALOG` khác khi sinh icon iOS).
- Android khai báo camera và vị trí gần đúng/chính xác. Camera là tính năng tùy
  chọn, không chặn cài app trên thiết bị không có camera. iOS có mô tả quyền
  camera, thư viện ảnh và vị trí khi sử dụng.
- `image_picker` xin quyền camera khi người dùng bấm **Chụp**; ảnh bằng chứng dùng
  `ImageSource.camera`. Không xin quyền khi khởi động app.
- `mobile_scanner` và `geolocator` đã được thêm để các task quét tem/bằng chứng
  triển khai tiếp. Khi dùng vị trí: kiểm tra dịch vụ vị trí, kiểm tra quyền rồi
  gọi `Geolocator.requestPermission()` nếu bị từ chối; chỉ lấy vị trí lúc người
  dùng chụp bằng chứng. Tích hợp QR thật và GPS/upload là các task nghiệp vụ sau.

| Lệnh | Việc |
|---|---|
| `flutter analyze` | kiểm tra code (CI chạy) |
| `flutter test` | unit test + dựng thử **mọi màn** ở khổ 360×780 (CI chạy) |
| `flutter build apk` | ra file APK để cài thử |
| `flutter build web --pwa-strategy=none` | bản web để xem trên trình duyệt |

## Cấu trúc

```
lib/
├── main.dart                     ← khởi động, đọc phiên đăng nhập đã lưu
├── app/
│   ├── routes.dart               ← MỌI đường dẫn màn hình
│   ├── router.dart               ← go_router + chuyển trang theo vai trò (redirectFor)
│   └── theme/                    ← AppColors, AppRadius, font, ảnh
├── core/
│   ├── api/api_client.dart       ← Dio + gắn JWT + apiErrorMessage()
│   ├── auth/                     ← phiên đăng nhập (secure storage), AuthRepository
│   └── format/                   ← formatVnd, formatDate, formatDueIn…
├── shared/
│   ├── widgets/                  ← SegmentedGauge, NavShell, AppCard, AddBar, CategoryChip, MetricRow…
│   └── models/batch_enums.dart   ← CrabType, BatchStatus (khớp CHECK trong CSDL)
└── features/
    ├── onboarding/  auth/  account/  common/  trace/
    ├── investor/   data/ (repository + mock) · home/ · batches/ · notifications/ · kyc/
    └── operator/   data/ (repository + mock) · today/ · logs/ · evidence/ · alerts/ · harvest/
```

| Màn | File | Người làm (đổi sang API) |
|---|---|---|
| Chào, Đăng nhập | `onboarding/`, `auth/` | xong (đăng nhập đã gọi API thật) |
| NĐT · Tổng quan, Thông báo | `investor/home/`, `investor/notifications/` | Khôi |
| NĐT · Khám phá lô, Chi tiết lô | `investor/batches/` | Viên (dữ liệu lô), Thiện (nút Góp vốn) |
| NĐT · eKYC | `investor/kyc/` | Khôi — đã nối API (CS-27) |
| Hộ nuôi · Hôm nay, Nhật ký | `operator/today/`, `operator/logs/` | Viên |
| Hộ nuôi · Chụp bằng chứng | `operator/evidence/` | Khôi — đã nối API (CS-44) |
| Hộ nuôi · Cảnh báo | `operator/alerts/` | Khôi |
| Hộ nuôi · Thu hoạch & in tem | `operator/harvest/` | Viên |
| Quét tem, Truy xuất | `trace/` | Viên |
| Hộ nuôi · Đóng gói đơn (quét tem) | *chưa có — tạo mới* | Nhân |
| Tài khoản | `account/` | Khôi |

## Đổi dữ liệu mẫu sang API (việc chính của từng task)

Chụp bằng chứng đã dùng `ApiEvidenceRepository`: tải hộp từ `GET /api/boxes`,
chụp trực tiếp bằng camera, lấy GPS thật và gửi `POST /api/evidence`. Cần cấp
quyền camera/vị trí và bật GPS. Kết quả Accepted/Watch/Flagged lấy từ máy chủ;
chưa có mô hình nhận diện thì app không hiển thị kết luận về cua. Lỗi mạng giữ
ảnh để thử lại. Xem [CS-44](../docs/validation/CS-44-production-evidence.md).

CS-50: mục Yêu cầu chụp ở Hôm nay lấy danh sách từ API, hiển thị hạn chụp,
mở đúng hộp/lô và gửi `captureRequestId` cùng ảnh. Khi hoàn thành, yêu cầu
được tải lại và biến mất khỏi danh sách đang chờ. Xem
[CS-50](../docs/validation/CS-50-random-capture-requests.md).

CS-57: tab Cảnh báo → **Bằng chứng bị gắn cờ** → xem ảnh và phản hồi thẩm định,
nhập giải trình tối đa 1.000 ký tự và gửi qua API. Ảnh tải bằng JWT theo hộ nuôi;
khi gửi lỗi giữ nội dung để thử lại. Giải trình đã gửi vẫn chờ kiểm định viên
thẩm định. Xem [CS-57](../docs/validation/CS-57-evidence-explanation.md).

eKYC đã dùng `ApiKycRepository` riêng: GET `/api/me/kyc`, POST multipart
`/api/kyc/ekyc`. Màn Tài khoản → Xác minh danh tính yêu cầu đồng ý điều khoản,
chụp CCCD trước/sau bằng camera sau, selfie bằng camera trước, rồi gửi cả 3 ảnh.
Ảnh được giữ trong bộ nhớ cho form; bản tạm từ camera được dọn và không lưu vào
session. Sau phản hồi, form bỏ ảnh và Tổng quan cập nhật trạng thái từ API.
KYC được tải lại khi đổi tài khoản; kéo làm mới Tổng quan cũng tải lại KYC.

Tài khoản demo được seed Verified. Để thử luồng gửi mới, đăng ký Investor mới
trên web rồi dùng tài khoản đó trên app. Provider backend hiện là sandbox giả lập.
Test `test/kyc_test.dart` kiểm tra multipart, consent, camera từ chối quyền,
đổi tài khoản và kết quả Verified; camera trong widget test được thay bằng ảnh mẫu.

Mỗi tính năng có **interface repository** + **bản Mock**. Ví dụ nhật ký nuôi:

```dart
// features/operator/data/operator_repository.dart
class ApiOperatorRepository extends MockOperatorRepository {
  ApiOperatorRepository(this._dio);
  final Dio _dio;

  @override
  Future<void> submitLog(DailyLogInput input) =>
      _dio.post('/api/batches/${input.batchCode}/production-logs', data: input.toJson());
}

// đổi đúng một dòng:
final operatorRepositoryProvider = Provider<OperatorRepository>((ref) => ApiOperatorRepository(ref.watch(dioProvider)));
```

`extends MockOperatorRepository` để các hàm **chưa có API** vẫn chạy bằng dữ liệu mẫu; làm xong hàm nào thì `override` hàm đó.

## Quy tắc
- Import Material bằng `package:material_ui/material_ui.dart` (Flutter 3.44+ đã tách Material khỏi SDK). **Không** dùng `package:flutter/material.dart` — trộn hai cái sẽ lỗi kiểu `ThemeData`/`TextTheme`.
- Màu, bo góc lấy từ `AppColors`, `AppRadius`; khối giao diện lấy từ `shared/widgets/app_ui.dart` — không tự đặt màu mới.
- Thêm màn mới → thêm path ở `routes.dart`, route ở `router.dart`, **thêm một dòng vào `test/pages_smoke_test.dart`**.
- Tiền là `int` (đồng), hiển thị bằng `formatVnd()`. **Không** hiển thị lợi suất kỳ vọng.
- Ảnh bằng chứng chỉ chụp bằng camera (`ImageSource.camera`).

## Package đã chuẩn bị (KH-01 / CS-24)

| Package | Task |
|---|---|
| `mobile_scanner` | Quét QR trên tem (truy xuất, đóng gói đơn) |
| `geolocator` | Lấy vị trí khi chụp bằng chứng |
| Font DM Sans trong `assets/fonts/` | Font offline cho app và test |
| `flutter_launcher_icons` (dev) | Sinh icon Android/iOS từ `assets/icon/` |
