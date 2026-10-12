# Accounts — Định danh (eKYC), tài khoản nhận tiền, quản lý người dùng

**Người làm:** Khôi · **Use case:** UC02 Complete Identity Verification · UC03 Maintain Payout Account · UC06 Authorise Identity Verification Exception (+ quản lý người dùng cho Quản trị)

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `kyc_check` | `check_type`: `OtpDeclaration`, `EkycIdFace`, `BankNameMatch` · `result`: `Pending`, `Passed`, `Failed`, `ExceptionApproved` · `EkycIdFace` bắt buộc có `consent_at` |
| `investor` | `verification_status`: `Unverified` → `Verified` / `Rejected` |
| `payout_account` | thuộc **một** người dùng **hoặc** một hộ nuôi · `name_match_status`: `Pending`, `Matched`, `Mismatched` |
| `customer_address` | địa chỉ giao hàng (Orders dùng khi đặt hàng) |
| `app_user` | `status`: `PendingVerification`, `Active`, `Locked` |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/kyc/ekyc` | Investor | multipart: ảnh CCCD trước, sau, selfie + `consent=true` → `IEkycProvider.VerifyAsync` (bản giả `FakeEkycProvider`). Ảnh chỉ chuyển cho nhà cung cấp, **không lưu**; ghi `kyc_check`; đạt → `investor.verification_status = Verified` |
| GET | `/api/me/kyc` | Investor | Trạng thái xác minh + lần kiểm tra gần nhất |
| GET / PUT | `/api/me/payout-account` | Investor, Operator Owner | Lưu ngân hàng + số tài khoản; kiểm tra khớp tên (`BankNameMatch`) |
| GET / POST / PUT / DELETE | `/api/me/addresses` | Customer | Sổ địa chỉ |
| GET | `/api/admin/users?role=&status=&page=` | PlatformAdmin | Danh sách người dùng |
| GET | `/api/admin/users/{id}` | PlatformAdmin | Chi tiết + lịch sử KYC (không có ảnh giấy tờ) |
| POST | `/api/admin/users/{id}/lock` · `/unlock` | PlatformAdmin | Khoá / mở tài khoản |
| GET | `/api/admin/kyc-checks?result=Failed` | PlatformAdmin | Hàng đợi ngoại lệ |
| POST | `/api/admin/kyc-checks/{id}/approve-exception` | PlatformAdmin | UC06 → `ExceptionApproved`, ghi `reviewed_by` |

## Quy tắc phải giữ
- Chỉ lưu **kết quả** eKYC và mã tham chiếu nhà cung cấp, **không lưu ảnh giấy tờ** (Phiếu mục Identity; TL-06).
- Nhà đầu tư chưa `Verified` thì Funding **từ chối** giữ chỗ góp vốn.
- Mọi thay đổi trạng thái tài khoản / KYC phải ghi `audit_log`.

## KH-03 — API tài khoản nhận tiền và địa chỉ

- `GET/PUT /api/me/payout-account?ownerType=Investor|Operator`. Bỏ query thì ưu tiên
  Investor nếu có vai này; frontend hộ nuôi gửi Operator rõ ràng. GET trả
  `{ ownerType, expectedHolderName, account }`, `account=null` nếu chưa đăng ký.
- PUT nhận `{ bankCode, accountNo, accountHolderName }`: mã ngân hàng tối đa 20 ký tự
  chữ/số/_/-, số tài khoản 4–30 chữ số, tên tối đa 150 ký tự. `FakeBankNameMatcher`
  bỏ dấu, hoa/thường và khoảng trắng thừa; chưa xác minh số tài khoản với ngân hàng.
  Tên đối chiếu: `app_user.full_name` (Investor) / `operator.legal_name` (Operator).
- Chỉ người dùng Active. Owner được kiểm tra từ `operator_member` trên DB; Staff
  không được xem/sửa. Tài khoản hai vai quản lý hai chủ sở hữu riêng, không nhận
  owner id do client cung cấp.
- BankNameMatch ghi Passed/Failed + mã tham chiếu, không đổi trạng thái eKYC.
  Khớp → Matched/Active; không khớp → Mismatched/Locked (HTTP 200 để hiện kết quả).
  Mismatched được sửa rồi đối chiếu lại; Matched bị quản trị khoá không tự mở bằng PUT.
- Đổi ngân hàng/số tài khoản đóng bản cũ, giữ lịch sử số tài khoản cho lệnh chi.
  Tài khoản Closed cùng chủ có thể dùng lại; không sửa tên đã có lệnh chi.
  Trùng tài khoản của chủ khác trả 409. Payout + KYC + audit lưu trong transaction;
  audit chỉ có metadata, không có số tài khoản/tên người nhận.
- V004 thêm 2 unique index có filter: tối đa 1 Active/chủ. Chạy migrator trước API
  mới. Không đổi cột/entity, không chỉnh file scaffold bằng tay.
- Địa chỉ: `GET/POST /api/me/addresses`, `GET/PUT/DELETE /api/me/addresses/{id}`.
  POST 201 + Location; DELETE 204. Chỉ Customer, lấy customer id từ JWT; địa chỉ
  người khác/không tồn tại trả 404. SĐT: `0` + 9 chữ số hoặc `+84` + 9 chữ số.
- Đầu tiên tự mặc định; chọn mới bỏ mặc định cũ; xoá mặc định chọn địa chỉ còn lại
  có id nhỏ nhất. Sổ không rỗng luôn có một mặc định. Serializable + khoá theo chủ/
  khách hàng giữ đúng khi cập nhật đồng thời.
- `AppDbContext.Custom.cs` sửa quan hệ nhiều địa chỉ/khách vì scaffold hiểu nhầm
  unique index có filter `is_default=1` thành quan hệ 1:1.

## KH-04 — API quản trị người dùng và ngoại lệ KYC

- `GET /api/admin/users?role=&status=&q=&page=&pageSize=`: role theo Roles.cs,
  status Active/Locked/PendingVerification; q tìm tên/email/điện thoại/ID. Phân trang
  mặc định 20, tối đa 100. Chi tiết: `GET /api/admin/users/{id}` trả user, verifiedAt,
  kycChecks chỉ chứa metadata, không có ảnh hoặc mật khẩu.
- `POST /api/admin/users/{id}/lock` và `/unlock` nhận `{ "reason": "..." }`,
  bắt buộc 1–300 ký tự không chỉ khoảng trắng. Trạng thái trùng trả 409, id không
  có trả 404. Không tự khoá tài khoản đang quản trị. Unlock khôi phục trạng thái
  trước khoá qua audit (PendingVerification hoặc Active); dữ liệu Locked cũ không
  có audit dùng Active.
- `GET /api/admin/kyc-checks?result=Failed&checkType=EkycIdFace&page=&pageSize=`.
  Result mặc định Failed; truyền `result=` để xem mọi kết quả. CheckType mặc định
  không lọc. Response có canApproveException để UI bật đúng thao tác.
- `POST /api/admin/kyc-checks/{id}/approve-exception` nhận reason như trên.
  Chỉ EkycIdFace Failed **mới nhất** có consent, Investor chưa Verified và user Active;
  không tự duyệt. Sai quy tắc trả 422, tự duyệt 403. BankNameMatch không được dùng
  để duyệt danh tính. Đạt → ExceptionApproved + reviewed_by, Investor Verified + verified_at.
- Tất cả endpoint yêu cầu JWT PlatformAdmin và vai admin/Active hiện tại trên DB.
  Không dùng role cũ trong JWT để vượt quyền đã bị thu hồi.
- Giao dịch Serializable ghi user/KYC/investor + audit atomically, hash audit theo
  JSON camelCase của CS-25 qua `Common/Auditing/AuditChain`; timestamp millisecond.
  Giữ failure_reason/checked_at của lần xác minh để không xoá lịch sử nhà cung cấp.
- Đăng nhập Locked vẫn trả 403 auth.locked. JwtBearer kiểm tra status mỗi lần xác
  thực; token đã cấp của tài khoản Locked hoặc đã xoá trả 401, client đăng xuất.
- Kiểm thử và ảnh giao diện: `docs/validation/KH-04-kyc-user-management.md`.

## Màn hình

- KH-03: Web nhà đầu tư ở Hồ sơ & eKYC; chủ hộ nuôi ở `/operator/payout-account`;
  khách hàng ở `/tai-khoan/dia-chi`. Mobile ở Tài khoản → Tài khoản nhận tiền.

- Web: `admin/AdminUsers.tsx`, `admin/AdminUserDetail.tsx`, `operator/OperatorKyc.tsx`, hồ sơ trong `investor/`.
- Mobile: `investor/kyc/kyc_page.dart`, `account/account_page.dart` (mục Tài khoản nhận tiền).

## Tài liệu
TL-06 Định danh người dùng · TL-01 Ranh giới vai trò nền tảng.

## Backend eKYC đã triển khai (CS-27, phần API)

`AccountsController` và `AccountService` cung cấp hai endpoint cho vai `Investor`:

- `POST /api/kyc/ekyc`: `multipart/form-data`, các trường `idCardFront`,
  `idCardBack`, `selfie` (file) và `consent=true`. Mỗi ảnh tối đa **5 MB**, tổng
  request tối đa **16 MB**; hỗ trợ JPEG/PNG/WebP, kiểm tra cả MIME và chữ ký file.
  Form được buffer trong RAM, không dùng thư mục temp cho ảnh trong giới hạn này.
  Ảnh chỉ đi vào `IEkycProvider`; không gọi `IFileStorage` và không lưu tên file
  hay họ tên đọc từ CCCD.
- `GET /api/me/kyc`: lấy trạng thái nhà đầu tư và lần `EkycIdFace` mới nhất,
  không lấy `BankNameMatch` làm kết quả xác minh danh tính.

Hai endpoint lấy chủ hồ sơ từ JWT, không nhận `userId` do client chọn. Trả **401**
khi chưa đăng nhập, **403** khi sai vai hoặc tài khoản đã khóa, **404** nếu thiếu
hồ sơ nhà đầu tư. Consent không có/false, thiếu ảnh, ảnh rỗng, quá dung lượng hoặc
sai định dạng trả **400** (request vượt 16 MB được Kestrel trả **413**).

Provider đạt → `kyc_check.result = Passed`, `investor.verification_status = Verified`,
có `verified_at`. Provider không đạt → `Failed` / `Rejected`, không có `verified_at`;
nhà đầu tư có thể thử lại. Người đã `Verified` gửi lại nhận **409**
`kyc.already_verified` để tránh một lần thử lại hạ trạng thái đã xác minh.
Provider giả mặc định luôn đạt; các test thay provider để kiểm tra nhánh không đạt.

Cả POST và GET trả dạng:

```json
{
  "verificationStatus": "Verified",
  "verifiedAt": "2026-10-14T08:00:00+00:00",
  "lastCheck": {
    "id": 1,
    "checkType": "EkycIdFace",
    "result": "Passed",
    "providerReference": "FAKE-EKYC-...",
    "consentAt": "2026-10-14T08:00:00+00:00",
    "checkedAt": "2026-10-14T08:00:00+00:00",
    "failureReason": null
  }
}
```

Nhà đầu tư mới có `verificationStatus = Unverified`, `verifiedAt = null`,
`lastCheck = null`. Các tài khoản demo đã được seed Verified; để thử POST trên
Scalar, đăng ký một tài khoản Investor mới rồi dùng JWT của tài khoản đó.

### Audit và giao dịch

Kết quả KYC, trạng thái nhà đầu tư và audit `Investor` / `VerifyIdentity` được ghi
trong cùng transaction Serializable. Ngay sau BeginTransaction, đọc đầu chuỗi bằng
`SELECT TOP (1) ... WITH (TABLOCKX, HOLDLOCK) ORDER BY audit_id DESC`, trước khi đọc/sửa
entity nghiệp vụ, giống `feature/CS-25-duyet-ho-nuoi`. Timestamp được chuẩn hóa
đến mili giây để khớp `DATETIMEOFFSET(3)` khi đọc lại từ SQL Server.

eKYC, payout và quản trị dùng chung `AuditChain` để khóa đầu chuỗi, chuẩn hóa thời gian,
serialize snapshot và băm. Công thức: `SHA-256(UTF8((prev_hash ?? "") + JSON))`, đầu ra
hex **64 ký tự `0–9, a–f`**. JSON băm dùng serializer mặc định và thứ tự trường đúng CS-25:
`entityType`, `entityId`, `actionType`, `oldValue`, `newValue`, `actorUserId`, `occurredAt`.
Snapshot old/new cũng dùng camelCase; giá trị nghiệp vụ giữ nguyên. Không chứa ảnh/CCCD.

Không viết lại audit cũ: `AuditChain.VerifyHash` nhận cả định dạng camelCase mới và
PascalCase của Accounts trước đây. Mở khoá đọc được cả `status` và `Status` trong snapshot
lịch sử. Không cần migration hoặc đổi entity. Test hỗn hợp xác minh chuỗi eKYC, payout,
khoá/mở khoá, ngoại lệ KYC và CS-25, cả khi ghi đồng thời.

### Kiểm thử

```powershell
dotnet test backend/CrabShare.sln
dotnet test backend/CrabShare.sln --filter "Category!=Database"
```

Test phân quyền/validation chạy trong CI. Test Database dùng LocalDB trên Windows,
tạo CSDL riêng `CrabShareKycTests_<guid>` từ migration rồi xoá sau kiểm thử; không
đụng dữ liệu `CrabShareDev`. Kiểm tra provider đạt/không đạt, retry, quyền sở hữu,
trạng thái đã Verified/Locked, chữ ký ảnh, không tạo storage và audit đồng thời.
