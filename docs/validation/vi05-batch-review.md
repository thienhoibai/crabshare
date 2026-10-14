# VI-05 UC08 duyệt lô và khóa chi phí

**Bản sửa tiếp theo:** [lịch theo mốc thực tế và bổ sung/gửi lại](vi05-relative-schedule-and-revision.md) thay quy tắc ngày bắt buộc và Rejected sửa được trong báo cáo bản đầu bên dưới. Áp thêm V009 trước khi dùng bản mới.

Ngày: 14/10/2026. Bắt đầu trên `develop`; nhánh hiện tại khi bàn giao là `feature/CS-34-duyet-lo` sau thay đổi bên ngoài phiên triển khai. Agent không tạo/checkout nhánh hoặc worktree, không commit/push/PR, không dependency mới. Đã đọc Phiếu v1.2 và TL-11/TL-03/TL-15 trong thư mục Chuan_hoa ngoài repo. Thiết kế bổ sung lịch đợt do hộ nuôi nhập đã được người dùng chấp thuận.

## Thay đổi và endpoint

- `Features/Batches/BatchReviewService`, `AdminBatchesController`: quyền PlatformAdmin được kiểm tra cả policy và tài khoản Active/role hiện hành trong DB. GET `/api/admin/batches?status=PendingApproval&page=1&pageSize=20`; GET `/api/admin/batches/{code}`; POST `.../{code}/approve` với `{fundingOpenAt,fundingDeadline}`; POST `.../{code}/reject` với `{reason}`. Danh sách dùng PagedResult, chi tiết gồm hộ nuôi, đúng version, items, tổng, lịch, phí và lý do từ chối.
- `BatchService`, `BatchDtos`: PUT `/api/batches/{code}/standard-cost` nhận thêm `tranches: [{trancheNo,plannedDate,unlockCondition}]`. Draft có thể chưa có lịch; lịch đã nhập phải có ngày và điều kiện tối đa 300 ký tự. Submit/approve yêu cầu lịch khớp đúng các nhóm khoản chi cần giải ngân, số đợt 1–255 và tổng từng đợt dương. Không tự điền ngày, điều kiện, tỷ lệ hoặc số đợt trong luồng thật.
- `standard_cost_tranche_plan` gắn với cost version. Khi sửa bản Rejected tạo version mới như VI-04; lịch cũ và items cũ được giữ. Không thêm Rejected → PendingApproval; state machine hiện tại chưa có chuyển trạng thái đó. Lý do từ chối hiển thị cho cả Admin và hộ nuôi.
- `FeeTierService`/`FeeTiersController`: GET/POST `/api/admin/fee-tiers`, PUT `/api/admin/fee-tiers/{id}`. Admin chọn khoảng vốn, có/không bao gồm từng cận, số tiền cố định và khoảng ngày hiệu lực. Cấm khoảng vốn chồng nhau trong cùng khoảng ngày; ghi audit. Bậc phí không khớp hoặc nhiều bậc khớp làm approve lỗi, không cập nhật một phần. Phí đã chốt trên lô không đổi khi sửa cấu hình.
- Web: nối API thật cho `AdminBatches`, `AdminBatchDetail`; `CostScheduleEditor` trên màn hộ nuôi và `FeeTierEditor` trên cài đặt Admin. Loading/error/empty, retry, server pagination/filter, chặn gửi lặp, cập nhật cache, tải lại trạng thái khi request xử lý lỗi. Bỏ ROI ước tính trên chi tiết Admin và cấu hình phí % giả trên cài đặt.
- `money.ts`: quantity quy về phần nghìn và tính bằng BigInt, làm tròn nửa đồng lên cho tiền không âm. `1.005 × 100 = 101`, giống decimal backend. Tổng chi phí không vượt DECIMAL(18,0) và phải dương khi gửi/duyệt; giá 0 vẫn lưu nháp được.

## Quy tắc dùng

- TL-11 §6.2/§8: khóa vĩnh viễn khi lô sang Funding, không có API mở khóa. Service kiểm tra mọi version Locked/Approved của lô trước khi ghi để không né khóa bằng version mới. Trigger bảo vệ item, version và lịch, kể cả đổi foreign key vào/ra version Locked.
- TL-11 §6.4: MortalityReserve giữ lại trong tài khoản lô theo sự kiện, không cộng vào tranche theo lịch. TL-03 §6.1: Depreciation trả khi quyết toán, không giải ngân theo lịch. Giá trị tranche = tổng amount đã làm tròn từng dòng của các category còn lại có cùng tranche_no; ngày/điều kiện sao chép từ lịch hộ nuôi. Trạng thái ban đầu Planned, không tự chi tiền.
- TL-15 §6.2: phí cố định VND, không dùng phần trăm, không trừ vốn/tranche/Revenue Pool. V008 bổ sung hai cờ biên: T1 [0,50 triệu), T2 [50 triệu,200 triệu], T3 (200 triệu,+∞). Các mức trong V002 được giữ; code chọn từ DB theo target_capital. Ngày hiệu lực bao gồm cả hai đầu, ngày hiện hành theo UTC+07.
- Chỉ chốt phí, chưa triển khai xác nhận đã thanh toán phí khởi tạo. Điều kiện thanh toán tại TL-15 §6.4 chưa có dữ liệu trong schema và nằm ngoài phạm vi đã chốt với người dùng.
- DateTimeOffset lưu UTC, UI nhập có nhãn giờ Việt Nam và gửi offset +07:00; fundingOpenAt < fundingDeadline, deadline ở tương lai. Ngày dự kiến của đợt không trước ngày deadline tại UTC+07. Lịch là dự kiến để đưa vào hợp đồng; chữ ký và đổi mốc sau ký thuộc luồng hợp đồng/giải ngân.
- Sandbox `IBatchAccountProvisioner` mở tài khoản ảo định danh theo batch code, idempotent và không gọi bên ngoài. Account Open được tạo trong transaction và có audit riêng gồm ID, provider, số tài khoản và thời điểm. Gateway không hỗ trợ provisioning, hoặc tài khoản có sẵn không Open, làm approve thất bại. Đây là sandbox theo gateway hiện có; không mở tài khoản ngân hàng thật.
- Duyệt: InTransactionAsync Serializable, khóa audit → hộ nuôi → lô → chi phí; batch/fee/cost/tranches/account và các dòng audit commit hoặc rollback cùng nhau. Hai approve đồng thời chỉ một thành công, request còn lại nhận 422 invalid_transition. Audit thành công không trùng.

## Migration

`database/migrations/V008__batch_approval_and_cost_lock.sql` qua DbUp, không sửa V001–V007. EF bổ sung trong partial handwritten, tắt SQL OUTPUT cho bảng có trigger. Seeder lưu graph chi phí trước rồi mới khóa để tuân thủ trigger.

Áp dụng trên DB phát triển đã xác nhận:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator -- 'Server=(localdb)\MSSQLLocalDB;Database=CrabShareDev;Trusted_Connection=True;TrustServerCertificate=True'
```

DB dev được kiểm tra chỉ đọc: chưa có lô và mới có V001–V003. Chưa tự áp migration vào DB đó. Migrator sẽ áp các V004–V008 còn thiếu trước khi chạy API mới. Không chạy API mới với schema cũ.

Rollback thủ công: `database/rollback/V008__batch_approval_and_cost_lock.sql`, sau khi backup lịch/lý do. Script nằm ngoài thư mục migrator, không tự chạy. Rollback loại bỏ cơ chế bảo vệ mới nhưng không đổi trạng thái Locked hiện có. Đã thử rollback rồi reapply V008 trên DB browser test trống bằng sqlcmd/DbUp, thành công.

## Kiểm chứng

- `dotnet test backend/CrabShare.sln --verbosity normal`: 516 API + 4 SettlementEngine pass ở lượt kiểm tra đầy đủ sau sửa review. VI-05 có 17 ca SQL Server, gồm chuỗi tạo/soạn/submit/approve, phí tại biên, thiếu/chồng tier, cập nhật cấu hình, authorization/thu hồi role, reject, schedule, tổng tiền, nhận vốn + payment request sandbox, rollback và concurrency.
- Trigger test dùng SQL Server LocalDB thật, không mock/in-memory: INSERT/UPDATE/DELETE item, FK vào/ra Locked, sửa/xóa/bỏ khóa version, tạo/chuyển version để né khóa, lịch đợt và statement nhiều dòng. Draft vẫn sửa được. Có thử đổi batch về Draft bằng SQL rồi gọi service; service vẫn chặn vì đã có version Locked.
- Rollback test gây lỗi ngay sau SQL save và sau khi account + hai dòng audit đã lưu; trạng thái, khóa, phí, tranche, account và audit đều rollback. Sau đó hai request duyệt đồng thời chỉ một thành công.
- Web `npm run lint` (TypeScript typecheck) và `npm run build` pass. Playwright `tests/batches.spec.ts tests/batch-review.spec.ts` với VI04_API_URL/VI05_API_URL trỏ API cô lập: 10 pass, không skip. 8 test dùng phản hồi API kiểm soát; 2 test API thật. Ca VI-05 tạo/lưu/reload lịch/submit, đổi phí qua UI, approve, kiểm tra Locked/Funding/tranche, thử sửa và nhận 422, rồi reject lô khác.
- API thật dùng DB riêng `CrabShareVI05BrowserTests_20261014`, migrator V001–V008, seed sandbox. Đã xem ảnh desktop và 390px, bảng cuộn trong panel, không tràn ngang toàn trang. Các fixture SQL tạo tên DB riêng và tự dọn. API browser đã dừng và DB browser riêng đã được xóa sau lượt kiểm chứng cuối.
- Review độc lập đã phát hiện và sửa tài khoản nhận vốn, giới hạn tổng DECIMAL(18,0), midpoint rounding và audit tài khoản. Không kiểm chứng với nhà cung cấp thanh toán/hợp đồng production hoặc benchmark tải.

## Thử thủ công

1. Áp migrator trên DB dev, chạy API và web. Owner Approved mở `/operator/create-batch`, nhập chi phí có reserve, phân đợt cho khoản chi thường, nhập ngày/điều kiện, lưu rồi gửi duyệt.
2. Admin có thể sửa bậc phí ở `/admin/settings`, rồi vào `/admin/batches` → chi tiết lô.
3. Nhập lịch gọi vốn trước ngày giải ngân đầu tiên, duyệt: Funding, version Locked có locked_at, phí theo DB, tranche Planned và tài khoản sandbox Open.
4. Dùng Owner thử PUT standard-cost: 422 `batch.cost_locked`. Dùng SQL trực tiếp trên DB test để kiểm tra trigger từ chối. Lô PendingApproval khác có thể từ chối bằng lý do; chi phí không bị khóa và không có tranche/phí do thao tác đó.
