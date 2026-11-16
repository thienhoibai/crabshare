# Đồng bộ audit của Khôi theo CS-25

Nguồn tham khảo: `origin/feature/CS-25-duyet-ho-nuoi`, `OperatorReviewService`.
Phạm vi: eKYC (CS-27), tài khoản nhận tiền (KH-03), quản trị/ngoại lệ KYC (KH-04).

Kết quả local: **151 test backend đạt** (147 API + 4 Settlement), **16 test trình
duyệt đạt**, web production build đạt. Backend build không có warning/error.

- Dùng chung `Common/Auditing/AuditChain` cho ba writer Accounts.
- Khoá bảng audit bằng `TABLOCKX, HOLDLOCK`, đọc TOP 1 ORDER BY audit_id DESC ngay
  sau BeginTransaction, trước nghiệp vụ, giữ đến commit/rollback đúng giao thức CS-25.
- JSON băm camelCase, thứ tự: entityType, entityId, actionType, oldValue, newValue,
  actorUserId, occurredAt. Dùng JsonSerializer mặc định, UTF-8, nối prev_hash hoặc
  chuỗi rỗng trước JSON; SHA-256 → Convert.ToHexStringLower (64 ký tự 0–9, a–f).
- Snapshot old/new camelCase; giá trị nghiệp vụ không đổi. Thời gian UTC mili giây
  khớp DATETIMEOFFSET(3), hash đọc lại từ DB vẫn đúng.
- Không viết lại hoặc băm lại audit cũ. VerifyHash hỗ trợ PascalCase Accounts cũ
  và camelCase mới; unlock đọc cả Status cũ và status mới.
- Không sửa writer CS-25; test ghi chung với writer nguyên bản để chứng minh tương thích.

Kiểm thử: vector SHA-256 cố định tính độc lập, regex chữ thường, hash cũ không đổi,
timestamp/snapshot, chuỗi hỗn hợp sáu thao tác và ba writer ghi đồng thời (eKYC,
payout, CS-25), rollback và mở khoá từ snapshot cũ. Test Database dùng LocalDB riêng,
không sửa CSDL dev hoặc lịch sử audit thật.
