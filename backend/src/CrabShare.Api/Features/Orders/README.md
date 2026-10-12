# Orders — Giỏ hàng, đặt hàng, đặt trước, giao hàng, khiếu nại

**Người làm:** Nhân · **Use case:** UC26 Place Order · UC27 Place Pre-order · UC28 Track Order Status · UC29 Fulfil Order by Tag Scan · UC30 Confirm Order Receipt · UC31 Submit Order Complaint · UC32 Resolve Order Dispute · UC34 Rate Purchase

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `sales_order` | `order_type`: `Retail`, `PreOrder` (bắt buộc `deposit_amount`), `Offtake` (bắt buộc `offtake_id`) · **một đơn một lô** (`batch_id`) · `status`: `PendingPayment` → `DepositPaid` / `Paid` → `Packed` → `Shipping` → `Delivered` → `Completed`; `Cancelled`, `Returned` · `return_window_ends_at` |
| `order_line` | `listing_id`, `quantity_kg`, `unit_price` |
| `stock_reservation` | giữ tồn khi đặt: `Active` (có `expires_at`) → `Committed` / `Released` |
| `complaint` | `complaint_type`: `LateDelivery`, `WrongGrade`, `Damaged`, `NotReceived`, `Other` · `Open` → `OperatorResponded` → `Escalated` → `Resolved` / `Rejected` · `resolution`, `refund_amount` |
| `product_rating` | 1–5 sao |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/orders/checkout` | Customer | **Đã làm (CS-36).** `{ lines: [{ listingId, quantityKg }], addressId }` → giữ tồn **nguyên tử** → mỗi lô một đơn `PendingPayment` + `payment_request` VietQR. Trả `{ orders: [{ orderNo, batchCode, totalAmount, expiresAt, lines, payment: { referenceCode, accountNo, amount, qrContent, expiresAt } }] }` |
| POST | `/api/preorders` | Customer | UC27: đặt trước khi lô đang nuôi, trả cọc (`PreOrderDeposit`) |
| GET | `/api/orders` · `/api/orders/{orderNo}` | Customer | UC28 |
| POST | `/api/orders/{orderNo}/cancel` | Customer | Khi chưa đóng gói |
| POST | `/api/orders/{orderNo}/receive` | Customer | UC30 → `Completed` sau hạn đổi trả |
| POST | `/api/orders/{orderNo}/complaints` | Customer | UC31 |
| POST | `/api/orders/{orderNo}/rating` | Customer | UC34 |
| GET | `/api/operators/me/orders?status=` | OperatorMember | Đơn cần xử lý |
| POST | `/api/orders/{orderNo}/pack` | OperatorMember | UC29: `{ tagCodes: [...] }` quét tem từng con → `crab_item Packed`, kiểm tra đúng lô/hạng/đủ kg |
| POST | `/api/orders/{orderNo}/ship` · `/deliver` | OperatorMember | Cập nhật giao hàng (nền tảng không tự giao) |
| POST | `/api/complaints/{id}/respond` | OperatorMember | Hộ nuôi phản hồi |
| GET | `/api/admin/complaints?status=Escalated` | PlatformAdmin | |
| POST | `/api/admin/complaints/{id}/resolve` | PlatformAdmin | UC32 |

Job nền: giữ tồn quá hạn chưa trả tiền → `Released`, đơn → `Cancelled`.

## Quy tắc phải giữ
- **Không bán vượt** với 50 lượt thanh toán đồng thời trên một niêm yết (NFR Transactional integrity) — giữ tồn bằng một câu `UPDATE ... SET reserved_qty_kg += @qty WHERE status = 'Published' AND stock_qty_kg - reserved_qty_kg >= @qty` trong transaction, kiểm tra số dòng bị ảnh hưởng; lớp chặn cuối là CHECK `ck_listing_reserved`. Test: `CheckoutConcurrencyTests` (LocalDB).
- Tồn gốc `stock_qty_kg` **không** bị trừ khi đặt (TL-28 §3.3). Không đường ghi nào khác được sửa `reserved_qty_kg` ngoài checkout và job/huỷ/thanh toán của module này (TL-28 §8). Câu UPDATE giữ tồn không đổi `updated_at` (concurrency token của đổi giá).
- **Cả giỏ là một transaction**: một dòng thiếu hàng → 409 `order.insufficient_stock`, không dòng nào được giữ, không đơn nào được tạo. Dòng khoá theo thứ tự `listingId` tăng dần để tránh deadlock.
- **Hạn giữ chỗ 15 phút** (`Orders:ReservationMinutes`) theo BR-13, TL-28 và câu hỏi đã chốt trong PRD. Không dùng "6 giờ" ở TL-29 §6.5 vì mâu thuẫn với các tài liệu trên. `payment_request.expires_at` = `stock_reservation.expires_at`: mã QR không sống lâu hơn giữ chỗ (BR-59).
- **Mã đơn** `OD` + 11 ký tự Crockford base32 = 13 ký tự (giới hạn `orderId` của VietQR); dùng luôn làm `payment_request.reference_code`. Không ghép `batch_code` vì dài tới 20 ký tự.
- Đặt được khi: niêm yết `Published`, lô `Harvesting`, hàng cấp đông chưa quá trần (TL-23), `batch_account` của lô đang `Open`, địa chỉ thuộc chính khách. Giá chốt vào `order_line.unit_price` được đọc khi dòng niêm yết đang bị khoá.
- Doanh thu tính quyết toán = đơn `Completed` của lô (Settlement đọc).
- Hoàn tiền tạo `payment_instruction` loại `Refund` (module Payments).

## Màn hình
- Web, đã nối API (CS-36, phần làm được trước của CS-43):
  - Giỏ hàng lưu máy `shared/cart/cartStore.ts` (zustand, `crabshare-cart`); cửa hàng dùng giỏ này, nút "Thanh toán" sang `/thanh-toan`. Hàng **chưa** được giữ khi thêm vào giỏ.
  - `orders/CheckoutPage.tsx` (`/thanh-toan`, `/gio-hang` chuyển về đây): chọn địa chỉ từ sổ địa chỉ (KH-03), giỏ theo lô, gọi checkout; lỗi 409/422 hiện đúng câu của backend và giữ nguyên giỏ.
  - `orders/OrderConfirmationPage.tsx` (`/xac-nhan-don-hang`): mỗi lô một đơn, số tài khoản lô, số tiền, nội dung chuyển khoản, đếm ngược tới `expiresAt`. Kết quả lưu ở `crabshare-last-checkout` để tải lại trang vẫn còn, cho tới khi có `GET /api/orders/{orderNo}` (NH-07).
  - Còn chờ: ảnh QR thật bằng `<VietQrBox>` (TH-05, hiện dùng `QrMock` minh hoạ) và đơn chuyển `Paid` trên web sau webhook (TH-06).
  - Test: `web/tests/checkout.spec.ts`.
- Web, còn là bản mẫu: `orders/CommercePage.tsx` (theo dõi, lịch sử, huỷ/trả, đánh giá), `admin/AdminDisputes.tsx`, trang đơn hàng trong `operator/` (mới).
- Mobile: màn **Đóng gói — quét tem** cho hộ nuôi (mới, UC29).

## Tài liệu
TL-28 Giữ chỗ tồn kho và chống bán vượt · TL-29 Tách đơn theo lô · TL-31 Giao hàng và xử lý khiếu nại.
