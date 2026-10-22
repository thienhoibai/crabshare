# CS-83 — Kế hoạch và ca kiểm thử hệ thống

Dùng cho Report 5. Ca chạy ngày 01–02/11 (D20–D21). Mỗi người chạy đúng cột của mình trên bản đã gộp `develop` và đã triển khai (CS-80). Ghi Đạt / Không đạt / Chặn vào báo cáo CS-91. Không điền kết quả trước khi chạy.

Môi trường: server demo sau CS-80, web và APK cùng revision. Tài khoản seed theo `docs/demo-app.md`. Một lô nuôi đi hết vòng đời; các ca lỗi dùng lô hoặc đơn riêng để không phá lô chính.

## Luồng chính

| Mã | Bước | Việc cần thấy | Người chạy |
|---|---|---|---|
| TC-01 | Đăng ký nhà đầu tư và khách | Có vai trò, đăng nhập được | Khôi |
| TC-02 | eKYC và tài khoản nhận tiền | Trạng thái xác minh và số tài khoản khớp tên | Khôi |
| TC-03 | Đăng ký hộ nuôi và được duyệt | Hộ ở trạng thái đã duyệt | Viên |
| TC-04 | Khai báo hộp nuôi | Danh sách hộp đúng sức chứa đã duyệt | Viên |
| TC-05 | Tạo lô nháp, chi phí chuẩn, gửi duyệt | Admin thấy lô chờ duyệt | Viên |
| TC-06 | Duyệt lô, mở gọi vốn | Lô `Funding`, có tài khoản chuyên dùng | Thiện |
| TC-07 | Xác nhận rủi ro rồi góp vốn | Giữ chỗ, QR, tiền về thì khoản `Confirmed` | Thiện |
| TC-08 | Cam kết bao tiêu trong lúc gọi vốn | Cọc `OfftakeDeposit`, hộ nuôi tự bao tiêu lô mình thì 422 `offtake.related_party` | Nhân |
| TC-09 | Ký hợp đồng | Người nuôi ký trước, nhà đầu tư ký sau | Thiện |
| TC-10 | Chốt vốn khi đủ tối thiểu | `capital_share` khớp tổng đã xác nhận | Thiện |
| TC-11 | Nhật ký nuôi và sự kiện hộp | Đúng một dòng mỗi ngày mỗi nguồn | Viên |
| TC-12 | Bằng chứng và cảnh báo | Ảnh lên hàng đợi; cảnh báo tới người nuôi | Khôi |
| TC-13 | Thu hoạch, cân, tem | Lô `Harvesting`, tem tra được nguồn | Viên |
| TC-14 | Niêm yết và đặt hàng lẻ | Giữ chỗ, không bán vượt tồn | Nhân |
| TC-15 | Cửa sổ bao tiêu 48 giờ | Trong cửa sổ: đơn `Offtake` đúng giá chốt, tiền phải trả = giá trị − cọc. Ngoài cửa sổ: 422. Hết hạn không nhận: cọc mất, kg về gian hàng. Lô huỷ hoặc không đủ hàng: hoàn 100% cọc | Nhân |
| TC-16 | Đóng gói, giao, hết hạn đổi trả | Đơn tới `Completed` | Nhân |
| TC-17 | Tính quyết toán | Tổng dòng khớp pool tới 1 đồng; lô 100 nhà đầu tư tính xong | Thiện |
| TC-18 | Duyệt, chi trả, đóng lô | Nhà đầu tư thấy sao kê đúng số đã duyệt | Thiện |
| TC-19 | Danh mục và thông báo | Nhà đầu tư thấy vốn và thông báo của chính mình | Khôi |
| TC-20 | Dashboard và sổ kiểm toán | Số liệu khớp, chuỗi kiểm toán không đứt | Khôi |

## Nhánh lỗi

| Mã | Tình huống | Kết quả đúng | Người chạy |
|---|---|---|---|
| TE-01 | Góp vốn quá hạn giữ chỗ | Khoản hết hạn, không thành `Confirmed` | Thiện |
| TE-02 | Webhook góp vốn gửi lại cùng mã | Không ghi hai lần | Thiện |
| TE-03 | Lô hết hạn gọi vốn dưới mức tối thiểu | Lô huỷ, hoàn 100% vốn đã xác nhận | Thiện |
| TE-04 | Bao tiêu vượt trần kg của lô | 422, không tạo cam kết | Nhân |
| TE-05 | 50 checkout cùng lúc trên một niêm yết | Số bán vượt = 0 | Nhân |
| TE-06 | Hết hạn thanh toán đơn lẻ | Trả tồn, đơn huỷ | Nhân |
| TE-07 | Khiếu nại sau khi đã hết hạn đổi trả | Không mở được khiếu nại hoàn tiền | Nhân |
| TE-08 | Tính lại quyết toán sau khi đã duyệt | 409, số đã duyệt không đổi | Thiện |
| TE-09 | Nhà đầu tư gọi API của hộ nuôi | 403 | Khôi |
| TE-10 | Sửa một dòng kiểm toán đã ghi | Chuỗi băm báo đứt, dòng cũ không đổi | Khôi |

## Phân công 01–02/11

| Người | Ca |
|---|---|
| Thiện | TC-06, TC-07, TC-09, TC-10, TC-17, TC-18, TE-01, TE-02, TE-03, TE-08 |
| Viên | TC-03, TC-04, TC-05, TC-11, TC-13 |
| Nhân | TC-08, TC-14, TC-15, TC-16, TE-04, TE-05, TE-06, TE-07. Thêm rà cửa hàng / đơn hàng trên web và màn đóng gói trên mobile |
| Khôi | TC-01, TC-02, TC-12, TC-19, TC-20, TE-09, TE-10 |

Ca của người khác bị chặn vì chức năng chưa lên server thì ghi **Chặn** và mã task, không ghi Không đạt.
