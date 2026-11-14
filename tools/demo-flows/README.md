# demo-flows — dữ liệu mẫu ở mọi bước cho người thử

Script Node đăng nhập bằng các tài khoản mẫu và gọi **chỉ API công khai** (không chạm cơ sở dữ liệu) để để lại bản ghi dừng ở nhiều giai đoạn khác nhau. Người thử vào là làm tiếp được ngay, không phải tự đi lại cả đoạn đầu.

## Cách chạy

```bash
node tools/demo-flows/demo-flows.mjs http://localhost:5298          # máy local
node tools/demo-flows/demo-flows.mjs https://<địa-chỉ-API> --yes      # máy chủ khác: bắt buộc thêm --yes
```

- Cần Node 18 trở lên. Mật khẩu mẫu đọc từ `web/src/features/auth/demoAccounts.ts` (không in ra); chạy ngoài repo thì đặt biến `DEMO_PASSWORD`.
- API phải bật công cụ demo (môi trường Development hoặc `Demo:Tools=true`) vì tiền cọc, tiền góp, tiền hàng đi qua `POST /api/dev/payments/simulate`.
- Trạm đo dùng thiết bị mẫu `ST-NC-01`; đổi bằng `STATION_CODE`, `STATION_KEY` nếu máy chủ dùng khoá khác.
- Cuối lần chạy có bảng: giai đoạn, ai làm tiếp, tài khoản, trang web, mã bản ghi; và danh sách giai đoạn không tạo được kèm lý do.

## Tạo những gì

| Lô / chỗ | Giai đoạn để lại |
|---|---|
| `CS-2611-T1` (lô T) | đơn chờ quét QR cọc; đơn đã cọc chờ cua; đợt giao đủ cua chờ lập chuyến; chuyến chờ xuất; chuyến đã xuất chờ cân lần hai; chờ khách nghiệm thu; đã nghiệm thu có hoá đơn; khiếu nại mở kèm ảnh (chờ người nuôi); khiếu nại chuyển Admin; đơn mua nguồn với phiếu nhận; phiếu nhận chờ kiểm đầu vào; 3 quyết định phân hạng đo bằng trạm chờ duyệt lần đầu; 1 quyết định đã giữ lại chờ kiểm phẩm thứ hai |
| `CS-2610-03` (lô P gọi vốn) | hợp đồng chờ người nuôi ký (investor1); chờ nhà đầu tư ký (investor2); đã ký đủ, chờ chuyển tiền (investor3); khoản góp đã xác nhận (investor4) |
| `CS-2610-01` | biểu quyết thanh lý sớm đang mở (nhà đầu tư) |
| `CS-2611-P1` | việc thăm trại giữa vụ của kiểm phẩm |
| Đối tác | tài khoản tổ chức `demo-org-N@crabshare.local` (cùng mật khẩu mẫu) đã gửi giấy tờ, chờ Admin xác minh; nhà cung cấp do người nuôi ghi nhận chờ xác minh |

Đơn của khách giao tới 8 nhà hàng mẫu ở TP.HCM; tên địa điểm có chữ `[demo]`. Ghi chú, mô tả khiếu nại, đơn mua nguồn... cũng có `[demo]` khi có ô ghi chú.

## Chạy lại

- Giai đoạn nào đang có bản ghi đúng chỗ thì bỏ qua. Chạy hai lần liền nhau thì lần sau không tạo gì.
- Giai đoạn đã bị người thử làm tiếp thì lần chạy sau tạo bản mới (đơn mới, cua mới, phiếu nhận mới...).
- Hai giai đoạn có hạn: đơn chờ cọc chỉ giữ **15 phút**, khoản góp chờ chuyển tiền giữ **30 phút**. Hết hạn thì chạy lại.

## Lưu ý

- Nếu trại `TRAI-01` chưa có toạ độ, script khai toạ độ trại Năm Căn (8.7601, 105.0503) bằng tài khoản người nuôi: thiếu toạ độ thì không ai đặt trước được.
- `CS-2611-T1` luôn còn một phiếu nhận chờ kiểm và vài con chưa duyệt nên vẫn ở Sourcing (còn nhận đặt trước). Kiểm xong mọi phiếu và duyệt hết thì Lô chuyển Selling, không nhận đặt trước nữa.
- Biểu quyết ở `CS-2610-01`: hơn nửa vốn bấm "Đồng ý" thì Lô chuyển sang thanh lý ngay.
- Hợp đồng chưa đủ chữ ký ở `CS-2610-03` làm đợt giải ngân 1 của Lô này chưa xin được cho tới khi ký xong.
- Mỗi lần tạo lại chuỗi giao hàng dùng thêm khoảng 20 con L Đặc cấp trong 75 con chào giá của `CS-2611-T1`; chạy lại nhiều lần sẽ hết số lượng chào.
- Hộ nuôi đang bị tạm dừng thì vẫn chạy được, nhưng không tạo hay duyệt Lô mới, không gửi ảnh bằng chứng và nhật ký được. Script không tự mở lại; Admin mở lại ở trang Hộ nuôi (nút "Mở lại", `POST /api/admin/operators/{id}/reinstate`).
- Chưa tạo được: mốc giải ngân chờ Admin duyệt (chưa đợt nào đủ điều kiện) và các bước quyết toán (chưa Lô nào ở giai đoạn quyết toán theo BR v1.5). Script in lý do cụ thể mỗi lần chạy.
