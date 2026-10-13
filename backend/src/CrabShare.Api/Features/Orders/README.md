# Orders — Giỏ hàng, đặt hàng, đặt trước, giao hàng, khiếu nại

**Người làm:** Nhân · **Use case:** UC26 Place Order · UC27 Place Pre-order · UC28 Track Order Status · UC29 Fulfil Order by Tag Scan · UC30 Confirm Order Receipt · UC31 Submit Order Complaint · UC32 Resolve Order Dispute · UC34 Rate Purchase

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `sales_order` | `order_type`: `Retail`, `PreOrder` (bắt buộc `deposit_amount`), `Offtake` (bắt buộc `offtake_id`) · **một đơn một lô** (`batch_id`) · `status`: `PendingPayment` → `DepositPaid` / `Paid` → `Packed` → `Shipping` → `Delivered` → `Completed`; `Cancelled`, `Returned` · `return_window_ends_at` |
| `order_line` | `listing_id`, `quantity_kg`, `unit_price`, `price_history_id` (V006, khóa ngoại kép với `listing_id`) |
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
| GET | `/api/operators/me/orders?status=` | OperatorMember | **Đã làm (CS-53).** `status=Paid` (mặc định) hoặc `Packed`. Sai giá trị → 400 `pack.invalid_status`. |
| GET | `/api/operators/me/orders/{orderNo}` | OperatorMember | **Đã làm (CS-53).** Chi tiết dòng, kg đã gán, tem đã quét. Đơn hộ khác → 403 `pack.order_forbidden`. |
| POST | `/api/orders/{orderNo}/pack` | OperatorMember | **Đã làm (CS-53, UC29).** `{ tagCodes: [...] }` — tem Active, cua InStock, cùng lô, đúng hạng, không trùng, đủ kg → cua `Packed` + `order_line_id`, event `Packed` + `tag_id`, đơn `Packed`, audit `sales_order/pack`. |
| POST | `/api/orders/{orderNo}/ship` · `/deliver` | OperatorMember | Cập nhật giao hàng (nền tảng không tự giao) |
| POST | `/api/complaints/{id}/respond` | OperatorMember | Hộ nuôi phản hồi |
| GET | `/api/admin/complaints?status=Escalated` | PlatformAdmin | |
| POST | `/api/admin/complaints/{id}/resolve` | PlatformAdmin | UC32 |

Lỗi đóng gói (HTTP 422 trừ khi ghi chú khác; client đọc `code` + `details`):

| Mã | Khi nào |
|---|---|
| `pack.order_not_found` | 404 — không có đơn |
| `pack.order_forbidden` | 403 — đơn thuộc hộ nuôi khác |
| `pack.invalid_status` | 400 — `status` không phải Paid/Packed |
| `pack.order_not_paid` | Đơn chưa Paid (ví dụ còn `PendingPayment`) |
| `pack.duplicate_tag` | Một mã tem xuất hiện hai lần trong cùng lần quét |
| `pack.tag_not_active` | Tem không có hoặc không ở trạng thái Active |
| `pack.crab_not_in_stock` | Tem hợp lệ nhưng cua đã Packed / không còn InStock |
| `pack.wrong_batch` | Cua thuộc lô khác với đơn |
| `pack.wrong_grade` | Hạng cua không có trong dòng đơn |
| `pack.line_already_full` | Hạng đúng nhưng mọi dòng hạng đó đã đủ kg |
| `pack.not_enough_weight` | Sau khi gán hết tem, một dòng vẫn thiếu kg |

Job nền: giữ tồn quá hạn chưa trả tiền → `Released`, đơn → `Cancelled`.

## Quy tắc phải giữ
- **Không bán vượt** với 50 lượt thanh toán đồng thời trên một niêm yết (NFR Transactional integrity) — giữ tồn bằng một câu `UPDATE ... SET reserved_qty_kg += @qty WHERE status = 'Published' AND stock_qty_kg - reserved_qty_kg >= @qty` trong transaction, kiểm tra số dòng bị ảnh hưởng; lớp chặn cuối là CHECK `ck_listing_reserved`. Test: `CheckoutConcurrencyTests` (LocalDB).
- Tồn gốc `stock_qty_kg` **không** bị trừ khi đặt (TL-28 §3.3). Không đường ghi nào khác được sửa `reserved_qty_kg` ngoài checkout và job/huỷ/thanh toán của module này (TL-28 §8). Câu UPDATE giữ tồn không đổi `updated_at` (concurrency token của đổi giá).
- **Cả giỏ là một transaction**: một dòng thiếu hàng → 409 `order.insufficient_stock`, không dòng nào được giữ, không đơn nào được tạo. Dòng khoá theo thứ tự `listingId` tăng dần để tránh deadlock.
- **Hạn giữ chỗ 15 phút** (`Orders:ReservationMinutes`) theo BR-13, TL-28 và câu hỏi đã chốt trong PRD. Không dùng "6 giờ" ở TL-29 §6.5 vì mâu thuẫn với các tài liệu trên. `payment_request.expires_at` = `stock_reservation.expires_at`: mã QR không sống lâu hơn giữ chỗ (BR-59).
- **Mã đơn** `OD` + 11 ký tự Crockford base32 = 13 ký tự (giới hạn `orderId` của VietQR); dùng luôn làm `payment_request.reference_code`. Không ghép `batch_code` vì dài tới 20 ký tự.
- Đặt được khi: niêm yết `Published`, lô `Harvesting`, hàng cấp đông chưa quá trần (TL-23), `batch_account` của lô đang `Open`, địa chỉ thuộc chính khách. Giá chốt vào đơn là phiên bản giá mới nhất trong `price_history`, đọc khi dòng niêm yết đang bị khoá: ghi cả `unit_price` lẫn `price_history_id` của chính bản ghi đó (TL-27 §6.1, §6.3). Đổi giá sau đó tạo bản ghi mới, không sửa dòng đơn cũ.
- Doanh thu tính quyết toán = đơn `Completed` của lô (Settlement đọc).
- Hoàn tiền tạo `payment_instruction` loại `Refund` (module Payments).

## Màn hình
- Web, đã nối API (CS-36, phần làm được trước của CS-43):
  - Giỏ hàng lưu máy `shared/cart/cartStore.ts` (zustand, `crabshare-cart`); cửa hàng dùng giỏ này, nút "Thanh toán" sang `/thanh-toan`. Hàng **chưa** được giữ khi thêm vào giỏ.
  - `orders/CheckoutPage.tsx` (`/thanh-toan`, `/gio-hang` chuyển về đây): chọn địa chỉ từ sổ địa chỉ (KH-03), giỏ theo lô, gọi checkout; lỗi 409/422 hiện đúng câu của backend và giữ nguyên giỏ.
  - `orders/OrderConfirmationPage.tsx` (`/xac-nhan-don-hang`): mỗi lô một đơn, số tài khoản lô, số tiền, nội dung chuyển khoản, đếm ngược tới `expiresAt`. Kết quả lưu ở `crabshare-last-checkout` để tải lại trang vẫn còn, cho tới khi có `GET /api/orders/{orderNo}` (NH-07).
  - Còn chờ: ảnh QR thật bằng `<VietQrBox>` (TH-05, hiện dùng `QrMock` minh hoạ) và đơn chuyển `Paid` trên web sau webhook (TH-06).
  - Test: `web/tests/checkout.spec.ts`.
- Web, đã nối API (CS-53): `operator/OperatorOrders.tsx` (`/operator/orders`, `/operator/orders/:orderNo`) — danh sách đơn Paid/Packed, nhập/quét mã tem, đóng gói. Nav hộ nuôi: Đơn hàng.
- Web, còn là bản mẫu: `orders/CommercePage.tsx` (theo dõi, lịch sử, huỷ/trả, đánh giá), `admin/AdminDisputes.tsx`.
- Mobile: màn **Đóng gói đơn** `/o/pack` và `/o/pack/:orderNo` (UC29, CS-53) — camera `mobile_scanner` chỉ mở khi bấm Quét; lối vào từ tab Hôm nay.

## Tài liệu
TL-28 Giữ chỗ tồn kho và chống bán vượt · TL-29 Tách đơn theo lô · TL-31 Giao hàng và xử lý khiếu nại.
