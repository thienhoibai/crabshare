# Evidence — Bằng chứng nuôi và thẩm định

**Người làm:** Khôi · **Use case:** UC45 Capture Production Evidence · UC47 Review Flagged Evidence · UC48 Submit Evidence Explanation
**Phối hợp:** Nhân (TSK-13 — mô hình nhận diện cua, cắm vào qua `ICrabDetector` / `OnnxCrabDetector`; thiếu file `.onnx` thì `model_version=none`)

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `evidence` | `media_type`: `Photo`, `Video`, `Invoice` · `source`: `FarmApi`, `InAppCapture`, `DocumentUpload` · `sha256`, `perceptual_hash`, `captured_at`, `received_at` (giờ máy chủ), `latitude`, `longitude`, `slot_id` · `risk_score` · `review_status`: `Accepted`, `Watch`, `Flagged`, `Rejected` · `explanation` |
| `capture_request` | yêu cầu chụp ngẫu nhiên một hộp: `Open` → `Fulfilled` / `Expired`, có `due_at` |
| `evidence_detection` | kết quả mô hình: `model_version`, `crab_detected`, `confidence`, `bbox_json` |
| `evidence_review` | phán quyết người thẩm định: `Pass`, `Fail`, `NeedMoreEvidence` |

## Endpoint

CS-44 đã triển khai `POST /api/evidence` và mobile chụp ảnh/GPS qua API.
Chi tiết định dạng, migration V007, chính sách ảnh trùng và kiểm thử:
[CS-44-production-evidence.md](../../../../../docs/validation/CS-44-production-evidence.md).
CS-50 đã triển khai job yêu cầu ngẫu nhiên, API danh sách và mobile Hôm nay:
[CS-50-random-capture-requests.md](../../../../../docs/validation/CS-50-random-capture-requests.md).
CS-54 triển khai hàng đợi, chi tiết,
ảnh riêng tư và phán quyết. CS-57 đã nối giải trình trên backend, web và mobile.
Timeline nhà đầu tư vẫn thuộc task tiếp theo.
Xem [CS-54-evidence-review.md](../../../../../docs/validation/CS-54-evidence-review.md).
Giải trình: [CS-57-evidence-explanation.md](../../../../../docs/validation/CS-57-evidence-explanation.md).

| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/evidence` | OperatorMember | multipart: `batchCode`, `slotCode`, `capturedAt`, `latitude`, `longitude`, `captureRequestId?`, ảnh → `IFileStorage.SaveAsync` (tính SHA-256) → so trùng (SHA-256 + perceptual hash) → `ICrabDetector.DetectAsync` → tính `risk_score` → `review_status` |
| GET | `/api/operators/me/capture-requests?status=Open` | OperatorMember | Yêu cầu chụp đang chờ |
| GET | `/api/operators/me/evidence?status=Flagged` | OperatorMember | Danh sách phân trang, theo hộ nuôi; có giải trình và phản hồi thẩm định gần nhất |
| GET | `/api/operators/me/evidence/{id}` | OperatorMember | Chi tiết để giải trình, kiểm tra quyền hiện tại |
| GET | `/api/operators/me/evidence/{id}/image` | OperatorMember | Ảnh gốc riêng tư qua JWT, `no-store`; cùng quy tắc định dạng/path với CS-54 |
| POST | `/api/evidence/{id}/explanation` | OperatorMember | UC48: giải trình khi bị gắn cờ |
| GET | `/api/review/evidence?status=Flagged` | EvidenceReviewer | Hàng đợi thẩm định |
| GET | `/api/review/evidence/{id}` | EvidenceReviewer | Ảnh + metadata + kết quả mô hình + giải trình |
| GET | `/api/review/evidence/{id}/image` | EvidenceReviewer | Ảnh gốc qua JWT, `no-store`; kiểm tra xung đột trước khi mở file |
| POST | `/api/review/evidence/{id}/verdict` | EvidenceReviewer | UC47: `{ verdict, note }` |
| GET | `/api/batches/{code}/evidence` | Investor của lô | Bằng chứng đã chấp nhận (cho timeline) |

Job nền: sinh yêu cầu chụp **ngẫu nhiên** mỗi ngày cho các lô đang nuôi; quá hạn → `Expired` + cảnh báo `EvidenceFlag`.

## Quy tắc phải giữ
- Ảnh chỉ chụp **trực tiếp** trong app (`InAppCapture` bắt buộc có `captured_at` — CHECK).
- Mỗi ảnh lưu: SHA-256, giờ máy chủ, vị trí, số hộp (NFR Evidence). Mỗi kết quả nhận diện lưu `confidence` + `model_version`.
- Người thẩm định **không** được thẩm định lô mà mình đã góp vốn → 403 `evidence.reviewer_conflict`.
- `Pass → Accepted`, `Fail → Rejected`, `NeedMoreEvidence → Flagged`. Ghi chú bắt buộc, tối đa 500 ký tự.
- Một phán quyết mỗi kiểm định viên/bằng chứng. Sau `NeedMoreEvidence`, cùng người chỉ sửa phán quyết khi có `explained_at` mới; audit giữ quyết định cũ.
- Kiểm tra quyền đang có trong CSDL, không chỉ JWT. Ghi phán quyết, trạng thái và audit trong cùng transaction; hash chữ thường theo `AuditChain`.
- Chủ hộ/nhân viên chỉ giải trình bằng chứng `Flagged` của hộ nuôi mình. Nội dung 1–1000 ký tự, trim; giữ `Flagged` chờ phán quyết. Nội dung không đổi không tạo thêm audit hoặc đổi `explained_at`.
- Mô hình chưa đạt precision ≥ 0,85 và recall ≥ 0,80 thì chỉ dùng như tín hiệu yếu (giảm trọng số trong `risk_score`).

## Màn hình
- Mobile: `operator/evidence/capture_page.dart` (đổi sang API; thêm package `geolocator` để lấy vị trí).
- Web: hàng đợi thẩm định trong `admin/` (trang mới), giải trình trong `operator/`.

## Tài liệu
TL-04 Xác thực bằng chứng nuôi · TL-08 Nhật ký kiểm toán và gói bằng chứng.
