# Payments — Webhook thanh toán, giải ngân theo mốc, đối soát

**Người làm:** Thiện · **Use case:** UC18 Request Milestone Disbursement · UC40 Monitor Payout Reconciliation (+ webhook dùng chung cho Funding, Orders, Offtake)

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `provider_transaction` | mỗi giao dịch ngân hàng **một dòng** (`provider_txn_id` duy nhất) · `direction` `In`/`Out` · `match_status`: `Matched`, `Unmatched`, `LatePayment` |
| `payment_request` | yêu cầu thu tiền (góp vốn, đơn hàng, cọc...) — đổi `Pending` → `Paid` khi khớp |
| `payment_instruction` | lệnh chi: `Disbursement`, `Payout`, `Refund`, `TaxPayment` · `Created` → `Sent` → `Succeeded` / `Failed` / `Disputed` |
| `disbursement_tranche` | `Planned` → `Requested` → `Released`; `NeedsExplanation`, `Blocked` |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/webhooks/payment-provider` | Trung gian thanh toán | Kiểm tra chữ ký; **idempotent** theo `provider_txn_id`; khớp `reference_code` → `payment_request.Paid` → báo module chủ (contribution `Confirmed`, đơn `Paid`...) |
| POST | `/api/dev/payments/simulate` | Chỉ môi trường Development | Giả lập "khách đã chuyển khoản" để demo (gọi lại đúng luồng webhook) |
| POST | `/api/batches/{code}/tranches/{no}/request` | Operator Owner | UC18: xin giải ngân đợt `no`; kiểm tra điều kiện mốc + bằng chứng (TL-03) |
| POST | `/api/admin/tranches/{id}/release` · `/block` · `/need-explanation` | PlatformAdmin | Duyệt → tạo `payment_instruction` loại `Disbursement` |
| GET | `/api/admin/payments/unmatched` | PlatformAdmin | Giao dịch không khớp / trả trễ |
| GET | `/api/admin/payment-instructions?type=&status=` | PlatformAdmin | UC40 đối soát chi trả |
| POST | `/api/admin/payment-instructions/{id}/send` | PlatformAdmin | Gửi lệnh qua `IPaymentGateway.SendPayoutAsync` (bản giả) |

## Quy tắc phải giữ
- Webhook gửi lặp lại **không** được ghi trùng (NFR Integrity) — dựa vào unique `provider_txn_id`, bắt lỗi 409 `db.unique` coi như đã xử lý.
- Tiền đến sau khi yêu cầu đã hết hạn → `LatePayment` → tạo lệnh hoàn tiền.
- Mọi lệnh chi ghi `audit_log`.

## Màn hình
- Web: `admin/AdminFinance.tsx`, nút xin giải ngân trong `operator/OperatorBatchDetail.tsx`.

## Tài liệu
TL-02 Mô hình giữ tiền · TL-03 Cơ chế giải ngân theo mốc · TL-10 Đối soát giao dịch và chống trùng lặp · TL-07 Nghĩa vụ thuế.
