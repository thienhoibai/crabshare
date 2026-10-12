# Operators — Hồ sơ hộ nuôi

**Người làm:** Viên · **Use case:** UC04 Submit Operator Application · UC05 Review Operator Application

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `operator` | `status`: `Draft` → `Submitted` → `Approved` / `Rejected`; `Suspended` · `approved_slot_capacity` (số hộp tối đa được duyệt) |
| `operator_member` | `member_role`: `Owner`, `Staff` — người dùng thuộc hộ nuôi nào |

## Endpoint đã triển khai
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/operators` | Người dùng đã đăng nhập | Tạo hồ sơ nháp, người tạo thành `Owner`, được thêm vai `OperatorMember` |
| GET / PUT | `/api/operators/me` | OperatorMember | Xem / sửa hồ sơ khi còn `Draft` hoặc `Rejected` |
| POST | `/api/operators/me/submit` | Owner | `Draft` → `Submitted` |
| GET | `/api/operators/me/members` | Owner / Staff | Thành viên hộ nuôi hiện tại, Owner đứng trước |
| POST | `/api/operators/me/members` | Owner | Thêm nhân viên bằng email (vai `Staff`) |
| DELETE | `/api/operators/me/members/{userId}` | Owner | Gỡ nhân viên |
| GET | `/api/admin/operators?status=Submitted` | PlatformAdmin | Hàng đợi duyệt |
| POST | `/api/admin/operators/{id}/approve` | PlatformAdmin | Ghi `approved_slot_capacity`, `approved_by`, `approved_at` |
| POST | `/api/admin/operators/{id}/reject` · `/suspend` | PlatformAdmin | Kèm lý do |

## Quy tắc phải giữ
- UC04 đã triển khai: `GET/PUT /me` xác minh membership và vai trò `OperatorMember` từ CSDL; Owner/Staff được sửa Draft/Rejected, chỉ Owner được gửi Draft. Rejected chưa có luồng gửi lại.
- Web: `/operator/register` dành cho mọi tài khoản đã đăng nhập; không cần đăng nhập lại để tiếp tục hồ sơ vừa tạo. Token mới nhận vai trò và `operator_id` khi đăng nhập lại theo cơ chế Auth hiện có.
- Chỉ hộ nuôi `Approved` mới được tạo lô; guard tại API tạo lô cần tích hợp ở VI-04 (xem bên dưới).
- UC05 đã triển khai: chỉ `PlatformAdmin` được lấy danh sách / xét duyệt; service kiểm tra lại tài khoản Active và quyền Admin từ CSDL, không chỉ tin JWT.
- Duyệt: `Submitted` → `Approved`; từ chối: `Submitted` → `Rejected`; đình chỉ: `Approved` → `Suspended`. Không mở lại hồ sơ bị đình chỉ, không tự tác động lô đang tồn tại.
- Duyệt nhận JSON `{ "approvedSlotCapacity": 155 }`. Bắt buộc số nguyên trong khoảng `0..2147483647` theo cột INT và CHECK hiện có; 0 hợp lệ theo schema. Từ chối / đình chỉ nhận `{ "reason": "Lý do" }`, bắt buộc không rỗng / khoảng trắng.
- Danh sách Admin hỗ trợ `status=Draft|Submitted|Approved|Rejected|Suspended` và `page`, `pageSize` qua `PageQuery`. Bỏ status để xem mọi trạng thái; sắp theo `submittedAt`, `operatorId`.
- Thêm Staff bằng `{ "email": "staff@example.com" }`: tài khoản có sẵn, Active, chưa thuộc hộ nuôi nào. Scope hộ nuôi và quyền Owner lấy từ CSDL; client không chọn role hoặc hộ nuôi. Không có invitation.
- Thêm / gỡ Staff cập nhật `operator_member` và vai trò `OperatorMember` trong cùng transaction Serializable; không xóa Owner hay vai trò khác của tài khoản.
- Thành viên cần đăng nhập lại để JWT chứa claim mới. Staff bị gỡ **mất quyền ngay** trên API hộ nuôi hiện có vì service luôn kiểm tra membership / role hiện hành từ CSDL. Token còn claim hộ nuôi cũ bị từ chối nếu người đó chuyển hộ nuôi.
- Ghi `audit_log` khi duyệt / từ chối / đình chỉ trong cùng transaction với cập nhật hồ sơ; rollback cả hai khi lỗi. Các quyết định đồng thời chỉ có một quyết định hợp lệ cho mỗi trạng thái nguồn.

## Điểm tích hợp TH-02 và VI-04

- TH-02 chưa có implementation `IAuditLog` trên nhánh nền. VI-02 ghi trực tiếp bảng audit hiện hữu trong `OperatorReviewService`, không migration / bảng / cơ chế lưu trữ mới. Khi TH-02 có service dùng chung, thay điểm ghi này và giữ nguyên yêu cầu transaction.
- Audit VI-02: `entity_type=operator`, `action_type=approve|reject|suspend`; `old_value` / `new_value` là JSON chứa `status`, `approvedSlotCapacity`, `approvedBy`, `approvedAt`, `reason`. Actor và thời gian lấy phía server.
- Chuỗi toàn bảng theo `audit_id`: `prev_hash` là `row_hash` gần nhất, dòng đầu là null. SHA-256 UTF-8 của `(prev_hash ?? "") + content`, hex chữ thường. `content` là JSON .NET mặc định, thứ tự cố định: `entityType`, `entityId`, `actionType`, `oldValue`, `newValue`, `actorUserId`, `occurredAt`. Không đưa `auditId` / hash vào content. Thời gian UTC được cắt đến millisecond trước khi ghi/băm cho khớp `DATETIMEOFFSET(3)`.
- Đọc đầu chuỗi bằng `TABLOCKX, HOLDLOCK` và giữ khoá tới commit, kể cả bảng rỗng. Writer TH-02 phải dùng cùng giao thức chuỗi / thứ tự lấy khoá để không rẽ nhánh; verifier phải hỗ trợ định dạng dòng VI-02 khi tích hợp.
- VI-04 chưa có controller/service tạo lô, nên **chưa thể xác minh end-to-end quy tắc tạo lô**. Tại transaction tạo lô, kiểm tra Owner, membership và role từ CSDL; đọc trạng thái hộ nuôi hiện hành và chỉ cho `Approved`. Không chỉ kiểm tra claim `operator_id`; phối hợp khoá/điều kiện cập nhật với thao tác đình chỉ để tránh race.
- Ca kiểm thử bàn giao VI-04: `Approved` + Owner tạo lô thành công; `Draft`, `Submitted`, `Rejected`, `Suspended` không tạo được; Staff / người ngoài hộ nuôi không tạo được; token cũ sau khi gỡ Staff hoặc đình chỉ không vượt guard. Đình chỉ không tự hủy lô cũ.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_operator_reputation` | điểm uy tín hộ nuôi (TL-25) |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Kiểm thử UC04
- `dotnet test backend/CrabShare.sln`: gồm test API, phân quyền, trạng thái, transaction và claim đăng nhập trên SQL Server LocalDB.
- Test có `Category=Database` tự tạo CSDL riêng `CrabShareVI01Tests_<guid>` bằng migration hiện có và xoá sau khi chạy; không tác động `CrabShareDev`. Cần LocalDB trên máy; CI tiếp tục dùng bộ lọc `Category!=Database`.

## Kiểm thử UC05

- `dotnet test backend/CrabShare.sln`: gồm `OperatorReviewTests` trên LocalDB và test anonymous cho các route mới. Bao phủ lọc/phân trang/quyền Admin, sức chứa và dữ liệu sai, trạng thái, lý do, audit/hash-chain, rollback khi lỗi sau SaveChanges trước commit, các quyết định đồng thời, quản lý Staff, scope, tài khoản không Active, thêm trùng/đồng thời, bảo vệ Owner, thu hồi role và token hộ nuôi cũ.
- Không có thay đổi schema/migration.

## Web UC05

- `/admin/users?tab=operators`: tab Hộ nuôi chỉ hiện cho PlatformAdmin, mặc định Chờ duyệt. Lọc mọi trạng thái và phân trang qua API thật; chọn Đã duyệt để đình chỉ. Form xác nhận duyệt nhập sức chứa; từ chối/đình chỉ bắt buộc lý do. Lỗi API hiển thị tại form, chống gửi lặp, cập nhật danh sách sau thành công. Tab Người dùng & eKYC giữ màn hình mẫu hiện hữu và có nhãn phân biệt.
- `/operator/members`: danh sách thành viên, Owner được thêm tài khoản có sẵn bằng email và xóa Staff có xác nhận; Staff chỉ xem. Quyền thao tác lấy từ membership trong phản hồi API, không suy từ vai trò OperatorMember trong JWT.
- Tái sử dụng AdminLayout, OperatorLayout và OpPanel/OpBtn/OpBadge/OpNote. Hộp thoại native hỗ trợ focus, Escape, khoá đóng khi đang gửi. Bảng Admin cuộn trong vùng chứa trên mobile; danh sách thành viên xếp dọc.
- Kiểm tra FE: `cd web && npm run lint && npm run build`. Kiểm thử trình duyệt với API thật trên CrabShareDev: danh sách rỗng, approve 155 ô, reject và suspend kèm lý do, chặn lý do khoảng trắng, lỗi email không tồn tại, thêm/xóa tài khoản Staff kiểm thử, Staff chỉ xem và bị từ chối khi làm mới sau khi bị xóa. Kiểm tra layout tại 390px và desktop.
- Bảng và audit kiểm thử được giữ trong CSDL dev với tên `HTX Kiểm thử UI …` / email `vi02-ui-…@test.local`; không dùng mock cho hai luồng UC05.

## Màn hình
- Web: trang đăng ký hộ nuôi trong `operator/` (mới), duyệt hồ sơ trong `admin/AdminUsers*`.

## Tài liệu
TL-01 Ranh giới vai trò nền tảng · TL-25 Điểm uy tín Operator (hiển thị sau, nếu kịp).
