# Tham khảo luồng nộp giấy tờ trực tuyến

## Cổng dịch vụ công tại Việt Nam

- **Cổng Dịch vụ công Quốc gia** hướng dẫn người nộp đính kèm PDF hoặc ảnh chụp, bản scan theo thành phần hồ sơ của từng thủ tục. Sau khi nộp, người dùng có mã hồ sơ để tra cứu tiến độ và có thể nhận yêu cầu bổ sung. [Hướng dẫn của xã Long Hưng, Hưng Yên](https://longhung.hungyen.gov.vn/huong-dan-chi-tiet-cac-buoc-thuc-hien-thu-tuc-hanh-chinh-tren-cong-dich-vu-cong-quoc-gia/).
- **Cổng thông tin quốc gia về đăng ký doanh nghiệp** tiếp nhận văn bản điện tử dạng PDF. Tên tệp tương ứng với loại giấy tờ trong hồ sơ. Người nộp nhận giấy tiếp nhận và hẹn trả kết quả qua mạng. [Văn bản hợp nhất 29/2026/VBHN-NĐ-BTC, Điều 3, 38 và 39](https://congbao.chinhphu.vn/van-ban/van-ban-hop-nhat-so-29-2026-vbhn-nd-btc-470413.htm).

Bộ Công an công bố Cổng Dịch vụ công Quốc gia được vận hành tại Trung tâm Dữ liệu quốc gia. Các nguồn công khai trên chưa xác nhận hai cổng dùng Cloudinary. [Thông tin của Bộ Công an](https://www.mps.gov.vn/bai-viet/trung-tam-du-lieu-quoc-gia-tiep-tuc-phat-huy-lam-chu-cong-nghe-loi-1787046389).

## Áp dụng cho CrabShare

- Chủ hồ sơ hộ kinh doanh, doanh nghiệp hoặc hợp tác xã chọn loại giấy tờ rồi gửi ảnh hoặc PDF. Giới hạn hiện tại của CrabShare là 5 MB mỗi tệp. Admin tải giấy tờ từ hồ sơ để đối chiếu theo BR-009. Cá nhân đi theo luồng eKYC theo BR-010. [Quy tắc nghiệp vụ CrabShare](business-rules-v1.5.md).
- Cloudinary lưu PDF dưới loại tài nguyên `image` với quyền truy cập `authenticated`. API CrabShare kiểm tra quyền trước khi tải bản gốc qua URL ký có thời hạn. [Tùy chọn tải lên](https://cloudinary.com/documentation/upload_parameters) · [Kiểm soát truy cập](https://cloudinary.com/documentation/control_access_to_media).
