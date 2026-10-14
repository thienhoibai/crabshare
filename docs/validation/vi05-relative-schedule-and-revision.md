# VI-05 sửa lịch theo mốc và luồng bổ sung hồ sơ

Ngày 14/10/2026. Nhánh `feature/CS-34-duyet-lo`, không commit/push/checkout. Phạm vi người dùng chốt: sửa ý 1 (lịch theo mốc thực tế) và ý 2 (bổ sung/gửi lại khác từ chối dứt điểm). Không thay đổi chính sách phí hoặc quyền xem dữ liệu thương mại trong lượt này.

## Lịch theo mốc

Hộ nuôi chọn `anchorCode` và `offsetDays` thay vì bắt buộc biết trước ngày giải ngân:

```json
{
  "trancheNo": 1,
  "anchorCode": "FundingReady",
  "offsetDays": 0,
  "unlockCondition": "Đủ vốn và hợp đồng hai bên đầy đủ chữ ký"
}
```

- `FundingReady`: đã đóng vốn (`capital_closed_at`), số vốn chốt đạt min_viable_capital, tổng các khoản Confirmed khớp số chốt và mọi khoản Confirmed có hợp đồng FullySigned. Mốc là thời điểm muộn hơn giữa đóng vốn và chữ ký hoàn tất cuối cùng, không phải ngày Admin duyệt hoặc ngày dự kiến hết hạn.
- `Stocked`: đã có mốc FundingReady và stocked_at không trước mốc đó. Hộ nuôi tự chọn số ngày không âm sau mốc, ví dụ đợt giữa vụ là 15 ngày sau thả giống. Không áp tỷ lệ hoặc ngày cố định cho từng đợt.
- Khi chưa có mốc, disbursement_tranche.planned_date là null và UI hiện **Chờ mốc thực tế**. Không tạo ngày giả. Job `TrancheScheduleJob` kiểm tra theo `Batches:Schedules:IntervalSeconds` (mặc định 60 giây); `Jobs:Enabled=false` tắt job. Job bỏ qua sớm nếu chưa có dữ liệu cần kiểm tra.
- Khi có mốc, hệ thống xác định ngày theo UTC+07 rồi cộng offset, ghi audit `disbursement_tranche/schedule_resolved`. Chỉ xác định một lần, không tự dời ngày đã xác định. Khoản chi vẫn Planned; đây không phải duyệt chi hoặc lệnh chuyển tiền.
- Ngân sách, items và quy tắc lịch trong cost version Locked vẫn bất biến. Ngày thực hiện thuộc bảng tranche vận hành, không cập nhật ngược baseline đã khóa. Đổi lịch sau thỏa thuận cần luồng chấp thuận riêng của hợp đồng/giải ngân, chưa triển khai ở đây.
- Các lịch ngày tuyệt đối V008 đã có được giữ nguyên, không đoán mốc để chuyển đổi. UI cho chủ hộ chuyển một lịch nháp cũ sang lịch theo mốc bằng thao tác rõ ràng. API vẫn đọc/ghi lịch ngày cũ hợp lệ; không được trộn ngày tuyệt đối và mốc trong cùng một đợt.
- Cảnh báo MilestoneDelay bổ sung trường hợp đợt FundingReady đã có ngày và quá hạn khi lô vẫn Funding; lịch chưa xác định ngày không bị cảnh báo quá hạn.

## Bổ sung và từ chối

- POST `/api/admin/batches/{code}/request-revision`, body `{reason}`: Admin hiện hành, tài khoản Active, chỉ PendingApproval; lý do bắt buộc, tối đa 300 ký tự. Chuyển về **Draft**, ghi lý do và audit `request_revision`. Không phí/tranche/account/khóa chi phí do thao tác này.
- Giữ nguyên version Submitted cũ khi trả hồ sơ. Khi chủ hộ lưu chi phí đã sửa, version cũ thành Superseded và tạo Draft kế tiếp; cả items và lịch cũ vẫn được giữ. Gửi lại bằng endpoint submit hiện có → PendingApproval, version mới Submitted. Lý do đang hiển thị được xóa khi gửi lại thành công; audit giữ đầy đủ lý do và dữ liệu trước/sau.
- POST reject giữ trạng thái **Rejected**, nay là từ chối dứt điểm: không sửa, không gửi lại. Không thêm trạng thái mới; bổ sung cạnh PendingApproval → Draft trong state machine đã được người dùng chốt.
- Admin có ba lựa chọn riêng: duyệt, yêu cầu bổ sung, từ chối. Hộ nuôi thấy lý do yêu cầu bổ sung trong editor. Các thao tác đều dùng transaction/audit/kiểm tra quyền server hiện có; approve và request-revision chạy đồng thời chỉ một thao tác thành công.

## Migration và scaffold

V009 `relative_disbursement_schedule.sql` làm nullable planned_date ở plan/tranche, thêm anchor_code/offset_days và CHECK phân biệt lịch tuyệt đối/theo mốc. Không sửa V001–V008.

Entity DisbursementTranche được scaffold thật bằng dotnet-ef 10.0.12 từ SQL Server test đã áp V009; chỉ lấy entity cần thay đổi từ thư mục scaffold tạm, không ghi đè DbContext/những entity khác. Mappings bổ sung nằm trong partial handwritten.

Chạy DbMigrator như thường trên DB dev được xác nhận trước khi dùng API mới. Chưa áp V009 vào CrabShareDev. Rollback phải theo thứ tự mới nhất trước; script rollback V009 từ chối nếu đã có lịch tương đối để tránh mất quy tắc đã công bố. Khi đã dùng lịch mới, cần giữ schema hoặc phục hồi backup phù hợp, không tự mở khóa chi phí.

## Kiểm chứng thực tế

- `dotnet test backend/CrabShare.sln --verbosity normal`: **542 API + 4 SettlementEngine pass**, không fail/skip. Gồm trả hồ sơ/sửa/version mới/gửi lại, Rejected terminal, approve đấu với request-revision, resolver chờ hợp đồng/đóng vốn/thả giống và audit một lần, cảnh báo quá hạn, cùng test khóa/rollback/tiền/phí/hồi quy cũ.
- `dotnet build backend/CrabShare.sln --no-restore --verbosity quiet`: pass, 0 warning/error. Web `npm run lint` và `npm run build`: pass.
- Playwright với VI04_API_URL/VI05_API_URL trên API thật cô lập: **11/11 pass**, không skip. Ca API thật đã lưu/tải lại mốc và số ngày, gửi duyệt → Admin yêu cầu bổ sung → hộ nuôi sửa/gửi lại → version 2 được duyệt/Locked → tranche chờ mốc, rồi thử sửa bị chặn. Có luồng từ chối dứt điểm lô khác. Kiểm tra ảnh desktop và 390px, không tràn ngang toàn trang.
- DB riêng `CrabShareVI05ReviseTests_20261014`, migrations V001–V009. Đã rollback/reapply V009 thành công khi DB trống; sau khi có relative plans, rollback bị chặn bằng 51009 và dữ liệu/cột được giữ nguyên. Không dùng mock/in-memory để khẳng định behavior SQL.
- Review độc lập read-only: không có Critical/Important. Góp ý về cảnh báo FundingReady trước stocking đã được bổ sung bằng test thất bại rồi sửa.

Giới hạn: các mốc chỉ có thể xác định khi module đóng vốn/ký hợp đồng/thả giống đã ghi dữ liệu thực tế vào DB. Không coi status Funding hoặc tới fundingDeadline là đủ điều kiện. Chưa có luồng thương lượng đổi mốc sau ký hoặc tự giải ngân; sandbox và thanh toán phí giữ phạm vi bản trước.

API browser đã dừng; DB kiểm thử riêng đã được xóa sau khi kiểm chứng. Bản build/typecheck cuối pass. Không commit/push hoặc đổi nhánh.
