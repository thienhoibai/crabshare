# Mermaid – State Machine Diagrams (v3.2 · 05/11/2026 · Register v1.4)

Mỗi máy trạng thái một file `stateDiagram-v2`, cùng nội dung với `../../CrabShare_State_Machines.drawio` (trang Index 2 phần + 23 máy).
Sinh tự động bằng bộ sinh `gen-state.js` (cùng dữ liệu với bản draw.io) — sửa dữ liệu trong file đó rồi sinh lại, không sửa tay.

Quy ước (giống bản draw.io): trạng thái = giá trị CHECK trong V001–V017 (develop @ 420a379); «planned» = có trong Phiếu v1.4 nhưng code chưa có
(class `planned`, nét đứt xám, kèm `note`); "(not written by code)" = CHECK cho phép nhưng code không ghi (class `notwritten`, nét đứt cam);
phần v1.4 đã bỏ thì không vẽ, chỉ ghi ở dòng `%%`. Nhãn chuyển ngắn `trigger [guard] / effect · UC`; nhãn đầy đủ nằm ở dòng `%%` ngay dưới cạnh.
Chuyển ra từ initial chỉ có effect ("/ …"), điều kiện tạo ghi ở dòng `%% Created by …`. `Contribution.mmd` có thêm composite «planned» RowAllocation
(Held → Allocated → Released) đi kèm khoản góp. `InvoicedOrder.mmd` cũ đổi tên thành `InvoicedSale.mmd` (quyết định thiết kế ngày 05/11/2026, đã được trưởng nhóm xác nhận).
Ký tự `:` `;` `#` `|` `{}` trong nhãn được thay để đúng cú pháp Mermaid. Cần Mermaid ≥ 10 (classDef trong state diagram).

| File | Hình | Máy | Thay đổi v1.4 |
|---|---|---|---|
| `Batch.mmd` | Figure 4.8 | batch.status (Batch) | modified + «planned» (Register v1.4) |
| `Contribution.mmd` | Figure 4.9 | contribution.status (Contribution / reservation) + RowAllocation «planned» | modified + «planned» (box rows, RowAllocation) |
| `InvestmentContract.mmd` | Figure 4.10 | investment_contract.status (Contract) | kept (template content «planned») |
| `PaymentRequest.mmd` | Figure 4.11 | payment_request.status (VietQR collection) | modified (purposes) |
| `PaymentInstruction.mmd` | Figure 4.12 | payment_instruction.status (refund, disbursement, payout) | corrected to code (Sent not written) |
| `DisbursementTranche.mmd` | Figure 4.13 | disbursement_tranche.status (milestone disbursement) | corrected to code |
| `Settlement.mmd` | Figure 4.14 | settlement.status (Settlement) | modified + «planned» (revenue lines, remuneration tiers) |
| `SettlementFeedback.mmd` | Figure 4.15 | settlement_feedback.status (Investor feedback) | kept |
| `BatchAccount.mmd` | Figure 4.16 | batch_account.status (dedicated batch account) | corrected to code (created Open) |
| `BulkPreOrder.mmd` | Figure 4.17 | sales_order.status — BulkPreOrder (v1.4) | new v1.4 flow on the code's PreOrder states + «planned» |
| `InvoicedSale.mmd` | Figure 4.18 | sales_order.status — InvoicedSale / FinalOrder «planned» | new, «planned» (no code) |
| `Complaint.mmd` | Figure 4.19 | complaint.status (Order complaint) | kept (regrouped) |
| `Operator.mmd` | Figure 4.20 | operator.status (Farm operator) | kept |
| `Box.mmd` | Figure 4.21 | physical_slot.status (Box) | modified + «planned» (box rows, row-scoped view) |
| `StandardCostVersion.mmd` | Figure 4.22 | standard_cost_version.status (Standard Cost) | modified + «planned» (locked with price per kg and floor price) |
| `CrabItem.mmd` | Figure 4.23 | crab_item.status (Crab in a box) | modified + «planned» (no tags, transit loss, resale) |
| `Harvest.mmd` | Figure 4.24 | harvest.lifecycle_status (Harvest session) | modified + «planned» (per box, no tags) |
| `AppUser.mmd` | Figure 4.25 | app_user.status (User account) | kept |
| `InvestorVerification.mmd` | Figure 4.26 | investor.verification_status (eKYC) | kept |
| `PayoutAccount.mmd` | Figure 4.27 | payout_account.status (+ name_match_status) | kept (redrawn with a choice) |
| `Evidence.mmd` | Figure 4.28 | evidence.review_status (Production evidence) | modified + «planned» (simulator input, row-scoped view) |
| `CaptureRequest.mmd` | Figure 4.29 | capture_request.status (Random capture request) | kept |
| `Alert.mmd` | Figure 4.30 | alert.status (Operations alert) | modified (alert types, regrouped) |

Máy đã bỏ (removed in v1.4, code vẫn còn, không có file): product_listing, stock_reservation, offtake_commitment (status, deposit_status), crab_tag.
