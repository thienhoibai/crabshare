# Mẫu hợp đồng hợp tác kinh doanh lô P — phiên bản CT-2026-02 (Business Rule v1.5)

> Bản khung cho demo, CHƯA qua rà soát pháp lý. Nội dung chỉ ghi các điều khoản bắt buộc và chỗ điền dữ liệu.
> Hệ thống sinh PDF từ mẫu này, điền dữ liệu của Lô và khoản góp, rồi đưa đi ký số: người nuôi ký trước, nhà đầu tư ký sau.
> Không có lợi nhuận, lợi suất hay ROI kỳ vọng trong hợp đồng (BR-219).

## Bên ký
- Bên A (người nuôi, đơn vị thực hiện): {{operator.legal_name}}, MST {{operator.tax_code}}, địa chỉ {{operator.farm_address}}
- Bên B (nhà đầu tư): {{investor.full_name}}, {{investor.id_or_tax_code}}

## Điều 1. Đối tượng hợp tác
Lô {{batch.batch_code}} — {{batch.title}}; loại cua {{batch.crab_type}}; sản lượng kế hoạch {{batch.planned_quantity}} con; có lưu nuôi: {{batch.has_holding}}.

## Điều 2. Vốn góp
Bên B góp {{contribution.amount}} đồng vào tài khoản riêng của Lô tại tổ chức trung gian thanh toán; nền tảng không giữ tiền (BR-213).
Số con được cấp vốn = phần nguyên của vốn đã xác nhận ÷ Chi phí chuẩn mỗi con khi đóng gọi vốn; phần vốn lẻ được hoàn (BR-080).
Tỷ lệ vốn của Bên B = vốn đã chốt của Bên B ÷ tổng vốn đã chốt; không ghi phần trăm cố định.

## Điều 3. Chi phí chuẩn
Kế hoạch chi phí phiên bản {{standard_cost.version_no}} (mã băm {{standard_cost.hash}}) khoá khi Lô được duyệt; Chi phí chuẩn mỗi con {{batch.standard_cost_per_crab}} đồng.
Cơ sở quyết toán: {{batch.settlement_basis}} (BR-037). Với cơ sở Chi phí chuẩn, phần tiết kiệm thuộc Bên A, chi vượt do Bên A tự trả (BR-190).

## Điều 4. Giải ngân theo mốc
Chi phí chuẩn được giải ngân cho Bên A theo các mốc: {{batch.milestones}}.
Mỗi mốc chỉ giải ngân khi đủ bằng chứng của mốc; mốc giữa vụ cần biên bản thăm trại của Nhân viên kiểm phẩm được phân ngẫu nhiên (BR-144, BR-145, BR-233).

## Điều 5. Phí nền tảng và quyết toán
Phí nền tảng = {{batch.platform_fee_rate_pct}}% × doanh thu thực thu của Lô, tính một lần khi quyết toán, không trừ vào vốn của Bên B (BR-188).
Revenue Pool = doanh thu thực thu − phí nền tảng − chi phí trừ theo cơ sở quyết toán (BR-189).
Thù lao Bên A theo bậc tỷ lệ sống: {{batch.remuneration_tiers}}; chỉ khi Pool dương, làm tròn xuống tới đồng (BR-192).
Pool không âm: Bên B nhận vốn góp + tỷ lệ vốn × (Pool − thù lao). Pool âm: phần lỗ của Bên B = tỷ lệ vốn × |Pool|, tối đa bằng vốn góp (BR-194, BR-196).
Bảng quyết toán đề xuất có {{settlement.feedback_days}} ngày để nhà đầu tư phản hồi trước khi Admin duyệt (BR-202).

## Điều 6. Bán hàng
Cua được phân hạng theo chuẩn nội bộ tham chiếu T/SCFA 0014-2024, không phải chứng nhận (BR-038); bán theo đơn đặt trước, đơn có hoá đơn và đơn hàng cuối.
Hết {{batch.sale_days}} ngày bán, cua còn lại bán cho bên cam kết thu mua {{batch.committed_buyer}} với đơn giá không dưới giá sàn {{batch.floor_price_per_kg}} đồng/kg; nền tảng không bù chênh lệch (BR-181).

## Điều 7. Quyết định tập thể và thanh lý sớm
Thanh lý sớm và bán phần dư khi bên cam kết không mua do nhà đầu tư biểu quyết theo vốn; vốn của Bên A và bên liên quan không biểu quyết (BR-211).
Thanh lý sớm: các mốc chưa giải ngân dừng lại, phần vốn chưa giải ngân trở về nhà đầu tư trước khi tính Pool (BR-210).

## Điều 8. Thuế
Bảng quyết toán không khấu trừ thuế; mỗi bên tự kê khai và nộp thuế theo quy định.

## Điều 9. Bằng chứng và dữ liệu
Bên A ghi nhật ký chăm sóc, chụp ảnh trong ứng dụng; thiết bị IoT gửi ảnh và số đo qua API; dữ liệu lưu chỉ ghi thêm kèm mã băm (BR-214).

## Điều 10. Tranh chấp
Giải quyết giữa các bên hoặc tại cơ quan có thẩm quyền; CrabShare cung cấp gói bằng chứng, không phán xử.

## Ký điện tử
Văn bản được ký số; bản đủ chữ ký được lưu nguyên vẹn kèm mã băm SHA-256 và thời điểm nhận.
