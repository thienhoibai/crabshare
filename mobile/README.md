# Mobile — Flutter

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
| NĐT · eKYC | `investor/kyc/` | Khôi |
| Hộ nuôi · Hôm nay, Nhật ký | `operator/today/`, `operator/logs/` | Viên |
| Hộ nuôi · Chụp bằng chứng | `operator/evidence/` | Khôi |
| Hộ nuôi · Cảnh báo | `operator/alerts/` | Khôi |
| Hộ nuôi · Thu hoạch & in tem | `operator/harvest/` | Viên |
| Quét tem, Truy xuất | `trace/` | Viên |
| Hộ nuôi · Đóng gói đơn (quét tem) | *chưa có — tạo mới* | Nhân |
| Tài khoản | `account/` | Khôi |

## Đổi dữ liệu mẫu sang API (việc chính của từng task)

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

## Package sẽ thêm khi làm task

| Package | Task |
|---|---|
| `mobile_scanner` | Quét QR trên tem (truy xuất, đóng gói đơn) |
| `geolocator` | Lấy vị trí khi chụp bằng chứng |
| Font DM Sans trong `assets/` | Bản phát hành không cần tải font qua mạng |
