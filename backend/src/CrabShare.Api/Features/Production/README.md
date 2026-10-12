# Production — Nhật ký nuôi, sự kiện từng hộp, Ingestion API

**Người làm:** Viên · **Use case:** UC17 Record Production Logs and Slot Events · UC21 View Production Timeline (+ API nhận dữ liệu từ phần mềm của trại)

Hệ thống **không** điều khiển nước hay thiết bị. Người nuôi **tự điền** (hoặc phần mềm của trại gửi qua API): nhiệt độ nước, độ mặn, pH, lượng thức ăn, ghi chú, và sự kiện của từng hộp.

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `production_log` | mỗi lô **một bản ghi/ngày/nguồn** (unique `batch_id, log_date, source`) · `water_temp_c`, `salinity_ppt`, `ph`, `feed_kg`, `note` · `source`: `Manual`, `FarmApi` · `plausibility_flag`: `Ok`, `OutOfRange`, `Inconsistent` |
| `slot_event` | `event_type`: `Stocked`, `Molted`, `Mortality`, `Restocked`, `Harvested`, `Relocated` |
| `crab_item` | **một con cua = một dòng** · `Growing` → `Dead` / (thu hoạch) `InStock`… · `replaces_crab_item_id` khi thả bù |
| `crab_item_event` | lịch sử từng con |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches/{code}/production-logs` | OperatorMember | Nhật ký ngày (`Manual`); kiểm tra hợp lý → gắn cờ; ngoài ngưỡng thì gọi `AlertService` tạo cảnh báo `WaterQuality` |
| GET | `/api/batches/{code}/production-logs?from=&to=` | OperatorMember, Investor của lô, Admin | |
| POST | `/api/batches/{code}/stocking` | Operator Owner | Thả giống vào danh sách hộp → `slot_allocation` + `crab_item (Growing)` + `slot_event Stocked`; lô → `Stocked` / `InProduction` |
| POST | `/api/batches/{code}/slot-events` | OperatorMember | `{ slotCode, eventType, occurredAt, quantity, note }` · `Mortality` → cua `Dead` (+ cảnh báo hao hụt) · `Restocked` → cua mới thay thế (trước `restock_cutoff_days`) |
| POST | `/api/ingest/v1/production-logs` | Phần mềm của trại | Header `X-Api-Key` của hộ nuôi · `source = FarmApi` |
| POST | `/api/ingest/v1/slot-events` | Phần mềm của trại | như trên |
| GET | `/api/batches/{code}/timeline` | Investor của lô, OperatorMember, Admin | UC21: gộp nhật ký + sự kiện + bằng chứng + cảnh báo theo thời gian |

## Quy tắc phải giữ
- Số cua khớp: đang nuôi = đã thả − chết + thả bù (đối chiếu mỗi lần có sự kiện).
- Thả bù chỉ trước `restock_cutoff_days` (TL-21).
- Phân quyền theo lô: nhân viên chỉ ghi cho lô của hộ nuôi mình (`ICurrentUser.RequireOperatorId()`).
- Ingestion API cần tài liệu đặc tả (Phiếu yêu cầu *ingestion API specification*): viết `docs/ingestion-api.md` khi làm.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_crab_count_reconciliation` | đối chiếu số cua đã thả / chết / thả bù / đang nuôi |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Web: `operator/OperatorDailyLog.tsx`, timeline trong `operator/OperatorBatchDetail.tsx` và trong `investor/`.
- Mobile: `operator/today/`, `operator/logs/` (đổi `MockOperatorRepository.submitLog` sang API).

## Tài liệu
TL-21 Ghi nhận hao hụt và thả bù giống · TL-22 Cảnh báo leo thang · TL-24 Định danh cá thể.
