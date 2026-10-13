# Deploy — web trên Vercel, API + CSDL trên Azure

| Phần | Ở đâu | Tự cập nhật khi |
|---|---|---|
| Web | Vercel project `crabshare` (tài khoản của Thiện), thư mục gốc `web/` → https://crabshare.vercel.app | Push lên nhánh production của Vercel; mọi nhánh/PR khác có link Preview riêng |
| API | Azure App Service `crabshare-api` (Linux B1, .NET 10) → https://crabshare-api.azurewebsites.net | Push lên `develop` có thay đổi `backend/` hoặc `database/` (workflow `deploy-backend.yml`) |
| CSDL | Azure SQL `crabshare-sql` / `crabshare` (Basic) | Migration chạy trong cùng workflow, trước khi deploy API |

Tất cả nằm trong nhóm tài nguyên `crabshare-rg`, vùng **East Asia** (gói Azure for Students chỉ cho Hong Kong, Hàn, Nhật, Malaysia West, Indonesia Central). Chi phí ~18 USD/tháng trừ vào credit — xong bảo vệ thì xoá cả nhóm `crabshare-rg`.

## Tự động deploy API (`.github/workflows/deploy-backend.yml`)
1. Build + test (không gồm test CSDL).
2. Đăng nhập Azure bằng **OIDC**: danh tính `crabshare-github-deploy` chỉ tin nhánh `develop`; repo chỉ lưu 3 biến định danh `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (Settings → Secrets and variables → Variables), không có mật khẩu. Repo này phát token OIDC dạng định danh bất biến, nên subject khai trên Azure phải là `repo:thienhoibai@190101556/crabshare@1415157593:ref:refs/heads/develop` (dạng `repo:thienhoibai/crabshare:...` sẽ bị từ chối).
3. Chạy DbMigrator lên Azure SQL (chỉ chạy file `V*.sql` mới).
4. Deploy lên App Service, rồi chờ `/api/health/ready` báo `database: connected`.

Chạy lại tay: tab **Actions** → *Deploy backend* → **Run workflow** (nhánh `develop`).

## Quy tắc
- **Không bao giờ chạy DbMigrator `--reset` vào Azure.** `--reset` xoá CSDL rồi DbUp tạo lại theo gói mặc định của Azure (General Purpose, vài trăm USD/tháng).
- Migration mới phải chạy được trên CSDL đang có dữ liệu (đã có V006 làm mẫu: thêm cột cho phép NULL → điền dữ liệu → mới đặt NOT NULL).
- API đăng nhập CSDL bằng managed identity (user `[crabshare-api]`, chỉ đọc/ghi dữ liệu); không có mật khẩu SQL nào.
- Seed dữ liệu demo chỉ chạy ở Development nên trên Azure **không tự seed** (xem mục làm mới dữ liệu).

## Cấu hình App Service
`ASPNETCORE_ENVIRONMENT=Production`, `ConnectionStrings__Default` (Authentication=Active Directory Managed Identity), `Jwt__SigningKey` (ngẫu nhiên, chỉ nằm trên Azure), `Storage__RootPath=/home/data/storage` (deploy lại không xoá file đã tải lên), `Cors__Origins__0..n`, `Cors__OriginPatterns__0`.
Khi xem cấu hình bằng `az webapp config appsettings list`, chỉ lấy **tên** (`--query "[].name"`), đừng in giá trị.

Web gọi API qua biến `VITE_API_URL` trên Vercel (loại Config, gắn lúc build — đổi xong phải Redeploy). CORS của API nhận:
- `Cors:Origins` — địa chỉ cố định: `https://crabshare.vercel.app`, link demo giao diện cũ.
- `Cors:OriginPatterns` — mẫu có dấu `*` (chỉ khớp chữ, số, gạch ngang): `https://crabshare-*-nguyn1hien.vercel.app` cho mọi bản Preview.

App mobile trỏ vào server: `--dart-define=API_URL=https://crabshare-api.azurewebsites.net --dart-define=WEB_URL=https://crabshare.vercel.app`.

## Làm mới dữ liệu demo trên Azure (cần quyền quản trị CSDL — Thiện)
```bash
az sql db delete -g crabshare-rg -s crabshare-sql -n crabshare --yes
az sql db create -g crabshare-rg -s crabshare-sql -n crabshare --edition Basic --capacity 5 --max-size 2GB --backup-storage-redundancy Local
```
Rồi, với tài khoản quản trị (`az login`): tạo lại user CSDL `[crabshare-api]` (db_datareader, db_datawriter) và `[crabshare-github-deploy]` (db_ddladmin, db_datareader, db_datawriter) bằng `CREATE USER ... FROM EXTERNAL PROVIDER`, chạy workflow *Deploy backend* (tạo bảng), rồi chạy API trên máy một lần ở Development với chuỗi kết nối Azure để seed:
```bash
# PowerShell, từ thư mục publish của API
$env:AZURE_TOKEN_CREDENTIALS='AzureCliCredential'; $env:ASPNETCORE_ENVIRONMENT='Development'; $env:Seed__Enabled='true'
$env:ConnectionStrings__Default='Server=tcp:crabshare-sql.database.windows.net,1433;Database=crabshare;Authentication=Active Directory Default;Encrypt=True'
dotnet CrabShare.Api.dll   # thấy "Đã seed dữ liệu demo" thì Ctrl+C
```
