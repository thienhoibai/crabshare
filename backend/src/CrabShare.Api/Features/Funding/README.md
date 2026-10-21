# Funding — Góp vốn

**Người làm:** Thiện · **Use case:** UC10 Commit Capital to Batch · UC11 Acknowledge Investment Risk · UC12 Make Payment

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `risk_disclosure` | bản công bố rủi ro đang `Active` (seed V002: `RD-2026-01`, nội dung `database/reference/`) |
| `risk_acknowledgement` | nhà đầu tư đã đọc hết (`scrolled_to_end = 1`) |
| `batch_account` | tài khoản chuyên dùng của lô ở trung gian thanh toán |
| `contribution` | `Reserved` (có `expires_at`) → `Confirmed` / `Expired` / `Refunded` |
| `capital_share` | ảnh chụp vốn đã xác nhận của từng nhà đầu tư khi chốt vốn |
| `payment_request` | `reference_code` ≤ 13 ký tự (giới hạn VietQR) · `purpose = Contribution` |

## Endpoint
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/risk-disclosures/active` | Investor | **Đã làm (TH-04).** Toàn văn đọc từ `database/reference/risk-disclosure-<mã>.md`, SHA-256 phải khớp `content_hash` (không khớp → 500 `funding.disclosure_unavailable`); kèm `acknowledgedAt` nếu tôi đã xác nhận |
| POST | `/api/risk-acknowledgements` | Investor | **Đã làm.** `{ riskDisclosureId, scrolledToEnd: true }`; chưa cuộn hết → 422 `funding.must_scroll_to_end`; bản đã cũ → 422 `funding.disclosure_outdated`; gọi lại không tạo trùng. Ghi audit |
| GET | `/api/funding/batches` | Investor | **Đã làm.** Lô đang mở gọi vốn: tiến độ, còn nhận trước trần |
| GET | `/api/funding/batches/{code}` | Investor | **Đã làm.** Số liệu cho màn 2 + `me.kycVerified`, `me.riskAcknowledged` + khoản tôi đang giữ chỗ |
| POST | `/api/batches/{code}/contributions` | Investor | **Đã làm.** `{ amount }` → 201 `Reserved`, `expires_at` = min(now + `Funding:ReservationMinutes` (30), `funding_deadline`) (TL-17 §6.1). Lỗi 422: `funding.kyc_required`, `funding.risk_ack_required`, `funding.not_open`, `funding.below_min_contribution`, `funding.over_max_capital`; 409 `funding.reservation_exists` (mỗi người một chỗ đang giữ / lô). Ghi audit |
| DELETE | `/api/contributions/{id}` | Investor | **Đã làm.** Huỷ khoản đang giữ chỗ, chưa trả tiền → `Expired` (CSDL không có trạng thái Cancelled), yêu cầu thanh toán Pending → `Cancelled`. Ghi audit |
| POST | `/api/contributions/{id}/payment-requests` | Investor | **Đã làm (TH-05).** Mã VietQR cho khoản `Reserved` còn hạn của chính mình → 201, mã đối chiếu `GV` + 11 ký tự, hết hạn cùng giữ chỗ. Còn mã `Pending` chưa hết hạn thì trả lại đúng mã đó (200), không sinh mã mới. Lỗi: 403 `contribution.not_owner`; 422 `contribution.not_payable`, `funding.not_open`, `funding.batch_account_unavailable`. Ghi audit (`payment_request` / `create`) |
| GET | `/api/me/contributions` | Investor | **Đã làm.** Các khoản góp của tôi (giữ chỗ quá hạn mà job chưa kịp chạy vẫn hiện `Expired` ngay) |
| GET | `/api/admin/funding/batches` | PlatformAdmin | **Đã làm (TH-07).** Vốn vào theo lô `Funding`/`Cancelled`: đã xác nhận, đang giữ chỗ, tối thiểu/mục tiêu/trần, `stage` (`Scheduled`, `Open`, `AwaitingClose`, `CapitalClosed`, `Cancelled`), số lệnh hoàn và số lệnh hoàn chưa xong |
| POST | `/api/admin/funding/close-due` | PlatformAdmin | **Đã làm (TH-07).** Chạy ngay một lượt của job (để demo khỏi chờ 1 phút) → `FundingCloseResult` |

Chống vượt trần: trong một transaction, khoá chuỗi audit (`IAuditLog.LockAsync`) rồi khoá dòng lô `UPDLOCK, HOLDLOCK`, cộng Confirmed + Reserved còn hạn rồi mới thêm. Test `FundingDatabaseTests`: 5 người giữ chỗ 3 tr cùng lúc vào lô trần 10 tr → đúng 3 người được.

Job nền **(đã làm, TH-07)**: `FundingCloseJob` chạy mỗi phút, việc thật ở `FundingCloseService.RunAsync` (TL-17 §6 bước 6–8, BR-06). Tắt riêng bằng `Funding:CloseJob:Enabled = false`.
- Giữ chỗ quá `expires_at` → `Expired` (audit `contribution/expire`); mã VietQR góp vốn còn `Pending` của nó → `Expired`.
- Lô `Funding` chưa chốt, tới `funding_deadline` **hoặc** vốn xác nhận đã bằng `max_capital` (chốt sớm, TL-17 bước 7): khoá chuỗi audit rồi khoá dòng lô, ép hết hạn mọi giữ chỗ còn lại, rồi
  - đủ `min_viable_capital` → chụp `capital_share` (gộp theo nhà đầu tư; trigger BR-09 cấm sửa về sau), ghi `total_confirmed_capital`, `capital_closed_at`; lô **vẫn ở `Funding`** tới khi thả giống (`Batches/FundingReadiness`). Audit `batch/close_capital`. Đã chốt thì `IsOpen` = false: không nhận giữ chỗ nữa dù chưa tới hạn.
  - thiếu → lô `Cancelled` (audit `batch/cancel_underfunded`), `RefundService` lập lệnh hoàn 100% cho từng khoản `Confirmed` (`Refund`/`Created`, gắn `contribution_id`); mã VietQR góp vốn còn `Pending` của lô → `Cancelled`. Khoản góp chỉ chuyển `Refunded` khi trung gian báo lệnh hoàn thành công (TH-10). Cam kết bao tiêu và cọc của lô huỷ **không** xử lý ở đây (thuộc module Offtake, NH-14).
- Job và webhook tiền về đều khoá chuỗi audit trước nên chạy lần lượt: mỗi khoản giữ chỗ đi tới đúng một trạng thái cuối. Chạy lại không chụp/hoàn trùng.
- Test `FundingCloseDatabaseTests`: hết hạn giữ chỗ; quá hạn đủ vốn → `capital_share`; quá hạn thiếu vốn → `Cancelled` + 2 lệnh hoàn; đủ trần → chốt sớm và chặn giữ chỗ mới; màn admin.
- Demo: sửa `funding_deadline` của lô seed `Funding` về quá khứ rồi bấm "Chạy chốt vốn ngay" ở AdminFinance (hoặc chờ 1 phút).

## Quy tắc phải giữ
- Phải `Verified` (Accounts) **và** đã xác nhận rủi ro bản đang Active trước khi giữ chỗ (TL-09).
- `amount` ≥ `batch.min_contribution`; tổng giữ chỗ + đã xác nhận ≤ `max_capital` (TL-17). Kiểm tra trong **transaction** để 2 người giữ chỗ cùng lúc không vượt trần.
- Luồng góp vốn trên web **≤ 5 màn hình** (Phiếu, Usability).
- Tiền xác nhận chỉ dựa trên thông báo giao dịch của trung gian (webhook — module Payments), không dựa vào người dùng bấm "đã chuyển".

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_batch_funding_progress` | tiến độ gọi vốn từng lô (dùng cho danh sách lô và job chốt vốn) |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Web: luồng góp vốn trong `investor/` (Xác nhận rủi ro → Số tiền & giữ chỗ → Ký hợp đồng → VietQR → Hoàn tất).
  **Đã làm màn 1–2 (TH-04):** trang `/nha-dau-tu/gop-von/:code` (`web/src/features/investor/funding/ContributePage.tsx`); nút Xác nhận chỉ bật khi cuộn hết bản công bố; màn 2 hiện mức tối thiểu, phần còn lại trước trần, đồng hồ giữ chỗ. Danh sách lô đang mở gọi vốn (số liệu thật) ở đầu mục Khám phá lô (`OpenBatches.tsx`). Màn 3 chờ TH-08.
  **Đã làm màn 4–5 (TH-05):** màn 4 lấy mã ngay khi vào và hiện bằng `<VietQrBox>` (`web/src/shared/payments/`); màn 5 "đang chờ tiền về" hỏi lại `GET /api/payment-requests/{id}` 3 giây một lần và chuyển sang "Đã nhận tiền" khi webhook (TH-06) đổi yêu cầu sang `Paid`. Nút "Tôi đã chuyển khoản" chỉ chuyển màn, không xác nhận gì. **Đã làm (TH-06):** `ContributionPaymentHandler` nhận tin từ webhook → khoản góp `Reserved` → `Confirmed` (+ `confirmed_at`, audit `contribution/confirm`); khi chạy dev có nút "Giả lập đã chuyển khoản" ở màn 4 và 5.
- Mobile: nút "Góp vốn" ở chi tiết lô (`investor/batches/batch_detail_page.dart`) mở trang web trên bằng `url_launcher` (`--dart-define=WEB_URL=...`, mặc định `http://localhost:5173`).

## Tài liệu
TL-02 Mô hình giữ tiền · TL-09 Xác nhận rủi ro · TL-16 Đơn vị góp vốn · TL-17 Hạn mức góp, giữ chỗ và dải vốn khả thi · TL-05 Cơ sở pháp lý huy động vốn.
