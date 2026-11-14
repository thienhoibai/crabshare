# Grading — lượt đo và phân hạng từng con (BR v1.5, G4–G5)

Chuẩn T/SCFA 0014-2024 là chuẩn nội bộ tham chiếu, không phải chứng nhận (BR-038). Size theo khối lượng cân (bảng 3.2), mức C = khối lượng (g) ÷
chiều dài mai CL (cm)³ (bảng 3.3), dải xuyên sáng viền mai cho cua gạch (BR-227). AI chỉ đề xuất số đo; Nhân viên kiểm phẩm duyệt hạng (BR-155).

## Luồng
1. Người nuôi bắt đầu thu hoạch (`POST /api/batches/{code}/start-harvest`, lô có lưu nuôi) và mở lượt đo bằng mã cua
   (`POST /api/measurement-sessions` `{crabCode, stationCode}` hoặc `{crabCode, procedure:"Manual"}`).
2. Trạm gửi bản tin (xem `Features/Devices`) → ghi khối lượng, chạy AI trên ảnh đèn trắng và soi đỏ → đề xuất. Lượt đo tay: `POST /api/measurement-sessions/{no}/values`
   `{weightG, carapaceLengthCm, carapaceWidthCm, edgeBandMm}`; với lượt đo bằng trạm chỉ bổ sung thước kẹp khi ảnh lỗi hay AI không chắc.
3. Đề xuất Draft khi không có lý do giữ; Hold khi cận ngưỡng (dải % của bộ quy tắc), ảnh kém, AI dưới ngưỡng tin cậy, thiếu thước kẹp, chờ cảm quan.
4. Nhân viên kiểm phẩm được phân ngẫu nhiên cho buổi đo của Lô (không có quan hệ với Lô, BR-017):
   - `POST /api/grade-decisions/{no}/approve` `{finalGrade?, sensoryNote, reason}`: hạng cuối chỉ bằng hoặc thấp hơn đề xuất; hạ hạng phải ghi lý do.
   - `POST /hold` `{reason}`: cần Nhân viên kiểm phẩm thứ hai (phân ngẫu nhiên) `POST /confirm-hold`, rồi người thứ hai duyệt hoặc loại.
   - `POST /reject` (multipart: LiveStatus, FoodSafety, Reason, Photo): cua chết, yếu nặng, không an toàn → tiêu huỷ (BR-156).
   - `POST /revise` (multipart: FinalSize, FinalGrade, Reason, Photo): đổi hạng tạo phiên bản quyết định mới, giữ quyết định cũ (BR-157).
5. Duyệt xong: cua Graded, rời hộp, được phân bổ ngay cho đợt giao sớm nhất cùng quy cách (Features/Delivery). Mọi con đã nhận có quyết định chốt thì Lô Selling (BR-152).

## Đọc
`GET /api/measurement-sessions/{no}/measurements`, `/images/white|red`, `GET /api/batches/{code}/grading`, `/grade-decisions?status=`,
`GET /api/crab-units/{code}/grade-decisions`, `GET /api/grade-decisions/{no}` và `/photo`.

## Admin
`GET /api/grading/standards` (công khai), `GET|POST /api/admin/grade-rule-sets`, `PUT /{id}/rules`, `POST /{id}/activate` (bộ đang dùng không sửa được),
`POST /api/admin/batches/{code}/grading-qc` (phân công lại khi lúc đo pool trống).

## AI đo mai (`Grading:Ai`)
`Mode = None` (mặc định: không có mô hình → yêu cầu thước kẹp), `Http` (`Endpoint` của dịch vụ mô hình, nhận multipart meta/white/red, trả
`{modelName, modelVersion, white:{status,imageQuality,landmarks,carapaceLengthCm,carapaceWidthCm,carapaceAreaCm2,confidence,error}, red:{status,edgeBandMm,confidence,error}}`),
`Simulated` (Development: số giả lập, mọi kết quả ghi `is_simulated = 1`).
