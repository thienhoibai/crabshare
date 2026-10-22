# Sơ đồ thiết kế CrabShare (draw.io)

Bản 2.0, 22/10/2026 — vẽ lại theo **Phiếu đăng ký v1.3 (15/10/2026)** và code trên `develop` (migration V001–V017, 60 bảng). File draw.io không nén, nhiều trang, ký hiệu UML 2.5; ERD dùng crow's foot ở cả ba mức; chữ trên sơ đồ bằng tiếng Anh.

## Mở trên draw.io web

Repo private nên lần đầu draw.io hỏi **Authorize GitHub**; sau đó xem, sửa và bấm Save là draw.io tự commit vào nhánh. Link mở thẳng từ `develop`:

| File | Trang | Dùng ở | Hình | Mở |
|---|---|---|---|---|
| `CrabShare_Business_Context_Diagram.drawio` | 1 | Report 1 · SRS 1 | Figure 1.1 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Business_Context_Diagram.drawio) |
| `CrabShare_Use_Case_Diagrams.drawio` | LV0 + SD1–SD5, 48 UC | SRS 2.2.1 | Figure 2.1–2.6 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Use_Case_Diagrams.drawio) |
| `CrabShare_Conceptual_ERD.drawio` | 1 (53 thực thể) | SRS 3.1.5 | Figure 3.1 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Conceptual_ERD.drawio) |
| `CrabShare_Screen_Flow.drawio` | Web · Mobile | SRS 3.1.1 | Figure 3.2–3.3 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Screen_Flow.drawio) |
| `CrabShare_Architecture.drawio` | Component · Deployment · Package ×3 | SDD 1 | Figure 4.1, 4.4–4.7 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Architecture.drawio) |
| `CrabShare_Logical_ERD.drawio` | toàn bộ + 6 vùng | SDD 2 | Figure 4.2 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Logical_ERD.drawio) |
| `CrabShare_Physical_ERD.drawio` | toàn bộ + 6 vùng | SDD 2 | Figure 4.3 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Physical_ERD.drawio) |
| `CrabShare_State_Machines.drawio` | Index + 27 máy trạng thái | SDD (Review 2) | Figure 4.8–4.34 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_State_Machines.drawio) |
| `CrabShare_Activity_Diagrams.drawio` | WF-01 … WF-05 | SDD (Review 2) · Demo Workflows | Figure 4.35–4.39 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Activity_Diagrams.drawio) |
| `CrabShare_Sequence_Diagrams.drawio` | 33 luồng chính | SDD 3 | Figure 4.40–4.72 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Sequence_Diagrams.drawio) |
| `CrabShare_Class_Diagrams.drawio` | 16 nhóm tính năng | SDD 3 | Figure 4.73–4.88 | [draw.io](https://app.diagrams.net/#Hthienhoibai%2Fcrabshare%2Fdevelop%2Fdocs%2Fdiagrams%2FCrabShare_Class_Diagrams.drawio) |

Muốn mở từ một nhánh khác, thay `develop` trong link bằng tên nhánh (dấu `/` viết thành `%2F`).

## Phân chia theo người

- **Thiện:** Funding, Contracts, Payments, Settlement (state machine 4.9–4.16, sequence 4.40–4.46, class 4.73–4.76), Component, Logical/Physical ERD, WF-02, WF-05.
- **Viên:** Operators, Boxes, Batches, Production, Harvest (state machine 4.8, 4.23–4.28, sequence 4.47–4.56, class 4.77–4.80), Conceptual ERD, WF-01.
- **Nhân:** Catalog, Orders, Offtake (state machine 4.17–4.22, sequence 4.57–4.64, class 4.81–4.84), WF-04, soát nhất quán UC ↔ sequence ↔ test case.
- **Khôi:** Auth/Accounts, Evidence, Alerts, Portfolio, Admin (state machine 4.29–4.34, sequence 4.65–4.72, class 4.85–4.88), Deployment, Package, WF-03.

## Điểm cần biết khi đọc

- Trạng thái trong state machine đúng bằng giá trị CHECK constraint trong CSDL; nhãn chuyển viết `trigger [guard] / effect`; nét **đứt cam** = CSDL cho phép nhưng code chưa có (hoặc nằm ở PR #72, CS-75).
- Phần **chưa có trên develop** được ghi "planned": ingestion API cho phần mềm trại (`/api/ingest/v1`), mô hình ONNX (hiện `NoopCrabDetector`), cửa sổ nhận hàng bao tiêu UC23.
- Không có trigger CSDL chặn chuyển trạng thái lô hay hộ nuôi, chỉ có CHECK danh sách giá trị; `docs/architecture.md` §5 cần sửa câu "cả hai nơi".
- Giá trị CHECK không bao giờ được ghi: `Disputed` (payment_instruction), `Withdrawn` (settlement_feedback), `Frozen/Closed` (batch_account), `Lost/DeliveredInKind` (crab_item), `Approved` (standard_cost_version).

## Sinh lại khi code đổi

Bộ sinh ở `generator/` (Node ≥ 20, không cần cài gói). Nội dung nghiệp vụ của state machine, activity, sequence, class là dữ liệu trong `gen-*.js`; lược đồ vật lý đọc từ `generator/schema17/` (dump `sys.columns`, `sys.foreign_keys`, `sys.indexes` của LocalDB sau khi chạy DbMigrator).

```bash
node docs/diagrams/generator/build.js --copy docs/diagrams
```

Khi có migration mới: chạy DbMigrator lên LocalDB, dump lại `columns.txt`, `fks.txt`, `indexes.txt` (câu lệnh SQL ghi trong `schema.js`), rồi chạy lệnh trên. `node docs/diagrams/generator/viewer/server.js` mở trình xem nhanh tại `http://localhost:5188` (dùng embed.diagrams.net).
