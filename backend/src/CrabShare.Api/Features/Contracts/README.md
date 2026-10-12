# Contracts — Hợp đồng góp vốn

**Người làm:** Thiện · **Use case:** UC14 Sign Investment Contract · UC15 Upload Offline-Signed Contract

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `contract_template` | mẫu đang `Active` (seed V002: `CT-2026-01`, nội dung `database/reference/contract-template-CT-2026-01.md`, `content_hash` cố định) |
| `investment_contract` | một hợp đồng cho một `contribution` · `status`: `Draft` → `OperatorSigned` → `FullySigned`; `Void` · `signing_method`: `DigitalSignature`, `OfflineUpload` · `draft_hash`, `final_hash`, `final_file_uri` |
| `contract_signature` | **thứ tự ký cố định**: `Operator` ký trước (order 1), `Investor` ký sau (order 2) |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/contributions/{id}/contract` | Investor | Sinh hợp đồng từ mẫu Active, điền `{{placeholder}}`, tính `draft_hash` (SHA-256) |
| GET | `/api/contracts/{id}` | Investor, Operator, Admin | Thông tin + trạng thái chữ ký |
| GET | `/api/contracts/{id}/file` | Investor, Operator, Admin | Tải file PDF |
| POST | `/api/contracts/{id}/sign` | Operator Owner rồi Investor | Gọi `IDigitalSigningService.SignAsync` (bản giả Viettel) → ghi `contract_signature`; đủ 2 chữ ký → `FullySigned`, ghi `final_hash` |
| POST | `/api/contracts/{id}/offline-upload` | Admin | UC15: tải bản ký tay đã scan → `signing_method = OfflineUpload` |

## Quy tắc phải giữ
- Sai thứ tự ký → 422 `contract.wrong_signing_order`.
- `FullySigned` bắt buộc có `final_hash` và `fully_signed_at` (CHECK).
- File mẫu trong `database/reference/` phải giữ **xuống dòng LF** (đã cấu hình `.gitattributes`) để hash không đổi.
- Mẫu hợp đồng **chưa được rà soát pháp lý** — ghi rõ trên giao diện bản demo.

## Màn hình
- Web: `operator/OperatorContract.tsx`, bước "Ký hợp đồng" trong luồng góp vốn ở `investor/`.

## Tài liệu
TL-19 Hiệu lực hợp đồng · TL-16 Đơn vị góp vốn và cách ghi quyền lợi · TL-18 Sở hữu đàn cua và uỷ quyền nuôi giữ.
