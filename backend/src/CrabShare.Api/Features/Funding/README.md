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

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/risk-disclosures/active` | Investor | Nội dung + mã phiên bản |
| POST | `/api/risk-acknowledgements` | Investor | `{ riskDisclosureId, scrolledToEnd: true }` |
| POST | `/api/batches/{code}/contributions` | Investor | `{ amount }` → `Reserved`, `expires_at` = now + thời hạn giữ chỗ |
| DELETE | `/api/contributions/{id}` | Investor | Huỷ giữ chỗ khi chưa trả tiền |
| POST | `/api/contributions/{id}/payment-requests` | Investor | Gọi `IPaymentGateway.CreateVietQrAsync` → trả nội dung QR |
| GET | `/api/me/contributions` | Investor | Các khoản góp của tôi |

Job nền:
- Hết hạn giữ chỗ → `Expired`.
- Tới `funding_deadline`: đủ `min_viable_capital` → chụp `capital_share`, ghi `total_confirmed_capital`; không đủ → lô `Cancelled` + tạo lệnh hoàn tiền (`payment_instruction` loại `Refund`, module Payments).

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
- Mobile: nút "Góp vốn" ở `investor/batches/batch_detail_page.dart` (đang hiện danh sách bước).

## Tài liệu
TL-02 Mô hình giữ tiền · TL-09 Xác nhận rủi ro · TL-16 Đơn vị góp vốn · TL-17 Hạn mức góp, giữ chỗ và dải vốn khả thi · TL-05 Cơ sở pháp lý huy động vốn.
