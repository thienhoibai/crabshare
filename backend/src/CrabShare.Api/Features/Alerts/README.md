# Alerts — Cảnh báo vận hành và leo thang

**Người làm:** Khôi · **Use case:** UC19 Acknowledge Operations Alert · UC20 Monitor Escalated Alerts

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `alert` | `alert_type`: `Mortality`, `WaterQuality`, `MilestoneDelay`, `LowStock`, `DataSilence`, `EvidenceFlag` · `severity`: `Low`, `Medium`, `High`, `Critical` · `ack_deadline` · `status`: `Open` → `Acknowledged` → `Resolved`; quá hạn → `Escalated` · `response_note` |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/operators/me/alerts?status=` | OperatorMember | Cảnh báo của hộ nuôi mình |
| POST | `/api/alerts/{id}/acknowledge` | OperatorMember | UC19: `{ responseNote }` (bắt buộc) |
| GET | `/api/batches/{code}/alerts` | Investor của lô | Hiển thị trên timeline |
| GET | `/api/admin/alerts?status=Escalated` | PlatformAdmin | UC20 |
| POST | `/api/admin/alerts/{id}/resolve` | PlatformAdmin | Đóng cảnh báo kèm ghi chú |

**Hàm dùng chung cho module khác** (không phải endpoint):
`AlertService.RaiseAsync(batchId, type, severity, message, ackWithin)` — Production gọi khi nhật ký ngoài ngưỡng / có cua chết, Evidence gọi khi yêu cầu chụp quá hạn, Catalog gọi khi sắp hết hàng. **Chốt chữ ký hàm này với Viên và Nhân ngay ngày đầu.**

Job nền (mỗi 15 phút):
- `Open` quá `ack_deadline` → `Escalated` (báo Quản trị).
- `DataSilence`: lô đang nuôi chưa có nhật ký trong ngày tới giờ quy định.
- `MilestoneDelay`: đợt giải ngân quá `planned_date` mà chưa xin.

## Quy tắc phải giữ
- Ngưỡng (pH, nhiệt độ, độ mặn, tỉ lệ chết) để trong `appsettings.json` mục `Alerts:Thresholds` (CSDL chưa có bảng ngưỡng). Chốt số liệu theo SRS.
- Không tạo trùng: cùng lô + cùng loại + còn `Open` thì cập nhật, không thêm dòng mới.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_overdue_alerts` | cảnh báo quá hạn phản hồi (dùng cho job leo thang) |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Mobile: `operator/alerts/alerts_page.dart` (đổi `AlertsController` sang API).
- Web: `operator/OperatorAlerts.tsx`, `admin/AdminAlerts.tsx`.

## Tài liệu
TL-22 Cảnh báo leo thang và bế tắc vận hành · TL-21 Ghi nhận hao hụt.
