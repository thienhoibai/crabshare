# Deploy — web trên Vercel, API + CSDL trên Azure

| Phần | Ở đâu | Tự cập nhật khi |
|---|---|---|
| Web | Vercel project `crabshare` (tài khoản của Thiện), thư mục gốc `web/` → https://crabshare.vercel.app | Workflow `deploy-web.yml`: push `main` → production; push `develop` → preview cố định https://crabshare-develop-nguyn1hien.vercel.app; PR có thay đổi `web/` → link preview trong comment |
| API | Azure App Service `crabshare-api` (Linux B1, .NET 10) → https://crabshare-api.azurewebsites.net | Push lên `develop` có thay đổi `backend/` hoặc `database/` (workflow `deploy-backend.yml`) |
| CSDL | Azure SQL `crabshare-sql` / `crabshare` (Basic) | Migration chạy trong cùng workflow, trước khi deploy API |

Tất cả nằm trong nhóm tài nguyên `crabshare-rg`, vùng **East Asia** (gói Azure for Students chỉ cho Hong Kong, Hàn, Nhật, Malaysia West, Indonesia Central). Chi phí ~18 USD/tháng trừ vào credit — xong bảo vệ thì xoá cả nhóm `crabshare-rg`.

## Tự động deploy API (`.github/workflows/deploy-backend.yml`)
1. Build + test (không gồm test CSDL).
2. Đăng nhập Azure bằng **OIDC**: danh tính `crabshare-github-deploy` chỉ tin nhánh `develop`; repo chỉ lưu 3 biến định danh `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (Settings → Secrets and variables → Variables), không có mật khẩu. Repo này phát token OIDC dạng định danh bất biến, nên subject khai trên Azure phải là `repo:thienhoibai@190101556/crabshare@1415157593:ref:refs/heads/develop` (dạng `repo:thienhoibai/crabshare:...` sẽ bị từ chối).
3. Chạy DbMigrator lên Azure SQL (chỉ chạy file `V*.sql` mới).
4. Deploy lên App Service, rồi chờ `/api/health/ready` báo `database: connected`.

Chạy lại tay: tab **Actions** → *Deploy backend* → **Run workflow** (nhánh `develop`).

## Tự động deploy web (`.github/workflows/deploy-web.yml`)
Vercel gói Hobby chỉ deploy commit do chủ tài khoản Vercel tạo; commit hay merge của thành viên khác bị **"Deployment was blocked"** và không thêm được thành viên. Vì vậy web không dùng Git integration của Vercel nữa (`web/vercel.json`: `git.deploymentEnabled=false`) mà deploy bằng Vercel CLI trong GitHub Actions với token của chủ project, nên **ai commit hay merge cũng deploy được**.
1. `vercel pull` lấy cấu hình project (Root Directory `web`) và biến môi trường đúng môi trường (`VITE_API_URL` vẫn khai báo trên Vercel như cũ).
2. `vercel build` rồi `vercel deploy --prebuilt` (`--prod` khi push `main`).
3. Push `develop`: gắn alias `crabshare-develop-nguyn1hien.vercel.app` (khớp mẫu CORS `crabshare-*-nguyn1hien.vercel.app`). PR: ghi link preview vào comment.

Thiết lập một lần, chỉ chủ project Vercel làm được (Settings → Secrets and variables → Actions → *Secrets*): `VERCEL_TOKEN` (tạo ở vercel.com/account/tokens, không dán vào đâu khác), `VERCEL_ORG_ID` ("Your ID" trong Account Settings với tài khoản cá nhân), `VERCEL_PROJECT_ID` (Project Settings → General). Thiếu secret thì workflow dừng ngay ở bước *Check secrets* với thông báo rõ. Chạy lại tay: tab **Actions** → *Deploy web* → **Run workflow**.

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

## CS-80: deployment and recovery

The workflow runs only from `develop`. Another team member must review the PR and CI must pass before merging (`docs/git-workflow.md`). Azure OIDC deliberately does not trust feature branches.

1. The infrastructure owner confirms the current Azure SQL backup and a private backup of the complete `/home/data/keys` directory. Keep keys outside GitHub build artifacts. CS-88 creates the directory on first use; preserve it for the lifetime of encrypted records.
2. Build, test and publish before maintenance. The workflow checks configuration without printing secrets, enforces HTTPS-only/Production, disables seed and sets persistent storage/keys. Existing JWT and managed identity credentials remain in Azure. No new paid infrastructure is needed.
3. Stop the old API, apply new migrations, deploy the matching binary and start the app. CS-88 upgrades legacy payout records before serving. Coordinate this short maintenance window with the team.
4. Readiness must pass, followed by `python deploy/smoke.py --expected-revision <SHA>`: HTTPS, database, anonymous 401, web/JS asset and the deployed API commit. The report contains no tokens, photos or account numbers.
5. Run CS-92 acceptance afterwards. Vercel must build with `VITE_API_URL=https://crabshare-api.azurewebsites.net`. Changing that value requires a redeploy. Previews and production are deployed by the `Deploy web` workflow with the project owner's token, so a commit by any member deploys; the Git-integration check that blocked other authors' commits is gone. Code CI alone does not prove a Preview deployment succeeded; look at the `Deploy web` run or the preview comment on the PR.

Failure after maintenance begins does not automatically reopen an old binary. Inspect the last successful Actions step, preserve SQL and keys, deploy a compatible fixed binary and then start the app. Never reset/recreate Azure SQL or roll back to a plaintext-reading binary after V012. Only the infrastructure owner performs coordinated SQL/key backup recovery; prefer a forward fix. DbMigrator now rejects `--reset` outside LocalDB and never creates a missing remote database with an unintended service tier.

`Security__DataProtectionKeyPath=/home/data/keys` is private and separate from `/home/data/storage`. CS-88 accepts forwarded headers only from configured proxies/networks, framework loopback defaults, and documented App Service private ingress ranges when running on that platform (RFC 1918 ranges plus the link-local `169.254.0.0/16` sandbox network that App Service for Linux uses to reach the container). Do not enable `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` or expose Kestrel directly. Reconfigure `Security__KnownProxies__0` / `Security__KnownNetworks__0` when changing ingress. If the smoke check `anonymous-private-route-401` ever fails with HTTP 400 again, `az webapp log tail` shows a `Rejected non-HTTPS request ... from <ip>` warning with the untrusted hop address to add.

Demo data maintenance is an explicit owner action on the existing database. Do not delete/recreate the database or run Development seeding against Azure as a routine deploy step.

## Optional container on an existing server

Azure remains the actual demo environment. `backend/Dockerfile` supplies a non-root API image and an explicit `migrator` target. Replicas do not each apply schema migrations. Build from the repository root:

```bash
docker build -f backend/Dockerfile --target api -t crabshare-api:<SHA> --build-arg SOURCE_REVISION=<SHA> .
docker build -f backend/Dockerfile --target migrator -t crabshare-migrator:<SHA> .
```

`deploy/compose.yml` and `deploy/Caddyfile` target an existing server and existing SQL database. Supply private environment variables `CRABSHARE_DB`, `CRABSHARE_JWT_KEY` (random, at least 32 characters), `CRABSHARE_WEBHOOK_SECRET`, `CRABSHARE_API_HOST` and `CRABSHARE_WEB_HOST`. Never commit them. Production SQL must use TLS `Encrypt=True;TrustServerCertificate=False`, with a separate DDL migration identity and a read/write API identity.

Set `CRABSHARE_SOURCE_REVISION` to the full reviewed commit SHA before a Compose build so the version smoke check can identify that binary.

Point DNS at the server and allow 80/443 for Caddy's managed TLS. Only Caddy publishes ports; the API trusts Caddy at 10.77.0.2 on the dedicated 10.77.0.0/24 network. Change both subnet and proxy setting if they conflict with the host network. Back up `private-keys`, `uploads` and `tls-data`; never use `docker compose down -v` on demo data.

```bash
docker compose -f deploy/compose.yml build
docker compose -f deploy/compose.yml stop api
# Supply the migration identity's CRABSHARE_DB for this command.
docker compose -f deploy/compose.yml --profile tools run --rm migrate
# Restore the API identity's CRABSHARE_DB before starting the API.
docker compose -f deploy/compose.yml up -d api caddy
python deploy/smoke.py --api https://<api-host> --web https://<web-host> --expected-revision <SHA>
```

This optional template does not provision a VPS/SQL service and has not been deployed to a new server.
