# Catalog — Niêm yết sản phẩm

**Người làm:** Nhân · **Use case:** UC24 Publish Product Listings · UC25 Browse Product Catalogue

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `product_listing` | theo `batch_id` + `grade_id` · `storage_type`: `Fresh`, `Frozen` (`frozen_at`) · `current_price_per_kg` · `stock_qty_kg`, `reserved_qty_kg` (CHECK `reserved ≤ stock`) · `status`: `Draft`, `Published`, `SoldOut`, `Closed` |
| `price_history` | mỗi lần đổi giá · `flagged_abnormal` |
| `product_grade` | hạng L1–L4, SOFT (seed V002) |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/listings` | Operator Owner | Tạo niêm yết từ tồn đã thu hoạch của lô + hạng |
| PATCH | `/api/listings/{id}/price` | Operator Owner | Ghi `price_history`; thay đổi bất thường → `flagged_abnormal` (TL-27) |
| POST | `/api/listings/{id}/publish` · `/close` | Operator Owner | |
| GET | `/api/listings?crabType=&grade=&storage=&sort=&page=` | **Công khai** | UC25 lọc, sắp xếp |
| GET | `/api/listings/{id}` | **Công khai** | Chi tiết + lịch sử giá + link truy xuất lô |
| GET | `/api/admin/listings?flagged=true` | PlatformAdmin | Kiểm duyệt |
| POST | `/api/admin/listings/{id}/hide` | PlatformAdmin | Ẩn niêm yết vi phạm |

## Quy tắc phải giữ
- Không bán quá tồn: tồn khả dụng = `stock_qty_kg − reserved_qty_kg` (giữ tồn làm ở Orders).
- Còn ít hàng → gọi `AlertService.RaiseAsync(... LowStock ...)`.
- Hàng cấp đông quá `frozen_stock_cap_months` → tự `Closed` (TL-23).

## Màn hình
- Web: `store/StorePage.tsx` (Cửa hàng **bản 1**, nền sáng), `admin/AdminStorefront.tsx`, trang quản lý niêm yết trong `operator/` (mới).

## Tài liệu
TL-27 Định giá bán và minh bạch giá · TL-23 Tồn kho cấp đông · TL-29 Tách đơn theo lô.
