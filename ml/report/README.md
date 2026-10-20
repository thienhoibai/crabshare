# Báo cáo đánh giá mô hình (CS-49)

Sau khi chạy `ml/evaluate.ipynb`, ghi kết quả vào đây:

| File | Nội dung |
|---|---|
| `metrics.json` | precision, recall, mAP50, số ảnh test, model_version, ngày |
| `misdetections.md` | vài ảnh false positive / false negative điển hình + nhận xét |
| `training_notes.md` | epoch, model base, augmentation, ảnh còn thiếu |

Mục tiêu lần 1: **precision ≥ 0,85**, **recall ≥ 0,80** trên test giữ riêng.
Chưa đạt → vẫn xuất ONNX nhưng giữ trọng số yếu trong `risk_score` của Evidence.
