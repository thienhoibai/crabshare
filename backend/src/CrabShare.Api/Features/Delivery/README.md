# Delivery — phân bổ, giao hàng theo đợt, nghiệm thu, khiếu nại, bán có hoá đơn (BR v1.5, G6)

## Phân bổ (BR-160, BR-234)
Cua vừa duyệt hạng được phân cho đợt giao đến hạn sớm nhất có dòng đơn đúng quy cách, ưu tiên đơn cọc trước; mỗi con tối đa một phân bổ còn hiệu lực.
Khi lập chuyến giao, dòng còn thiếu được bù từ tồn: đúng quy cách trước, rồi cua cùng size hạng cao hơn với giá của dòng đơn. Cua chết, bị loại hay đổi hạng
thì nhả phân bổ và bù con khác. `GET /api/batches/{code}/allocations`, `GET /api/batches/{code}/delivery-tranches`.

## Giao hàng (BR-162 – BR-168)
| Bước | API | Ai |
|---|---|---|
| Lập chuyến cho đợt, phát QR đơn | `POST /api/delivery-tranches/{id}/shipments` `{scheduledAt, transportCondition, allowSubstitution}` | người nuôi |
| Thiếu cua cả đợt: huỷ đợt | `POST /api/delivery-tranches/{id}/cancel` `{reason}` | người nuôi |
| Xuất, cân lần một | `POST /api/shipments/{no}/dispatch` `{lines:[{lineId, dispatchedCrabs, dispatchedKg}]}` | người nuôi |
| Nhận, cân lần hai, biên bản | `POST /api/shipments/{no}/receipt` `{lines:[{lineId, receivedCrabs, receivedKg, acceptedCrabs, acceptedKg}], rejectedCrabCodes, discrepancyReason}` | người nuôi |
| Xác nhận nghiệm thu | `POST /api/shipments/{no}/acceptance/confirm` → tiền hàng, trừ cọc, phần còn lại qua VietQR, hoá đơn đợt | khách |
| Từ chối nhận (mất cọc) | `POST /api/shipments/{no}/acceptance/refuse` `{reason}` | khách |

Tiền hàng = Σ kg nghiệm thu × giá mỗi kg; cọc tính trên cả đơn và trừ dần; đợt cuối xong mà cọc còn dư thì tự hoàn (BR-167). Quá hạn trả phần còn lại thì
mất cọc, cua quay về tồn để bán lại (BR-168, BR-169). Hết hạn đổi trả không có khiếu nại mở thì đơn hoàn tất và ghi dòng doanh thu (BR-175).
`GET /api/preorders/{orderNo}/deliveries` cho khách, người nuôi, Admin.

## Khiếu nại và đánh giá (BR-172 – BR-176)
`POST /api/preorders/{orderNo}/claims` (multipart: ShipmentNo, SpecCode, ClaimType Return|Complaint, IssueType, AffectedCrabs|AffectedKg, Description, Photo),
`POST /api/claims/{no}/respond` (người nuôi, trong 48 giờ), `POST /api/claims/{no}/customer-reply`, `POST /api/admin/claims/{no}/decide`,
`POST /api/preorders/{orderNo}/rating`. Hoàn tiền = kg bị ảnh hưởng × giá mỗi kg.

## Đơn có hoá đơn, đơn hàng cuối (BR-177 – BR-182)
`POST /api/batches/{code}/invoiced-sales` `{saleReason: LowGrade|ForfeitResale|Surplus, buyerName, crabCodes, kg, pricePerKg, sourceOrderNo}`,
`POST /api/batches/{code}/final-order` `{kg, pricePerKg}` (hết số ngày bán, không dưới giá sàn), `POST /api/direct-sales/{orderNo}/cancel`,
`GET /api/batches/{code}/sellable-crabs`, `/direct-sales`. Bán phần dư của lô P cần biểu quyết thông qua (Features/Settlement).

## QR đơn (BR-162, BR-163)
`GET /api/trace/orders/{traceCode}` công khai: Lô, trại, vùng xuất xứ và ngày thu của lô nguồn, quy cách đã duyệt; không có thông tin cá nhân, không có mã từng con.

## Việc định kỳ
`Delivery:Jobs:Enabled`: mất cọc khi quá hạn phần còn lại, chuyển khiếu nại quá hạn cho Admin, hoàn tất đơn hết hạn đổi trả.
