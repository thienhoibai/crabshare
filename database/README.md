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

VI-05 thêm `V008__batch_approval_and_cost_lock.sql`: lịch đợt theo cost version, lý do từ chối, cờ biên fee_tier, trigger bất biến cho cost/version/lịch. Rollback thủ công ở `rollback/V008__batch_approval_and_cost_lock.sql`; không được DbUp tự chạy. Xem [báo cáo VI-05](../docs/validation/vi05-batch-review.md). Chạy migrator trước API mới; không chỉ copy code khi DB còn schema cũ.

1. **Không sửa** file migration đã có trên `main`. Muốn đổi → file mới `V003__...sql`, `V004__...`.
2. Tên file: `V` + 3 chữ số + `__` + mô tả không dấu.
3. Không viết `CREATE DATABASE` / `USE` trong migration (DbMigrator tự tạo CSDL).
4. Không dùng chuỗi `/*` bên trong comment `/* ... */` (SQL Server hiểu là comment lồng → lỗi 113).
5. Sau khi chạy migration mới: sinh lại entity (`backend/README.md` mục *Đổi CSDL*) và commit cả hai.
6. File trong `reference/` giữ xuống dòng **LF** (`.gitattributes` đã ép) — đổi nội dung là đổi hash, phải tạo bản mới (RD/CT mới) chứ không sửa bản cũ.

## Dữ liệu demo

`DevDataSeeder` + `DemoLifecycleSeeder` (`backend/src/CrabShare.Api/Infrastructure/Persistence/`) tạo khi API chạy ở Development và CSDL chưa có người dùng (khoảng 5 giây). Làm lại từ đầu:

```bash
dotnet run --project backend/tools/CrabShare.DbMigrator -- --reset
```

rồi chạy API (F5). Mốc thời gian tính lùi từ lúc seed nên dữ liệu luôn "đang diễn ra"; số liệu cố định giữa các lần seed.

**Tài khoản** (mật khẩu chung: hằng `DemoPassword` trong `DevDataSeeder.cs`): `admin`, `reviewer`, `operator` (chủ hộ nuôi), `staff`, `investor1`–`investor4` (đã Verified, đã xác nhận bản công bố rủi ro RD-2026-01, có tài khoản nhận tiền), `customer` (có địa chỉ giao hàng). Email dạng `<tên>@crabshare.local`.

**Người nuôi:** HTX Nuôi cua Năm Căn (Approved, sức chứa 2.000) — 1.700 hộp `0001`–`1700`, tài khoản nhận tiền VCB.

| Lô | Trạng thái | Dùng cho | Có sẵn |
|---|---|---|---|
| `CS-2611-01` | PendingApproval | VI-05 duyệt lô | Chi phí chuẩn đã gửi (Submitted); chưa có bậc phí, tài khoản lô |
| `CS-2610-03` | Funding | TH-04 giữ chỗ, TH-05 VietQR, NH-13 đặt trước | Cua lột. Mục tiêu 120 tr (tối thiểu 90, trần 150); đã Confirmed 50 tr (investor1 30, investor2 20); hạn gọi vốn còn 11 ngày; tài khoản lô Open; 3 đợt giải ngân Planned |
| `CS-2610-02` | Funding | như trên (lô thứ hai cho danh sách gọi vốn) | Cua gạch. Mục tiêu 60 tr (tối thiểu 45, trần 75); đã Confirmed 25 tr (investor3 15, investor4 10); hạn gọi vốn còn 10 ngày |
| `CS-2610-01` | InProduction | VI-08/09/11 nhật ký, sự kiện hộp, timeline · KH-07..10 bằng chứng · KH-11 danh mục | 1.200 con ở hộp 0001–1200 (20 chết → 1.180 còn sống), đang "ngày 45/90"; nhật ký 30 ngày (một ngày pH vượt ngưỡng); 30 lần lột xác; 9 ảnh bằng chứng (1 ảnh Flagged); vốn 180 tr từ 4 nhà đầu tư; đã giải ngân đợt 1–2 |
| `CS-2609-04` | Harvesting | NH-02..10 bán hàng · VI-15/17 tem, truy xuất · TH-10 giải ngân | 288 con InStock (≈125 kg) có tem Active và ảnh kích hoạt; 4 niêm yết Published L1–L4 còn tồn; đợt giải ngân 3 đang Requested |
| `CS-2605-01` | Settlement | TH-12..14 quyết toán · KH-14 dashboard | Cua gạch, 192 con bán hết qua 12 đơn Completed: doanh thu thực ≈ 55,3 tr, chi phí chuẩn đã khoá 33,99 tr; capital_share 3 nhà đầu tư (48 tr); đã giải ngân đủ 3 đợt |

- Mỗi khoản góp Confirmed có hợp đồng FullySigned (người nuôi ký trước, nhà đầu tư ký sau), `payment_request` Paid và `provider_transaction` đã khớp. Mỗi đơn Completed có `payment_request` Paid với mã đối chiếu = `order_no`.
- `DemoSeedDatabaseTests` kiểm tra các con số trên (chạy cùng `dotnet test`).
- Mã lô trùng dữ liệu mẫu (mock) của app mobile (`CS-2610-01` đang nuôi, `CS-2610-02/03` gọi vốn, `CS-2609-04` thu hoạch) để khi đổi màn sang API thật không lệch mã.
- Mỗi lô dùng một dải hộp riêng vì EF đang map `physical_slot ↔ slot_allocation` thành quan hệ một-một (do index UNIQUE có điều kiện `ux_slot_active`), nên chưa dùng lại hộp đã trả trong cùng một DbContext được.
- Cần thêm dữ liệu mẫu cho tính năng của mình: bổ sung vào `DemoLifecycleSeeder` (PR riêng).

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
