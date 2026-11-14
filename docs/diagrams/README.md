# Sơ đồ thiết kế CrabShare (draw.io + Mermaid)

**Bản 3.2 · 05/11/2026 · Phiếu đăng ký v1.4.** Toàn bộ sơ đồ được vẽ lại theo Phiếu v1.4 và đối chiếu với code trên `develop` @ 420a379 (migration V001–V017, 60 bảng).

Bộ sơ đồ đã qua hai vòng duyệt độc lập. Mỗi vòng soát theo ba hướng:
- hướng dẫn của thầy;
- phiếu và code;
- tài liệu.

Mọi trang ghi dấu "v3.2 · 05/11/2026 · Register v1.4".

**Định dạng:**
- File draw.io không nén, nhiều trang.
- Ký hiệu UML 2.5. ERD dùng crow's foot ở cả ba mức.
- Chữ trên sơ đồ bằng tiếng Anh, tối thiểu 11 px.

Tài liệu nghiệp vụ (Phiếu, Report, TL, thiết kế CSDL) nằm ngoài repo, trong thư mục `Chuan_hoa/` và Google Drive của nhóm (thư mục Capstone_FALL26).

## Mở trên draw.io web

Repo private, nên lần đầu draw.io hỏi **Authorize GitHub**. Sau đó có thể xem, sửa, và bấm Save để draw.io tự commit vào nhánh. Muốn mở từ nhánh khác thì thay `develop` trong link bằng tên nhánh, viết dấu `/` thành `%2F`.

| File | Trang | Dùng ở | Hình | Mở |
|---|---|---|---|---|
| `CrabShare_Business_Context_DFD.drawio` | 1: DFD mức 0, 43 luồng gom gói | Report 1, SRS 1 | Figure 1.1 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Business_Context_DFD.drawio) |
| `CrabShare_Use_Case_Diagrams.drawio` | 7: LV0, SD1–SD3, SD4a, SD4b, SD5 | SRS 2.2.1 | Figure 2.1–2.6 (2.5a/b) | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Use_Case_Diagrams.drawio) |
| `CrabShare_Screen_Flow.drawio` | 5: Web 1 (2 phần), Web 2 Operator, Web 3 Admin, Mobile | SRS 3.1.1 | Figure 3.1a–c (web), 3.2 (mobile) | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Screen_Flow.drawio) |
| `CrabShare_Conceptual_ERD.drawio` | 7: tổng và 6 vùng | SRS 3.1.5 | Figure 3.3 (3.3.1–3.3.6) | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Conceptual_ERD.drawio) |
| `CrabShare_Architecture.drawio` | 13: Component (2 phần), Deployment, Package ×3, bảng giải thích | SDD 1.1–1.2 | Figure 4.1, 4.4–4.7; Table 4.1, 4.4–4.7 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Architecture.drawio) |
| `CrabShare_Logical_ERD.drawio` | 12: tổng, 8 trang vùng, Table 4.2 (3 phần) | SDD 2 | Figure 4.2, Table 4.2 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Logical_ERD.drawio) |
| `CrabShare_Physical_ERD.drawio` | 11: tổng, 8 trang vùng, Table 4.3 (2 phần); khớp V001–V017 | SDD 2 | Figure 4.3, Table 4.3 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Physical_ERD.drawio) |
| `CrabShare_State_Machines.drawio` | 25: Index (2) và 23 máy trạng thái | SDD | Figure 4.8–4.30 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_State_Machines.drawio) |
| `CrabShare_Activity_Diagrams.drawio` | 16: WF-01 (2 phần), WF-02 (3), WF-03 (3), WF-04 (5), WF-05 (3) | SDD, Demo Workflows | Figure 4.31–4.35 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Activity_Diagrams.drawio) |
| `CrabShare_Sequence_Diagrams.drawio` | 79: Index (2) và 35 luồng, luồng dài tách "(k of N)" | SDD 3 | Figure 4.36–4.70 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Sequence_Diagrams.drawio) |
| `CrabShare_Class_Diagrams.drawio` | 39: Index (2) và 17 nhóm | SDD 3 | Figure 4.71–4.87 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Class_Diagrams.drawio) |
| `overview/CrabShare_Overview_Diagrams.drawio` | 28: bộ khái quát O1–O28, mỗi sơ đồ một trang | slide, giới thiệu | Figure O.1–O.28 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2Foverview%2FCrabShare_Overview_Diagrams.drawio) |

**Cỡ chữ khi in A4 ngang.** Mọi trang của bộ chi tiết đạt từ 5,1 pt trở lên. Có hai ngoại lệ:
- Hai trang tổng của Logical và Physical ERD, chỉ để nhìn tổng thể ("for orientation only").
- Vài trang của bộ khái quát, vốn để chiếu slide. Khi cần in thì dùng bộ chi tiết.

## Quy ước

| Ký hiệu | Nghĩa |
|---|---|
| Nét đứt xám `#64748b`, nhãn «planned» | Phiếu v1.4 có nhưng code chưa có |
| Nét đứt hoặc chữ cam, "(not written by code)" | CSDL cho phép giá trị này nhưng code không bao giờ ghi |
| Chỉ liệt kê "Removed in v1.4 (still in code)" trong Notes hoặc Index | v1.4 đã bỏ: niêm yết, giỏ hàng, bán lẻ; bao tiêu và cửa sổ ưu tiên; tem từng con; Farm Management System; ngưỡng chất lượng nước |

**Quyết định thiết kế ngày 05/11/2026, trưởng nhóm đã xác nhận.** Gồm:
- điều kiện mở Lô;
- hàng hộp và mức góp tối thiểu;
- mất cọc;
- tỷ lệ sống;
- tiền theo kg cân;
- Standard Cost dùng không hết;
- bỏ ký quỹ;
- InvoicedSale;
- bảng chấm điểm.

Trang nào áp dụng các quyết định này thì Notes có câu "Design decisions of 05/11/2026 applied here were confirmed by the lead." Nếu sau này đổi quyết định, tìm câu này để biết những trang cần sửa.

**Use case.** Có 50 use case:
- Giữ mã UC01–UC48.
- Bỏ UC13, UC23, UC24, UC26, UC46.
- Thêm UC49–UC55 «planned», trong đó có UC55 Cancel Bulk Pre-order. UC54 Forfeit Deposit «extend» UC55 và UC30.
- Investor ▷ Customer (generalization), kèm ràng buộc {not the Batch's Operator or its related parties}.

**Mermaid** (`mermaid/`) đáp ứng yêu cầu R2 "sơ đồ lưu dạng mã nguồn". Gồm 31 file, đều parse và vẽ được bằng Mermaid 11.4.1:
- `activity/WF-01…05.mmd`;
- 23 file `state/*.mmd`;
- `overview/Component.mmd`, `overview/Deployment.mmd`;
- `erd/Logical_ERD.mmd`.

## Phân chia theo người

Theo các gói việc trong Phiếu v1.4 và [`docs/feature-map.md`](../feature-map.md).

| Người | Phụ trách |
|---|---|
| Thiện | Auth (module mẫu), Funding, Contracts, Payments, Settlement, UC41; Component, Logical ERD, Physical ERD; WF-02, WF-05 |
| Viên | Operators, Boxes, Batches và hàng hộp, Production, Ingestion API và tool giả lập, Harvest theo hộp, truy xuất; Conceptual ERD; WF-01 |
| Nhân | Đặt trước sỉ, giao hàng, khiếu nại, InvoicedSale, đơn hàng cuối, module giá, mô-đun nhận diện; WF-04 |
| Khôi | Accounts (eKYC, tài khoản nhận tiền), Evidence, Alerts, Portfolio, báo cáo và nhật ký kiểm toán (UC42, UC43), quyền xem hộp theo hàng, bản đồ trại; Deployment, Package; WF-03 |

## Điểm cần biết khi đọc

- **State machine:**
  - Trạng thái đúng bằng giá trị CHECK constraint trong CSDL. Nhãn chuyển viết theo dạng `trigger [guard] / effect`.
  - Trạng thái v1.4 chưa có trong code thì ghi «planned».
- **CSDL:** không có trigger chặn chuyển trạng thái lô hay hộ nuôi, chỉ có CHECK danh sách giá trị.
- **Giá trị CHECK code không bao giờ ghi:**
  - `Disputed` (payment_instruction)
  - `Withdrawn` (settlement_feedback)
  - `Frozen`/`Closed` (batch_account)
  - `Lost`/`DeliveredInKind` (crab_item)
  - `Approved` (standard_cost_version)
- **Phần «planned» lớn:**
  - hàng hộp và RowAllocation;
  - đặt trước sỉ theo số con, giao có cân, mất cọc;
  - InvoicedSale và đơn hàng cuối theo giá sàn;
  - module gợi ý giá;
  - API nhận dữ liệu thiết bị cùng tool giả lập;
  - mô-đun nhận diện (hiện `NoopCrabDetector`).

## Sinh lại khi code đổi

Bộ sinh ở `generator/`, chạy bằng Node ≥ 20, không cần cài gói. Nội dung nghiệp vụ là dữ liệu trong các file `gen-*.js`. Lược đồ vật lý đọc từ `generator/schema17/`: dump `sys.columns`, `sys.foreign_keys`, `sys.indexes` của LocalDB sau khi chạy DbMigrator.

```bash
node docs/diagrams/generator/build.js --copy docs/diagrams
```

Lệnh này:
1. Sinh 12 file draw.io, Mermaid và bản gộp `CrabShare_Grouped.drawio` vào `generator/out/` (thư mục bị bỏ qua khi commit).
2. Kiểm XML.
3. Chép bản nguồn vào `docs/diagrams`.

Chạy không có `--copy` để chỉ sinh và kiểm.

Khi có migration mới:
1. Chạy DbMigrator lên LocalDB.
2. Dump lại `columns.txt`, `fks.txt`, `indexes.txt`; câu lệnh SQL ghi trong `schema.js`.
3. Chạy lại lệnh trên.

**Ảnh PNG/SVG.** Không xuất qua embed.diagrams.net, vì cách đó làm mất đoạn cuối của các đường có điểm gãy. Hãy mở file trên app.diagrams.net rồi chọn **File → Export as**. Trình xem nhanh `node docs/diagrams/generator/viewer/server.js` chỉ dùng để lướt.
