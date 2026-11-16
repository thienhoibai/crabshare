# Production — Nhật ký nuôi, sự kiện từng hộp, Ingestion API

**Người làm:** Viên · **Use case:** UC17 Record Production Logs and Slot Events · UC21 View Production Timeline (+ API nhận dữ liệu từ phần mềm của trại)

Hệ thống **không** điều khiển nước hay thiết bị. Người nuôi **tự điền** (hoặc phần mềm của trại gửi qua API): nhiệt độ nước, độ mặn, pH, lượng thức ăn, ghi chú, và sự kiện của từng hộp.

## VI-08 Nhật ký ngày đã triển khai

POST/GET `/api/batches/{code}/production-logs` và GET `/api/operators/me/production-logs` dùng API thật cho web/mobile. Owner của Operator đặt riêng ngưỡng nước cho mỗi lô qua GET/PUT `/api/batches/{code}/production-thresholds`; không dùng các ngưỡng dev làm tiêu chuẩn nuôi. Cần cấu hình trước lần ghi đầu, mỗi thay đổi tạo phiên bản và nhật ký giữ phiên bản đã áp dụng.

Owner/Staff ghi nhật ký Manual cho lô InProduction/Harvesting thuộc Operator Approved, chỉ hôm nay UTC+7 từ server. Số đo ngoài khoảng vẫn lưu với OutOfRange và tạo WaterQuality qua AlertService trong cùng transaction. Unique hiện có bảo vệ một bản/lô/ngày/nguồn; ghi trùng trả 409. GET `/api/operators/me/production-batches` trả lô Stocked/InProduction/Harvesting cùng số cua Growing và trạng thái ghi nhật ký, giữ lô Harvesting cho màn Thu hoạch.

Cần áp dụng V014 trước khi chạy API mới. Contract, JSON Bruno, đơn vị, quyền, quy tắc tạm VI-08 và cách demo: [CS-48-production-logs.md](../../../../../docs/validation/CS-48-production-logs.md). Các endpoint ingestion, slot-events và timeline trong bảng kế hoạch dưới đây vẫn ngoài phạm vi VI-08.

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `production_log` | mỗi lô **một bản ghi/ngày/nguồn** (unique `batch_id, log_date, source`) · `water_temp_c`, `salinity_ppt`, `ph`, `feed_kg`, `note` · `source`: `Manual`, `FarmApi` · `plausibility_flag`: `Ok`, `OutOfRange`, `Inconsistent` |
| `slot_event` | `event_type`: `Stocked`, `Molted`, `Mortality`, `Restocked`, `Harvested`, `Relocated` |
| `crab_item` | **một con cua = một dòng** · `Growing` → `Dead` / (thu hoạch) `InStock`… · `replaces_crab_item_id` khi thả bù |
| `crab_item_event` | lịch sử từng con |

## VI-09 Sự kiện hộp đã triển khai

POST/GET `/api/batches/{code}/slot-events`, GET `slot-event-context` và GET/PUT `slot-event-policy` đã dùng API thật trên web/mobile. Owner/Staff ghi Molted/Mortality/Restocked/Relocated cho Stocked/InProduction/Harvesting; Owner đặt quy tắc có phiên bản cho lô. Trại chọn cách tính hạn và ngưỡng cảnh báo, hệ thống không tự áp các định mức sinh học. Chưa cấu hình ngưỡng thì không tự đánh giá Mortality; thả bù cần cấu hình hạn trước.

Chết/thả bù cần ảnh chụp trực tiếp từ app mobile đúng hộp/lô. Thả bù cùng hộp, chọn rõ cua Dead chưa được thay; chuyển hộp giữ ID cua và lịch sử allocation nguồn/đích. UUID request chống gửi lặp, Serializable + claim có điều kiện + unique DB bảo vệ concurrency. Cần V015, không reset DB. Contract, JSON Bruno, quyết định nghiệp vụ cập nhật theo người dùng và hướng dẫn demo: [CS-52-slot-events.md](../../../../../docs/validation/CS-52-slot-events.md).

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/batches/{code}/production-logs` | OperatorMember | Nhật ký ngày (`Manual`); kiểm tra hợp lý → gắn cờ; ngoài ngưỡng thì gọi `AlertService` tạo cảnh báo `WaterQuality` |
| GET | `/api/batches/{code}/production-logs?from=&to=` | OperatorMember, Investor của lô, Admin | |
| POST | `/api/batches/{code}/stocking` | Operator Owner | **Đã làm VI-07.** Chọn slotCodes hoặc range; tạo allocation/cua/event, ghi audit Funding → Stocked → InProduction trong một transaction. Chi tiết: [vi07-stocking.md](../../../../../docs/validation/vi07-stocking.md). |
| POST | `/api/batches/{code}/slot-events` | OperatorMember | `{ slotCode, eventType, occurredAt, quantity, note }` · `Mortality` → cua `Dead` (+ cảnh báo hao hụt) · `Restocked` → cua mới thay thế (trước `restock_cutoff_days`) |
| POST | `/api/ingest/v1/production-logs` | Phần mềm của trại | Header `X-Api-Key` của hộ nuôi · `source = FarmApi` |
| POST | `/api/ingest/v1/slot-events` | Phần mềm của trại | như trên |
| GET | `/api/batches/{code}/timeline` | Investor của lô, OperatorMember, Admin | UC21: gộp nhật ký + sự kiện + bằng chứng + cảnh báo theo thời gian |

## Quy tắc phải giữ
- Số cua khớp: đang nuôi = đã thả − chết + thả bù (đối chiếu mỗi lần có sự kiện).
- Thả bù theo hạn do trại cấu hình tường minh (cách tính + số ngày), cho phép hết ngày hạn UTC+7; kiểm tra cả giờ server để không né hạn bằng nhập lùi. Thông số cũ `restock_cutoff_days` chỉ là gợi ý khi chưa xác nhận cấu hình VI-09.
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
