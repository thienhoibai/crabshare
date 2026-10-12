# Harvest — Thu hoạch, in tem, truy xuất

**Người làm:** Viên · **Use case:** UC22 Declare Harvest · UC46 Print and Activate Crab Tag · UC33 Trace Crab by Tag Scan

Tem **in lúc thu hoạch** bằng máy in nhãn của trại, dán lên con cua, kích hoạt bằng **một ảnh xác nhận**. Khi nuôi, con cua được nhận diện qua **số hộp**.

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `harvest` | một đợt thu hoạch: `harvested_count`, `total_weight_kg`, `declared_by` |
| `crab_item` | sau khi cân: `weight_g`, `grade_id`, `harvest_id`, `status = InStock` (CHECK bắt buộc đủ 3 cột khi khác `Growing`/`Dead`) |
| `crab_tag` | `tag_code` CHAR(12) duy nhất · `Printed` → `Active` (bắt buộc `activation_evidence_id`) · `Void` (bắt buộc lý do) |
| `crab_item_event` | `Harvested`, `TagPrinted`, `TagActivated`, `TagVoided`, `Packed`, `Delivered`... |
| `tag_scan` | mỗi lần quét tem (ai quét, có phải chủ đơn không) |
| `product_grade` | seed V002: L1 ≥ 500 g · L2 350–499 g · L3 250–349 g · L4 < 250 g · SOFT (cua lột) |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches/{code}/harvests` | Operator Owner | UC22 mở đợt thu hoạch; lô → `Harvesting` |
| POST | `/api/harvests/{id}/crabs` | OperatorMember | `{ slotCode, weightG }` → xếp hạng theo `product_grade` → `crab_item InStock` → tạo `crab_tag Printed` → trả nội dung in (mã tem + QR URL) |
| POST | `/api/tags/{tagCode}/activate` | OperatorMember | UC46: ảnh xác nhận (đi qua Evidence) → `Active` |
| POST | `/api/tags/{tagCode}/void` | Operator Owner | `{ reason }` → in lại tem mới |
| POST | `/api/harvests/{id}/complete` | Operator Owner | Chốt tổng số con, tổng kg → cộng tồn cho Catalog (thống nhất với Nhân) |
| GET | `/api/trace/{tagCode}` | **Công khai** | UC33: hộ nuôi, lô, **số hộp**, ngày thả, ngày thu hoạch, hạng, khối lượng, chuỗi sự kiện tới đơn hàng; ghi `tag_scan` |

## Quy tắc phải giữ
- Mã tem 12 ký tự, không trùng, không đoán được (tránh ký tự dễ nhầm 0/O, 1/I).
- Trang truy xuất **không** trả ảnh nuôi; chỉ trả nguồn gốc và hành trình.
- Tồn cấp đông tối đa `frozen_stock_cap_months` (mặc định 4 tháng) — TL-23.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_traceability` | dữ liệu trang truy xuất theo mã tem |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Mobile: `operator/harvest/` (cân → hạng → in tem → chụp xác nhận), `trace/` (quét tem: thêm package `mobile_scanner`).
- Web: `operator/OperatorHarvest.tsx`, `trace/TracePage.tsx` (route `/truy-xuat/:tagCode` — đây là URL in trong QR).

## Tài liệu
TL-24 Định danh cá thể và truy xuất nguồn gốc · TL-23 Thời điểm thu hoạch, tồn kho cấp đông và trần bốn tháng.
