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
