# CS-85 / TH-15 — Rà soát mọi đường tiền và nhật ký kiểm toán

Ngày rà soát: 21/10/2026 · Người làm: Thiện · Nhánh: `feature/CS-85-ra-soat-duong-tien` (xếp sau CS-47 → CS-51 → CS-58 → CS-62 → CS-70 → CS-77 → CS-81).
Căn cứ: TL-08 (nhật ký kiểm toán và gói bằng chứng), TL-10 (đối soát giao dịch và chống trùng lặp), TL-05 §8 / BR-49 (không hiển thị lợi suất).

## Cách rà soát
1. Liệt kê mọi file service có ghi CSDL (`SaveChangesAsync`, `ExecuteUpdateAsync`, `ExecuteDeleteAsync`) và đối chiếu với lời gọi `IAuditLog.WriteAsync` trong cùng file, rồi đọc từng hàm có đổi tiền / hợp đồng / chi phí chuẩn / trạng thái lô / quyết toán.
2. Tìm kiểu số thực (`double`, `float`) dùng cho tiền ở backend, web, mobile.
3. Tìm trường hoặc chữ kiểu lợi suất (`expectedReturn`, `yield`, `roi`, "lợi suất"...) trong DTO và giao diện.
4. Chạy lại test tự động của các luồng tiền.

Phạm vi sửa: chỉ module của Thiện (Funding, Payments, Contracts, Settlement). Lỗ hổng ở module người khác **chỉ ghi lại** ở mục 5 để chủ module xử lý.

## 1. Checklist TL-08 — nhật ký kiểm toán

| # | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Nhật ký chỉ thêm, không sửa / xoá | Đạt | Trigger `trg_audit_log_append_only` (V001); test `AuditLogDatabaseTests` |
| 2 | Mỗi dòng chứa mã băm dòng trước (chuỗi liên kết) | Đạt | `AuditChain` (TH-02): `row_hash = SHA-256(prev_hash + nội dung)`, ghi tuần tự bằng khoá `TABLOCKX, HOLDLOCK` |
| 3 | Thời điểm do máy chủ cấp | Đạt | `AuditLogService` lấy `TimeProvider` máy chủ, làm tròn mili giây |
| 4 | Ghi chủ thể hành động | Đạt | `actor_user_id` từ `ICurrentUser`; job nền để trống (đúng là tiến trình hệ thống) |
| 5 | Ghi mọi thay đổi tiền / quyền sở hữu / hợp đồng | **Đạt với module của Thiện**; còn thiếu ở vài module khác (mục 5) | Bảng mục 3 |
| 6 | Kiểm tra được chuỗi | Đạt | `VerifyChainAsync`, job `AuditChainCheckJob` mỗi 6 giờ, màn xem và xuất CSV (CS-76) |
| 7 | Neo mã băm tại ba mốc: chốt vốn, chốt quyết toán, đóng lô (§6.4) | **Đạt một phần (sửa trong TH-15)** | Sao kê quyết toán trả `auditAnchors` = `row_hash` của dòng audit ghi `batch/close_capital`, `settlement/approve`, `batch/close`; web hiện ở bảng quyết toán. Chưa **gửi** mã neo tới từng bên qua kênh thông báo (module Notifications) |
| 8 | Gói bằng chứng xuất được cho mỗi lô (§6.2) | Chưa có | Hiện có xuất CSV nhật ký (CS-76), hợp đồng PDF + mã băm (TH-08/09), bảng quyết toán có đủ số gốc; chưa gộp thành một gói có mã băm tổng |
| 9 | Chuỗi không chứa dữ liệu cá nhân, dữ liệu nằm ở kho riêng (§6.3) | Lệch thiết kế | `audit_log.old_value/new_value` lưu JSON chi tiết ngay trong dòng (thiết kế TH-02). Không lưu số tài khoản, giấy tờ; nhưng có tên/nội dung góp ý. Ghi nhận để cân nhắc sau đồ án |

## 2. Checklist TL-10 — đối soát và chống trùng

| # | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Mỗi giao dịch ngân hàng ghi đúng một lần (khoá idempotency) | Đạt | `uq_provider_transaction_provider_txn_id` + kiểm tra trước khi ghi + bắt lỗi unique; test gửi 2 lần và 4 lần song song (`PaymentWebhookDatabaseTests`) |
| 2 | Mã đối chiếu ngắn, duy nhất, không dấu (≤ 13 ký tự) | Đạt | `PaymentRequestService` (TH-05), test `PaymentPurposesTests` |
| 3 | Chỉ khớp khi đúng tài khoản lô + đúng số tiền + còn hạn | Đạt | `PaymentWebhookService`: sai tiền / sai tài khoản → `Unmatched` |
| 4 | Tiền đến sau hạn không tự tính vào vốn, lập lệnh hoàn | Đạt | `LatePayment` + `RefundService`; test |
| 5 | Giao dịch không khớp có hàng xử lý tay | Đạt | `GET /api/admin/payments/unmatched`, tab Đối soát (TH-10) |
| 6 | Tiền ra cũng có dấu vết giao dịch | Đạt | Gửi lệnh chi ghi `provider_transaction` chiều `Out`, gắn `instruction_id` (TH-10) |
| 7 | Lệnh chi gửi lại không thành hai giao dịch | **Đạt (sửa trong TH-15)** | Cổng sandbox trả mã giao dịch cố định theo mã tham chiếu `CHI{id}` (trước đây sinh ngẫu nhiên, EF chạy lại transaction có thể ghi thành hai); test `Sandbox_gateway_is_idempotent_by_reference` |
| 8 | Không tự xác nhận theo lời người dùng | Đạt | Nút "Tôi đã chuyển khoản" chỉ chuyển màn; chỉ webhook đổi trạng thái |

## 3. Đường tiền trong module của Thiện

| Thao tác | Endpoint / job | Transaction + khoá | Audit | Test |
|---|---|---|---|---|
| Xác nhận rủi ro | `POST /api/risk-acknowledgements` | Có, khoá audit | `risk_acknowledgement/acknowledge` | `FundingDatabaseTests` |
| Giữ chỗ / huỷ giữ chỗ | `POST /api/batches/{code}/contributions`, `DELETE /api/contributions/{id}` | Khoá audit + khoá dòng lô | `contribution/reserve`, `cancel_reservation` (+ `investment_contract/void`) | `FundingDatabaseTests` |
| Mã VietQR | `POST /api/contributions/{id}/payment-requests` | Có | `payment_request/create` | `FundingDatabaseTests` |
| Tiền về (webhook) | `POST /api/webhooks/payment-provider` | Có, khoá audit | `provider_transaction/receive`, `payment_request/paid`·`expire`, `contribution/confirm` | `PaymentWebhookDatabaseTests` |
| Hết hạn giữ chỗ, chốt vốn, huỷ lô + hoàn | `FundingCloseJob`, `POST /api/admin/funding/close-due` | Khoá audit + khoá dòng lô | `contribution/expire`, `batch/close_capital`, `batch/cancel_underfunded`, `payment_instruction/create`, `payment_request/cancel` | `FundingCloseDatabaseTests` |
| Hợp đồng | `POST /api/contributions/{id}/contract`, `/sign`, `/offline-upload` | Có | `investment_contract/create`·`sign`·`offline_upload`·`void` | `ContractDatabaseTests` |
| Giải ngân theo mốc | `POST .../tranches/{no}/request`, `/release`, `/need-explanation`, `/block` | Có | `disbursement_tranche/*`, `payment_instruction/create` | `DisbursementDatabaseTests` |
| Gửi lệnh chi | `POST /api/admin/payment-instructions/{id}/send`, `/settlements/{id}/send-payouts` | Có | `payment_instruction/send`, `contribution/refund`, `settlement/paid_out`·`close`, `batch/close` | `DisbursementDatabaseTests`, `SettlementPayoutDatabaseTests` |
| Quyết toán | `POST /api/admin/batches/{code}/settlements`, `/propose`, `/feedback`, `/answer`, `/approve` | Có | `settlement/calculate`·`recalculate`·`propose`·`approve`, `settlement_feedback/*`, `batch/start_settlement` | `SettlementDatabaseTests`, `SettlementReviewDatabaseTests`, `SettlementPayoutDatabaseTests` |

## 4. Kiểu số cho tiền và lợi suất
- **Backend:** tiền là `decimal(18,0)` trong CSDL, `long` trong DTO của Funding / Payments / Contracts / Settlement. Không có `double`/`float` cho tiền (chỉ có toạ độ trang PDF và cân nặng trong seeder).
- **Web:** tiền là `number` nguyên đồng (an toàn tới 2⁵³), định dạng bằng `formatVnd`.
- **Mobile:** `double` chỉ dùng cho kg (`packing_models.dart`), không dùng cho tiền.
- **Lợi suất:** không có trường hay chữ hiển thị lợi suất kỳ vọng ở backend, web, mobile. Bảng quyết toán chỉ ghi số tiền thực tế sau khi bán (TL-05 §8, BR-49).

## 5. Phát hiện ở module khác — chỉ ghi lại, chưa sửa (chủ module xử lý)

| Module (chủ) | Phát hiện | Gợi ý |
|---|---|---|
| Orders (Nhân) | `OrderService.CheckoutAsync` tạo đơn + yêu cầu thu tiền + giữ tồn nhưng không ghi audit | Gọi `audit.WriteAsync("sales_order", ..., "checkout", ...)` trong transaction checkout |
| Catalog (Nhân) | `CatalogService` đổi niêm yết / giá không ghi audit (đã có `price_history` chỉ thêm nên vẫn truy được giá) | Ghi audit khi tạo / đổi giá / ẩn niêm yết |
| Offtake (Nhân) | Lô huỷ vì thiếu vốn: cam kết bao tiêu và cọc đã `Held` chưa có luồng huỷ + hoàn cọc | Lắng nghe lô `Cancelled` (hoặc job) → huỷ cam kết, `RefundService.CreateRefundAsync` cho cọc |
| Operators (Viên) | `OperatorService` tạo / sửa / nộp hồ sơ hộ nuôi và thêm thành viên không ghi audit (thành viên = quyền ký thay hộ nuôi) | Ghi audit khi thêm / bớt thành viên và nộp hồ sơ |
| Batches / Payments (Viên ↔ Thiện) | Đợt giải ngân bị dừng chi (`Blocked`) chưa có luồng thanh lý sớm (hoàn vốn chưa chi, TL-03 §6.4) | Thống nhất trước khi làm |
| Notifications (Khôi) | Chưa gửi mã neo nhật ký tới các bên tại ba mốc (TL-08 §6.4) | Dùng `auditAnchors` của sao kê quyết toán / dòng audit `batch/close_capital` |

## 6. Rủi ro còn lại (đã biết, chấp nhận trong phạm vi đồ án)
- Chưa đối chiếu **số dư tài khoản lô** (tổng giao dịch In − Out) trước khi duyệt chi trả quyết toán; dữ liệu demo do seeder tạo không có giao dịch ngân hàng nên chưa bật được. Đã chặn giải ngân vượt vốn đã chốt.
- Dự phòng hao hụt chưa giải ngân vẫn nằm trong tài khoản lô sau quyết toán (chờ chốt theo TL-11 / TL-21).
- Gửi lệnh chi gọi cổng thanh toán **bên trong** transaction CSDL: với cổng thật phải dựa vào khoá idempotency `CHI{id}` (đã làm ở bản sandbox).

## 7. Sửa trong TH-15
1. `FakePaymentGateway.SendPayoutAsync` idempotent theo mã tham chiếu.
2. `DisbursementService.ReleaseAsync` chặn tổng giải ngân vượt `total_confirmed_capital` → 422 `payment.insufficient_capital`.
3. Mã neo nhật ký (`auditAnchors`) trên sao kê quyết toán (API + web).

## 8. Kết quả test
- `dotnet test` toàn bộ backend trên nhánh này: 954 test API + 13 test bộ tính quyết toán qua; 23 test lỗi là `BatchReviewTests` + `BatchesTests` có sẵn trên `develop` (thiếu giá bao tiêu khi gửi duyệt, sửa ở PR #57). Ghép thêm bản sửa của PR #57: **977/977 + 13/13 qua**.
- Test mới của TH-15: `Release_cannot_exceed_locked_capital`, `Sandbox_gateway_is_idempotent_by_reference`, kiểm tra `auditAnchors` trong `SettlementPayoutDatabaseTests`.
