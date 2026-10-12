# Operators — Hồ sơ hộ nuôi

**Người làm:** Viên · **Use case:** UC04 Submit Operator Application · UC05 Review Operator Application

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `operator` | `status`: `Draft` → `Submitted` → `Approved` / `Rejected`; `Suspended` · `approved_slot_capacity` (số hộp tối đa được duyệt) |
| `operator_member` | `member_role`: `Owner`, `Staff` — người dùng thuộc hộ nuôi nào |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/operators` | Người dùng đã đăng nhập | Tạo hồ sơ nháp, người tạo thành `Owner`, được thêm vai `OperatorMember` |
| GET / PUT | `/api/operators/me` | OperatorMember | Xem / sửa hồ sơ khi còn `Draft` hoặc `Rejected` |
| POST | `/api/operators/me/submit` | Owner | `Draft` → `Submitted` |
| POST | `/api/operators/me/members` | Owner | Thêm nhân viên bằng email (vai `Staff`) |
| DELETE | `/api/operators/me/members/{userId}` | Owner | Gỡ nhân viên |
| GET | `/api/admin/operators?status=Submitted` | PlatformAdmin | Hàng đợi duyệt |
| POST | `/api/admin/operators/{id}/approve` | PlatformAdmin | Ghi `approved_slot_capacity`, `approved_by`, `approved_at` |
| POST | `/api/admin/operators/{id}/reject` · `/suspend` | PlatformAdmin | Kèm lý do |

## Quy tắc phải giữ
- UC04 đã triển khai: `GET/PUT /me` xác minh membership và vai trò `OperatorMember` từ CSDL; Owner/Staff được sửa Draft/Rejected, chỉ Owner được gửi Draft. Rejected chưa có luồng gửi lại.
- Web: `/operator/register` dành cho mọi tài khoản đã đăng nhập; không cần đăng nhập lại để tiếp tục hồ sơ vừa tạo. Token mới nhận vai trò và `operator_id` khi đăng nhập lại theo cơ chế Auth hiện có.
- Chỉ hộ nuôi `Approved` mới tạo lô (Batches kiểm tra).
- Sau khi thêm/gỡ thành viên, người đó phải **đăng nhập lại** để token có/không có claim `operator_id`.
- Ghi `audit_log` khi duyệt / từ chối / đình chỉ.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_operator_reputation` | điểm uy tín hộ nuôi (TL-25) |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Kiểm thử UC04
- `dotnet test backend/CrabShare.sln`: gồm test API, phân quyền, trạng thái, transaction và claim đăng nhập trên SQL Server LocalDB.
- Test có `Category=Database` tự tạo CSDL riêng `CrabShareVI01Tests_<guid>` bằng migration hiện có và xoá sau khi chạy; không tác động `CrabShareDev`. Cần LocalDB trên máy; CI tiếp tục dùng bộ lọc `Category!=Database`.

## Màn hình
- Web: trang đăng ký hộ nuôi trong `operator/` (mới), duyệt hồ sơ trong `admin/AdminUsers*`.

## Tài liệu
TL-01 Ranh giới vai trò nền tảng · TL-25 Điểm uy tín Operator (hiển thị sau, nếu kịp).
