# Evidence — Bằng chứng nuôi và thẩm định

**Người làm:** Khôi · **Use case:** UC45 Capture Production Evidence · UC47 Review Flagged Evidence · UC48 Submit Evidence Explanation
**Phối hợp:** Nhân (TSK-13 — mô hình nhận diện cua, cắm vào qua `ICrabDetector`)

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `evidence` | `media_type`: `Photo`, `Video`, `Invoice` · `source`: `FarmApi`, `InAppCapture`, `DocumentUpload` · `sha256`, `perceptual_hash`, `captured_at`, `received_at` (giờ máy chủ), `latitude`, `longitude`, `slot_id` · `risk_score` · `review_status`: `Accepted`, `Watch`, `Flagged`, `Rejected` · `explanation` |
| `capture_request` | yêu cầu chụp ngẫu nhiên một hộp: `Open` → `Fulfilled` / `Expired`, có `due_at` |
| `evidence_detection` | kết quả mô hình: `model_version`, `crab_detected`, `confidence`, `bbox_json` |
| `evidence_review` | phán quyết người thẩm định: `Pass`, `Fail`, `NeedMoreEvidence` |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/evidence` | OperatorMember | multipart: `batchCode`, `slotCode`, `capturedAt`, `latitude`, `longitude`, `captureRequestId?`, ảnh → `IFileStorage.SaveAsync` (tính SHA-256) → so trùng (SHA-256 + perceptual hash) → `ICrabDetector.DetectAsync` → tính `risk_score` → `review_status` |
| GET | `/api/operators/me/capture-requests?status=Open` | OperatorMember | Yêu cầu chụp đang chờ |
| POST | `/api/evidence/{id}/explanation` | OperatorMember | UC48: giải trình khi bị gắn cờ |
| GET | `/api/review/evidence?status=Flagged` | EvidenceReviewer | Hàng đợi thẩm định |
| GET | `/api/review/evidence/{id}` | EvidenceReviewer | Ảnh + metadata + kết quả mô hình + giải trình |
| POST | `/api/review/evidence/{id}/verdict` | EvidenceReviewer | UC47: `{ verdict, note }` |
| GET | `/api/batches/{code}/evidence` | Investor của lô | Bằng chứng đã chấp nhận (cho timeline) |

Job nền: sinh yêu cầu chụp **ngẫu nhiên** mỗi ngày cho các lô đang nuôi; quá hạn → `Expired` + cảnh báo `EvidenceFlag`.

## Quy tắc phải giữ
- Ảnh chỉ chụp **trực tiếp** trong app (`InAppCapture` bắt buộc có `captured_at` — CHECK).
- Mỗi ảnh lưu: SHA-256, giờ máy chủ, vị trí, số hộp (NFR Evidence). Mỗi kết quả nhận diện lưu `confidence` + `model_version`.
- Người thẩm định **không** được thẩm định lô mà mình đã góp vốn → 403 `evidence.reviewer_conflict`.
- Mô hình chưa đạt precision ≥ 0,85 và recall ≥ 0,80 thì chỉ dùng như tín hiệu yếu (giảm trọng số trong `risk_score`).

## Màn hình
- Mobile: `operator/evidence/capture_page.dart` (đổi sang API; thêm package `geolocator` để lấy vị trí).
- Web: hàng đợi thẩm định trong `admin/` (trang mới), giải trình trong `operator/`.

## Tài liệu
TL-04 Xác thực bằng chứng nuôi · TL-08 Nhật ký kiểm toán và gói bằng chứng.
