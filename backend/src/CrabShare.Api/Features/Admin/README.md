# Admin — Cấu hình phí, dashboard, nhật ký kiểm toán

**Người làm:** Khôi (UC42, UC43) · Thiện (UC41)
**Use case:** UC41 Configure Platform Fees · UC42 View Dashboard and Reports · UC43 Export Audit Log

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `fee_tier` | phí theo dải vốn, có `effective_from` / `effective_to` (seed V002: T1, T2, T3) |
| `audit_log` | **chỉ thêm, không sửa/xoá** · `entity_type`, `entity_id`, `action_type`, `old_value`, `new_value`, `actor_user_id`, `occurred_at` · chuỗi băm `prev_hash` → `row_hash` |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET / POST | `/api/admin/fee-tiers` | PlatformAdmin | UC41 (Thiện) — bậc mới có hiệu lực từ ngày chọn, không chồng lấn |
| GET | `/api/admin/dashboard` | PlatformAdmin | UC42: vốn vào theo ngày, lô theo trạng thái, cảnh báo leo thang, đơn hàng, chi trả |
| GET | `/api/operators/me/dashboard` | OperatorMember | UC42: lô đang nuôi, việc hôm nay, đơn cần xử lý |
| GET | `/api/admin/reports/{name}.csv` | PlatformAdmin | Xuất báo cáo |
| GET | `/api/admin/audit-log?entityType=&from=&to=&page=` | PlatformAdmin | UC43 |
| GET | `/api/admin/audit-log/export?from=&to=` | PlatformAdmin | UC43 xuất CSV + kiểm tra chuỗi băm còn nguyên |

## Ghi nhật ký kiểm toán (Thiện dựng ngày đầu)
`IAuditLog.WriteAsync(entityType, entityId, action, oldValue, newValue)` — mọi thay đổi về **tiền, hợp đồng, chi phí chuẩn, trạng thái lô, quyết toán** đều phải gọi.
`row_hash = SHA-256(prev_hash + nội dung dòng)` → sửa một dòng là gãy chuỗi, phát hiện được khi xuất.

## Quy tắc phải giữ
- Thời hạn giữ chỗ, ngưỡng cảnh báo... chưa có bảng cấu hình → để trong `appsettings.json`. Cần sửa lúc chạy thì thêm bảng `platform_setting` bằng migration mới.

## Màn hình
- Web: `admin/AdminDashboard.tsx`, `admin/AdminSettings.tsx`, `operator/OperatorDashboard.tsx`.

## Tài liệu
TL-08 Nhật ký kiểm toán và gói bằng chứng · TL-15 Thù lao Operator và phí nền tảng.
