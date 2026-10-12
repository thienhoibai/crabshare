# Settlement — Quyết toán và chi trả

**Người làm:** Thiện · **Use case:** UC35 Review Settlement Statement · UC36 Submit Settlement Feedback · UC37 Publish Settlement Proposal · UC38 Calculate Settlement · UC39 Approve Settlement and Issue Payouts
**Phối hợp:** Viên (TSK-12 — kiểm định đúng đắn engine)

Công thức: **Revenue Pool = doanh thu thực thu từ đơn đã hoàn tất − chi phí chuẩn đã khoá**.
Pool > 0 → trích thù lao người nuôi (`operator_share_pct`), phần còn lại chia theo tỷ lệ vốn. Pool ≤ 0 → không có thù lao, lỗ chia theo vốn, tối đa bằng vốn đã góp.

## Bảng
| Bảng | Cột / trạng thái cần nhớ |
|---|---|
| `settlement` | `revision_no` · `actual_revenue`, `locked_standard_cost`, `revenue_pool` (CHECK = revenue − cost), `operator_remuneration` (= 0 nếu pool ≤ 0), `depreciation_amount`, `tax_total` · `status`: `Draft` → `Proposed` → (`Disputed`) → `Approved` → `PaidOut` → `Closed` · `feedback_deadline` ≥ `proposed_at` + 7 ngày |
| `settlement_line` | mỗi nhà đầu tư một dòng: `capital_return`, `profit_share`, `tax_withheld`, `net_payout` (CHECK = capital + profit − tax), `in_kind_qty_kg` |
| `settlement_feedback` | ý kiến của nhà đầu tư trong hạn: `Open`, `Answered`, `Withdrawn`, `Unresolved` |

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/admin/batches/{code}/settlements` | PlatformAdmin | UC38 tính bản nháp: doanh thu từ đơn `Completed`, chi phí khoá, pool, thù lao, chia theo `capital_share` bằng `LargestRemainderAllocator`, thuế (TL-07) |
| POST | `/api/admin/settlements/{id}/propose` | PlatformAdmin | UC37 công bố, đặt `feedback_deadline` |
| GET | `/api/settlements/{id}` | Investor của lô, Operator, Admin | UC35 sao kê: tổng + dòng của chính mình |
| POST | `/api/settlements/{id}/feedback` | Investor của lô | UC36, chỉ trong hạn |
| POST | `/api/admin/settlement-feedback/{id}/answer` | PlatformAdmin | |
| POST | `/api/admin/settlements/{id}/approve` | PlatformAdmin | UC39 → tạo `payment_instruction` loại `Payout` cho từng dòng; quyết toán đã duyệt **không sửa được** |

## Quy tắc phải giữ
- Tổng các khoản chia = Revenue Pool **đúng tới 1 đồng** (NFR Accuracy) — dùng `CrabShare.SettlementEngine`, không tự làm tròn trong service.
- Lô 100 nhà đầu tư, 2.000 hộp tính xong trong 10 giây (NFR Performance) — viết test hiệu năng.
- Mọi thay đổi ghi `audit_log`; muốn sửa sau khi duyệt thì tạo `revision_no` mới.

## View có sẵn trong CSDL
| View | Dùng cho |
|---|---|
| `v_batch_actual_revenue` | doanh thu thực thu theo lô |
| `v_settlement_reconciliation` | đối chiếu tổng dòng chia với Revenue Pool |

Đã có entity tương ứng trong `Infrastructure/Persistence/Entities` (chỉ đọc).

## Màn hình
- Web: `admin/AdminFinance.tsx`, `admin/AdminSettlementDetail.tsx`, `operator/OperatorSettlement.tsx`, tab Sao kê trong `investor/`.
- Mobile (nếu kịp): xem sao kê trong chi tiết lô của nhà đầu tư.

## Tài liệu
TL-12 Công thức quyết toán và xử lý hao hụt · TL-13 Phân bổ làm tròn và phân bổ lỗ · TL-14 Quy trình quyết toán và điều kiện đóng lô · TL-15 Thù lao Operator và phí nền tảng · TL-07 Nghĩa vụ thuế.
