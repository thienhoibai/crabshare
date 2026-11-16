# VI-13 Mutation Testing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Đo và cải thiện chất lượng test SettlementEngine bằng Stryker.NET (CS-67).

**Architecture:** Dùng local .NET tool và cấu hình ngay trong test project hiện có. Chạy toàn engine, giữ nguyên mutant tương đương trong mẫu số và giải thích trong báo cáo.

**Tech Stack:** .NET 10, xUnit, FsCheck, Stryker.NET.

**Spec:** CS-67 / VI-13 và mô tả task người dùng cung cấp trong chat.

## Global Constraints

- Người dùng tự tạo nhánh; không tạo nhánh/worktree, commit hoặc push.
- Chỉ VI-13; không mở rộng sang yêu cầu ≥10 property × 1.000 ca của VI-12.
- Không đổi nghiệp vụ để tăng mutation score.

## Review Focus

Khôi phục local tool từ test directory; chỉ mutate engine; kiểm tra validation và tie-break; phân biệt mutant tương đương với test thiếu; lưu HTML/JSON có thể đối chiếu với kết quả thực.

## Task 1: Mutation testing và kết quả

- [x] Pin dotnet-stryker trong backend/dotnet-tools.json, thêm stryker-config.json vào test project với reporters HTML/JSON/progress.
- [x] Chạy baseline trên 13 test hiện có; lưu số liệu và danh sách mutant sống sót.
- [x] Thêm xUnit test bắt các lỗi thực được mutant chỉ ra; chạy lại test và Stryker để chứng minh mutant bị diệt.
- [x] Xuất HTML/JSON; ghi score trước/sau và giải thích từng mutant còn sống trong docs/validation/CS-67-mutation-testing.md.
- [x] Cập nhật backend/README.md với lệnh restore, test và mutation; kiểm chứng lệnh, chạy backend suite không cần CSDL và kiểm tra diff.

## Verification ledger

- Local tool restore từ test directory: pass, Stryker 5.0.0.
- Baseline 63,46% → cuối 81,73%, 19 mutant mới bị diệt; không sửa engine.
- Lượt cuối backend suite: 37 engine + 352 API test pass, filter Category!=Database.
- HTML có component/report nhúng, không cần external script; HTML/JSON được giữ nguyên bản từ Stryker.
- Không tạo nhánh/worktree, commit, push hoặc cập nhật Jira.
