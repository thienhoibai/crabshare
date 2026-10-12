# Backend — ASP.NET Core .NET 10

```
backend/
├── CrabShare.sln
├── dotnet-tools.json                 ← dotnet-ef (chạy dotnet tool restore)
├── scripts/scaffold-db.ps1           ← sinh lại Entities từ CSDL
├── src/
│   ├── CrabShare.Api/                ← API (Controller, lát cắt dọc theo Features/)
│   └── CrabShare.SettlementEngine/   ← thư viện quyết toán thuần (không phụ thuộc DB)
├── tools/CrabShare.DbMigrator/       ← chạy database/migrations/V*.sql bằng DbUp
└── tests/
    ├── CrabShare.Api.Tests/          ← test API (WebApplicationFactory)
    └── CrabShare.SettlementEngine.Tests/  ← xUnit + FsCheck (TSK-12)
```

## Mở bằng Visual Studio 2026

1. **File → Open → Project/Solution…** → chọn `backend\CrabShare.sln` (hoặc nhấp đúp file này trong Explorer). Đừng dùng *Open a local folder* với thư mục gốc `crabshare\`: thư mục gốc chứa cả web và mobile nên Visual Studio không coi đó là solution C#.
2. Lần đầu trên máy: chuột phải `CrabShare.DbMigrator` → **Debug → Start New Instance** để tạo CSDL LocalDB `CrabShareDev`. Chạy lại mỗi khi có file `V00X__*.sql` mới.
3. Chuột phải `CrabShare.Api` → **Set as Startup Project**, chọn profile **http** trên thanh công cụ → **F5**. Trình duyệt tự mở http://localhost:5233/scalar để thử API.
4. Chạy test: **Test → Test Explorer → Run All Tests**.

Cần workload **ASP.NET and web development** trong Visual Studio Installer. F5 báo `CrabShare.Api.exe` bị khoá hoặc cổng 5233 đã dùng → đang có API khác chạy (ví dụ `dotnet run` ở terminal), tắt nó rồi chạy lại.

## Chạy bằng dòng lệnh

```bash
dotnet tool restore
dotnet run --project backend/tools/CrabShare.DbMigrator
dotnet run --project backend/src/CrabShare.Api --launch-profile http
```

- API: http://localhost:5233 · Thử API: http://localhost:5233/scalar · OpenAPI: `/openapi/v1.json`
- Lần chạy đầu ở môi trường Development, `DevDataSeeder` tạo tài khoản demo + hộ nuôi mẫu + 60 hộp. Mật khẩu chung: hằng `DemoPassword` trong `src/CrabShare.Api/Infrastructure/Persistence/DevDataSeeder.cs`.
- Muốn làm lại CSDL từ đầu: `dotnet run --project backend/tools/CrabShare.DbMigrator -- --reset`.

## Test

```bash
dotnet test backend/CrabShare.sln
```

Test cần CSDL thì gắn `[Trait("Category", "Database")]`; CI chỉ chạy test không cần CSDL (`--filter "Category!=Database"`).

## Thêm tính năng

Đọc `docs/conventions.md` mục 3. Tóm tắt: copy cách viết `Features/Auth/` (Dtos + Service + Controller) → bỏ comment 2 dòng của module trong `Common/FeatureRegistry.cs` → thử trên `/scalar`.
Mỗi thư mục `Features/<Module>/README.md` đã ghi sẵn use case, bảng, endpoint dự kiến, quy tắc.

## Đổi CSDL

1. Thêm file `database/migrations/V00X__mo_ta.sql` (không sửa file cũ).
2. `dotnet run --project backend/tools/CrabShare.DbMigrator`
3. Sinh lại entity (Windows):
   ```powershell
   powershell -ExecutionPolicy Bypass -File backend/scripts/scaffold-db.ps1
   ```
   Thêm **bảng/view mới** thì thêm tên vào danh sách `$objects` trong script. Tắt API đang chạy trước khi scaffold (file .exe bị khoá).
4. Cấu hình thêm cho entity (không sửa file sinh ra) → viết trong `Infrastructure/Persistence/AppDbContext.Custom.cs`.

## Cấu hình (`appsettings*.json`)

| Khoá | Ý nghĩa |
|---|---|
| `ConnectionStrings:Default` | Chuỗi kết nối SQL Server (dev: LocalDB `CrabShareDev`) |
| `Jwt:Issuer`, `Jwt:Audience`, `Jwt:SigningKey`, `Jwt:ExpiryMinutes` | Token đăng nhập. `SigningKey` ≥ 32 ký tự; bản thật đặt qua biến môi trường `Jwt__SigningKey` |
| `Cors:Origins` | Địa chỉ web/mobile-web được gọi API |
| `Storage:RootPath` | Thư mục lưu ảnh/hợp đồng (`storage/`, không commit) |
| `Seed:Enabled` | Tạo dữ liệu demo khi CSDL trống |

## Hệ thống ngoài (đều có bản giả)

| Interface | Bản giả hiện tại | Ghi chú |
|---|---|---|
| `IPaymentGateway` | `FakePaymentGateway` | Tạo nội dung VietQR sandbox, chi trả giả |
| `IDigitalSigningService` | `FakeSigningService` | Ký số Viettel (sandbox) |
| `IEkycProvider` | `FakeEkycProvider` | eKYC |
| `ICrabDetector` | `NoopCrabDetector` | TSK-13 thay bằng `OnnxCrabDetector` |
| `IFileStorage` | `LocalFileStorage` | Lưu đĩa + tính SHA-256 |

Đổi bản thật: sửa đăng ký trong `Infrastructure/DependencyInjection.cs`.
