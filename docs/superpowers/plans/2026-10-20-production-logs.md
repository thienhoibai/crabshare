# Production Logs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and parallel workers with exclusive file ownership. Steps use checkboxes for tracking.

**Goal:** VI-08 manual daily logs on web/mobile, evaluated using thresholds configured by the Operator for each batch.

**Architecture:** Existing Production vertical slice, EF/SQL Server with immutable threshold versions; existing AlertService joins the log transaction. React and Flutter use the same REST contract.

**Tech Stack:** .NET 10, SQL Server/DbUp, React/TanStack Query, Flutter/Riverpod/Dio.

**Spec:** ../specs/2026-10-20-production-logs-design.md

## Global Constraints

- Work in current branch; no commits, push, merge or destructive data changes.
- No preset safety thresholds. Owner configures all three water ranges; Staff records measurements.
- InProduction and Harvesting can record; today is server UTC+7. Configure before first log.
- Keep existing unique (batch_id, log_date, source). Server owns source/actor/date/flag.
- Threshold/config audit, log and WaterQuality alert commit or roll back together.
- Fixed fields/units; no dynamic metric builder, IoT or ingestion implementation.

## Shared Contract

ThresholdVersion: {id,versionNo,phMin,phMax,waterTempMinC,waterTempMaxC,salinityMinPpt,salinityMaxPpt,createdBy,createdAt}.

GET /api/batches/{code}/production-thresholds: {businessDate,canConfigure,canRecord,current:ThresholdVersion|null}.
PUT same path: {expectedVersionNo,phMin,phMax,waterTempMinC,waterTempMaxC,salinityMinPpt,salinityMaxPpt}; returns ThresholdVersion.

POST /api/batches/{code}/production-logs: {ph,waterTempC,salinityPpt,feedKg,note?}; returns 201 DailyLog.
DailyLog: {id,batchCode,logDate,ph,waterTempC,salinityPpt,feedKg,note,source,plausibilityFlag,recordedBy,createdAt,thresholdVersion:number|null,thresholdsApplied:ThresholdVersion|null}.

GET same path and GET /api/operators/me/production-logs use from/to/page/pageSize; return {items,page,pageSize,total}. Date-descending then id-descending.

GET /api/operators/me/production-batches?page=&pageSize=: paged {batchCode,title,crabType,status,cycleDays,seedQuantity,aliveCount,dayOfCycle,latestLog,loggedToday,canRecord,businessDate}; includes Stocked/InProduction/Harvesting. Preserve Harvesting for other callers. Form permits InProduction/Harvesting and explains missing configuration.

Errors use ProblemDetails {code,detail}; conflict production.log_exists, production.thresholds_changed; missing configuration 422 production.thresholds_required.

## Review Focus

- Race between changing thresholds and writing logs preserves one coherent threshold version.
- A duplicate request cannot modify existing alert/audit history.
- Legacy logs have no threshold version and remain readable without inventing evaluation history.
- Switching accounts invalidates cached Operator data; never briefly display another Operator's records.
- Midnight business date comes from server, independent of device timezone.

## Task 1 Backend and Database

- [x] Extend HTTP/LocalDB tests first for configuration, Owner/Staff, concurrency, custom alerts, version preservation, filters and rollback. Confirm failure on missing endpoint (initial three tests already failed with 404).
- [x] Add V014 threshold version table and optional log reference, custom EF mappings without editing generated entities.
- [x] Implement DTO/controller/service, DB authorization, Serializable audit-first transaction and existing AlertService integration.
- [x] Run ProductionLogTests and existing Alert/Stocking tests; resolve regressions.

## Task 2 Web

- [x] Add Playwright tests first for configuration/log submit/conflict/alert display.
- [x] Implement productionApi.ts and replace OperatorDailyLog demo using existing Op components.
- [x] Run build/lint and relevant Playwright tests; inspect desktop/mobile screenshots.

## Task 3 Mobile

- [x] Add repository/state/widget tests first for JSON, 409, configuration, refresh and retaining Harvesting.
- [x] Implement real Operator repository for daily log flows and threshold UI; keep unrelated existing features intact.
- [ ] Flutter analyze/test: executable not found; attempted and documented. Runtime verification remains unavailable.

## Task 4 Verify and Handoff

- [x] Independent code review after workers finish, fix material findings with regression tests.
- [x] Run full backend/web/mobile checks, document background failures by name.
- [x] Write CS-48 validation guide with contract, Bruno examples, migration/demo and exact results.

## Execution Ledger

- User follow-up: explicitly requested a local commit after reviewing the verification limitations. This supersedes the earlier no-commit instruction; no push, merge or branch switch is authorized.

- Ruling: Continue implementation under the user's earlier explicit instruction to implement and latest choice of customizable thresholds; do not repeat authorization requests for the same work.
- Ruling: Keep fixed four metrics; only water safety ranges are configurable. Do not claim biological defaults are authoritative.
- Ruling: Include Harvesting as proposed in the most recent user-facing explanation; preserve ongoing care during partial harvest.
- Ruling: Allow negative water temperatures down to the rounded absolute-zero bound; zero is not a universal physical minimum for saline water.
- Baseline: Initial ProductionLogTests 0/3 pass (expected 404 because routes do not exist), run against isolated LocalDB; no production DB changes.

- Final verification 20/10/2026: API 869 passed/23 failed; all 104 VI-08 cases passed. SettlementEngine 4/4 passed.
- Baseline comparison: exported unmodified HEAD Batches/BatchReview tests 31 passed/23 failed; exact failed test-name sets match final TRX (0 differences).
- Web build/lint passed; complete Playwright suite 126 passed/2 skipped, including all 12 production cases.
- Mobile: Flutter analyze/test attempted but SDK absent; WASM Dart parser/formatter passed for all 13 changed/new Dart files. Do not claim mobile type/runtime verification.
- Independent review: fixed date-scoped loggedToday, draft retention on fetch errors, and account-safe successful-mutation cache invalidation outside widget lifetime. Follow-up reviewer found no actionable issues.
- Migrator applied all outstanding V004–V014 to local CrabShareDev successfully, without reset; user-facing handoff documents this.
- Final artifacts: docs/validation/CS-48-production-logs.md with API contracts, Bruno JSON, validation/date/threshold semantics, migration/demo, commands/results and complete baseline failure list.
