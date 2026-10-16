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
| POST | `/api/orders/checkout` | Customer | **Đã làm (CS-36, CS-43).** `{ lines: [{ listingId, quantityKg }], addressId }` → giữ tồn **nguyên tử** → mỗi lô một đơn `PendingPayment` + `payment_request` VietQR. Trả `{ orders: [{ orderNo, batchCode, totalAmount, expiresAt, lines, payment: { referenceCode, accountNo, amount, qrContent, expiresAt, paymentRequestId } }] }` |
| — | (webhook `POST /api/webhooks/payment-provider`, module Payments) | Trung gian thanh toán | **Đã làm (CS-43).** `payment.paymentRequestId` có trong kết quả checkout để web hỏi `GET /api/payment-requests/{id}`. Tiền về đúng mã → `OrderPaymentHandler`: đơn `Paid` (+`paid_at`), giữ chỗ `Committed`, trừ `stock_qty_kg`/`reserved_qty_kg`, audit `sales_order/paid`. Dev: `POST /api/dev/payments/simulate { referenceCode: orderNo }` |
| POST | `/api/preorders` | Customer | UC27: đặt trước khi lô đang nuôi, trả cọc (`PreOrderDeposit`) |
| GET | `/api/orders` · `/api/orders/{orderNo}` | Customer | UC28 |
| POST | `/api/orders/{orderNo}/cancel` | Customer | Khi chưa đóng gói |
| POST | `/api/orders/{orderNo}/receive` | Customer | **Đã làm (CS-56, UC30).** `Shipping → Delivered` (bắt đầu 72h đổi trả) hoặc chỉ ghi `received_at`. |
| POST | `/api/orders/{orderNo}/complaints` | Customer | UC31 |
| POST | `/api/orders/{orderNo}/rating` | Customer | UC34 |
| GET | `/api/operators/me/orders?status=` | OperatorMember | **Đã làm (CS-53, CS-56).** Nhận `Paid|Packed|Shipping|Delivered|Completed`. Mặc định `Paid`. Sai giá trị → 400 `pack.invalid_status`. |
| GET | `/api/operators/me/orders/{orderNo}` | OperatorMember | **Đã làm (CS-53, CS-56).** Chi tiết dòng, kg đã gán, tem đã quét, thông tin giao hàng `shipment`. Đơn hộ khác → 403 `pack.order_forbidden`. |
| POST | `/api/orders/{orderNo}/pack` | OperatorMember | **Đã làm (CS-53, UC29).** `{ tagCodes: [...] }` — tem Active, cua InStock, cùng lô, đúng hạng, không trùng, đủ kg → cua `Packed` + `order_line_id`, event `Packed` + `tag_id`, đơn `Packed`, audit `sales_order/pack`. |
| POST | `/api/orders/{orderNo}/ship` | OperatorMember | **Đã làm (CS-56, UC30).** Body `{ carrierName*, vehiclePlate?, driverPhone*, expectedArrivalAt?, note? }` → `Packed → Shipping`, lưu thông tin nhà xe. |
| POST | `/api/orders/{orderNo}/deliver` | OperatorMember | **Đã làm (CS-56, UC30).** `Shipping → Delivered`, cua `Packed → Sold` + event `Delivered`, `return_window_ends_at = now + Orders:ReturnWindowHours (72)`. |
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
- **Thanh toán (CS-43)** — `OrderPaymentHandler` (cài `IPaymentPurposeHandler` cho `OrderPayment`, chạy trong transaction của webhook TH-06, không mở transaction lồng): đơn `PendingPayment` → `Paid` + `paid_at`; `stock_reservation` `Active` → `Committed`; mỗi dòng một câu `UPDATE product_listing SET stock_qty_kg -= q, reserved_qty_kg -= q WHERE listing_id = @id AND stock_qty_kg >= q AND reserved_qty_kg >= q` (0 dòng ảnh hưởng = dữ liệu hỏng → ném lỗi, webhook rollback); audit `sales_order/paid`. Đơn không còn `PendingPayment` khi tiền về (đã huỷ) → chỉ ghi audit `sales_order/payment_after_close`, không sửa gì (cùng cách với `ContributionPaymentHandler`); webhook trùng `provider_txn_id` bị Payments chặn trước nên không trừ tồn hai lần; tiền đến lần hai cho đơn đã Paid → `LatePayment` + lệnh hoàn (Payments). Test: `OrderPaymentDatabaseTests` (LocalDB).
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
  - CS-43: mã QR thật bằng `<VietQrBox>` dùng chung (TH-05); `usePaymentRequest(payment.paymentRequestId)` hỏi lại 3 giây/lần nên chip đổi "Chờ chuyển khoản" → "Đã thanh toán" / "Hết hạn" ngay khi webhook về; nút "Giả lập đã chuyển khoản" (`<SimulatePaymentButton>`, chỉ dev) để demo.
  - Test: `web/tests/checkout.spec.ts` (Playwright, mock API: đặt đơn → giả lập chuyển khoản → "Đã thanh toán").
- Web, đã nối API (CS-53): `operator/OperatorOrders.tsx` (`/operator/orders`, `/operator/orders/:orderNo`) — danh sách đơn Paid/Packed, nhập/quét mã tem, đóng gói. Nav hộ nuôi: Đơn hàng.
- Web, còn là bản mẫu: `orders/CommercePage.tsx` (đánh giá đơn, NH-12), `admin/AdminDisputes.tsx`.
- Mobile: màn **Đóng gói đơn** `/o/pack` và `/o/pack/:orderNo` (UC29, CS-53) — camera `mobile_scanner` chỉ mở khi bấm Quét; lối vào từ tab Hôm nay.

## Tài liệu
TL-28 Giữ chỗ tồn kho và chống bán vượt · TL-29 Tách đơn theo lô · TL-31 Giao hàng và xử lý khiếu nại.

## NH-07 — Theo dõi đơn, lịch sử, huỷ đơn, job trả tồn (CS-46)

Controller riêng `OrderTrackingController` (không sửa `OrdersController` checkout). Khách đăng nhập:

| Method | Path | Việc |
|---|---|---|
| GET | `/api/orders?status=&page=&pageSize=` | Lịch sử đơn của tôi, mới nhất trước; `status` nhiều giá trị cách nhau bằng dấu phẩy |
| GET | `/api/orders/{orderNo}` | Chi tiết + dòng thời gian + khoản thu. Đơn người khác → 403 `order.not_owner` |
| POST | `/api/orders/{orderNo}/cancel` | Body `{ reason }`. `PendingPayment` / `Paid` được huỷ; `Packed` trở đi → 422 `order.cannot_cancel` |

Huỷ chạy `InTransactionAsync` + `IAuditLog` (khoá chuỗi trước khi đọc đơn). `PendingPayment`: trả `reserved_qty_kg`, khoản thu Pending → Cancelled. `Paid`: giữ chỗ Committed → Released, cộng lại `stock_qty_kg`, lập lệnh hoàn `RefundService`. Mọi UPDATE có điều kiện trạng thái để không đua webhook.

Job `ReservationExpiryJob` mỗi 1 phút (`ReservationExpiryService`, tắt bằng `Orders:ExpiryJob:Enabled = false` / `Orders__ExpiryJob__Enabled`). Đơn `PendingPayment` giữ chỗ `Active` đã quá `expires_at` → Cancelled, `cancel_reason = payment_timeout`, khoản thu Pending → Expired. Câu UPDATE đơn có điều kiện `status = PendingPayment`.

Test: `OrderTrackingRulesTests` (CI), `OrderTrackingDatabaseTests` (LocalDB). Web: `OrderHistoryPage.tsx` (`/lich-su-don-hang`, `/huy-tra-hang`), `OrderTrackingPage.tsx` (`/theo-doi-don-hang`, `/theo-doi-don-hang/:orderNo`). `/danh-gia-don-hang` đã nối API (CS-64).

## NH-10 — Giao hàng + hoàn tất đơn (CS-56)

Controller: `OperatorOrdersController` (hộ nuôi), `OrderTrackingController` (khách).

- **Cột V010 trên `sales_order`**: `carrier_name`, `vehicle_plate`, `driver_phone`, `expected_arrival_at`, `shipping_note`, `received_at`.
- **Nền tảng không thu phí ship** (BR-52, TL-31): hộ nuôi tự gửi hàng qua nhà xe, thông tin nhập để khách liên hệ tài xế.
- **Quy tắc chuyển trạng thái**:
  - `Packed` → `Shipping` (`POST /api/orders/{orderNo}/ship`, hộ nuôi): ghi thông tin nhà xe, `shipped_at`.
  - `Shipping` → `Delivered` (`POST /api/orders/{orderNo}/deliver`, hộ nuôi): `delivered_at`, `return_window_ends_at = now + Orders:ReturnWindowHours (72)`. Cua của đơn `Packed` → `Sold`, mỗi con ghi 1 `CrabItemEvent` `Delivered`.
  - `POST /api/orders/{orderNo}/receive` (khách): nếu đơn `Shipping` thì chuyển `Delivered` (+72h từ lúc khách bấm); nếu đơn đã `Delivered` thì chỉ ghi `received_at`, không đổi hạn; xác nhận lại trả 200 không ghi thêm audit.
- **Job `OrderCompletionJob`** chạy mỗi 1 phút (`OrderCompletionService`, cấu hình `Orders:CompletionJob:Enabled`): chuyển đơn `Delivered` có `return_window_ends_at <= now` sang `Completed`, bỏ qua đơn có khiếu nại đang mở (`Open`, `OperatorResponded`, `Escalated`). Đơn `Completed` cộng vào doanh thu lô (`v_batch_actual_revenue`).
- **Mã lỗi `fulfil.*`**:
  - `fulfil.order_not_found` (404): không tìm thấy đơn.
  - `fulfil.order_forbidden` (403): đơn thuộc hộ nuôi khác.
  - `fulfil.invalid_status` (422): trạng thái không hợp lệ cho thao tác này.
  - `fulfil.eta_invalid` (422): giờ xe đến quá khứ hoặc quá 7 ngày.
  - `fulfil.status_changed` (409): trạng thái vừa bị thay đổi đồng thời.

## NH-12 — Đánh giá đơn hàng + trả hàng trong hạn (CS-64)

Controller: `OrderTrackingController` (khách).

- **Route**:
  - `GET /api/orders/{orderNo}/rating`: xem đánh giá của đơn và cờ `canRate`.
  - `POST /api/orders/{orderNo}/rating`: một đánh giá một đơn khi `status = Completed` (1–5 sao, `comment` ≤ 500 ký tự). Điểm trung bình (`averageStars`, `ratingCount`) hiển thị trên `GET /api/listings` và `GET /api/listings/{id}`.
  - `POST /api/orders/{orderNo}/return`: trả cả đơn khi `status = Delivered` và còn trong `return_window_ends_at` → `status = Returned`, lập một lệnh hoàn `Refund` bằng tổng `payment_request` `Paid`. Không nhập lại kho (`stock_qty_kg` không đổi), cua không đổi trạng thái.
- **Mã lỗi**: `rating.order_not_completed` (422), `rating.already_exists` (409), `order.already_returned` (422), `order.return_not_delivered` (422), `order.return_window_closed` (422), `order.return_blocked_by_complaint` (422), `order.return_nothing_paid` (422), `order.return_batch_account_closed` (422), `order.return_batch_settled` (422), `order.return_reason_required` (422), `order.status_changed` (409).


