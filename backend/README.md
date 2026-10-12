# Backend — ASP.NET Core .NET 10

```
backend/
├── CrabShare.sln
├── dotnet-tools.json                 ← dotnet-ef (chạy dotnet tool restore)
├── scripts/scaffold-db.ps1           ← sinh lại Entities từ CSDL
├── src/
│   ├── CrabShare.Api/                ← API (Minimal API, lát cắt dọc theo Features/)
│   └── CrabShare.SettlementEngine/   ← thư viện quyết toán thuần (không phụ thuộc DB)
├── tools/CrabShare.DbMigrator/       ← chạy database/migrations/V*.sql bằng DbUp
└── tests/
    ├── CrabShare.Api.Tests/          ← test API (WebApplicationFactory)
    └── CrabShare.SettlementEngine.Tests/  ← xUnit + FsCheck (TSK-12)
```

## Chạy

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

Đọc `docs/conventions.md` mục 3. Tóm tắt: copy cách viết `Features/Auth/` → bỏ comment 3 dòng của module trong `Common/Endpoints/FeatureRegistry.cs` → thử trên `/scalar`.
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
