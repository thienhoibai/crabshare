# CS-87 — Cách chạy kiểm thử tải

Công cụ `backend/tools/CrabShare.Load` bắn HTTP thật, không giả lập số. Ca quyết toán gọi `POST /api/admin/batches/{code}/settlements` (TH-12 đã có trên `develop`). Bảng số liệu chính thức chạy trên server sau CS-80.

```powershell
dotnet run --project backend/tools/CrabShare.Load -- --base-url http://localhost:5233 --users 100 --checkouts 50 --listing 1 --quantity 0.1 --address 1 --batch MA_LO --output docs/validation/CS-87-load-results.md
```

Token không ghi vào lệnh. Đặt `CRABSHARE_BUYER_TOKEN` (khách có địa chỉ `--address`) và `CRABSHARE_ADMIN_TOKEN` trong môi trường của phiên chạy. Ca nào thiếu dữ liệu thì dòng đó ghi Bỏ qua, không tính là Đạt.

Ca checkout: 50 request cùng lúc, mỗi request một số kg. Bán vượt = kg đặt thành công − tồn lúc bắt đầu, và phải bằng 0. Từ chối 409/422 vì hết hàng không tính là lỗi.

Ca quyết toán: một lần tính. Đạt khi lệch đối soát bằng 0. Dòng ghi chú nêu số nhà đầu tư; mốc 100 nhà đầu tư cần một lô đã chốt đủ 100 `capital_share`.
