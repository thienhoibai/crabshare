# Payments — Webhook thanh toán, giải ngân theo mốc, đối soát

**Người làm:** Thiện · **Use case:** UC18 Request Milestone Disbursement · UC40 Monitor Payout Reconciliation (+ webhook dùng chung cho Funding, Orders, Offtake)

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `provider_transaction` | mỗi giao dịch ngân hàng **một dòng** (`provider_txn_id` duy nhất) · `direction` `In`/`Out` · `match_status`: `Matched`, `Unmatched`, `LatePayment` |
| `payment_request` | yêu cầu thu tiền (góp vốn, đơn hàng, cọc...) — đổi `Pending` → `Paid` khi khớp |
| `payment_instruction` | lệnh chi: `Disbursement`, `Payout`, `Refund`, `TaxPayment` · `Created` → `Sent` → `Succeeded` / `Failed` / `Disputed` |
| `disbursement_tranche` | `Planned` → `Requested` → `Released`; `NeedsExplanation`, `Blocked` |

## Đã có (TH-05)
`PaymentRequestService.CreateAsync(purpose, amount, batchAccountId, batchAccountNo, expiresAt, target, referenceCode, ct)` — dùng chung cho mọi khoản thu:
- Thêm `payment_request` (`Pending`) vào DbContext, **không** SaveChanges: module gọi lưu trong transaction của mình, nên yêu cầu thu tiền không tồn tại tách rời khỏi nghĩa vụ. Trả `CreatedPaymentRequest(Request, Qr)`.
- `target` = `PaymentTarget.ForContribution(id)` · `ForOrder(order)` (đơn chưa lưu cũng được) · `ForOfftake(id)` — luôn đúng một nghĩa vụ (`ck_payment_request_target`).
- `referenceCode = null` → sinh mã 13 ký tự = tiền tố theo `PaymentPurposes` + 11 ký tự Crockford, kiểm tra không trùng: `GV` góp vốn · `OD` đơn hàng · `DC`/`DT` cọc và phần còn lại của đơn đặt trước · `BT`/`BH` cọc và tiền hàng bao tiêu. Truyền mã sẵn (đơn hàng dùng `order_no`) thì chỉ kiểm tra ≤ 13 ký tự `A–Z`, `0–9`.
- `expiresAt` = hạn giữ chỗ của nghĩa vụ (mã QR không sống lâu hơn, TL-10 §6.1). Module gọi tự kiểm tra tài khoản lô `Open`.
- `CreateForOrderAsync` của CS-36 giữ nguyên chữ ký, giờ gọi qua `CreateAsync`.
- `Describe` / `DescribeAsync` → `PaymentRequestResponse` cho web/app; `Pending` đã quá hạn trả `Expired` ngay (job TH-07 sẽ đổi hẳn), `qrContent` chỉ có khi còn chờ.

Ví dụ (Funding, `FundingService.RequestPaymentAsync`):
```csharp
var created = await payments.CreateAsync(PaymentPurposes.Contribution, contribution.Amount, account.BatchAccountId,
    account.ProviderAccountNo, contribution.ExpiresAt, PaymentTarget.ForContribution(contribution.ContributionId), null, ct);
await db.SaveChangesAsync(ct);
await audit.WriteAsync("payment_request", created.Request.PaymentRequestId, "create", null, new { created.Request.ReferenceCode }, ct);
return payments.Describe(created, account, batch.BatchCode);
```
Web: `<VietQrBox>` + `usePaymentRequest` ở `web/src/shared/payments/` (xem `web/README.md`). Trang xác nhận đơn hàng (NH-06) thay `PaymentBox` tạm bằng `<VietQrBox payment={{ ...order.payment, batchCode: order.batchCode }} />`.

## Endpoint
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/payment-requests/{id}` | Chủ nghĩa vụ (người góp, người mua, người bao tiêu) | **Đã làm (TH-05).** Trạng thái + mã QR khi còn chờ; web hỏi lại 5 giây/lần để biết tiền đã về. Người khác → 403 `payment.not_owner` |
| POST | `/api/contributions/{id}/payment-requests` | Investor | **Đã làm (TH-05)**, ở `Features/Funding` |
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
