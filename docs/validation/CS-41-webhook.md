# CS-41 / TH-06 — Webhook thanh toán (chống trùng) + giả lập chuyển khoản

Nhánh: `feature/CS-41-webhook-thanh-toan`, tạo từ `develop` + merge `feature/CS-38-thanh-toan-vietqr` (TH-05). Merge sau #16 (CS-21), #18 (CS-32), #19 (CS-38). Không có migration mới: dùng `provider_transaction`, `payment_instruction`, `payment_request` đã có.

## Test tự động (LocalDB, xUnit) — `backend/tests/CrabShare.Api.Tests/PaymentWebhookDatabaseTests.cs`
Lệnh: `dotnet test backend/CrabShare.sln --filter "FullyQualifiedName~PaymentWebhook"` → **10/10 qua**.

| Test | Kiểm tra |
|---|---|
| `Sai_chu_ky_thi_401_va_khong_ghi_giao_dich` | sai secret / thiếu `X-Signature` → 401 `webhook.bad_signature`, không có dòng `provider_transaction` |
| `Thieu_truong_thi_400_webhook_bad_payload` | thân thiếu `providerTxnId`/`occurredAt` → 400 `webhook.bad_payload` |
| `Tien_ve_dung_so_thi_khoan_thu_Paid_va_khoan_gop_Confirmed` | giữ chỗ → mã QR → webhook đúng tiền: `Matched`; `payment_request` Paid; contribution Confirmed + `confirmed_at`; 3 dòng audit (`payment_request/paid`, `contribution/confirm`, `provider_transaction/receive`) không có actor; chuỗi audit hợp lệ; `GET /api/payment-requests/{id}` trả Paid |
| `Gui_lai_cung_webhook_hai_lan_chi_ghi_mot_giao_dich` | **cùng body gửi 2 lần → lần 2 `Duplicate`, đếm `provider_transaction` theo `provider_txn_id` = 1**, chỉ 1 audit `confirm` |
| `Hai_webhook_cung_ma_chay_song_song_van_chi_mot_giao_dich` | 4 request cùng lúc → 1 `Matched` + 3 `Duplicate`, 1 dòng giao dịch |
| `Tien_den_sau_han_thi_LatePayment_va_lap_lenh_hoan` | lùi `expires_at` về quá khứ rồi webhook → **`LatePayment`**, `provider_transaction.match_status = LatePayment`, **`payment_instruction` Refund/Created đúng số tiền gắn `contribution_id`**, `payment_request` Expired, contribution không Confirmed, chuỗi audit hợp lệ |
| `Sai_so_tien_thi_Unmatched_va_khoan_thu_van_Pending` | thiếu 1.000 đ → `Unmatched` (vẫn gắn `payment_request_id`), khoản thu Pending, không có lệnh hoàn |
| `Noi_dung_khong_co_ma_thi_Unmatched_khong_gan_khoan_thu` | nội dung không có mã → `Unmatched`, `payment_request_id` null |
| `Tai_khoan_khong_ton_tai_thi_422_payment_unknown_account` | `accountNo` lạ → 422 |
| `Gia_lap_chuyen_khoan_di_dung_luong_webhook` | `POST /api/dev/payments/simulate { referenceCode }` (mã viết thường vẫn khớp) → `Matched`, `provider_txn_id` bắt đầu `SIM-`, contribution Confirmed; mã không có → 404 `payment.not_found`; chưa đăng nhập → 401 |

Full `dotnet test backend/CrabShare.sln`: **347 test API + 4 test quyết toán qua, 0 fail** (môi trường LocalDB, `Alerts__Jobs__Enabled=false` do `TestBackgroundJobs`).

## Web
- `npm run lint` (tsc -b) và `npm run build` qua.
- `usePaymentRequest` hỏi lại 3 giây/lần khi còn Pending (trước là 5 giây).
- Nút "Giả lập đã chuyển khoản" (`SimulatePaymentButton`) chỉ render khi `import.meta.env.DEV`: ở màn 4 (cạnh "Tôi đã chuyển khoản") và màn 5 (cạnh "Xem lại mã QR"). Bấm → `POST /api/dev/payments/simulate` → invalidate query mã → màn hình đổi sang "Đã nhận tiền góp vốn" ở lần hỏi lại kế tiếp. Không chạy Playwright trong task này.

## Cách thử tay
1. Chạy API ở Development (`dotnet run` trong `backend/src/CrabShare.Api`) và web (`npm run dev`).
2. Đăng nhập nhà đầu tư đã eKYC, vào lô đang gọi vốn → giữ chỗ → màn 4 có mã QR → bấm "Giả lập đã chuyển khoản" (hoặc "Tôi đã chuyển khoản" rồi bấm ở màn 5).
3. Hoặc gửi webhook bằng tay (secret dev `dev-only-webhook-secret-change-me`):
   ```powershell
   $body = '{"providerTxnId":"BANK-001","accountNo":"<provider_account_no>","amount":3000000,"content":"<GV...> gop von","occurredAt":"2026-10-13T10:00:00+07:00"}'
   $sig = [BitConverter]::ToString((New-Object System.Security.Cryptography.HMACSHA256([Text.Encoding]::UTF8.GetBytes('dev-only-webhook-secret-change-me'))).ComputeHash([Text.Encoding]::UTF8.GetBytes($body))).Replace('-','').ToLower()
   Invoke-RestMethod -Method Post -Uri http://localhost:5233/api/webhooks/payment-provider -ContentType application/json -Headers @{ 'X-Signature' = $sig } -Body $body
   ```
   Gửi lần 2 cùng body → `outcome = Duplicate`.

Còn lại: đơn hàng `Paid` (NH-06) và cọc bao tiêu `Held` (NH-14) cài `IPaymentPurposeHandler` của mình; job hết hạn giữ chỗ (TH-07); admin gửi lệnh hoàn (TH-10).
