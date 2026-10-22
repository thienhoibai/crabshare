# Harvest — Thu hoạch, in tem, truy xuất

## Đã triển khai CS-71 / VI-14

API thật cho thu hoạch từng phần đã có trong `HarvestController` / `HarvestService*`.
Chi tiết contract, JSON Bruno, migration và kiểm chứng: [CS-71-harvest.md](../../../../../docs/validation/CS-71-harvest.md).

- Owner mở/sửa/chốt đợt; Owner/Staff ghi từng cá thể của Operator Approved. `Open` → `Completed`, một đợt Open mỗi lô; dữ liệu cũ thiếu trạng thái hiển thị `Legacy` chỉ đọc. Chốt đợt không đóng lô và không cộng tồn lần hai.
- `POST /api/batches/{code}/harvests` nhận `{requestId,name?,note?}`; trả 201 khi tạo, 200 khi tiếp tục/replay. GET cùng route đọc các đợt theo phân trang.
- `GET /api/batches/{code}/harvest-context?slotCode=...` trả quyền, đợt Open, tổng hợp và cá thể đang chiếm hộp.
- `POST /api/harvests/{id}/crabs` nhận `{requestId,slotCode,expectedCrabItemId,weightG,shellCondition}`. Gram nguyên 1–32767; shellCondition là `HardShell` hoặc `SoftShell`, xác nhận theo quan sát lúc cân. Không suy SOFT từ loại lô hoặc một lần Molted trong quá khứ.
- HardShell lấy các khoảng bao gồm hai đầu từ `product_grade`; SoftShell lấy đúng SOFT. Client không tính hạng hoặc tự chọn grade_id. Replay giữ snapshot kết quả cân dù hộp/cua/tem đã đổi trạng thái.
- `GET /api/harvests/{id}` và `/crabs` đọc lại đợt/lịch sử; `PATCH /api/harvests/{id}` nhận `{expectedRevision,name?,note?}`; `POST /api/harvests/{id}/complete` nhận `{expectedRevision}`.
- V016 bổ sung vòng đời, request chống lặp và snapshot bất biến; unique mã tem và một tem Printed/Active mỗi cá thể; collision retry tối đa 5 transaction đầy đủ.
- NH-15 chưa triển khai: lưu mốc `batch.harvest_started_at` khi lô lần đầu chuyển Harvesting, không tự đặt hạn hay đổi cam kết sang WindowOpen. API trại, kích hoạt tem và phần cứng in chưa thuộc CS-71.

CS-74 / VI-15 bổ sung backend cho danh sách/in tem, ảnh xác nhận, kích hoạt thủ công, hủy/thay tem và truy xuất theo trạng thái Active. Web/mobile và phần cứng máy in vẫn làm ở phase tiếp theo.

**Người làm:** Viên · **Use case:** UC22 Declare Harvest · UC46 Print and Activate Crab Tag · UC33 Trace Crab by Tag Scan

Tem **in lúc thu hoạch** bằng máy in nhãn của trại, dán lên con cua, kích hoạt bằng **một ảnh xác nhận**. Khi nuôi, con cua được nhận diện qua **số hộp**.

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `harvest` | một đợt thu hoạch: `harvested_count`, `total_weight_kg`, `declared_by`; V016 thêm tên, `lifecycle_status`, thời điểm/người chốt và revision |
| `crab_item` | sau khi cân: `weight_g`, `grade_id`, `harvest_id`, `status = InStock` (CHECK bắt buộc đủ 3 cột khi khác `Growing`/`Dead`) |
| `crab_tag` | `tag_code` CHAR(12) duy nhất · `Printed` → `Active` (bắt buộc `activation_evidence_id`) · `Void` (bắt buộc lý do) |
| `crab_item_event` | `Harvested`, `TagPrinted`, `TagActivated`, `TagVoided`, `Packed`, `Delivered`... |
| `tag_scan` | mỗi lần quét tem (ai quét, có phải chủ đơn không) |
| `product_grade` | seed V002: L1 ≥ 500 g · L2 350–499 g · L3 250–349 g · L4 < 250 g · SOFT (cua lột) |

## Endpoint hiện có và phần dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches/{code}/harvests` | Operator Owner | UC22 mở đợt thu hoạch; lô → `Harvesting` |
| POST | `/api/harvests/{id}/crabs` | OperatorMember | CS-71: `{ requestId, slotCode, expectedCrabItemId, weightG, shellCondition }` → `product_grade` → cá thể hiện có InStock → tem Printed → mã tem + đường dẫn QR |
| GET | `/api/tags?status=Printed&page=1&pageSize=20` | Operator Owner/Staff | Danh sách tem theo trang, giới hạn hộ nuôi hiện tại |
| GET | `/api/tags/{tagCode}/label` | Operator Owner/Staff | Trả `{tagCode,traceUrl}`; URL lấy từ `Trace:PublicBaseUrl`; không đổi trạng thái |
| POST | `/api/evidence` | Operator Owner/Staff | Multipart KH-07; gửi thêm `tagCode` để ảnh sau thu hoạch dùng lại pipeline ảnh, lưu trữ, nhận diện, trùng lặp và chấm rủi ro. Không gửi `batchCode`/`slotCode` khi dùng `tagCode` |
| POST | `/api/review/evidence/{id}/verdict` | Evidence Reviewer | `{verdict:"Pass"|"Fail"|"NeedMoreEvidence",note}`; `Watch` có thể được reviewer quyết định thủ công. Operator không tự đổi trạng thái |
| POST | `/api/tags/{tagCode}/activate` | Operator Owner/Staff | `{evidenceId}`; chỉ Evidence `Accepted`, `Photo`, `InAppCapture`, đúng crab/batch mới kích hoạt. Replay cùng evidence là idempotent |
| POST | `/api/tags/{tagCode}/void` | Operator Owner | `{reason}`; thay tag Printed/Active của crab `InStock`, tạo tag Printed mới |
| POST | `/api/harvests/{id}/complete` | Operator Owner | CS-71: `{ expectedRevision }` → chốt đợt Completed, giữ tổng cân hiện có; không đóng lô hoặc cộng tồn lần hai. Phần mở rộng VI-16 làm sau. |
| GET | `/api/trace/{tagCode}` | **Công khai** | Anonymous, mã đúng 12 ký tự theo alphabet tem VI-15; chỉ tag `Active` có view truy xuất mới trả DTO allowlist (lô, loại cua, trạng thái, cân nặng/hạng, ngày thả/thu hoạch, hộp và loại/thời điểm sự kiện). Không trả tên pháp lý/địa chỉ riêng tư, UUID nội bộ, ghi chú sự kiện, ảnh hoặc mã đơn hàng. Mỗi lượt hợp lệ thử ghi một `tag_scan` anonymous (`scanned_by=NULL`, `is_order_owner=0`); lỗi ghi scan không chặn kết quả. `Printed`/`Void` không ghi scan. Cache tắt. |

### Bruno examples

```http
GET {{baseUrl}}/api/tags?status=Printed&page=1&pageSize=20
Authorization: Bearer {{operatorToken}}
```

```http
GET {{baseUrl}}/api/tags/{{tagCode}}/label
Authorization: Bearer {{operatorToken}}
```

```http
POST {{baseUrl}}/api/evidence
Authorization: Bearer {{operatorToken}}
Content-Type: multipart/form-data

tagCode={{tagCode}}
capturedAt=2026-10-21T12:00:00+07:00
latitude=10.123456
longitude=106.654321
image=@./confirmation.jpg
```

```http
POST {{baseUrl}}/api/review/evidence/{{evidenceId}}/verdict
Authorization: Bearer {{reviewerToken}}
Content-Type: application/json

{"verdict":"Pass","note":"Đã đối chiếu cua và tem trong ảnh"}
```

```http
POST {{baseUrl}}/api/tags/{{tagCode}}/activate
Authorization: Bearer {{operatorToken}}
Content-Type: application/json

{"evidenceId":123}
```

```http
POST {{baseUrl}}/api/tags/{{tagCode}}/void
Authorization: Bearer {{operatorOwnerToken}}
Content-Type: application/json

{"reason":"Tem in sai"}
```

```http
GET {{baseUrl}}/api/trace/{{tagCode}}
```

`Watch` và `Flagged` cần reviewer quyết định trước khi kích hoạt. Thay tem sau khi cua đã `Packed`/`Delivered` đang được ghi TODO; phase này trả conflict. Không tích hợp/kiểm tra máy in vật lý.

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
