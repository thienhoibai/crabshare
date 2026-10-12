# Portfolio — Danh mục nhà đầu tư và thông báo

**Người làm:** Khôi · **Use case:** UC16 Track Investment Portfolio (+ dòng thông báo trong app)

Module **chỉ đọc**: gom dữ liệu từ Funding, Batches, Production, Alerts, Settlement để hiển thị cho nhà đầu tư. Không ghi vào bảng của module khác.

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/investor/portfolio` | Investor | Danh sách khoản góp: lô, số tiền, % vốn lô, trạng thái lô, ngày nuôi / chu kỳ, số cua đang nuôi, số cảnh báo mở |
| GET | `/api/investor/portfolio/{batchCode}` | Investor | Chi tiết một lô mình góp: timeline rút gọn, hợp đồng, sao kê (nếu có) |
| GET | `/api/me/notifications?after=` | Đã đăng nhập | Dòng thông báo tính từ sự kiện: tiền đã xác nhận, hợp đồng đủ chữ ký, nhật ký mới, cảnh báo, quyết toán được công bố, đã chi trả |

## Quy tắc phải giữ
- **Không** hiển thị lợi suất kỳ vọng (BR-49). Chỉ số liệu thật.
- Chỉ trả dữ liệu các lô mà người gọi đã góp vốn.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_investor_portfolio` | danh mục góp vốn theo nhà đầu tư |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Mobile: `investor/home/` (đồng hồ chu kỳ + thẻ khoản góp), `investor/notifications/` — đổi `MockInvestorRepository` sang API.
- Web: tab Danh mục trong `investor/InvestorPortal.tsx` (bản 2).

## Tài liệu
TL-05 Cơ sở pháp lý huy động vốn (mục không hiển thị lợi suất).
