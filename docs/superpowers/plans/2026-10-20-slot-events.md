# VI-09 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. User explicitly requests immediate implementation; no additional approval gate, branch change or commits.

**Goal:** Operator records four box events on web/mobile with intact individual history, camera evidence, configurable rules and concurrency protection.

**Architecture:** Existing vertical slice Production with SQL Server transactions and AlertService. Immutable per-batch policy versions and event detail relations extend current schema. Web and mobile consume the exact contract in the spec.

**Tech Stack:** .NET 10 / EF Core / SQL Server LocalDB; React / TanStack Query / Playwright; Flutter / Riverpod / Dio.

**Spec:** ../specs/2026-10-20-slot-events-design.md

## Global Constraints

- Keep current branch; no commit, push, merge or destructive database operations.
- No hardcoded biological thresholds; farm configuration governs alerts and restock cutoff.
- Death/restock evidence comes from mobile camera, with existing capture validation.
- Do not edit old migrations or generated entity/context files.
- Existing APIs and unrelated flows remain compatible.

## Review Focus

- Retry after success cannot apply the event to a different/new occupant.
- Released/reused destination histories reject retroactive events.
- Evidence of a previous occupant cannot prove an event for the new occupant.
- Restock at midnight and backdating cannot evade the farm's cutoff.
- Alert failure rolls back registry, events, allocation and evidence association.

### Task 1: Backend contracts, transactions and migration

Files: Production/SlotEvent*.cs; persistence partial SlotEvents files; V015__slot_events.sql; FeatureRegistry; minimal EvidenceService/Dtos extension; tests/SlotEventTests*.cs.

Interfaces: exact HTTP/JSON contracts in spec; reuse db.InTransactionAsync and AlertService.RaiseAsync.

- [x] Write HTTP tests for missing routes then run and verify 404 failures.
- [x] Add V015 schema and partial mappings, service/controller and evidence extension.
- [x] Run focused SQL tests; extend tests for policy, calendar boundaries, rights, evidence, rollback and concurrency, fixing each observed failure.
- [x] Verify view counts and preserved source/destination and individual history.

### Task 2: Web event section and policy editor

Files: web/src/features/operator/slotEventsApi.ts, SlotEventsSection.tsx, SlotEventPolicyForm.tsx; OperatorBatchDetail.tsx; web/tests/slot-events.spec.ts.

Interfaces: Task 1 HTTP contract in spec. Independent web files; no backend/mobile edits.

- [x] Write failing Playwright tests for form changes, farm policy, missing evidence/422 and refreshed counts.
- [x] Implement UI with existing components and live API client.
- [x] Run relevant Playwright and npm run build, inspect actual output.

### Task 3: Mobile event screen and camera

Files: mobile/lib/features/operator/slot_events/*; app/routes.dart and router.dart; today/operator_today_page.dart; minimal optional evidence upload parameter; smoke/repository/widget tests.

Interfaces: Task 1 HTTP contract; reuse evidenceCameraProvider and EvidenceRepository with optional slotEventType on upload.

- [x] Add tests before product implementation for repository payload/error, form branching and smoke registration.
- [x] Implement repository/providers, page, camera and navigation; no mock submissions.
- [x] Attempt flutter analyze and flutter test; if SDK unavailable locate existing install, report exact limitation rather than asserting pass.

### Task 4: Integration verification and handoff

- [x] Independent review of actual diff for history, transaction, concurrency and UI API mismatches.
- [x] Run dotnet test backend/CrabShare.sln, web build and Playwright, mobile checks available.
- [x] Compare unrelated failures with baseline when needed; no unrelated refactor.
- [x] Write docs/validation/CS-52-slot-events.md with actual contracts/Bruno JSON, migrations, selected rules, demo and verification results.
- [x] Confirm git branch/status and no commits; hand off concrete result with limitations.


## Execution record 20/10/2026

- Task 1 complete: 54/54 VI-09 HTTP/SQL tests; V015 applied without reset; Lost/harvest and nullable legacy history regressions verified.
- Task 2 complete: 9/9 VI-09 Playwright, full web 135 passed/2 skipped; final build passed.
- Task 3 complete: Flutter analyze clean and full suite 188/188 passed with existing local SDK.
- Task 4 complete: final solution API 932 passed/23 failed, SettlementEngine 4/4 passed. All 23 failing names match original HEAD baseline exactly (baseline 31 passed/23 failed); documented, no unrelated fixes.
- Additional user-authorized scope: authenticated Cloudinary storage, legacy local reads, backend private configuration outside Git; real upload/read/hash/unsigned401/cleanup verified, related storage/evidence/event suite 120/120 passed.
- Fresh independent review of Cloudinary/provider/legacy routing/evidence rollback and VI-09 recording reported no verified P1/P2 findings. Final manual integration and screenshot checks performed.
- No branch changes, commits, pushes, merges or production deployment.
