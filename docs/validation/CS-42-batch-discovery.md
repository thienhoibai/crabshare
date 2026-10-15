# CS-42 / VI-06 — Khám phá lô (UC09)

Ngày triển khai: 15/10/2026. Nhánh có sẵn `feature/CS-42-kham-pha-lo`; không tạo/chuyển nhánh, commit, push, migration hoặc dependency.

## Phạm vi và quy tắc công bố

Đã đối chiếu Phiếu FA26SE229 v1.2, conventions, state machine, VI-05 và phần bổ sung lịch tương đối. Phiếu yêu cầu nhà đầu tư đọc lô có điều khoản và Standard Cost đã công bố; UC08 ghi ApprovedAt, FundingOpenAt và khóa chi phí khi duyệt. UC09 dùng cùng một predicate cho danh sách và truy cập theo mã:

- Trạng thái `Funding`, `Cancelled`, `Stocked`, `InProduction`, `Harvesting`, `Settlement`, `Closed`.
- `approved_at` và `funding_open_at` không null, đã đến thời điểm hiện hành UTC.
- Có version `Locked` với `locked_at` không null, không ở tương lai.

Cancelled chỉ xuất hiện nếu đã từng công bố theo các điều kiện trên. Draft/PendingApproval/Rejected không xuất hiện dù query yêu cầu đúng trạng thái đó. Quy tắc giữ lịch sử công bố sau Funding được suy ra từ state machine; không giới hạn khám phá ở các lô còn nhận vốn.

## Contract

`GET /api/batches?status=&crabType=&page=&pageSize=` yêu cầu policy Investor, cùng kiểm tra tài khoản Active, bản ghi investor và role hiện hành trong DB. Không yêu cầu KYC để đọc; không mở anonymous. `status` nhận các trạng thái schema nhưng luôn giao với predicate công bố; `crabType` là FatteningMudCrab/RoeCrab/SoftShellCrab. Giá trị sai trả 400; trang mặc định 1, kích thước mặc định 20, tối đa 100. Sắp xếp CreatedAt DESC, BatchId DESC. Trang vượt dữ liệu trả items rỗng.

Response `{items, page, pageSize, total}`. Mỗi item:

```text
batchCode, title, operatorName, crabType, status,
seedQuantity, expectedOutputKg, cycleDays, restockCutoffDays,
minViableCapital, targetCapital, maxCapital, minContribution, operatorSharePct,
fundingOpenAt, fundingDeadline,
fundingProgress: {confirmedCapital, reservedCapital, investorCount, pctOfTarget, percentLabel},
standardCost: null
```

`GET /api/batches/{code}` với Investor trả cùng các trường và
`standardCost: {versionNo, status: "Locked", total, items: [{category, amount}], lockedAt}`.
Không tìm thấy hoặc chưa công bố: 404 `batch.not_found`. Không trả draft, rejectionReason, editor flags, approvedBy hay trường lợi suất. Chi phí chọn bản Locked duy nhất, không chọn bản có số version lớn nhất. Tổng theo category dùng đúng rounding từng dòng của UC07/UC08.

GET cũ vẫn hỗ trợ OperatorMember không có Investor qua service UC07. Màn sửa của hộ nuôi dùng đường đọc rõ ràng `GET /api/operators/me/batches/{code}` để tài khoản có đồng thời Investor và OperatorMember không nhận nhầm DTO; quyền Owner/Staff và phạm vi hộ nuôi kiểm tra như trước. Các endpoint ghi giữ nguyên.

Tiền là số nguyên VND. `pctOfTarget` có đơn vị phần trăm, lấy nguyên `pct_of_target` (DECIMAL(7,2)) từ `v_batch_funding_progress`; vốn đã xác nhận, giữ chỗ còn hạn và investorCount cũng từ view. Không dùng giữ chỗ làm tử số. `percentLabel` có hai chữ số thập phân và dấu phẩy, ví dụ `33,33%`, do backend định dạng. Web/mobile dùng nguyên nhãn này; chỉ chặn chiều rộng thanh vẽ trong [0,100], không chặn số phần trăm. Missing/null view trả 0 và `0,00%`. Schema có CHECK target_capital > 0 (qua min_viable_capital), không thể có mẫu số 0 hợp lệ trong SQL; mapper vẫn phòng thủ target <= 0. Không sửa view hoặc công thức vốn.

Read-only Serializable transaction giống Portfolio giữ nhất quán publication/role/detail. Danh sách dùng projection + join view, hai query count/page, không truy vấn theo từng item; chi tiết tải một version Locked và items.

## Client

Web bản 2: `/nha-dau-tu/kham-pha` và `/nha-dau-tu/lo/{code}`; status/crabType/page lưu query URL và giữ khi quay lại. Thay mock khám phá/chi tiết bằng React Query, giữ kit/style hiện có. Có loading, empty, error, retry và bố cục responsive. Luồng góp vốn/quyết toán không triển khai thêm.

Mobile: `ApiInvestorRepository` dùng Dio thật; Riverpod lọc/phân trang, DTO mapping theo contract, hiển thị điều khoản và tổng chi phí Locked. Không fallback mock khi API lỗi; 403/404 chi tiết hiện lô không tồn tại/không còn được xem. Model danh mục cũ được giữ tương thích.

## Kiểm tra

Backend dùng SQL Server LocalDB riêng do fixture tạo/xóa; không chạm DB dev. Test mới kiểm tra gate list/code, trạng thái vòng đời, phiên bản Locked trước draft mới hơn, filtering/pagination, quyền đã bị thu hồi, view và zero/missing mapping, cùng đường đọc hộ nuôi cho tài khoản hai role. Review độc lập phát hiện và đã sửa DTO của tài khoản hai role và 201 Location: POST tạo lô trỏ về MineByCode để URL trả về vẫn đọc được bản nháp.

- `dotnet test backend/CrabShare.sln --verbosity quiet`: 587 API tests và 4 SettlementEngine tests pass, không skip. Lượt này trước khi thêm 3 unit tests progress và regression hai role.
- Lượt cuối sau mọi sửa backend: `dotnet test backend/tests/CrabShare.Api.Tests --filter "FullyQualifiedName~BatchExplore|FullyQualifiedName~BatchesTests|FullyQualifiedName~BatchReviewTests" --verbosity quiet`: 82 pass, không skip. Đã tái hiện red rồi green cho lỗi 201 Location của tài khoản hai role.
- Web `npm run lint` và `npm run build`: pass, kiểm tra lại sau thay đổi cuối.
- Full Playwright: 85 pass, 2 skip do chưa đặt `VI04_API_URL`/`VI05_API_URL` cho ca dùng API sống. Kiểm tra lại riêng `tests/batch-explore.spec.ts tests/batches.spec.ts`: 11 pass, 1 skip cùng lý do. Dùng `CI=1` để chạy Chromium đã có vì Chrome mặc định không được cài. UC09 có 5 ca kiểm tra filters/page/URL refresh, terms/cost, loading/error/empty/retry, 404, overfunding; kiểm tra không tràn ngang ở 320/768/1024/1440px.
- `git diff --check`: pass.

Mobile chưa chạy được `flutter analyze` hoặc `flutter test`: không tìm thấy Flutter/Dart SDK trên máy. Đã thêm repository/widget tests và cập nhật smoke fixtures, nhưng chưa xác nhận biên dịch hoặc runtime mobile. Không tuyên bố mobile đã được kiểm chứng.
