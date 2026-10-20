# CS-48 / VI-08 Nhật ký ngày và ngưỡng của Operator

## Hành vi

Operator tự cấu hình khoảng pH, nhiệt độ nước và độ mặn theo từng lô. Các mức dev trong appsettings.json và khoảng nhắc tạm trên mobile không được dùng làm ngưỡng cho nhật ký mới. Đây là thông số do Operator khai báo, không phải chuẩn sinh học do CrabShare xác nhận.

Owner được cấu hình; Owner/Staff được ghi nhật ký cho lô InProduction hoặc Harvesting của Operator Approved. Quyền, membership, trạng thái tài khoản được kiểm tra lại trong DB. Lô chưa cấu hình trả 422 production.thresholds_required, không ghi nhãn Ok khi chưa có ngưỡng để đánh giá.

Mỗi lần cấu hình thay đổi tạo phiên bản bất biến có người tạo/thời gian/audit. Nhật ký giữ phiên bản đã dùng; chỉnh ngưỡng không tính lại lịch sử hoặc tự đóng cảnh báo cũ. Ghi cùng cấu hình không tạo phiên bản mới. Hai người lưu cấu hình đồng thời phải dùng expectedVersionNo; phiên bản cũ trả 409 production.thresholds_changed.

Nhật ký chỉ ghi hôm nay theo server UTC+7; API không nhận ngày, nguồn, người ghi hay cờ đánh giá từ client. Source luôn Manual. Mỗi lô/ngày/nguồn có một bản ghi, bao gồm khi hai request đồng thời. Ghi trùng trả 409 production.log_exists, không tạo/cập nhật thêm cảnh báo.

## Chỉ số và validation

| JSON | Đơn vị | Miền dữ liệu và độ chính xác |
|---|---|---|
| ph | Không có đơn vị | 0–14; tối đa 1 chữ số thập phân |
| waterTempC | °C | -273,1 đến 999,9; tối đa 1 chữ số thập phân |
| salinityPpt | ppt | 0–999,9; tối đa 1 chữ số thập phân |
| feedKg | kg | 0–999999999,999; tối đa 3 chữ số thập phân |

Bốn chỉ số bắt buộc, note tùy chọn tối đa 500 ký tự. Miền dữ liệu chỉ bảo vệ kiểu dữ liệu/vật lý và độ chính xác SQL; không phải ngưỡng an toàn. Ngưỡng Operator nhập phải trong miền chỉ số tương ứng và min <= max. Không tự đặt ngưỡng theo loại cua/giai đoạn; mỗi lô có cấu hình riêng.

Biên min/max được tính trong ngưỡng. Vượt bất kỳ khoảng nước nào: vẫn lưu số đo, plausibilityFlag=OutOfRange và gọi AlertService.RaiseAsync WaterQuality, Medium, hạn phản hồi 24 giờ. Nội dung nêu chỉ số, giá trị, đơn vị và khoảng Operator cấu hình. Trong khoảng: Ok. Không suy diễn Inconsistent vì chưa có công thức đối chiếu số cua; các bản ghi cũ vẫn đọc/hiển thị cờ đó.

Nguồn quy tắc: Phiếu FA26SE229 v1.2, UC17/Production README, lựa chọn của người dùng về ngưỡng tùy chỉnh, schema V001 và bản thiết kế trong docs/superpowers/specs. Các quyết định hoàn thiện VI-08: chỉ hôm nay UTC+7, ghi cả khi Harvesting, cần cấu hình trước, Owner cấu hình/Staff ghi và SLA cảnh báo 24 giờ. Chúng là quy ước triển khai đã ghi rõ, không khẳng định Phiếu quy định chi tiết những điểm đó.

## API và Bruno

Headers: Authorization: Bearer {{operatorToken}}, Content-Type: application/json.

GET {{baseUrl}}/api/batches/{{batchCode}}/production-thresholds

Trả {businessDate,canConfigure,canRecord,current}. current=null khi chưa cấu hình; current có id, versionNo, sáu ngưỡng, createdBy và createdAt.

PUT {{baseUrl}}/api/batches/{{batchCode}}/production-thresholds

Các số dưới đây chỉ là dữ liệu minh họa request, không phải khuyến nghị kỹ thuật nuôi:

```json
{
  "expectedVersionNo": 0,
  "phMin": 7.1,
  "phMax": 8.3,
  "waterTempMinC": 24,
  "waterTempMaxC": 31,
  "salinityMinPpt": 12,
  "salinityMaxPpt": 29
}
```

expectedVersionNo=0 chỉ khi chưa có cấu hình. Khi sửa, dùng versionNo nhận từ GET. Thành công trả phiên bản hiện hành.

POST {{baseUrl}}/api/batches/{{batchCode}}/production-logs

```json
{
  "ph": 8.7,
  "waterTempC": 28.5,
  "salinityPpt": 18.4,
  "feedKg": 1.234,
  "note": "Đo thủ công buổi sáng"
}
```

Thành công 201. Với cấu hình minh họa trên, pH vẫn được lưu là 8.7 và cờ OutOfRange; đọc cảnh báo qua GET /api/operators/me/alerts. Gửi lại cùng ngày trả 409.

Response nhật ký: {id,batchCode,logDate,ph,waterTempC,salinityPpt,feedKg,note,source,plausibilityFlag,recordedBy,createdAt,thresholdVersion,thresholdsApplied}. thresholdVersion là versionNo, thresholdsApplied là bản cấu hình đầy đủ. Hai trường này null với nhật ký legacy không có tham chiếu; không gán ngưỡng hiện tại vào lịch sử cũ.

- GET /api/batches/{code}/production-logs?from=2026-10-01&to=2026-10-31&page=1&pageSize=20
- GET /api/operators/me/production-logs với cùng query, tổng hợp đúng Operator đang đăng nhập.
- GET /api/operators/me/production-batches?page=1&pageSize=100: lô Stocked/InProduction/Harvesting, số cua Growing, ngày chu kỳ, latestLog, loggedToday (Manual), canRecord và businessDate.

Danh sách trả {items,page,pageSize,total}; page>=1, pageSize 1–100. Ngày lọc bao gồm hai biên, từ ngày <= đến ngày. Nhật ký sắp logDate giảm dần rồi id giảm dần. GET theo lô cho Owner/Staff đúng Operator, Investor có vốn Confirmed/capital_share và PlatformAdmin; mọi quyền được đối chiếu DB hiện hành.

## Database và transaction

V014__production_threshold_versions.sql thêm production_threshold_version và production_log.threshold_version_id nullable. Dữ liệu cũ không bị sửa/xóa, giữ unique ux_production_log_day. FK ghép ngăn nhật ký gắn cấu hình của lô khác; trigger ngăn sửa/xóa phiên bản cấu hình đã lưu.

Áp dụng từ thư mục gốc repo, với API dừng nếu môi trường đang giữ schema:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator
```

Không dùng --reset. Chạy migration trước khi chạy bản API có code VI-08. Giao thức ghi: Serializable; khóa audit → Operator → batch; lưu nhật ký trước tạo cảnh báo; audit và AlertService cùng transaction. Lỗi alert/audit rollback nhật ký; lỗi trùng không phát sinh alert. Không có tác động ngoài database trong RaiseAsync hiện tại.

## Demo

1. Áp migration, chạy API và web/mobile với cùng API_URL và DB.
2. Đăng nhập Owner của Operator Approved, chọn lô InProduction/Harvesting.
3. Mở cấu hình, tự nhập cả ba khoảng nước và lưu. Staff xem được khoảng nhưng không sửa.
4. Ghi bốn chỉ số và ghi chú. Mở lịch sử để thấy ngày server, nguồn Manual, số đo, cờ và phiên bản ngưỡng.
5. Ghi trên web rồi refresh Nhật ký mobile; làm chiều ngược lại với một lô hoặc ngày khác chưa ghi. Lần hai cùng lô/ngày trả 409.
6. Dùng một số đo ngoài ngưỡng Operator đã đặt; kiểm tra số đo vẫn có trong lịch sử và WaterQuality xuất hiện trong Cảnh báo.
7. Đổi cấu hình, kiểm tra nhật ký cũ vẫn hiển thị khoảng cũ. Test tự động kiểm tra phiên bản mới áp dụng vào ngày tiếp theo.

## Kiểm chứng trong phiên triển khai

Ngày kiểm chứng: 20/10/2026, sau khi sửa các phát hiện của review độc lập.

| Lệnh/kiểm tra | Kết quả |
|---|---|
| `dotnet test backend/CrabShare.sln --no-restore --logger 'trx;LogFileName=cs48-final.trx' --verbosity quiet` | SettlementEngine: 4 qua. API: 869 qua, 23 lỗi, 0 bỏ qua, tổng 892. |
| 104 ca `ProductionLogTests` trong lượt chạy toàn bộ trên | 104/104 qua, gồm cấu hình/log đồng thời, quyền hiện hành, 409, các khoảng tùy chỉnh, lịch sử phiên bản, rollback và mốc ngày UTC+7. |
| `npm run build` trong web | Qua, Vite build 2755 modules. |
| `npm run lint` trong web | Qua (TypeScript `tsc -b --noEmit`, exit 0). |
| `CI=1 npx playwright test --reporter=line` trong web | 126 qua, 2 bỏ qua, 0 lỗi; gồm 12 ca nhật ký/cấu hình. CI=1 chọn Chromium đã có trên máy thay vì Chrome chưa cài. |
| `flutter analyze`, `flutter test` trong mobile | Đã thử, không khởi chạy được vì không tìm thấy executable Flutter. Chưa xác nhận type analysis, widget/repository tests hoặc build app. |
| Kiểm tra parser/formatter Dart qua bản WASM dart_style ở thư mục tạm | 13 file thay đổi/mới qua kiểm tra cú pháp và định dạng. Không thay thế analyzer/test Flutter. |
| `git diff --check` | Qua; có cảnh báo Git chuyển LF sang CRLF theo cấu hình hiện có. |
| `dotnet run --project backend/tools/CrabShare.DbMigrator --no-restore` | Qua trên LocalDB `CrabShareDev`. DB này còn thiếu V004–V013 nên migrator đã áp dụng các migration đó cùng V014. Không chạy `--reset`. |

Hai ca Playwright bỏ qua là các ca cần API thật chưa được bật trong môi trường test. Các ca UI VI-08 kiểm tra tại biên HTTP bằng Playwright route fixtures; backend được kiểm thử HTTP/SQL Server LocalDB thật trong database riêng. Chưa chạy một phiên web và Flutter app cùng kết nối API/DB thật xuyên suốt, vì thiếu Flutter SDK.

Đã xem ảnh giao diện web desktop và viewport điện thoại 390 px; lịch sử giữ số đo ngoài ngưỡng, nguồn, phiên bản và đơn vị. Đã bổ sung/sửa các ca chống mất nội dung khi refetch lỗi, không giữ `loggedToday` qua ngày mới, và refresh mobile độc lập với việc form đã đóng. Review lại không còn phát hiện cần xử lý.

### Đối chiếu 23 lỗi nền

Đã xuất nguyên HEAD gốc bằng `git archive` sang thư mục tạm riêng, không đổi branch/worktree hoặc sửa checkout, rồi chạy lại `BatchesTests` và `BatchReviewTests` trên bản đó. Bản gốc: 31 qua, 23 lỗi. So sánh tên từng ca lỗi trong TRX gốc với TRX lượt chạy hiện tại cho kết quả trùng khớp hoàn toàn (0 khác biệt). Các ca lỗi trả 422 tại luồng gửi duyệt lô, trước phần nhật ký; không sửa ngoài phạm vi VI-08.

Danh sách tên đầy đủ, tiền tố chung `CrabShare.Api.Tests.`:

```text
BatchesTests.Create_save_replace_submit_and_state_guards
BatchesTests.Definitively_rejected_batch_preserves_history_and_cannot_be_edited
BatchesTests.Failure_after_save_rolls_back_new_and_replaced_costs_and_submit
BatchesTests.Submit_rechecks_reserve_and_approval_and_concurrent_submit_only_succeeds_once
BatchReviewTests.Admin_can_configure_fee_amount_but_not_overlapping_ranges_and_existing_snapshot_does_not_change
BatchReviewTests.Approval_locks_submitted_version_and_uses_user_schedule_excluding_reserve_and_depreciation
BatchReviewTests.Approval_racing_revision_returns_only_one_success_and_one_audit_transition
BatchReviewTests.Concurrent_approval_succeeds_once_and_failure_after_save_rolls_everything_back
BatchReviewTests.Definitive_rejection_is_terminal_for_operator_edits_and_resubmission
BatchReviewTests.Fee_boundaries_follow_configured_inclusivity(target: 199999999, expected: 1000000)
BatchReviewTests.Fee_boundaries_follow_configured_inclusivity(target: 200000000, expected: 1000000)
BatchReviewTests.Fee_boundaries_follow_configured_inclusivity(target: 200000001, expected: 2000000)
BatchReviewTests.Fee_boundaries_follow_configured_inclusivity(target: 49999999, expected: 500000)
BatchReviewTests.Fee_boundaries_follow_configured_inclusivity(target: 50000000, expected: 1000000)
BatchReviewTests.Invalid_time_state_reserve_and_missing_schedule_never_partially_approve
BatchReviewTests.Missing_expired_or_overlapping_tier_is_an_atomic_business_error_and_configured_amount_is_used
BatchReviewTests.Newly_approved_batch_accepts_reservation_and_sandbox_payment_request
BatchReviewTests.Operator_schedule_is_persisted_replaced_and_checked_for_missing_duplicate_and_zero_tranches
BatchReviewTests.Reject_records_reason_and_audit_without_locking_or_generating_tranches
BatchReviewTests.Relative_schedule_waits_for_real_capital_contract_and_stocking_events_and_resolves_once
BatchReviewTests.Request_revision_returns_draft_then_new_version_can_be_submitted_without_losing_review_history
BatchReviewTests.Sql_triggers_block_all_locked_writes_and_mixed_multirow_statements_but_allow_drafts
BatchReviewTests.Unauthorized_and_revoked_admin_cannot_review
```

## File chính

- Backend: `Features/Production/ProductionLogDtos.cs`, `ProductionLogsController.cs`, `ProductionLogService.cs`, `ProductionLogService.Read.cs`; đăng ký DI và ánh xạ EF trong các file Custom/Production, không sửa entity sinh tự động.
- Database: `database/migrations/V014__production_threshold_versions.sql`.
- Web: `OperatorDailyLog.tsx`, `productionApi.ts`, `ProductionThresholds.tsx`, `ProductionLogForm.tsx`, `ProductionLogHistory.tsx`, `productionLogs.css`.
- Mobile: `api_operator_repository.dart`, `operator_repository.dart`, `operator_models.dart`, `production_thresholds.dart`; form, section ngưỡng, tab lịch sử và màn Hôm nay.
- Test: 5 file partial `ProductionLogTests`, `web/tests/production-logs.spec.ts`, `mobile/test/production_logs_test.dart`, `production_log_widgets_test.dart` và fixture liên quan.

Commit local theo yêu cầu bổ sung của người dùng; không push, merge hoặc chuyển nhánh. Nhánh bàn giao vẫn là `feature/CS-48-nhat-ky-ngay`.
