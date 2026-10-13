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

## Đã có (TH-06)
`PaymentWebhookService.ProcessAsync(ProviderPaymentNotification, ct)` → `WebhookResult` — nhận một giao dịch tiền VÀO do trung gian thanh toán báo về, chạy trong **một transaction** có khoá chuỗi audit (hai webhook cùng lúc chạy lần lượt).

**Endpoint `POST /api/webhooks/payment-provider`** (`[AllowAnonymous]`, controller `PaymentWebhookController`):
- Header `X-Signature` = HMAC-SHA256(`Payments:WebhookSecret`, thân request thô) hex chữ thường (`WebhookSignature.Compute/Verify`, so sánh thời gian cố định). Sai/thiếu → 401 `webhook.bad_signature`. Secret dev cố định trong `appsettings.Development.json`; môi trường thật đặt qua biến môi trường `Payments__WebhookSecret`.
- Thân JSON camelCase: `{ "providerTxnId": "BANK-...", "accountNo": "SBX...", "amount": 3000000, "content": "GV0123456789A gop von", "occurredAt": "2026-10-13T10:00:00+07:00" }`. Thiếu trường → 400 `webhook.bad_payload`. `accountNo` không phải tài khoản lô nào → 422 `payment.unknown_account`.
- Luôn trả 200 kèm `WebhookResult(outcome, transactionId, referenceCode, paymentRequestId, purpose, refundInstructionId)`, kể cả khi đã xử lý trước đó, để trung gian không gửi lại mãi.

Luồng xử lý (TL-10 §5), mỗi giao dịch ghi đúng **một** dòng `provider_transaction` (`Direction = In`, `ReferenceCode` = nội dung chuyển khoản cắt 60 ký tự) + audit `provider_transaction/receive` ghi lý do:
| Outcome | Khi nào | Ghi gì |
|---|---|---|
| `Duplicate` | đã có `provider_transaction` cùng `provider_txn_id` (kiểm tra trước, và bắt cả lỗi unique `uq_provider_transaction_provider_txn_id` khi hai webhook chạy sát nhau) | **không ghi gì**, trả lại dòng cũ |
| `Matched` | tách nội dung thành các cụm `[A-Z0-9]+` ≤ 13 ký tự, tìm `payment_request` có `reference_code` trùng (ưu tiên Pending), đúng tài khoản lô, còn `Pending`, chưa quá `expires_at`, đúng số tiền | `match_status = Matched`, `payment_request.status = Paid` + audit `payment_request/paid`, rồi gọi `IPaymentPurposeHandler` theo `purpose` |
| `LatePayment` | tìm được mã nhưng khoản thu đã `Expired`/`Cancelled`/`Paid`, hoặc `expires_at` đã qua (so với giờ máy chủ **và** `occurredAt`) | `Pending` → `Expired` (audit `payment_request/expire`); `RefundService.CreateRefundAsync` tạo `payment_instruction` Refund/Created đúng số tiền nhận, gắn `contribution_id`/`order_id` của khoản thu |
| `Unmatched` | không có mã trong nội dung, mã thuộc tài khoản lô khác, hoặc đúng mã còn hạn nhưng **sai số tiền** (vẫn gắn `payment_request_id` để admin đối soát) | khoản thu giữ nguyên `Pending`; admin xử lý tay ở `GET /api/admin/payments/unmatched` (TH-10) |

**`IPaymentPurposeHandler`** — module chủ của khoản thu cài để nhận tin "đã Paid":
```csharp
public sealed class OrderPaymentHandler(AppDbContext db, IAuditLog audit) : IPaymentPurposeHandler   // ví dụ cho NH-06
{
    public string Purpose => PaymentPurposes.OrderPayment;
    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = await db.SalesOrders.SingleAsync(o => o.OrderId == request.OrderId, ct);
        order.Status = "Paid"; order.PaidAt = paidAt; order.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, "paid", new { status = "PendingPayment" }, new { status = "Paid" }, paidAt, ct);
    }
}
// FeatureRegistry (nhóm Nhân): services.AddScoped<IPaymentPurposeHandler, OrderPaymentHandler>();
```
Handler chạy **bên trong** transaction của webhook, sau khi `payment_request` đã Paid: không mở transaction riêng, SaveChanges + audit của mình là đủ; ném exception thì rollback cả webhook (trung gian sẽ gửi lại). Chưa có handler cho một `purpose` thì khoản thu vẫn Paid và ghi `LogWarning`. Đã cài: `Features/Funding/ContributionPaymentHandler` (Reserved → Confirmed + `confirmed_at`, audit `contribution/confirm`; không còn Reserved thì chỉ audit `payment_after_close`).

**`RefundService.CreateRefundAsync(batchAccountId, amount, contributionId?, orderId?, note, now, ct)`** — tạo `payment_instruction` loại `Refund`, trạng thái `Created`, tự SaveChanges + audit `payment_instruction/create`; gọi bên trong transaction của module (dùng cho TH-06 trả trễ, NH-07 huỷ đơn đã trả, NH-11 khiếu nại, TH-07 lô huỷ). Admin gửi lệnh đi ở TH-10.

**Giả lập `POST /api/dev/payments/simulate`** (`[Authorize]`, chỉ `Development`, ngoài dev trả 404): body `{ "referenceCode": "GV...", "amount": null }` → tìm khoản thu theo mã, dựng `ProviderPaymentNotification` với `providerTxnId = SIM-yyyyMMddHHmmss-<guid>` và gọi `ProcessAsync` — đi đúng luồng webhook, không đi tắt. Web: nút "Giả lập đã chuyển khoản" (`<SimulatePaymentButton>`, chỉ render khi `import.meta.env.DEV`) ở màn 4 và 5 luồng góp vốn; `usePaymentRequest` hỏi lại 3 giây/lần khi còn Pending.

## Endpoint
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/payment-requests/{id}` | Chủ nghĩa vụ (người góp, người mua, người bao tiêu) | **Đã làm (TH-05).** Trạng thái + mã QR khi còn chờ; web hỏi lại 3 giây/lần để biết tiền đã về. Người khác → 403 `payment.not_owner` |
| POST | `/api/contributions/{id}/payment-requests` | Investor | **Đã làm (TH-05)**, ở `Features/Funding` |
| POST | `/api/webhooks/payment-provider` | Trung gian thanh toán | **Đã làm (TH-06).** Chữ ký HMAC `X-Signature`; **idempotent** theo `provider_txn_id`; khớp `reference_code` → `payment_request.Paid` → `IPaymentPurposeHandler` (contribution `Confirmed`; đơn `Paid` và cọc `Held` do NH-06/NH-14 cài); trả trễ → `LatePayment` + lệnh hoàn |
| POST | `/api/dev/payments/simulate` | Chỉ môi trường Development | **Đã làm (TH-06).** Giả lập "khách đã chuyển khoản" để demo (gọi lại đúng luồng webhook) |
| POST | `/api/batches/{code}/tranches/{no}/request` | Operator Owner | UC18: xin giải ngân đợt `no`; kiểm tra điều kiện mốc + bằng chứng (TL-03) |
| POST | `/api/admin/tranches/{id}/release` · `/block` · `/need-explanation` | PlatformAdmin | Duyệt → tạo `payment_instruction` loại `Disbursement` |
| GET | `/api/admin/payments/unmatched` | PlatformAdmin | Giao dịch không khớp / trả trễ |
| GET | `/api/admin/payment-instructions?type=&status=` | PlatformAdmin | UC40 đối soát chi trả |
| POST | `/api/admin/payment-instructions/{id}/send` | PlatformAdmin | Gửi lệnh qua `IPaymentGateway.SendPayoutAsync` (bản giả) |

## Quy tắc phải giữ
- Webhook gửi lặp lại **không** được ghi trùng (NFR Integrity) — kiểm tra `provider_txn_id` trước khi ghi, và dựa vào unique `uq_provider_transaction_provider_txn_id` cho trường hợp hai webhook chạy sát nhau: bắt lỗi unique coi như đã xử lý, trả `Duplicate`.
- Tiền đến sau khi yêu cầu đã hết hạn → `LatePayment` → tạo lệnh hoàn tiền (`RefundService`).
- Mọi lệnh chi ghi `audit_log`.

## Màn hình
- Web: `admin/AdminFinance.tsx`, nút xin giải ngân trong `operator/OperatorBatchDetail.tsx`.

## Tài liệu
TL-02 Mô hình giữ tiền · TL-03 Cơ chế giải ngân theo mốc · TL-10 Đối soát giao dịch và chống trùng lặp · TL-07 Nghĩa vụ thuế.
