# Mermaid – System Overview (v3.2 · 05/11/2026 · Register v1.4)

Hai sơ đồ `flowchart` rút gọn từ `../../CrabShare_Architecture.drawio`, đúng code nhánh develop @ 420a379.
Sinh tự động bằng bộ sinh `generator/gen-architecture.js` (hằng `MERMAID_COMPONENT`, `MERMAID_DEPLOYMENT`): sửa trong file đó rồi sinh lại, không sửa tay.

| File | Hình | Nội dung |
|---|---|---|
| `Component.mmd` | Figure 4.1 (1/2) và (2/2) gộp một sơ đồ | Web, mobile, API (51 lớp controller trong 49 tệp, module, 8 job nền, Common, SettlementEngine, adapter), dữ liệu, hệ thống ngoài; giao thức ghi trên mũi tên |
| `Deployment.mmd` | Figure 4.4 | Local, Preview/staging (develop), Production; GitHub Actions (`ci.yml`, `deploy-backend.yml`, `deploy-web.yml` bằng Vercel CLI, `release-mobile.yml`, `acceptance-tools.yml`) |

Quy ước:
- Khối viền đứt và nét đứt xám, nhãn có chữ «planned» = có trong Phiếu v1.4, code chưa có: Device & Camera Simulator, Ingestion API, Price Module, bản đồ trại, mô hình nhận diện cua.
- Phần code còn mà v1.4 bỏ (Catalog, Offtake, tem cua, job PreorderBalance) không vẽ, chỉ ghi ở dòng comment `%%` đầu `Component.mmd`.
- Thanh toán VietQR, ký số Viettel, eKYC hiện là adapter giả lập (Fake) chạy trong tiến trình API; lời gọi tới sandbox của nhà cung cấp là «planned» (nét đứt), giống Figure 4.1 (2/2), Figure 4.4 và Table 4.4.
- Kho dữ liệu mang mã [S1] SQL Server, [S2] File storage.

Bản draw.io tách Figure 4.1 thành hai phần (phía client/API và phía dữ liệu/dịch vụ ngoài) để chữ đọc được khi in A4 ngang; bảng giải thích từng khối và node nằm ở trang Table 4.1 (1/2), (2/2) và Table 4.4.
Đã kiểm cú pháp bằng Mermaid 11.4.1 (`mermaid.parse` + `render`).
