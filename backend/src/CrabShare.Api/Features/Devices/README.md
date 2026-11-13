# Devices — API nhận dữ liệu thiết bị IoT (BR v1.5 nhóm E, G4)

Hợp đồng API đúng mục 11 của Hướng dẫn dựng trạm đo GradeAI và camera chạy dàn. Thiết bị thật và tool giả lập `simdevice` dùng chung API (BR-230).

## Quy ước chung
- Header `X-Device-Key`: khoá thiết bị Admin cấp khi đăng ký (chỉ lưu SHA-256 trên máy chủ).
- Header `Idempotency-Key`: trùng `messageId` (UUID) của bản tin. Gửi lại cùng mã thì 409, không ghi hai lần (BR-113).
- `capturedAt` là giờ thiết bị; máy chủ ghi `receivedAt` theo giờ máy chủ. Mất mạng thì thiết bị lưu tạm rồi gửi dồn (BR-231).
- Mã lỗi: 403 thiết bị lạ, sai khoá, đã gỡ hoặc ngoài phạm vi; 404 chưa có lượt đo mở; 409 trùng bản tin; 422 thiếu trường hoặc sai quy tắc (cửa trạm mở, quá hạn hiệu chuẩn, cân không ổn định > 0,2 g).

| Method | Path | Thiết bị | Nội dung |
|---|---|---|---|
| POST | `/api/devices/heartbeat` | mọi loại | `{deviceCode, firmwareVersion, status, lastCalibratedAt, queueLength}` → trạng thái, `calibrationDue` |
| GET | `/api/devices/{code}/open-session` | Station | `{sessionNo, crabTag, openedAt}` hoặc 404 |
| POST | `/api/devices/ingest/measurements` | Station | multipart: `meta` (JSON) + `white` + `red` (JPEG) → 202 `{status:"Received", sessionNo}` |
| POST | `/api/devices/ingest/box-images` | RailCamera, Camera | multipart: `meta` + `image`; hộp phải thuộc dàn của thiết bị, tầng và cột phải khớp |
| POST | `/api/devices/ingest/water-readings` | WaterSensor | `{messageId, deviceCode, measuredAt, temperatureC, salinityPpt, ph, qualityFlag}` |
| POST | `/api/devices/calibration` | mọi loại | `{messageId, deviceCode, kind: scale|camera|tof|ph|ec|position, performedAt, details}` |
| GET | `/api/devices/{code}/commands` | RailCamera | lệnh chờ: ScanRack, ScanBox `{boxCode}`, Park, Calibrate |
| POST | `/api/devices/commands/{id}/ack` | RailCamera | xác nhận đã làm lệnh |

`meta` của trạm đo: `messageId, deviceCode, deviceType, firmwareVersion, capturedAt, weightG, weightSamples, weightRangeG, tofMm, cameraHeightMm,
lastCalibratedAt, presets{white,red{exposureUs,gain,lensPosition}}, doorClosed`.
`meta` của camera chạy dàn: `messageId, deviceCode, deviceType, rackCode, boxCode, tier, column, runId, capturedAt, tofMm, illumination, exposureUs, gain`.
Mã dàn là `R` + số kệ hai chữ số (`R02`).

Trạm đo gửi xong thì máy chủ ghi khối lượng từ cân, chạy AI đo mai (`Grading:Ai:Mode` = None, Http hoặc Simulated), đề xuất hạng và phân ngẫu nhiên
Nhân viên kiểm phẩm (xem `Features/Grading`).

## Quản lý thiết bị
- Admin: `POST /api/admin/devices` (đăng ký, trả khoá một lần), `/rotate-key`, `/remove`, `GET /api/admin/devices`, hiệu chuẩn tay.
- Người nuôi: `GET /api/operators/me/devices`, `POST /api/devices/{code}/commands` (ra lệnh cho camera chạy dàn).
- Dữ liệu: `GET /api/batches/{code}/water-readings`, `GET /api/batches/{code}/device-images`, `GET /api/device-images/{id}/file`.
- Thiết bị không gửi quá `DeviceOfflineMinutes` thì có cảnh báo mất kết nối (job `Devices:OfflineJob:Enabled`).

## Thiết bị demo (chỉ máy dev, `Seed:Enabled`)
Seed tạo lô `CS-2611-P1` đang nuôi 40 con ở dàn R02 (hộp 1701–1740, 4 tầng × 10 cột) và ba thiết bị có khoá cố định:

| Mã | Loại | Khoá | Phạm vi |
|---|---|---|---|
| `ST-NC-01` | Station | `dk_demo_station_namcan_2026` | trạm kiểm phẩm tại trại |
| `RC-NC-R02` | RailCamera | `dk_demo_railcam_namcan_r02_2026` | dàn R02 |
| `WS-NC-01` | WaterSensor | `dk_demo_water_namcan_2026` | đợt lưu nuôi của CS-2611-P1 |

## Tool giả lập `simdevice`
```
dotnet run --project backend/tools/CrabShare.DeviceSimulator -- heartbeat --api http://localhost:5233 --device WS-NC-01 --key dk_demo_water_namcan_2026
dotnet run --project backend/tools/CrabShare.DeviceSimulator -- water --device WS-NC-01 --key dk_demo_water_namcan_2026 --count 4 --duplicate
dotnet run --project backend/tools/CrabShare.DeviceSimulator -- railcam --device RC-NC-R02 --key dk_demo_railcam_namcan_r02_2026 --rack R02 --first-box 1701 --count 40
dotnet run --project backend/tools/CrabShare.DeviceSimulator -- station --device ST-NC-01 --key dk_demo_station_namcan_2026 --weight 412.3
```
Tuỳ chọn thêm: `--offline-replay` (giữ ba bản tin rồi gửi dồn), `--unknown-device` (máy chủ phải trả 403), `--clock-skew <giây>`, `--images <thư mục>`
(dùng ảnh JPG thật thay ảnh tự vẽ), `--door-open`, `--calibrated-days-ago 31`, `--range 0.4` (thử các lỗi của trạm).
Trước khi chạy `station`, người nuôi phải bắt đầu thu hoạch và mở lượt đo bằng mã cua (`POST /api/measurement-sessions`).
