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

## Ghi nhật ký kiểm toán (TH-02)
Mọi thay đổi về **tiền, hợp đồng, chi phí chuẩn, trạng thái lô, quyết toán, KYC** ghi `audit_log` trong **cùng transaction** với thay đổi đó:

```csharp
public sealed class BatchService(AppDbContext db, IAuditLog audit)
{
    public Task ApproveAsync(string code, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        var batch = await db.Batches.SingleAsync(b => b.BatchCode == code, ct);
        var before = new { batch.Status };
        batch.Status = "Funding";
        await audit.WriteAsync("batch", batch.BatchId, "approve", before, new { batch.Status }, ct);
    }, ct);
}
```

- `db.InTransactionAsync` (`Infrastructure/Persistence/TransactionExtensions.cs`) tự SaveChanges + commit; lỗi ở đâu là rollback cả thay đổi lẫn dòng audit. Đọc và sửa entity **bên trong** lambda (khi mạng chập chờn EF chạy lại cả khối).
- `oldValue` / `newValue`: object (tự thành JSON camelCase) hoặc chuỗi JSON có sẵn. Người làm lấy từ token; job nền để trống.
- Ghi ngoài transaction → `InvalidOperationException`. Cần các thao tác đồng thời chạy lần lượt từ đầu (hai admin cùng duyệt một hồ sơ) → gọi `await audit.LockAsync(ct)` ngay đầu transaction.
- Kiểm tra chuỗi: `await audit.VerifyChainAsync(fromId, toId, ct)` → `IsValid`, `BrokenAuditId`, `Problem` (dùng cho UC43 xuất nhật ký). Job `AuditChainCheckJob` tự kiểm tra cả bảng mỗi 6 giờ, gãy thì log Critical.
- Giao thức băm/khoá chỉ có ở `Common/Auditing/AuditChain.cs`: khoá `TABLOCKX, HOLDLOCK`, `row_hash = SHA-256(prev_hash + JSON {entityType, entityId, actionType, oldValue, newValue, actorUserId, occurredAt})`. Writer của Accounts ghi theo cùng giao thức; Operators đã dùng `IAuditLog` để ghi vào chung chuỗi. Code mới dùng `IAuditLog`, không tự viết công thức khác.

## Job nền (TH-02)
Kế thừa `Common/Jobs/RecurringJob`: đặt `Interval`, viết `RunAsync(services, ct)` (lấy `AppDbContext`, `IAuditLog`... từ `services`), đăng ký `services.AddHostedService<TênJob>()`. Mỗi lần chạy có scope riêng, lỗi chỉ ghi log rồi chờ chu kỳ sau; lần chạy đầu là sau một chu kỳ. Tắt mọi job: `Jobs:Enabled = false`. Mẫu: `Common/Auditing/AuditChainCheckJob.cs`.

## Quy tắc phải giữ
- Thời hạn giữ chỗ, ngưỡng cảnh báo... chưa có bảng cấu hình → để trong `appsettings.json`. Cần sửa lúc chạy thì thêm bảng `platform_setting` bằng migration mới.

## Màn hình
- Web: `admin/AdminDashboard.tsx`, `admin/AdminSettings.tsx`, `operator/OperatorDashboard.tsx`.

## Tài liệu
TL-08 Nhật ký kiểm toán và gói bằng chứng · TL-15 Thù lao Operator và phí nền tảng.
