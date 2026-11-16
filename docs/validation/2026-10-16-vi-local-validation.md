# VI-01–VI-06 — Bản sửa và kiểm thử trên DB local

Ngày 16/10/2026, nhánh `develop`, nền commit `1aa8418`. Người dùng chốt chỉ sửa VI-01–VI-06; để lỗi token ở API feature khác và cache góp vốn lại.

## Thay đổi

- **VI-02:** `OperatorReviewService` chuyển phần audit viết tạm trước TH-02 sang `IAuditLog` và `db.InTransactionAsync`. Giữ thứ tự khoá audit → hộ nuôi, snapshot trước/sau, actor, lý do, độ chính xác millisecond và tính nguyên tử. Không thay đổi Auth/Catalog/Orders.
- **VI-03:** lưới hộp tự đưa trang vượt phạm vi về trang còn dữ liệu. Chỉ clamp khi request hiện hành đã hoàn tất, tránh dùng tổng cũ trong cache để huỷ request trang cuối vừa có hộp mới.
- Sửa ghi chú bàn giao lỗi thời về audit dùng chung và mobile GET hộp/`batchCode`.
- Thêm `backend/scripts/Validate-VI01-06Local.ps1` để lặp lại kiểm thử API/SQL trên DB local được chỉ định. Không đổi fixture xUnit sang DB dev có sẵn.

## Đúng DB người dùng cung cấp

Đã dùng SQL Server **ZIENK**, database **CrabShare_Local**, Windows Integrated Security, Encrypt/TrustServerCertificate, Pooling=False và MultipleActiveResultSets=False theo cấu hình người dùng.

DB ban đầu có 54 bảng và 9 view; chưa có người dùng/hộ nuôi/lô/audit. Schema đã được tạo thủ công nên không có `dbo.SchemaVersions`. Đây không phải `CrabShareDev` LocalDB trong báo cáo rà soát ban đầu.

Trước khi ghi dữ liệu kiểm thử:

1. Tạo DB tạm riêng trên ZIENK, áp V001–V011 bằng migrator của repo.
2. Đối chiếu **1.248 mục metadata** giữa DB tạm và CrabShare_Local: cột, kiểu/nullability/identity/computed, check/default, index, FK, view/trigger/function; không có chênh lệch. Dữ liệu danh mục grade/fee/risk disclosure/contract template cũng khớp.
3. Bổ sung **riêng** bảng journal SchemaVersions và 11 tên script đã được đối chiếu. Thời điểm journal là thời điểm tiếp nhận schema, không phải lịch sử chạy script gốc. Không chạy lại DDL trên bảng hiện hữu.
4. Chạy migrator với connection string CrabShare_Local: kết quả **No new scripts need to be executed**. DB tạm đã được xoá và xác nhận không còn.

Không reset DB, không tắt trigger và không sửa fee tier.

API riêng phục vụ kiểm thử đã được dừng sau khi hoàn tất; không để seed/job chạy nền. DB hiện có fixture test nên seeder mặc định chỉ chạy khi không có người dùng sẽ bỏ qua; lượt này không tạo các tài khoản/data demo của những feature khác.

## Kiểm thử trực tiếp trên CrabShare_Local

API riêng tại `http://127.0.0.1:5296`, seed/jobs tắt. Health ready trả 200 và database connected. Script xác minh server/database, rồi đối chiếu người dùng mới tạo qua HTTP trong DB được chọn trước khi cấp role cho tài khoản admin kiểm thử.

Run **VI20261016160550-16fb84**, 16:05 giờ Việt Nam: **179/179 kiểm tra pass**, tổng thời gian 4,5 giây. Tạo 1.200 hộp bằng một request mất **161,39 ms**, tính cả HTTP round trip, đạt yêu cầu dưới 2 giây.

| Phạm vi | Kiểm tra pass | Nội dung chính |
| --- | ---: | --- |
| Preflight | 8 | Đúng server/DB, kết nối mã hoá, trigger và schema lịch tương đối |
| VI-01 | 18 | Đăng ký Owner/role, sửa Draft, gửi Submitted, chặn sửa sau gửi |
| VI-02 | 32 | Admin duyệt/sức chứa, phân quyền, Staff và claim sau đăng nhập lại |
| VI-03 | 21 | Bulk 1.200, vượt sức chứa 422, đổi trạng thái, tìm kiếm/lọc/phân trang |
| VI-04 | 23 | Approved/Owner guard, Draft, sai dải vốn, thiếu MortalityReserve, lưu/gửi chi phí |
| VI-05 | 43 | Bổ sung/version 2, duyệt Funding/Locked, fee snapshot, tranche, audit, trigger rollback probes, reject |
| VI-06 | 11 | Chỉ lô công bố, Locked cost summary, tiến độ bằng SQL view, không lộ Draft/Rejected |
| VI-02 kiểm tra tiếp | 23 | Reject/suspend, xoá Staff, token cũ bị chặn ở các API thuộc VI, cấu hình phí giữ nguyên |

Các phép thử SQL INSERT/UPDATE/DELETE lên chi phí Locked, lịch, version và audit chạy trong transaction riêng luôn rollback. DELETE version cha có thể bị FK chặn trước trigger; các phép sửa khác trực tiếp chứng minh trigger 51008 hoạt động. Backend cũng chặn sửa chi phí bằng 422 `batch.cost_locked`.

Ngoài script, đọc và tính lại SHA-256 độc lập cho toàn bộ **15 dòng audit** thực tế: prev_hash và row_hash đều hợp lệ. Funding progress được đối chiếu với view ở mức **0 vốn**; không tạo khoản góp/thanh toán để giữ phạm vi đã chốt.

## Dữ liệu kiểm thử giữ lại

Giữ nguyên các fixture có mã run để kiểm tra lại; không cố xoá dữ liệu Locked hoặc audit bất biến. Mật khẩu/JWT không được ghi vào báo cáo hoặc manifest.

| Dữ liệu | Định danh / trạng thái cuối |
| --- | --- |
| Người dùng test | user_id 1–5: Owner, admin test, Staff đã gỡ, Investor, Owner hồ sơ bị từ chối |
| Hộ nuôi chính | operator_id 1, Suspended sau ca kiểm thử đình chỉ; 1.200 hộp `0001`–`1200` |
| Hộ nuôi từ chối | operator_id 2, Rejected |
| Lô công bố | `B-a53e0309a5734e25be`, Funding; cost version 2 Locked; 2 tranche Planned |
| Lô từ chối | `B-01f210047bf84040a8`, Rejected |
| Tổng cuối | 5 users, 2 operators, 2 batches, 1.200 boxes, 3 cost versions, 15 audits; 3 fee tiers giữ nguyên |

Manifest và kết quả gốc nằm tại:

```text
C:\Users\ziend\AppData\Local\Temp\crabshare-vi-local-20261016\VI20261016160550-16fb84\manifest.json
C:\Users\ziend\AppData\Local\Temp\crabshare-vi-local-20261016\VI20261016160550-16fb84\summary.json
C:\Users\ziend\AppData\Local\Temp\crabshare-vi-local-20261016\VI20261016160550-16fb84\report.md
```

## Hồi quy

- Backend đầy đủ: **643 API + 4 SettlementEngine pass**, 0 fail/skip. Bộ xUnit vẫn dùng DB riêng; kết quả 179 kiểm tra phía trên mới là kiểm thử trực tiếp CrabShare_Local.
- Test audit mới: trước sửa nhận 200 thay vì 500 khi shared writer được cấu hình lỗi; sau sửa nhận 500 và rollback cả hồ sơ/audit. Các ca mixed writer, concurrent decision và rollback hiện hữu tiếp tục pass.
- Ba test hộp mới đều được chạy thất bại trước sửa rồi qua sau sửa: trang cuối co lại do đổi trạng thái, co lại do thay đổi khác, và co lại → thêm hộp → mở lại trang cuối có cache cũ.
- Browser đầy đủ sau sửa cuối: **96 pass, 2 skip**. Hai ca browser API demo riêng không bật vì yêu cầu tài khoản seed và có ca thay cấu hình fee; không trỏ chúng vào DB người dùng. Các ca browser đã chạy dùng phản hồi API kiểm soát.
- Web TypeScript/Vite build pass.
- Review độc lập cuối: không còn lỗi cần sửa trong diff thuộc phạm vi đã chốt.

Mobile không thay đổi. Máy thiếu Flutter/Dart SDK nên chưa chạy analyze/test hoặc UI mobile với DB này; API/DTO và nhãn phần trăm chung đã được đối chiếu, không coi đó là kiểm chứng runtime mobile.

## Chạy lại

Terminal API từ gốc repo, chỉ cấu hình trong phiên terminal, không đổi connection string chung của nhóm:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Default = 'Data Source=ZIENK;Initial Catalog=CrabShare_Local;Integrated Security=True;Persist Security Info=False;Pooling=False;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=True;Application Name=CrabShare VI local validation;Command Timeout=0'
$env:Seed__Enabled = 'false'
$env:Jobs__Enabled = 'false'
dotnet run --project backend/src/CrabShare.Api --no-launch-profile --urls http://127.0.0.1:5296
```

Terminal kiểm thử khác, từ gốc repo:

```powershell
$localConnection = 'Data Source=ZIENK;Initial Catalog=CrabShare_Local;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;Pooling=False;MultipleActiveResultSets=False'
./backend/scripts/Validate-VI01-06Local.ps1 -ApiBaseUrl http://127.0.0.1:5296 -ConnectionString $localConnection -ExpectedServer ZIENK -ExpectedDatabase CrabShare_Local -OutputDirectory (Join-Path $env:TEMP 'crabshare-vi-local')
```

Mỗi lượt tạo dữ liệu test mới có RunId riêng và giữ lại manifest. Script không reset, migrate, xoá fixture, sửa tài khoản cũ hoặc cấu hình phí.

## Giữ ngoài phạm vi

Theo lựa chọn rõ ràng của người dùng: chưa sửa token cũ trên Catalog/Orders/Auth, cache góp vốn, hợp đồng giả, đóng vốn, thanh toán hoặc thả giống. Các vấn đề đó vẫn được ghi trong báo cáo rà soát ban đầu; không kết luận toàn bộ các feature đó đã ổn.
