# Mermaid – Logical ERD (v3.2 · 05/11/2026 · Register v1.4)

`Logical_ERD.mmd` là `erDiagram` cùng nội dung với `../../CrabShare_Logical_ERD.drawio` (Figure 4.2): 61 thực thể = 50 bảng còn giữ của V001–V017 + 11 thực thể «planned», 120 quan hệ.
Sinh tự động bằng bộ sinh `generator/gen-erd.js` (hàm `mermaidLogical`, cùng dữ liệu `V14`, `NEW`, `BK` với bản draw.io): sửa trong file đó rồi sinh lại, không sửa tay.

Quy ước:
- Kiểu dữ liệu chung, không gắn DBMS: Integer, Money (số nguyên VND), Decimal, Text, Date, DateTime, Boolean, UUID.
- Ghi chú sau thuộc tính: `planned` = có trong Phiếu v1.4, code chưa có; `changed` = đổi nghĩa hoặc miền giá trị ở v1.4; `derived` = giá trị dẫn xuất lưu làm bản chụp; `composite FK` = BatchId còn nằm trong một khoá ngoại ghép giữ hai dòng cùng một Lô; `optional` = cho phép trống.
- Thực thể «planned» (BoxRow, RowAllocation, RemunerationTier, IngestionMessage, PriceObservation, PriceSuggestion, PreOrderQuota, PreOrderHold, Invoice, OrderQrCode, RevenueLine) có dòng comment `%% «planned» entity …` ngay trước khối. Tên thuộc tính dùng chung với Class Diagram và Sequence Diagram.
- Khoá nghiệp vụ ghép ghi bằng comment `%% BK …`, ràng buộc nghiệp vụ bằng `%% rule …`; quan hệ «planned» có comment `%% planned` và nhãn `(planned)`.
- Theo các quyết định thiết kế ngày 05/11/2026 (đã được trưởng nhóm xác nhận; các rule liên quan kết thúc bằng "(confirmed by the lead)"): Lô mở khi đạt vốn tối thiểu khả thi và tỷ lệ đặt trước; BoxRow thuộc Batch, RowAllocation.Status ∈ {Held, Allocated, Released}, mức góp tối thiểu = vốn một hàng; OrderType ∈ {BulkPreOrder, InvoicedSale, FinalOrder} kèm SaleReason, mỗi đơn đã giao có một Invoice; PreOrderQuota, PreOrderHold, Batch.SalesWindowDays.
- Listing, Cart, Offtake, CrabTag và ngưỡng chất lượng nước (ProductionThreshold: nhiệt độ, độ mặn, pH) đã bỏ khỏi mô hình nghiệp vụ v1.4 nên không có ở đây; bảng của chúng vẫn ở Physical ERD vì code còn dùng.

Đã kiểm cú pháp bằng Mermaid 11.4.1 (`mermaid.parse` + `render`).
