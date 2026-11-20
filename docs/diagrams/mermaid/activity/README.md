# Activity Diagram (Mermaid) — WF-01 … WF-05

Bản Mermaid `flowchart` của 5 main workflow, cùng nút và luồng với `../../CrabShare_Activity_Diagrams.drawio` (Figure 4.31–4.35, v3.2 · 05/11/2026 · Register v1.4). Các quyết định thiết kế ngày 05/11/2026 (điều kiện mở Lô, hàng hộp, mất cọc, tỷ lệ sống, tiền theo kg cân, Standard Cost dùng không hết, InvoicedSale) đã áp dụng và đã được trưởng nhóm xác nhận; trang nào dùng chúng thì Notes có dòng "were confirmed by the lead".

| File | Workflow | Trang draw.io | Người phụ trách |
|---|---|---|---|
| `WF-01.mmd` | Operator đăng ký hộp theo mã dãy, tạo Lô trên các hàng hộp (hàng hộp thuộc Lô), soạn Standard Cost, đặt giá (gợi ý của module giá), giá sàn, ngưỡng tỷ lệ sống, bán kính giao; Admin duyệt, yêu cầu sửa hoặc từ chối; Lô mở gọi vốn | 2 | Viên |
| `WF-02.mmd` | Investor eKYC, chọn hàng hộp (mỗi hàng một nhà đầu tư, tiền góp = tổng vốn các hàng), giữ chỗ 30 phút; trả VietQR song song với lập và ký hợp đồng (fork ở phần 2, join ở phần 3); Lô mở khi đạt vốn tối thiểu khả thi và đủ tỷ lệ đặt trước, nếu không thì huỷ Lô và Admin gửi lệnh hoàn tiền | 3 | Thiện |
| `WF-03.mmd` | Thả giống ở các hộp được cấp vốn, dữ liệu từ app hoặc thiết bị giả lập qua một kênh dữ liệu chung, cảnh báo, chụp ngẫu nhiên, điểm rủi ro → Người thẩm định; Investor xem hộp trong hàng của mình (luồng riêng); giải ngân theo mốc | 3 | Khôi |
| `WF-04.mmd` | Luồng từng đơn (phần 1–4): đặt trước có cọc, huỷ đơn (UC55) và kết quả mở Lô (hoàn cọc hoặc mất cọc), giao có cân, tiền còn lại = kg cân × giá − cọc, quét QR, trả hàng, khiếu nại; mỗi đơn kết thúc ở flow final riêng. Luồng của cả Lô (phần 5): thu hoạch theo hộp, hết hạn bán thì bán có hoá đơn (cua kém, cua của đơn mất cọc) và một đơn cuối không dưới giá sàn | 5 | Nhân |
| `WF-05.mmd` | Quyết toán: Admin bấm tính, engine gom các dòng doanh thu (DeliveredOrder, InvoicedSale, ForfeitedDeposit, FinalOrder), Pool trừ Standard Cost của số hộp được cấp vốn, thù lao theo bậc, chia tiền; góp ý; Admin duyệt, gửi lệnh chi; nhánh vụ lỗ | 3 | Thiện |

Quy ước:
- Mỗi actor là một `subgraph` (làn). Bước «planned» (có trong phiếu v1.4, code develop @ 420a379 chưa có) vẽ nét đứt xám; bước có một phần ghi "(… «planned»)".
- Bản draw.io tách mỗi hình thành nhiều trang (part) để in A4 ngang vẫn có chữ ≥ 5 pt, nối bằng connector UML (vòng tròn A, B, C, D; connector B của WF-01 quay lại phần 1). Ở Mermaid, mỗi connector là một nút chung nằm ngoài các làn, nên các phần nối liền thành một luồng.
- Action có nhiều luồng vào luôn có merge đứng trước; join chỉ nhận một luồng từ mỗi nhánh của fork; mỗi fork đều có join. Luồng độc lập (Investor xem hộp, phần bán của cả Lô) bắt đầu bằng nút đầu riêng.
- Nhãn luôn để trong ngoặc kép; ký tự `&` viết là `#amp;`. Thanh fork/join là ô đen nhỏ, sự kiện thời gian có dấu ⌛.
- Đã kiểm tra parse và render bằng Mermaid 10.9.1 và 11.4.1.
- Không sửa tay: sinh lại từ cùng dữ liệu với bản draw.io bằng `node generator/gen-activity.js --mermaid mermaid/activity` (chạy trong `docs/diagrams`). Bộ sinh tự kiểm tra các quy tắc trên trước khi ghi file.
