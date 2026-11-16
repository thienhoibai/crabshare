# CS-82 Public Tag Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the public tag trace flow across backend, web, and mobile while preserving the VI-15 QR format, recording eligible scans, and limiting public data to an allowlist.

**Architecture:** Complete the existing `TraceController`/`TraceService` endpoint and DTO, React trace route, and Flutter scanner/result route. Keep tag validation and QR parsing aligned with VI-15’s 12-character alphabet and `/truy-xuat/{tagCode}` URL. Use `tag_scan` only for valid Active tags and never return private operator fields, event notes, order identifiers, or image data.

**Tech Stack:** ASP.NET Core 10, EF Core, SQL Server, React 19, React Router 7, TanStack Query 5, Playwright, Flutter/Dart, Riverpod 3, Dio 5, `mobile_scanner` 7.4.2.

**Spec:** [2026-10-22-cs-82-public-tag-traceability-design.md](../specs/2026-10-22-cs-82-public-tag-traceability-design.md)

## Global Constraints

- Preserve the QR contract emitted by VI-15: a 12-character tag code in `/truy-xuat/{tagCode}`.
- Only Active tags with a valid trace row produce public trace data; Printed and Void tags never do.
- The public response is an explicit DTO allowlist and excludes image data, operator legal/private identity and precise farm address, scan counts, item identifiers, event notes, and order identifiers.
- Anonymous valid lookups create `tag_scan` rows with `scanned_by = null` and `is_order_owner = false`; scan write failure does not fail the trace lookup.
- Do not add a database migration, alter tag printing/activation, change framework/dependency major versions, or merge the branch.
- Mobile already has `mobile_scanner: ^7.4.2` locked to 7.4.2. `pubspec.yaml` declares Dart `^3.13.5`; the package supports Dart 3.7+. iOS camera usage text and Android camera permission are already configured.
- Follow existing Vietnamese UI copy, API error mapping, authorization boundaries, and framework test conventions.

## Review Focus

1. A malformed code or a URL that merely ends in 12 alphanumeric characters must be rejected before API navigation; accept a host-independent HTTP(S) URL only when its path exactly matches `/truy-xuat/{tagCode}`, and cover it in `trace_code_parser_test.dart`.
2. Printed, Void, missing, and malformed tags must not create scan rows; cover statuses and scan counts in `Trace_returns_status_errors_without_recording_scans`.
3. A valid Active tag must return only allowlisted fields and record exactly one anonymous scan; cover response JSON and persisted `tag_scan` in `Trace_is_anonymous_and_returns_allowlist_with_one_scan`.
4. A scan insert failure must not hide an otherwise valid lookup; cover the failure path in `Trace_scan_write_failure_does_not_fail_lookup`.
5. Repeated QR callbacks or a camera permission/init error must not open repeated result routes or leave scanning active; cover scan gating and permission/error UI in `scan_page_test.dart`.

---

### Task 1: Public backend trace contract and scan recording

**Files:**
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TraceController.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TraceService.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsDtos.cs`
- Modify: `backend/tests/CrabShare.Api.Tests/HarvestTests.TagApi.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/README.md`

**Interfaces:**
- Consumes: `HarvestTagCodeGenerator.Length == 12`; `HarvestTagCodeGenerator.Alphabet == "23456789ABCDEFGHJKMNPQRSTUVWXYZ"`; existing `TraceResponse` endpoint at `GET /api/trace/{tag}`; `AppDbContext.CrabTags`, `VTraceabilities`, `CrabItemEvents`, and `TagScans`.
- Produces: `GET /api/trace/{tag}` explicitly anonymous; public `TraceResponse` containing `tagCode`, `batchCode`, `crabType`, `itemStatus`, `weightG`, `gradeCode`, `gradeName`, `stockedAt`, `harvestedAt`, `slotCode`, and `events` with only `eventType`/`occurredAt`. Existing web/mobile consumers will be updated in later tasks to this response shape.

- [ ] **Step 1: Add failing database/API tests** in `HarvestTests.TagApi.cs`:
  - `Trace_is_anonymous_and_returns_allowlist_with_one_scan`: use `fixture.Factory.CreateClient()` without test auth against an activated tag, assert 200, expected grade/weight/box/dates, exactly one new scan with null `ScannedBy` and false `IsOrderOwner`, and no private/image/order/internal fields in JSON.
  - `Trace_returns_status_errors_without_recording_scans`: exercise malformed code, missing code, Printed tag, and Void tag; assert validation/404/business errors and no new scan rows.
  - `Trace_scan_write_failure_does_not_fail_lookup`: inject a test SQL command failure for the scan insert, assert the valid trace still returns 200 and does not leak database details.
  - Assert unrelated operator tag/harvest endpoints remain protected using existing authorization tests; do not broaden anonymous access.

- [ ] **Step 2: Run the new backend tests and verify they fail**

Run: `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~Trace_`

Expected: failures identify the current response privacy leak, missing scan write, and any absent anonymous/invalid-code behavior.

- [ ] **Step 3: Implement the public contract**
  - Mark only `TraceController.Get` with `[AllowAnonymous]`.
  - Validate length and characters against `HarvestTagCodeGenerator` before database queries.
  - Project only the DTO allowlist from the view/event source; omit legal name, address, `ItemUuid`, event note, image URI/metadata, scan count, and order number.
  - After an Active tag and complete trace row have been verified, create one `TagScan` with the tag ID, anonymous actor, and false order-owner flag. Preserve SQL timestamp default; catch/log scan-write exceptions without exposing tag/user/database details and do not swallow request cancellation.
  - Keep no-store response headers and existing status/error conventions.

- [ ] **Step 4: Run focused backend tests**

Run: `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~Trace_`

Expected: all trace tests pass against the SQL Server test fixture.

- [ ] **Step 5: Update Harvest README contract**

Document the exact anonymous allowlist, valid scan rule, ignored invalid states, and best-effort insert behavior in the existing feature README.

- [ ] **Step 6: Commit backend changes**

```powershell
git add backend/src/CrabShare.Api/Features/Harvest/TraceController.cs backend/src/CrabShare.Api/Features/Harvest/TraceService.cs backend/src/CrabShare.Api/Features/Harvest/TagsDtos.cs backend/tests/CrabShare.Api.Tests/HarvestTests.TagApi.cs backend/src/CrabShare.Api/Features/Harvest/README.md
git commit -m "feat: secure public tag trace API and record scans"
```

### Task 2: Web direct QR route and public response rendering

**Files:**
- Modify: `web/src/features/trace/traceApi.ts`
- Modify: `web/src/features/trace/TracePage.tsx`
- Modify: `web/src/features/trace/trace.css` (only if layout needs updates after removing private fields)
- Test: `web/tests/traceability.spec.ts`

**Interfaces:**
- Consumes: Task 1 `TraceResponse` fields and `GET /api/trace/{tagCode}`; existing route `/truy-xuat/:tagCode` and shared `http` client.
- Produces: QR direct-entry page with loading, success, malformed/not-found/not-active/void, retry, and network error states; render only fields in the Task 1 DTO.

- [ ] **Step 1: Add Playwright coverage** in `traceability.spec.ts`:
  - Load `/truy-xuat/23456789ABCD` directly with no authenticated session; fulfill exactly one `/api/trace/23456789ABCD` request and assert route-driven API use.
  - Assert allowlisted batch/box/date/grade/weight/event data renders, and operator identity/address, image data, item UUID, event note, and order number do not appear.
  - Assert loading, not-found, not-active/void, and network-error/retry states.

- [ ] **Step 2: Run the new Playwright spec and verify it fails**

Run: `npx playwright test tests/traceability.spec.ts`

Expected: failures identify fields that are removed from the response and any state behavior not yet covered.

- [ ] **Step 3: Align types and page with the backend allowlist**

Update `TraceResponse` and rendering in `traceApi.ts`/`TracePage.tsx` to remove private fields and preserve resilient rendering of nullable grade/weight/harvest date/events. Keep query key, shared API client, retry behavior, and route unchanged.

- [ ] **Step 4: Run web verification**

Run: `npx playwright test tests/traceability.spec.ts` and `npm run build` from `web/`.

Expected: Playwright assertions pass and TypeScript/Vite production build completes.

- [ ] **Step 5: Commit web changes**

```powershell
git add web/src/features/trace/traceApi.ts web/src/features/trace/TracePage.tsx web/src/features/trace/trace.css web/tests/traceability.spec.ts
git commit -m "feat: align web trace page with public API"
```

### Task 3: Mobile real QR camera flow and result contract

**Files:**
- Create: `mobile/lib/features/trace/trace_code_parser.dart`
- Modify: `mobile/lib/features/trace/scan_page.dart`
- Modify: `mobile/lib/features/trace/trace_repository.dart`
- Modify: `mobile/lib/features/trace/trace_result_page.dart`
- Test: `mobile/test/features/trace/trace_code_parser_test.dart`
- Test: `mobile/test/features/trace/scan_page_test.dart`
- Test: `mobile/test/features/trace/trace_repository_test.dart`
- Inspect (change only if official setup requires it): `mobile/ios/Runner/Info.plist`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/pubspec.yaml`

**Interfaces:**
- Consumes: VI-15 raw code or QR URL `/truy-xuat/{tagCode}`; Task 1 public API fields; existing public mobile routes `Routes.scan`, `Routes.trace(tagCode)` and `TraceResultPage`/`traceProvider`.
- Produces: `String? parseTraceTag(String raw)` that accepts only a raw valid 12-character code or an absolute HTTP(S) URL with path exactly `/truy-xuat/{tagCode}`. The deployment host can vary by environment, so validate the URI shape without hardcoding a host; scanner performs at most one navigation per accepted code until reset; result page reads only public DTO fields.

- [ ] **Step 1: Add parser and scan-flow tests**
  - `parseTraceTag` accepts valid uppercase/lowercase raw codes after normalization and the exact VI-15 trace URL.
  - It rejects invalid alphabet/length, non-HTTP(S) schemes, paths other than `/truy-xuat/{tagCode}`, extra path segments, query-only codes, empty payloads, and malformed URLs; it accepts deployment hosts without hardcoding a domain.
  - Widget tests prove repeated detections navigate once; invalid detections stay on the scanner; permission denial and camera initialization errors show actionable states; returning from a result permits a new scan.

- [ ] **Step 2: Add response repository tests**

Assert `ApiTraceRepository.lookup` calls the encoded `/api/trace/{tagCode}` endpoint, maps nullable harvest fields/events correctly, and does not require image/private properties in JSON.

- [ ] **Step 3: Run focused Flutter tests and verify they fail**

Run: `flutter test test/features/trace` from `mobile/`.

Expected: parser, scanner behavior, and the revised public response model tests fail before implementation.

- [ ] **Step 4: Implement parser, camera lifecycle, and result model**
  - Use `MobileScanner` with QR-only detection and its documented controller lifecycle; stop/pause before navigation and dispose on page teardown/app backgrounding.
  - Use a scan latch to ignore callback bursts; reset it only when the scanner becomes active for another scan.
  - Surface permission denial, camera initialization failure, malformed payload, and manual retry/rescan affordances; never display a mocked trace.
  - Update `TraceResult`/`TraceResultPage` to Task 1 allowlisted fields and preserve the shared Dio/Riverpod API flow.
  - Do not add a package or change framework versions. Keep existing Android CAMERA and iOS `NSCameraUsageDescription` setup unless [official mobile_scanner 7.4.2 guidance](https://pub.dev/packages/mobile_scanner) reveals a missing required setting.

- [ ] **Step 5: Run Flutter tests, analyzer, and build**

Run from `mobile/`: `flutter test test/features/trace`, `flutter analyze`, and `flutter build apk --debug`.

Expected: automated scanner/parser/repository tests pass, analyzer reports no new issues, and the Android debug build succeeds. Report that camera hardware behavior remains unverified unless tested on a physical device/emulator.

- [ ] **Step 6: Commit mobile changes**

```powershell
git add mobile/lib/features/trace/trace_code_parser.dart mobile/lib/features/trace/scan_page.dart mobile/lib/features/trace/trace_repository.dart mobile/lib/features/trace/trace_result_page.dart mobile/test/features/trace mobile/ios/Runner/Info.plist mobile/android/app/src/main/AndroidManifest.xml mobile/pubspec.yaml
git commit -m "feat: scan public trace tags with mobile camera"
```

## Final branch verification

- [ ] Run backend API tests, web Playwright trace test plus production build, and mobile trace tests/analyzer/build. Record database/device limitations explicitly.
- [ ] Inspect `git diff develop...HEAD` and `git status --short --branch`; confirm changes are limited to CS-82 and no user edits were overwritten.
- [ ] Confirm the `TraceResponse` JSON shape matches on backend, web, and mobile, and that VI-15 QR URLs remain unchanged.
- [ ] Report changed files, API example, allowlist exclusions, scan logging semantics, QR URL behavior, scanner version/platform configuration, verification results, and remaining VI-15/device constraints. Do not merge.
