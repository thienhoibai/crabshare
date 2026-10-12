# Mẫu hợp đồng hợp tác kinh doanh — phiên bản CT-2026-01

> Bản khung cho demo, CHƯA qua rà soát pháp lý. Nội dung chỉ ghi các điều khoản bắt buộc (TL-19) và chỗ điền dữ liệu.
> Hệ thống sinh PDF từ mẫu này, điền dữ liệu của lô và khoản góp, rồi đưa đi ký số: người nuôi ký trước, nhà đầu tư ký sau.

## Bên ký
- Bên A (người nuôi): {{operator.legal_name}}, MST {{operator.tax_code}}, địa chỉ {{operator.farm_address}}
- Bên B (nhà đầu tư): {{investor.full_name}}, {{investor.id_or_tax_code}}

## Điều 1. Đối tượng hợp tác
Lô {{batch.batch_code}} — {{batch.title}}; số con giống khoá {{batch.seed_quantity}}; chu kỳ {{batch.cycle_days}} ngày.

## Điều 2. Vốn góp
Bên B góp {{contribution.amount}} đồng vào tài khoản chuyên dùng của lô do tổ chức trung gian thanh toán giữ.
Tỷ lệ hưởng = số vốn của Bên B / tổng vốn xác nhận khi đóng vốn (TL-16); không ghi phần trăm cố định.

## Điều 3. Chi phí chuẩn (Standard Cost)
Bảng chi phí phiên bản {{standard_cost.version_no}} (mã băm {{standard_cost.hash}}) được khoá khi mở gọi vốn và không sửa được.
Chi vượt do Bên A chịu; dự phòng hao hụt chưa dùng trả về Revenue Pool.

## Điều 4. Giải ngân theo mốc
Theo lịch đợt giải ngân của lô; đợt 2 trở đi cần bằng chứng nuôi (TL-03).

## Điều 5. Quyết toán
Revenue Pool = Doanh thu thực từ đơn hàng đã hoàn tất − Standard Cost đã khoá.
Thù lao Bên A {{batch.operator_share_pct}}% trên Revenue Pool dương. Pool âm: chia lỗ theo tỷ lệ, tối đa bằng vốn đã góp.
Bảng quyết toán đề xuất có 7 ngày phản hồi trước khi chốt (TL-14).

## Điều 6. Hàng tồn và trần thời gian bán
Hết {{batch.frozen_stock_cap_months}} tháng mà chưa bán hết thì phần còn lại giao bằng hiện vật theo tỷ lệ vốn (TL-23).

## Điều 7. Bao tiêu (nếu có)
Khối lượng {{offtake.volume_kg}} kg, giá chốt {{offtake.price}}; cọc {{batch.offtake_deposit_pct}}%; ưu tiên nhận hàng 48 giờ (TL-30).

## Điều 8. Thuế
Bên A khai thay, nộp thay thuế thu nhập cá nhân cho Bên B nếu phát sinh; bảng quyết toán ghi số trước thuế, khấu trừ, sau thuế (TL-07).

## Điều 9. Bằng chứng và dữ liệu
Bên A ghi nhật ký, chụp bằng chứng trong ứng dụng; dữ liệu được lưu chỉ-ghi-thêm kèm mã băm (TL-04, TL-08).

## Điều 10. Tranh chấp
Giải quyết giữa hai bên hoặc tại cơ quan có thẩm quyền; CrabShare cung cấp gói bằng chứng, không phán xử (TL-01).

## Ký điện tử
Văn bản được ký số; bản đủ hai chữ ký được lưu nguyên vẹn kèm mã băm SHA-256 và thời điểm nhận.
