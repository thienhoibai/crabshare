# Contracts — Hợp đồng góp vốn

**Người làm:** Thiện · **Use case:** UC14 Sign Investment Contract · UC15 Upload Offline-Signed Contract

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `contract_template` | mẫu đang `Active` (seed V002: `CT-2026-01`, nội dung `database/reference/contract-template-CT-2026-01.md`, `content_hash` cố định) |
| `investment_contract` | một hợp đồng cho một `contribution` (unique) · `status`: `Draft` → `OperatorSigned` → `FullySigned`; `Void` · `signing_method`: `DigitalSignature`, `OfflineUpload` · `draft_hash`, `final_hash`, `final_file_uri` |
| `contract_signature` | **thứ tự ký cố định**: `Operator` ký trước (order 1), `Investor` ký sau (order 2) · `signed_hash` = mã băm file sau chữ ký đó |

## Đã làm (TH-08)
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/contributions/{id}/contract` | Investor (chủ khoản góp) | Lập hợp đồng từ mẫu `Active` mới nhất: điền `{{placeholder}}`, dựng PDF, lưu file, `draft_hash` = SHA-256 → 201 `Draft`. Đã có thì trả đúng hợp đồng đó (200). Khoản góp phải `Reserved` còn hạn hoặc `Confirmed` (422 `contract.contribution_inactive`), lô `Funding` (422 `contract.batch_not_funding`). Người khác → 403 `contribution.not_owner`. Audit `investment_contract/create` |
| GET | `/api/contracts/{id}` | Nhà đầu tư của khoản góp, thành viên hộ nuôi của lô, admin | Thông tin + chữ ký + `currentHash`, `nextSigner`, `canSign`, `legalNotice`. Người ngoài → 404 |
| GET | `/api/contracts/{id}/file` | như trên | PDF hiện hành (bản cuối khi đã đủ chữ ký); **băm lại trước khi trả**, lệch → 500 `contract.file_tampered` |
| POST | `/api/contracts/{id}/sign` | Chủ hộ nuôi (Owner) rồi nhà đầu tư | Ký trên đúng file hiện hành qua `IDigitalSigningService` (bản giả Viettel nối chữ ký vào cuối file → mã băm mới, phần đã ký trước giữ nguyên byte). Nhà đầu tư ký trước → 422 `contract.wrong_signing_order`; nhân viên (Staff) → 403 `contract.owner_only`; ký lại → 409 `contract.already_signed`; hợp đồng `Void` → 422 `contract.void`. Đủ hai chữ ký → `FullySigned` + `final_hash`, `final_file_uri`, `fully_signed_at`. Audit `investment_contract/sign` |
| GET | `/api/operator/contracts` | OperatorMember | Hợp đồng các lô của hộ nuôi tôi: chờ người nuôi ký trước, rồi chờ nhà đầu tư, rồi đã xong |

Cách làm:
- `ContractTemplateDocuments` đọc mẫu từ `Reference/` và so SHA-256 với `content_hash` (mẫu bị sửa → 500 `contract.template_unavailable`).
- `ContractPdfRenderer` dựng PDF bằng **SkiaSharp có sẵn** (không thêm thư viện), font Plus Jakarta Sans (OFL, đủ dấu tiếng Việt) lấy từ `web/public/assets/fonts`, copy vào `Reference/Fonts`. Trang đầu có khung **"BẢN DEMO — MẪU HỢP ĐỒNG CHƯA ĐƯỢC RÀ SOÁT PHÁP LÝ"**; chân trang có số hợp đồng, mẫu, số trang.
- `ContractFileStore` lưu từng phiên bản tại `contracts/{số hợp đồng}/{sha256}.pdf` dưới `Storage:RootPath` (Azure: `/home/data/storage`). Tên file là mã băm nên không cần cột mới; không đi qua `IFileStorage` vì Cloudinary chỉ nhận ảnh.
- Số hợp đồng `HD{yyyyMMdd}-{contribution_id:6}`. `{{standard_cost.hash}}` = SHA-256 bản JSON các dòng chi phí chuẩn đã khoá (bảng không có cột băm).
- `ContractVoiding.VoidUnsignedAsync`: hợp đồng chưa đủ chữ ký → `Void` khi giữ chỗ hết hạn (job TH-07), nhà đầu tư huỷ giữ chỗ, hoặc lô huỷ vì thiếu vốn. Bản `FullySigned` giữ nguyên làm hồ sơ.
- Thả giống cần mọi khoản `Confirmed` có hợp đồng `FullySigned` (`Batches/FundingReadiness`).
- Hợp đồng do seeder tạo (lô demo) chỉ có dòng trong CSDL, không có file PDF: mở file của chúng báo `contract.file_missing`.
- Test `ContractDatabaseTests`: ký đúng/sai thứ tự, Staff không ký được, mã băm từng phiên bản, file cuối = file nháp + các chữ ký nối sau, người ngoài 404, giữ chỗ hết hạn → `Void`, font đủ dấu.

## Đã làm (TH-09)
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/contracts/{id}/offline-upload` | PlatformAdmin | UC15 (TL-19 §3.3, đường dự phòng): multipart `file` (PDF bắt đầu bằng `%PDF-`, ≤ 10 MB) + `confirmedBothSigned=true` (admin xác nhận đã đối chiếu đủ chữ ký hai bên — hệ thống không kiểm tra chữ ký tay). Lưu nguyên byte, băm SHA-256 ngay → `FullySigned`, `signing_method = OfflineUpload`, `final_hash`, `final_file_uri`. Lỗi: 422 `contract.confirm_signatures`, `contract.file_type`, `contract.file_size`, `contract.void`, `contract.contribution_inactive`; 409 `contract.already_signed` (đã đủ chữ ký thì phải lập phiên bản mới). Audit `investment_contract/offline_upload` (mã băm, kích thước, người tải, mã băm bản trước) |
| GET | `/api/me/contracts` | Investor | Tab Hợp đồng: **chỉ** hợp đồng của các khoản góp của tôi |
| GET | `/api/admin/batches/{code}/contracts` | PlatformAdmin | Kho hợp đồng của một lô |

Test `ContractDatabaseTests.Admin_uploads_offline_signed_scan_and_investor_sees_only_own_contracts`.

## Quy tắc phải giữ
- Sai thứ tự ký → 422 `contract.wrong_signing_order`.
- `FullySigned` bắt buộc có `final_hash` và `fully_signed_at` (CHECK).
- File mẫu trong `database/reference/` phải giữ **xuống dòng LF** (đã cấu hình `.gitattributes`) để hash không đổi.
- Mẫu hợp đồng **chưa được rà soát pháp lý** — ghi rõ trên PDF và giao diện bản demo (`legalNotice`).

## Màn hình
- Web: `operator/OperatorContract.tsx` (danh sách + xem PDF + ký, menu "Hợp đồng góp vốn"), màn 3 "Ký hợp đồng" trong `investor/funding/ContributePage.tsx`; dùng chung `shared/contracts/` (`ContractViewer`, `contractsApi`). Màn 3 không chặn chuyển tiền: nhà đầu tư ký sau khi người nuôi ký (trang tự hỏi lại 5 giây/lần).
- TH-09: tab **Hợp đồng** trong cổng nhà đầu tư (`/nha-dau-tu/hop-dong`, `investor/contracts/InvestorContracts.tsx`: danh sách + xem + ký tiếp); admin xem / tải / tải bản ký tay ở tab **Hợp đồng** của AdminFinance (`admin/AdminBatchContracts.tsx`, chọn mã lô).

## Tài liệu
TL-19 Hiệu lực hợp đồng · TL-16 Đơn vị góp vốn và cách ghi quyền lợi · TL-18 Sở hữu đàn cua và uỷ quyền nuôi giữ.
