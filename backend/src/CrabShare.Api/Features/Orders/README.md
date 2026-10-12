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
| POST | `/api/orders/checkout` | Customer | `{ lines: [{ listingId, quantityKg }], addressId }` → giữ tồn **nguyên tử** → `PendingPayment` + `payment_request` VietQR. Giỏ nhiều lô → tách nhiều đơn |
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
- **Không bán vượt** với 50 lượt thanh toán đồng thời trên một niêm yết (NFR Integrity) — giữ tồn bằng một câu `UPDATE ... WHERE stock_qty_kg - reserved_qty_kg >= @qty` trong transaction; viết test chạy song song.
- Doanh thu tính quyết toán = đơn `Completed` của lô (Settlement đọc).
- Hoàn tiền tạo `payment_instruction` loại `Refund` (module Payments).

## Màn hình
- Web: `orders/CommercePage.tsx` (giỏ, thanh toán, theo dõi, lịch sử, huỷ/trả, đánh giá), `admin/AdminDisputes.tsx`, trang đơn hàng trong `operator/` (mới).
- Mobile: màn **Đóng gói — quét tem** cho hộ nuôi (mới, UC29).

## Tài liệu
TL-28 Giữ chỗ tồn kho và chống bán vượt · TL-29 Tách đơn theo lô · TL-31 Giao hàng và xử lý khiếu nại.
