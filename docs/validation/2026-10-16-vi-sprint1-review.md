# Rà soát Sprint 1 — VI-01 đến VI-06

> Cập nhật sau rà soát: xem [bản sửa và kiểm thử trực tiếp trên DB người dùng](2026-10-16-vi-local-validation.md). `CrabShareDev` bên dưới là DB mặc định được kiểm tra ban đầu; DB dev người dùng cung cấp sau đó là `ZIENK / CrabShare_Local`, đã được đối chiếu và kiểm thử riêng. Lỗi phân trang hộp đã sửa; lỗi token ở API feature khác và cache góp vốn được để lại theo yêu cầu người dùng.

Ngày: 16/10/2026 (Asia/Bangkok). Nhánh: `develop`.
Commit: `1aa841829e9f18f10a298b383d0fc336c4ed9d68`.
Đã fetch và xác nhận HEAD bằng `origin/develop`, không có commit lệch hai phía.

## Kết luận

Các luồng chính VI-01–VI-06 đã triển khai và vượt qua các test backend hiện có trên SQL Server LocalDB cô lập. Tuy nhiên, chưa thể kết luận hệ thống ổn hoàn toàn: còn một lỗi thu hồi quyền nhân viên, hai lỗi giao diện/tích hợp đã tái hiện, và CSDL dev trên máy chưa cập nhật schema. Mobile mới được đối chiếu code/contract, chưa chạy kiểm tra bằng Flutter trong lượt này.

Lượt rà soát chỉ thêm báo cáo này; không sửa mã nguồn, không commit/push, không đổi nhánh và không áp migration vào `CrabShareDev`.

## Vấn đề cần xử lý

### P1 — Nhân viên bị xoá vẫn dùng được token cũ ở Catalog/Orders

Vị trí: `backend/src/CrabShare.Api/Common/Auth/AuthSetup.cs:55`, `Common/Auth/CurrentUser.cs:42`, `Features/Catalog/CatalogService.cs:36`, `Features/Orders/OrderPackingService.cs:41`, `Features/Orders/OrderFulfilmentService.cs:42`.

`OperatorService` đã xoá đúng `operator_member` và role của Staff. Tuy nhiên, policy Operator chỉ kiểm tra role trong JWT; xác thực token chỉ loại tài khoản không tồn tại hoặc bị Locked, không kiểm tra membership/role hiện hành. Các service Catalog/Orders lấy `operator_id` từ JWT mà không đối chiếu membership hiện hành. Token có thời hạn mặc định 480 phút.

Tái hiện trên API thật và DB riêng đã áp V001–V011:

1. Đăng ký chủ hộ và nhân viên; tạo hộ nuôi; chủ hộ thêm Staff.
2. Staff đăng nhập lại, giữ nguyên bearer chứa `OperatorMember` và `operator_id`.
3. Chủ hộ xoá Staff, API trả `204`.
4. Dùng chính bearer cũ:

| Request | Kết quả thực tế |
| --- | --- |
| GET `/api/operators/me` | `404 operator.not_found` |
| GET `/api/operators/me/members` | `403 operator.membership_required` |
| GET `/api/operators/me/listings` | **`200 []`** |
| GET `/api/operators/me/orders` | **`200 []`** |

Hai API cuối vẫn cho phép truy cập phạm vi hộ nuôi cũ. Code đóng gói/giao hàng cũng dùng cùng cách kiểm tra quyền; khả năng ghi này được xác nhận bằng đọc code, chưa thực hiện mutation bằng token bị thu hồi trong lượt tái hiện.

Hướng sửa: kiểm tra role và membership hiện hành, bao gồm khớp `operator_id`, tại cơ chế cấp quyền dùng chung hoặc trước mỗi thao tác trong các service liên quan. Thêm ca hồi quy xoá/chuyển nhân viên rồi dùng token cũ trên API đọc và ghi. Giữ khả năng tạo hồ sơ bằng token của tài khoản mới chưa có OperatorMember.

### P2 — Lưới hộp bị kẹt trang rỗng sau khi đổi trạng thái

Vị trí: `web/src/features/operator/OperatorFarmMap.tsx:104`; điều kiện ẩn phân trang ở dòng 100.

Tái hiện bằng Chromium với phản hồi API kiểm soát: có 51 hộp Available, lọc Available, sang trang 2, chuyển hộp duy nhất của trang đó sang Maintenance. Mutation chỉ invalidate query, không đưa trang hiện hành về phạm vi hợp lệ. API được gọi lại với `page=2`, trả `total=50`, `items=[]`; UI hiện “50 hộp phù hợp” nhưng không có hộp và không có nút chuyển trang vì tổng trang đã còn 1.

Hướng sửa: reset hoặc clamp page sau mutation/biến động total, đồng thời giữ khả năng quay lại khi trang hiện hành không còn dữ liệu. Thêm ca hồi quy lọc trạng thái + trang cuối + đổi trạng thái hộp cuối cùng.

### P2 — Cache góp vốn dùng lại dữ liệu cá nhân khi đổi tài khoản sau HTTP 401

Vị trí: `web/src/features/investor/funding/fundingApi.ts:77` và `:84`, `web/src/shared/api/http.ts:19`, `web/src/app/providers.tsx:8`.

Query funding batch chỉ có mã lô, query disclosure cũng không có userId. QueryClient dùng chung có staleTime 30 giây và không bị xoá khi HTTP interceptor gọi logout trong bộ nhớ.

Tái hiện bằng Chromium với API kiểm soát và thao tác UI:

1. Tài khoản 1 mở `/nha-dau-tu/gop-von/B-CACHE`, có khoản giữ chỗ 111, số tiền 9.000.000 đồng và trạng thái xác nhận rủi ro.
2. Bấm Huỷ giữ chỗ; DELETE trả 401, app tự chuyển sang đăng nhập với URL quay lại.
3. Đăng nhập tài khoản 2 trong vòng 30 giây và tự quay về cùng trang góp vốn.
4. UserId hiện hành là 2, nhưng số lần GET funding vẫn là 1; UI tiếp tục hiện khoản giữ chỗ, số tiền và thời gian của tài khoản 1. Trạng thái KYC/rủi ro trong cache cũng chưa được tải cho tài khoản 2.

Đăng xuất chủ động hiện reload toàn bộ trang nên không thuộc đường tái hiện này. Lỗi đã chứng minh là lộ/sử dụng nhầm dữ liệu phía giao diện; chưa chứng minh backend cho phép tài khoản 2 ghi vào khoản góp của tài khoản 1.

Hướng sửa: thêm userId vào các query chứa dữ liệu cá nhân và huỷ/xoá query cá nhân khi phiên thay đổi; rà cả cache payment/disclosure. Thêm test 401 → đăng nhập tài khoản khác → quay lại trang góp vốn.

## CSDL dev trên máy còn thiếu migration

Kiểm tra chỉ đọc `CrabShareDev.dbo.SchemaVersions` cho kết quả chỉ có:

- V001__initial_schema.sql
- V002__reference_data.sql
- V003__listing_image_and_price_revision.sql

Repo hiện có đến V011. Kiểm tra schema trực tiếp xác nhận chưa có `batch.rejection_reason`, bảng `standard_cost_tranche_plan` và `disbursement_tranche.anchor_code`. Các API lô mới phụ thuộc vào những thành phần này; test xanh trên DB riêng không đồng nghĩa DB dev hiện tại chạy được cùng code.

Cần chạy migrator từ gốc repo để áp các migration còn thiếu trước khi dùng API mới:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator
```

Không cần dùng `--reset`. Báo cáo này chưa áp migration hoặc thay đổi dữ liệu dev.

## Đối chiếu từng task

| Task | Kết quả rà soát |
| --- | --- |
| VI-01 | Tạo Draft + Owner + role trong một lần SaveChanges; sửa Draft/Rejected; gửi Draft → Submitted; đăng nhập lại có operator_id. Có test tích hợp. |
| VI-02 | Duyệt/từ chối/đình chỉ, sức chứa, lý do và audit đã có; quyền quản lý thành viên được kiểm tra. Còn lỗi thu hồi quyền ở các module dùng JWT cũ nêu trên. |
| VI-03 | API hộp, giới hạn sức chứa, khoá đồng thời, route `/operator/boxes` và mobile evidence GET đã tích hợp. Test 1.200 hộp dưới 2 giây qua. Còn lỗi phân trang giao diện nêu trên. |
| VI-04 | Owner Approved mới tạo/sửa/gửi lô; kiểm tra dải vốn, thù lao, chu kỳ, MortalityReserve; form và danh sách dùng API. Test giao dịch, rollback và phân quyền qua. |
| VI-05 | Duyệt → Funding; chọn fee tier từ DB, snapshot phí, mở batch account sandbox, sinh tranche; Locked bị chặn ở service và trigger SQL. Có test concurrency/rollback và approve → giữ chỗ/thanh toán sandbox. |
| VI-06 | Danh sách/chi tiết công bố dùng API; summary chi phí Locked; tiến độ từ view; web/mobile dùng cùng percentLabel, không có trường lợi suất kỳ vọng. Mobile chưa chạy analyze/test tại máy này. |

## Phụ thuộc và phần tạm còn lại

- **Audit TH-02 đã có:** common AuditLogService/AuditChain và job xác minh được đăng ký. OperatorReviewService vẫn có cách ghi audit riêng nhưng dùng cùng giao thức hash/khóa/thời gian; MixedAuditDatabaseTests đã kiểm tra tương thích. Không phát hiện lỗi phải thay writer ngay chỉ vì nó được viết trước dependency.
- **Hộp → bằng chứng đã nối thật:** `ApiEvidenceRepository.boxes()` gọi GET theo trang và nhận `batchCode`/`latestEvidence`. Ghi chú thiếu GET và thiếu batchCode trong `Features/Boxes/README.md:67–68` đã lỗi thời.
- **Góp vốn/VietQR/webhook đã có:** duyệt lô tạo batch account Open; test nhận giữ chỗ và yêu cầu thanh toán trên lô vừa duyệt qua. Cần sửa cache phiên nêu trên.
- **Đóng vốn, ký hợp đồng và thả giống chưa có đầy đủ service vận hành:** Features/Contracts và Features/Production vẫn chỉ có hướng dẫn; đăng ký service tương ứng còn comment. Các phép gán `CapitalClosedAt`, `TotalConfirmedCapital`, `FullySignedAt`, `StockedAt` trong code hiện chủ yếu ở seeder. Resolver lịch theo mốc chờ đúng dữ liệu thực tế, chưa có đủ luồng sinh các mốc này từ người dùng. Đây là phụ thuộc vòng đời tiếp theo, ngoài tiêu chí hoàn thành VI-01–VI-06.
- **Các trang cũ vẫn có mock:** OperatorBatchDetail và OperatorContract còn nội dung cố định/ký giả bằng setTimeout; ContractStep của luồng góp vốn còn chờ TH-08. Danh sách VI-04 hiện mở editor API theo mã lô, nên không dùng trang chi tiết mock đó để chứng minh task VI-04 đã nối thật. Không coi seeder hoặc nút ký giả là kiểm chứng hợp đồng thực tế.
- FakePaymentGateway/FakeSigningService là sandbox được tài liệu dự án quy định; không phải bằng chứng thiếu triển khai VI-01–VI-06.

## Kiểm chứng đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `dotnet test backend/CrabShare.sln --verbosity quiet --logger 'trx;LogFilePrefix=sprint1-audit'` | **642 API + 4 SettlementEngine pass**, 0 fail, 0 skip. Bao gồm **136 ca** trong các nhóm Operators/OperatorReview/Boxes/Batches/BatchReview/BatchExplore. DB test dùng database riêng. |
| Filter BoxesTests / BoxesAuthenticationTests / EvidenceDatabaseTests.Box_ | **24/24 pass**, gồm assertion tạo 1.200 hộp dưới 2 giây. |
| `npm run build` trong web | Pass. |
| `CI=1 npx playwright test tests/batches.spec.ts tests/batch-review.spec.ts tests/batch-explore.spec.ts` | **15 pass, 2 skip**; hai ca browser dùng API thật thiếu VI04_API_URL/VI05_API_URL. Những ca chạy không thay thế full browser-to-live-API E2E. |
| Tái hiện quyền Staff trên API thật | Xác nhận lỗi P1 bằng DB GUID cô lập, migration V001–V011, API port riêng, seed/jobs tắt. Server đã dừng và DB riêng đã xoá. |
| Hai tái hiện Chromium với API kiểm soát | Xác nhận lỗi phân trang hộp và cache tài khoản góp vốn. Server kiểm thử đã dừng. |
| `git diff --check` trước khi thêm báo cáo | Pass; working tree sạch. |
| Flutter analyze/test | Chưa chạy: không tìm thấy Flutter/Dart SDK cục bộ. |

## Thứ tự xử lý đề xuất

1. Cập nhật DB dev bằng migrator, giữ dữ liệu hiện có.
2. Sửa thu hồi quyền Staff trên mọi API hộ nuôi dùng claims cũ.
3. Sửa cache dữ liệu cá nhân khi đổi phiên và lỗi phân trang hộp.
4. Chạy hồi quy tương ứng, browser với API thật và mobile trên máy/CI có Flutter.
5. Cập nhật các ghi chú phụ thuộc lỗi thời; tiếp tục theo dõi TH-07/TH-08 và luồng thả giống ở sprint sau.
