# Trạng thái kết nối trạm GradeAI

Web hiển thị chờ kết nối, tự kiểm tra mỗi 1,5 giây, hướng dẫn khi chờ trên 30 giây,
và LAN/Wi-Fi, tên Wi-Fi, interface, IP Pi do thiết bị báo về. Dữ liệu cũ được ghi là lần gần nhất.
SSH là công cụ quản trị, không phải đường truyền riêng của dữ liệu cân.

`network_status.py` đọc route đến API CrabShare rồi xác định interface Wi-Fi/Ethernet
từ sysfs. Trên Wi-Fi, dùng `iw` để đọc SSID đang kết nối. Cache 10 giây.
Khi Pi chưa gửi SSID, web hiển thị nhãn Wi-Fi.

## Cập nhật Pi đang chạy GradeAI App 1.2

Chỉ cập nhật khi trạm rảnh. Sao lưu `app.py`, `station.py`, `physical_flow.py` và
`network_status.py` (nếu có) trước khi thay đổi.
Chép `network_status.py` cạnh `app.py` trong thư mục ứng dụng Pi.
Nếu Pi chưa gửi trạng thái LAN/Wi-Fi, áp dụng `connection-status.patch` tại thư mục ứng dụng.
Nếu cần cân lại cùng mã cua, áp dụng thêm `remeasure-session.patch` một lần:

```sh
git apply --check /path/to/connection-status.patch
git apply /path/to/connection-status.patch
git apply --check /path/to/remeasure-session.patch
git apply /path/to/remeasure-session.patch
python3 -m py_compile app.py network_status.py physical_flow.py station.py
sudo systemctl restart gradeai-demo
```

Nếu một patch không khớp phiên bản, kiểm tra trước xem Pi đã có thay đổi đó chưa.
Giữ nguyên file cấu hình URL API, mã/khóa thiết bị, hiệu chuẩn và dữ liệu lượt cân.
Backend đọc `networkSsid` cùng thông tin kết nối trong heartbeat và mở lượt cân lại
qua API `POST /api/measurement-sessions/{sessionNo}/remeasure`. Các thay đổi này
dùng dữ liệu phiên đo và trạng thái thiết bị hiện có.

## Kiểm tra

```sh
# tại deploy/gradeai
python3 -m unittest discover -s tests -p test_network_status.py

# tại web
npm run build
npm run test:kyc -- tests/gradeai-connection.spec.ts tests/gradeai-batch-navigation.spec.ts
```

Đã xác nhận trên Pi thật: Wi-Fi qua `wlan0`; web nhận trạng thái online và IP Pi.
Kiểm thử LAN dùng route giả lập, không yêu cầu đổi dây/mạng của trạm đang chạy.
Nhánh này chỉ chuẩn bị mã để xem xét; chưa triển khai production.
