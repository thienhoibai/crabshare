# Trạng thái kết nối trạm GradeAI

Web hiển thị chờ kết nối, tự kiểm tra mỗi 1,5 giây, hướng dẫn khi chờ trên 30 giây,
và LAN/Wi-Fi, interface, IP Pi do thiết bị báo về. Dữ liệu cũ được ghi là lần gần nhất.
SSH là công cụ quản trị, không phải đường truyền riêng của dữ liệu cân.

`network_status.py` đọc route đến API CrabShare rồi xác định interface Wi-Fi/Ethernet
từ sysfs. Cache 10 giây; lỗi đọc trả `unknown`. Không đổi mạng, không đọc mật khẩu.

## Cập nhật Pi đang chạy GradeAI App 1.2

Chỉ cập nhật khi trạm không chạy lượt đo. Sao lưu `app.py` trước khi thay đổi.
Chép `network_status.py` cạnh `app.py` trong thư mục ứng dụng Pi.
Tại thư mục ứng dụng, kiểm tra patch trước khi áp dụng:

```sh
git apply --check /path/to/connection-status.patch
git apply /path/to/connection-status.patch
python3 -m py_compile app.py network_status.py
sudo systemctl restart gradeai-demo
```

Nếu patch không khớp phiên bản, đối chiếu 3 thay đổi trong patch trước khi cập nhật.
Giữ nguyên file cấu hình URL API, mã/khóa thiết bị, hiệu chuẩn và dữ liệu lượt cân.
Backend phải có các trường `connectionType`, `networkInterface`, `networkIp` trong
`StationRuntimeState`; không cần migration riêng cho 3 trường này.

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
