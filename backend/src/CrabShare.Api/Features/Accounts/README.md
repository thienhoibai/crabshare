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

## Màn hình
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
trong cùng transaction Serializable. Query audit dùng `UPDLOCK, HOLDLOCK` để không
tách nhánh chuỗi băm khi nhiều nhà đầu tư gửi đồng thời. Timestamp được chuẩn hóa
đến mili giây để khớp `DATETIMEOFFSET(3)` khi đọc lại từ SQL Server.

Hiện TH-02 chưa có `IAuditLog`: writer của KYC nằm trong `AccountService`. Khi tích
hợp writer chung, giữ định dạng chuỗi hiện có: `SHA-256(prev_hash hoặc chuỗi rỗng +
JSON UTF-8)` bằng `JsonSerializer.Serialize` mặc định, với các trường đúng thứ tự
`EntityType`, `EntityId`, `ActionType`, `OldValue`, `NewValue`, `ActorUserId`,
`OccurredAt`. `OldValue`/`NewValue` là chuỗi JSON trạng thái, không chứa ảnh/CCCD.
Không cần đổi migration hoặc entity.

### Kiểm thử

```powershell
dotnet test backend/CrabShare.sln
dotnet test backend/CrabShare.sln --filter "Category!=Database"
```

Test phân quyền/validation chạy trong CI. Test Database dùng LocalDB trên Windows,
tạo CSDL riêng `CrabShareKycTests_<guid>` từ migration rồi xoá sau kiểm thử; không
đụng dữ liệu `CrabShareDev`. Kiểm tra provider đạt/không đạt, retry, quyền sở hữu,
trạng thái đã Verified/Locked, chữ ký ảnh, không tạo storage và audit đồng thời.
