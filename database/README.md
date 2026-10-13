# Database — SQL Server

```
database/
├── migrations/
│   ├── V001__initial_schema.sql     ← 52 bảng + 9 view + trigger (từ Chuan_hoa/Database/crabshare_sqlserver.sql)
│   └── V002__reference_data.sql     ← hạng cua, bậc phí, bản công bố rủi ro, mẫu hợp đồng
├── reference/                        ← nội dung bản công bố rủi ro / mẫu hợp đồng (hash đã ghi trong V002)
└── seed/                             ← (dự phòng) dữ liệu demo dạng SQL nếu cần
```

## Chạy migration

```bash
dotnet run --project backend/tools/CrabShare.DbMigrator                 # CSDL dev mặc định (LocalDB CrabShareDev)
dotnet run --project backend/tools/CrabShare.DbMigrator -- --reset      # XOÁ rồi tạo lại (chỉ dev)
dotnet run --project backend/tools/CrabShare.DbMigrator -- "<chuỗi kết nối>"
```

Hoặc đặt biến môi trường `CRABSHARE_DB` = chuỗi kết nối. DbUp ghi file đã chạy vào bảng `dbo.SchemaVersions`, chạy lại sẽ bỏ qua.

## Quy tắc

1. **Không sửa** file migration đã có trên `main`. Muốn đổi → file mới `V003__...sql`, `V004__...`.
2. Tên file: `V` + 3 chữ số + `__` + mô tả không dấu.
3. Không viết `CREATE DATABASE` / `USE` trong migration (DbMigrator tự tạo CSDL).
4. Không dùng chuỗi `/*` bên trong comment `/* ... */` (SQL Server hiểu là comment lồng → lỗi 113).
5. Sau khi chạy migration mới: sinh lại entity (`backend/README.md` mục *Đổi CSDL*) và commit cả hai.
6. File trong `reference/` giữ xuống dòng **LF** (`.gitattributes` đã ép) — đổi nội dung là đổi hash, phải tạo bản mới (RD/CT mới) chứ không sửa bản cũ.

## Dữ liệu demo

Tài khoản demo, hộ nuôi mẫu, 60 hộp do `backend/src/CrabShare.Api/Infrastructure/Persistence/DevDataSeeder.cs` tạo khi API chạy ở Development và CSDL chưa có người dùng.
Thêm lô / góp vốn / nhật ký mẫu để mọi người làm song song: mở rộng `DevDataSeeder` (task của Thiện tuần 1).

Để thử camera/GPS của CS-44 trên CSDL dev đã có tài khoản demo:

```powershell
powershell -ExecutionPolicy Bypass -File backend/scripts/seed-evidence-demo.ps1
```

Script thêm lô `[DEMO CS-44]` mã `CS44-DEMO-01` ở trạng thái `InProduction`
và gán ba hộp `0014`, `0015`, `0016` thành `Occupied` cho hộ nuôi demo.
Tài khoản `operator@crabshare.local` và `staff@crabshare.local` đều chọn được
các hộp này trên màn Chụp bằng chứng. Chạy lại không nhân đôi dữ liệu; script
không thay allocation của lô khác và không đặt lại lô đã đổi trạng thái.
Chỉ chạy trên LocalDB `CrabShareDev`; đây là fixture để thử upload, không phải
luồng gọi vốn/thả giống thật. Dữ liệu seed không tạo audit nghiệp vụ; các lần
gửi ảnh sau đó vẫn dùng audit chuẩn của API.

## Dùng Docker thay LocalDB (máy macOS / không có LocalDB)

```bash
docker compose up -d sqlserver
```

Rồi đặt chuỗi kết nối (thay mật khẩu bằng giá trị bạn đặt trong `MSSQL_SA_PASSWORD`):
`Server=localhost,1433;Database=CrabShareDev;User Id=sa;Password=<...>;TrustServerCertificate=True`
cho cả `CRABSHARE_DB` (migrator) và `ConnectionStrings__Default` (API).
