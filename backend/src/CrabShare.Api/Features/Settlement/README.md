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

## Đã làm (TH-12) — tính quyết toán
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| GET | `/api/admin/settlements` | PlatformAdmin | Lô `Harvesting` / `Settlement` / `Closed` kèm bảng quyết toán nếu đã tính (tab Quyết toán của AdminFinance) |
| POST | `/api/admin/batches/{code}/settlements` | PlatformAdmin | UC38 tính bản nháp, body `{ taxWithholdingPct }` (tỷ lệ người nuôi khai, 0–35, 0 = chưa khai). Lần đầu → 201, lô `Harvesting` → `Settlement` (audit `batch/start_settlement`); tính lại khi còn `Draft`/`Proposed`/`Disputed` → 200, `revision_no` + 1, thay toàn bộ dòng, về `Draft` (phải công bố lại). Đã duyệt → 409 `settlement.locked`. Lỗi 422: `settlement.batch_not_ready`, `settlement.no_capital_shares`, `settlement.no_locked_cost`. Audit `settlement/calculate`·`recalculate` (đủ số liệu, nguồn doanh thu, từng dòng) |
| GET | `/api/admin/settlements/{id}` | PlatformAdmin | Bảng đầy đủ: nguồn doanh thu, chi phí khoá, Pool, thù lao, phần chia, khấu hao, từng dòng, góp ý |

Cách tính (`CrabShare.SettlementEngine/SettlementCalculator`, lõi thuần, có test FsCheck):
- Doanh thu thực thu = `v_batch_actual_revenue.actual_revenue` (đơn `Completed` + cọc bị mất − hoàn tiền khiếu nại), âm thì lấy 0. Chi phí = tổng các dòng của bảng chi phí chuẩn `Locked`, làm tròn từng dòng như `Batches/BatchService`. `depreciation_amount` = phần khấu hao trong đó.
- Pool = doanh thu − chi phí (CHECK `ck_settlement_pool`). Thù lao = `operator_share_pct` × Pool, **làm tròn xuống**, chỉ khi Pool > 0.
- Phần chia = Pool − thù lao (Pool dương) hoặc Pool (âm), chia theo `capital_share` bằng `LargestRemainderAllocator` → tổng dòng = phần chia đúng tới đồng (`v_settlement_reconciliation.difference = 0`).
- Pool âm: lỗ chia theo vốn, mỗi người tối đa bằng vốn góp; phần vượt trần của người đã chạm trần chia lại cho người còn dư địa (lặp). Lỗ vượt tổng vốn của mọi nhà đầu tư (`uncoveredLoss`) không chia cho nhà đầu tư — chỉ xảy ra khi doanh thu + tổng vốn < chi phí.
- Khấu trừ thuế = tỷ lệ người nuôi khai × phần chia dương, làm tròn xuống (TL-07: nền tảng không tự khấu trừ, bảng hiển thị số trước thuế / khấu trừ / sau thuế và ghi chú ai có nghĩa vụ).
- Mỗi lô **một** bảng (`uq_settlement_batch_id`): "bản sửa" là tính lại trên cùng dòng, tăng `revision_no`, chỉ trước khi duyệt; sau duyệt trigger `trg_settlement_locked` / `trg_settlement_line_locked` khoá số liệu (BR-30).
- Test: `SettlementCalculatorTests` (ví dụ + bất biến) và `SettlementDatabaseTests` (Pool dương khớp đồng, Pool âm có trần, lỗ vượt vốn, 100 nhà đầu tư < 10 giây, quyền admin, lô chưa thu hoạch).

## Đã làm (TH-13) — công bố, sao kê, góp ý trong hạn
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/admin/settlements/{id}/propose` | PlatformAdmin | UC37: `Draft` → `Proposed`, `proposed_at`, `feedback_deadline` = + `feedbackDays` (7–14, mặc định 7; CHECK CSDL ≥ 7 ngày). Không phải nháp → 422 `settlement.not_draft`. Audit `settlement/propose` |
| GET | `/api/settlements/{id}` | Nhà đầu tư của lô, người nuôi của lô, admin | UC35 sao kê. Nhà đầu tư thấy tổng + **đúng dòng và góp ý của mình**; người nuôi, admin thấy đủ. Bản nháp và người ngoài → 404 |
| POST | `/api/settlements/{id}/feedback` | Nhà đầu tư của lô | UC36: `{ content }` 10–1.000 ký tự, kèm căn cứ. Chỉ khi `Proposed`/`Disputed` và chưa quá `feedback_deadline`, ngược lại 422 `settlement.feedback_closed`. Bảng → `Disputed`. Audit `settlement_feedback/create` |
| POST | `/api/admin/settlement-feedback/{id}/answer` | PlatformAdmin | `{ response, unresolved }` → `Answered` hoặc `Unresolved` (hai bên chưa thống nhất: vẫn chốt được, kèm ghi chú công khai — TL-14 Bước 4). Hết góp ý `Open` → bảng về `Proposed`. Audit `settlement_feedback/answer` |
| GET | `/api/me/settlements` | Investor | Bảng đã công bố của các lô tôi góp vốn, kèm số thực nhận của tôi |
| GET | `/api/operator/settlements` | OperatorMember | Bảng đã công bố của các lô thuộc hộ nuôi tôi |

Điều chỉnh số liệu sau góp ý: admin **tính lại** (lần tính mới, về `Draft`) rồi công bố lại → cửa sổ mới. Test `SettlementReviewDatabaseTests`.

## Endpoint dự kiến
| Method | Path | Ai gọi | Ghi chú |
|---|---|---|---|
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
- Web: tab Quyết toán của `admin/AdminFinance.tsx` (`AdminSettlementsPanel`), `admin/AdminSettlementDetail.tsx` (tính / tính lại, công bố, trả lời góp ý), `operator/OperatorSettlement.tsx` (xem bảng + góp ý, chỉ đọc), tab Quyết toán của cổng nhà đầu tư (`investor/settlement/InvestorSettlements.tsx`: sao kê + form góp ý). Dùng chung `shared/settlement/` (`SettlementStatement`, `SettlementFeedbackList`, `settlementApi`).
- Mobile (nếu kịp): xem sao kê trong chi tiết lô của nhà đầu tư.

## Tài liệu
TL-12 Công thức quyết toán và xử lý hao hụt · TL-13 Phân bổ làm tròn và phân bổ lỗ · TL-14 Quy trình quyết toán và điều kiện đóng lô · TL-15 Thù lao Operator và phí nền tảng · TL-07 Nghĩa vụ thuế.
