# Catalog — Niêm yết sản phẩm

**Người làm:** Nhân · **Use case:** UC24 Publish Product Listings · UC25 Browse Product Catalogue

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `product_listing` | theo `batch_id` + `grade_id` · `storage_type`: `Fresh`, `Frozen` (`frozen_at`) · `current_price_per_kg` · `stock_qty_kg`, `reserved_qty_kg` (CHECK `reserved ≤ stock`) · `status`: `Draft`, `Published`, `SoldOut`, `Closed` |
| `price_history` | append-only · mỗi lần đổi giá: `previous_price_per_kg`, `reason_code` (`Initial`, `Market`, `Promotion`, `Clearance`, `Correction`, `Other`), `note`, `flagged_abnormal` (V003) |
| `price_check` | append-only · 1-1 với `price_history`: tập so sánh, trung vị, MAD, điểm, ngưỡng, `algorithm_version` (V003) |
| `product_listing.image_uri` | ảnh sản phẩm do hộ nuôi tải lên (V003) |
| `product_listing.hidden_at`, `hidden_by`, `hidden_reason` | quản trị ẩn niêm yết vi phạm; ba cột cùng null hoặc cùng có giá trị (V005) |
| `product_grade` | hạng L1–L4, SOFT (seed V002) |

## Endpoint
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/operators/me/listings` · `/{id}` | Operator | Niêm yết của hộ + lịch sử giá |
| GET | `/api/operators/me/listings/options` | Operator | Lô đang thu hoạch × hạng còn cua trong kho, kèm niêm yết đã có |
| POST | `/api/listings` | Operator Owner | Tạo bản nháp từ tồn đã cân của lô + hạng (mỗi lô + hạng một niêm yết) |
| GET | `/api/listings/{id}/price-check?pricePerKg=` | Operator | Xem trước kết quả so giá, không ghi gì |
| PATCH | `/api/listings/{id}/price` | Operator Owner | Ghi `price_history` + `price_check`; lệch → `flagged_abnormal`, không chặn (TL-27) |
| POST | `/api/listings/{id}/publish` · `/close` | Operator Owner | Đăng thẳng, không chờ duyệt; `close` bị chặn khi còn hàng đang giữ cho đơn |
| POST | `/api/listings/{id}/refresh-stock` | Operator | Tính lại tồn từ cua `InStock`; tự chuyển `Published` ⇄ `SoldOut` |
| POST · GET | `/api/listings/{id}/image` | Owner · **Công khai** | JPEG/PNG/WebP ≤ 5 MB |
| GET | `/api/listings?crabType=&grade=&storage=&sort=&page=&pageSize=` | **Công khai** | UC25 · chỉ `Published` + `SoldOut`, còn hàng xếp trước · `sort`: `Newest` (mặc định), `PriceAsc`, `PriceDesc` · trả `PagedResult` |
| GET | `/api/listings/{id}` | **Công khai** | Chi tiết + lịch sử giá + `traceTagCode` (tem `Active` của lô + hạng) để mở `/truy-xuat/{tagCode}` |
| GET | `/api/admin/listings?flagged=&hidden=&status=&page=&pageSize=` | PlatformAdmin | Kiểm duyệt · `flagged=true`: lần đổi giá gần nhất bị gắn cờ · kèm kết quả so giá của lần đó |
| POST | `/api/admin/listings/{id}/hide` | PlatformAdmin | Ẩn niêm yết vi phạm · `{ reason }` bắt buộc · đã ẩn → 409 `listing.already_hidden` |

## Quy tắc phải giữ
- Không bán quá tồn: tồn khả dụng = `stock_qty_kg − reserved_qty_kg` (giữ tồn làm ở Orders).
- Còn ít hàng → `LowStockMonitor` gọi `IAlertRaiser.RaiseAsync(batchId, "LowStock", ...)` sau khi đăng bán, làm mới tồn và checkout. Ngưỡng `Alerts:Thresholds:LowStockKg` (mặc định 5 kg). Một lô một cảnh báo, liệt kê mọi niêm yết thấp của lô. Bản hiện tại `LoggingAlertRaiser` chỉ ghi log; KH-05 xong thì đổi đăng ký sang AlertService.
- Niêm yết bị ẩn: status giữ nguyên, người nuôi vẫn thấy kèm lý do; cửa hàng (`FilterStore`, `GetPublicAsync`) và checkout bỏ qua.
- Hàng cấp đông quá `frozen_stock_cap_months` → tự `Closed` (TL-23).
- So giá (`PriceAnomaly`, `mad-v1`): đơn `Completed` cùng loại cua + hạng + bảo quản trong 30 ngày (thiếu thì 90 ngày); cần ≥ 20 giao dịch và ≥ 3 hộ nuôi, không đủ thì ghi "chưa đủ dữ liệu" và không gắn cờ. Chưa lọc theo tỉnh vì địa chỉ hộ nuôi là chuỗi tự do.

## Màn hình
- Web: `store/StorePage.tsx` (Cửa hàng **bản 1**, nền sáng), `admin/AdminStorefront.tsx`, trang quản lý niêm yết trong `operator/` (mới).

## Tài liệu
TL-27 Định giá bán và minh bạch giá · TL-23 Tồn kho cấp đông · TL-29 Tách đơn theo lô.
