# Production Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Timeline dữ liệu thật, có quyền theo lô và phân trang theo ngày trên backend/web/mobile.
**Architecture:** Service đọc tổng hợp bốn nguồn; controller có xác thực; hai client dùng cùng contract và cơ chế file riêng tư.
**Tech Stack:** .NET 10 / EF Core SQL Server, React / TanStack Query, Flutter / Riverpod / Dio.
**Spec:** docs/superpowers/specs/2026-10-20-production-timeline-design.md

## Global Constraints

- Giữ nhánh hiện tại, không commit/push/merge; không sửa nghiệp vụ nguồn.
- UTC+7, days=7 mặc định, 1–30, before exclusive, whole-day paging.
- Quyền hiện hành trong DB, chỉ evidence Accepted, không trả storage URI/PII.
- Source ID chuỗi; giao diện tiếng Việt và style hiện có.

## Review Focus

- Token cũ và thay đổi membership: server chặn, client xóa dữ liệu.
- Evidence mất Accepted sau khi tải timeline: endpoint file phải chặn.
- Hai nguồn trùng timestamp và ranh giới UTC: không thiếu/trùng ngày.
- Đổi lô hoặc account khi request chậm: hủy request, không hiện kết quả cũ.
- Một ngày nhiều mục và ngày trống xen kẽ: cursor theo nhóm ngày thật.

## Task 1 — API và file riêng tư

Files: Features/Production/Timeline{Dtos,Service,Controller}.cs,
TimelineService.Read.cs, Common/FeatureRegistry.cs,
tests/CrabShare.Api.Tests/TimelineTests.cs.

Produces: GET timeline response và GET timeline/evidence/{id}/file theo spec.

- [x] Viết HTTP tests cho quyền, empty và contract; chạy để thấy route chưa có.
- [x] Thêm access guard, query DTO, service hợp nhất ngày và payload, file route.
- [x] Test cả bốn nguồn, timezone/order/paging, Accepted và quyền file.
- [x] Chạy test mới và dotnet test backend/CrabShare.sln; ghi nhận lỗi nền.

## Task 2 — Web

Files: features/timeline/{timelineApi.ts,BatchTimeline.tsx,timeline.css},
operator/OperatorBatchDetail.tsx, investor/batches/InvestorBatches.tsx,
web/tests/timeline.spec.ts.

Consumes: Task 1 contract. Produces: BatchTimeline({code}) dùng chung.

- [x] Viết Playwright cho rendering, phân trang/refresh/403 và ảnh riêng tư.
- [x] Thêm component timeline responsive, metrics, event, accepted media, alert.
- [x] Tích hợp hai trang, reset theo user/code, hủy request cũ và revoke blob.
- [x] Chạy npm run build và Playwright; kiểm tra ảnh desktop/phone.

## Task 3 — Mobile

Files: investor/data/timeline_repository.dart,
investor/batches/batch_timeline.dart, batch_detail_page.dart,
mobile/test/timeline_test.dart.

Consumes: Task 1 contract. Produces: repository/model và widget BatchTimeline.

- [x] Viết test mapping/paging/repository và widget empty/403/load more.
- [x] Thêm UI và file bằng Dio có token; session/batch reset và cancel.
- [x] Chạy flutter analyze/test hoặc ghi rõ executable không có.

## Task 4 — Bàn giao

Files: docs/validation/CS-59-production-timeline.md.

- [x] Review diff theo năm failure modes, sửa lỗi tìm được và test lại.
- [x] Ghi contract, JSON Bruno, time semantics, demo, test và giới hạn.
- [x] git diff --check; báo file chính và trạng thái xác minh thực tế.

Validation status (21/10): mobile tests authored but not executed; Flutter SDK unavailable. Full backend has 23 matching baseline failures; 8 prior timeouts passed on focused rerun. See docs/validation/CS-59-production-timeline.md for actual evidence and limits.

