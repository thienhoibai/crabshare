# Auth — Đăng ký, đăng nhập *(module mẫu, đã xong)*

**Người làm:** Thiện · **Use case:** UC01 Register Account

Đây là module **mẫu**: module khác copy đúng cách chia 3 file này.

| File | Vai trò |
|---|---|
| `AuthDtos.cs` | `RegisterRequest`, `LoginRequest`, `AuthResponse`, `MeResponse` + DataAnnotations |
| `AuthService.cs` | Nghiệp vụ: băm mật khẩu (`PasswordHasher`), tạo vai trò, cấp JWT |
| `AuthEndpoints.cs` | `MapAuthEndpoints()` — 3 route bên dưới |

## Endpoint

| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/auth/register` | Khách | Tự đăng ký vai `Customer` hoặc `Investor` (Investor có luôn `Customer`) |
| POST | `/api/auth/login` | Khách | Trả `accessToken` + thông tin người dùng (vai trò, `operatorId`) |
| GET | `/api/auth/me` | Đã đăng nhập | Thông tin tài khoản hiện tại |

## Bảng
`app_user`, `app_user_role`, `investor` (`verification_status` = `Unverified` khi mới đăng ký), `customer`, `operator_member` (đọc để lấy `operator_id`).

## Ghi chú
- Tài khoản demo do `Infrastructure/Persistence/DevDataSeeder.cs` tạo khi chạy môi trường Development.
- Token chứa claim `role` (nhiều giá trị) và `operator_id` (nếu là nhân viên hộ nuôi).
