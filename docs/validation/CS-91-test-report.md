# CS-91 — Báo cáo kiểm thử

Ca lấy từ kế hoạch CS-83. Chạy trên server sau CS-80, ngày 01–02/11. Người điều phối: Nhân. Mỗi ca ghi một trong ba kết quả: Đạt, Không đạt, Chặn. Chặn chỉ dùng khi chức năng của người khác chưa có trên bản đang chạy, và phải kèm mã task.

Tỉ lệ đạt = số Đạt / (số Đạt + số Không đạt). Ca Chặn không đưa vào mẫu số. Lỗi chặn là lỗi Không đạt làm đứt luồng chính TC-01 → TC-20. Báo cáo chỉ kết luận "hết lỗi chặn" sau khi cột Kết quả được điền từ lần chạy thật.

## Phiếu ca

| Mã | Người chạy | Kết quả | Mã lỗi Jira |
|---|---|---|---|
| TC-01 | Khôi | | |
| TC-02 | Khôi | | |
| TC-03 | Viên | | |
| TC-04 | Viên | | |
| TC-05 | Viên | | |
| TC-06 | Thiện | | |
| TC-07 | Thiện | | |
| TC-08 | Nhân | | |
| TC-09 | Thiện | | |
| TC-10 | Thiện | | |
| TC-11 | Viên | | |
| TC-12 | Khôi | | |
| TC-13 | Viên | | |
| TC-14 | Nhân | | |
| TC-15 | Nhân | | |
| TC-16 | Nhân | | |
| TC-17 | Thiện | | |
| TC-18 | Thiện | | |
| TC-19 | Khôi | | |
| TC-20 | Khôi | | |
| TE-01 | Thiện | | |
| TE-02 | Thiện | | |
| TE-03 | Thiện | | |
| TE-04 | Nhân | | |
| TE-05 | Nhân | | |
| TE-06 | Nhân | | |
| TE-07 | Nhân | | |
| TE-08 | Thiện | | |
| TE-09 | Khôi | | |
| TE-10 | Khôi | | |

Số Đạt: — / Số Không đạt: — / Số Chặn: — / Tỉ lệ đạt: —

## Cách ghi lỗi

Tạo bug trong dự án CS, gắn vào ca (ví dụ TC-14). Tiêu đề nêu màn hình và kết quả sai. Mô tả gồm tài khoản, mã lô hoặc mã đơn, bước bấm, và mã lỗi API nếu có. Người phụ trách phần đó sửa trên nhánh `fix/CS-<số>-...`. Nhân chỉ sửa lỗi của cửa hàng, đơn hàng, bao tiêu và đóng gói.

## Phần Nhân rà trên web và mobile

Làm cùng TC-14, TC-15, TC-16.

| Việc | Đường đi | Cần thấy |
|---|---|---|
| Cửa hàng còn hàng | Web `/cua-hang` | Thẻ hiện kg còn bán. Hàng trong cửa sổ bao tiêu chưa nhận không bị bán lẻ. |
| Hết hàng | Web `/cua-hang` | Không đặt thêm được khi tồn đã giữ hết. |
| Đặt hàng | Web `/san-pham` | Tách đơn theo lô, có QR, hết hạn thì trả tồn. |
| Theo dõi đơn | Web trang đơn của khách | Trạng thái đi từ chờ thanh toán tới hoàn tất. |
| Danh sách đóng gói | Mobile `/o/pack` | Đơn đã thanh toán hiện trong danh sách. |
| Quét tem đóng gói | Mobile `/o/pack/{mã đơn}` | Đúng tem của đơn thì chuyển đã đóng gói. Tem của đơn khác thì từ chối. |

Kết quả phần rà này ghi vào TC-14 và TC-16. Chưa chạy trên bản 01–02/11 thì để trống, không ghi Đạt.
