# VI-07 Thả giống theo từng hộp

## Phạm vi và giao ước với TH-07

VI-07 ghi nhận việc Operator đã thả cua thực tế. Mỗi hộp chứa đúng một cua, toàn bộ số hộp phải bằng seed_quantity. Không thả từng phần, thả bù hoặc tự chốt vốn.

Điều kiện đã được thống nhất:

- Người gọi là Owner hiện tại, tài khoản Active, có role OperatorMember trong DB, hộ nuôi Approved.
- Lô thuộc hộ nuôi đó và còn Funding; chưa có stocked_at, crab_item, slot_allocation hoặc slot_event Stocked.
- capital_closed_at đã có và không nằm trong tương lai.
- total_confirmed_capital >= min_viable_capital; có ít nhất một khoản Confirmed; tổng các khoản Confirmed khớp total_confirmed_capital.
- Tất cả hợp đồng của các khoản Confirmed là FullySigned, có fully_signed_at không nằm trong tương lai.

Quy tắc FundingReady được chuyển nguyên logic từ TrancheScheduleResolver sang FundingReadiness.ReadyAt; resolver tiếp tục dùng chung hàm này. FundingReadiness.StockingBlockedReason là nơi kiểm tra điều kiện thả giống cho cả POST và chi tiết lô. GET chi tiết trả thêm canStock, stockingBlockedReason và stockedAt; UI không tự suy đoán từ trạng thái Funding.

TH-07 vẫn sở hữu chốt vốn, snapshot capital_share, hủy lô thiếu vốn và hoàn tiền. VI-07 không ghi các dữ liệu này. Khi TH-07 hoàn thành, nếu vẫn giữ các trường/trạng thái trên thì không cần đổi VI-07. Nếu hợp đồng giao tiếp thay đổi, đối chiếu FundingReadiness và StockingTests trước khi ghép nhánh. Không dựa vào việc quá funding_deadline hoặc đạt target_capital để tự kết luận đủ điều kiện.

## API và ví dụ Bruno

POST {{baseUrl}}/api/batches/{{batchCode}}/stocking

Headers: Authorization: Bearer {{operatorToken}}, Content-Type: application/json.

Chọn đúng một cách:

```json
{
  "range": { "from": 1, "to": 2, "width": 4 }
}
```

Hoặc:

```json
{
  "slotCodes": ["0001", "0002"]
}
```

Ví dụ này dành cho lô seedQuantity = 2, hộp 0001 và 0002 có sẵn. Range dùng cùng DTO và quy tắc với POST /api/boxes/range: from/to là số nguyên dương <= int.MaxValue, to >= from, width 1–30, mặc định 4. Width không cắt số dài hơn: from = to = 2147483647, width = 1 vẫn chọn hộp 2147483647. Hệ thống kiểm tra số lượng và tồn tại hộp trước khi mở rộng range để không cấp phát mảng theo một seed_quantity quá lớn.

Thành công HTTP 200:

```json
{
  "batchCode": "VI07-TEST",
  "createdCrabs": 2,
  "status": "InProduction"
}
```

Đọc GET /api/operators/me/batches/{{batchCode}} để kiểm tra canStock trước khi gọi. Sau thành công canStock = false, status = InProduction và stockedAt có thời điểm máy chủ.

| HTTP | code | Ý nghĩa |
|---|---|---|
| 400 | ValidationProblemDetails | Chọn cả hai cách/không cách nào, mã trùng/rỗng/sai, range sai |
| 401 | Theo authentication | Chưa đăng nhập hoặc tài khoản bị khóa |
| 403 | stocking.owner_required / batch.not_owner | Thiếu quyền Owner, membership hoặc sai hộ nuôi |
| 404 | batch.not_found | Không có lô |
| 409 | stocking.already_stocked | Đã ghi nhận hoặc đã có registry, không tạo thêm dữ liệu |
| 409 | stocking.slot_conflict | Xung đột unique khi hộp vừa được gán bởi luồng khác |
| 422 | stocking.not_ready | Trạng thái hoặc vốn/hợp đồng chưa đủ điều kiện |
| 422 | stocking.quantity_mismatch | Số hộp khác seed_quantity |
| 422 | stocking.slot_not_found | Hộp không thuộc hộ nuôi, không tồn tại hoặc sai padding |
| 422 | stocking.slot_unavailable | Occupied, Maintenance, allocation đang mở hoặc còn cua Growing |
| 422 | stocking.operator_not_approved | Hộ nuôi chưa được duyệt hoặc đang Suspended |

## Transaction và concurrency

Toàn bộ công việc nằm trong InTransactionAsync với Serializable và execution strategy. Thứ tự khóa theo quy ước hiện có: audit, operator, batch. Hộp được chiếm bằng UPDATE có điều kiện: Available, không có allocation đang mở và không có cua Growing trên bất kỳ allocation nào của hộp. Nếu số hàng cập nhật khác số được chọn, rollback toàn bộ.

Sau đó tạo allocation, cua Growing, slot_event Stocked (Manual, quantity = 1), crab_item_event Stocked có actor. Ghi batch Funding → Stocked cùng stocked_at và audit stocked, rồi Stocked → InProduction cùng audit start_production. Cả hai audit lưu actor, thời điểm, trạng thái trước/sau trong cùng transaction. Lỗi kể cả ở audit cuối phải rollback cả trạng thái hộp, registry, event và audit đầu.

DB tiếp tục bảo vệ qua ux_slot_active (slot_id WHERE released_at IS NULL), ux_crab_item_growing_slot và các FK ghép sẵn có. AppDbContext.Custom sửa quan hệ EF bị scaffold thành một-một sang nhiều allocation lịch sử cho một hộp; không sửa entity/file scaffold. Không unique vĩnh viễn trên hộp trong bảng lịch sử.

Không thêm migration; DB cần áp dụng các migration hiện hành của repository. Không thay đổi dữ liệu dev. Fixture kiểm thử tự tạo DB riêng và dọn khi xong.

## Web

Danh sách lô dẫn đến /operator/batch/detail?code=...; màn chi tiết lấy dữ liệu thật, có liên kết sang hồ sơ/chi phí chuẩn và hộp nuôi. Owner thấy nút Thả giống khi canStock từ server là true. Modal dùng ActionDialog hiện có, chọn khoảng/padding, hiển thị số lượng và có bước xác nhận thực tế. Khóa gửi/đóng khi đang xử lý; lỗi giữ form để sửa. Thành công tải lại chi tiết, danh sách lô và cache hộp.

## Kiểm thử

```powershell
dotnet test backend/tests/CrabShare.Api.Tests --filter FullyQualifiedName~StockingTests
dotnet test backend/CrabShare.sln
cd web
npm run build
npm run lint
$env:CI='1'
npx playwright test --reporter=line
```

StockingTests chạy HTTP thật qua WebApplicationFactory và SQL Server LocalDB riêng, áp migration thật. Bao phủ tạo cua/allocation/event/audit, đủ số lượng, mã trùng, range/padding/biên int, hộp khác trại/không tồn tại/bảo trì/đang dùng, allocation cũ và cua còn chiếm hộp, tái sử dụng hộp, quyền hiện tại với token cũ, mọi trạng thái lô không hợp lệ, vốn/hợp đồng chưa sẵn sàng, gọi lại và hai request đồng thời. Trigger chỉ có trong DB test chèn lỗi ở crab_item_event hoặc audit cuối để kiểm tra rollback.

Playwright stocking.spec.ts kiểm tra UI với API giả lập tại biên HTTP: xác nhận trước gửi, payload, chống bấm lặp khi gửi, refresh, lỗi xung đột, đếm hộp và thiếu mã lô. Các ca này không thay thế chạy trình duyệt nối API/DB thật xuyên suốt.

## Kết quả ngày 20/10/2026

- Test hộp nền trước sửa: 18/18 qua.
- VI-07 sau review: 49/49 API/LocalDB qua, không skip. Gồm biên seed_quantity = int.MaxValue với range khớp nhưng trại chỉ có 2 hộp: trả 422 trước khi cấp phát mảng.
- Build web và npm run lint qua.
- Playwright toàn bộ: 113 qua, 2 skip (ca yêu cầu API thật chưa được cấu hình). Sau khi bổ sung ca Staff và ảnh desktop/mobile: riêng VI-07 4/4 qua; đã xem cả hai ảnh và kiểm tra không tràn ngang ở chiều rộng 390px.
- Toàn bộ backend trước sửa guard range cuối: API 764 qua, 23 lỗi, 0 skip; SettlementEngine 4/4 qua. Sau sửa guard đã chạy lại toàn bộ StockingTests 49/49 qua.
- Đã xuất nguyên HEAD gốc vào thư mục tạm, chạy riêng BatchesTests và BatchReviewTests: cũng 23 lỗi, 31 qua. So sánh tên từng ca lỗi khớp hoàn toàn với lượt toàn bộ hiện tại. Các lỗi xuất hiện ở gửi duyệt lô (422, dữ liệu thử cũ chưa khai giá bao tiêu theo quy tắc hiện tại); không sửa ngoài phạm vi VI-07.
- Review độc lập đã kiểm tra phân quyền, transaction, concurrency, tái sử dụng hộp và UI; điểm cần sửa là giới hạn mở rộng range và đã xử lý bằng tồn hộp thực tế.

Các ca lỗi nền (tên có tiền tố CrabShare.Api.Tests):

- BatchesTests.Create_save_replace_submit_and_state_guards
- BatchesTests.Definitively_rejected_batch_preserves_history_and_cannot_be_edited
- BatchesTests.Failure_after_save_rolls_back_new_and_replaced_costs_and_submit
- BatchesTests.Submit_rechecks_reserve_and_approval_and_concurrent_submit_only_succeeds_once
- BatchReviewTests.Admin_can_configure_fee_amount_but_not_overlapping_ranges_and_existing_snapshot_does_not_change
- BatchReviewTests.Approval_locks_submitted_version_and_uses_user_schedule_excluding_reserve_and_depreciation
- BatchReviewTests.Approval_racing_revision_returns_only_one_success_and_one_audit_transition
- BatchReviewTests.Concurrent_approval_succeeds_once_and_failure_after_save_rolls_everything_back
- BatchReviewTests.Definitive_rejection_is_terminal_for_operator_edits_and_resubmission
- BatchReviewTests.Fee_boundaries_follow_configured_inclusivity: target 49999999, 50000000, 199999999, 200000000, 200000001 (5 ca)
- BatchReviewTests.Invalid_time_state_reserve_and_missing_schedule_never_partially_approve
- BatchReviewTests.Missing_expired_or_overlapping_tier_is_an_atomic_business_error_and_configured_amount_is_used
- BatchReviewTests.Newly_approved_batch_accepts_reservation_and_sandbox_payment_request
- BatchReviewTests.Operator_schedule_is_persisted_replaced_and_checked_for_missing_duplicate_and_zero_tranches
- BatchReviewTests.Reject_records_reason_and_audit_without_locking_or_generating_tranches
- BatchReviewTests.Relative_schedule_waits_for_real_capital_contract_and_stocking_events_and_resolves_once
- BatchReviewTests.Request_revision_returns_draft_then_new_version_can_be_submitted_without_losing_review_history
- BatchReviewTests.Sql_triggers_block_all_locked_writes_and_mixed_multirow_statements_but_allow_drafts
- BatchReviewTests.Unauthorized_and_revoked_admin_cannot_review

Giới hạn: TH-07 và luồng ký hợp đồng chưa được triển khai trong nhánh này; dữ liệu demo Funding hiện có không tự đủ điều kiện thả giống. Test VI-07 dựng kết quả upstream trong DB riêng, không làm thay TH-07. Chưa chạy browser nối API/DB thật xuyên suốt hoặc đo tải production. Không commit, push hoặc merge.
