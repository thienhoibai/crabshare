# CS-74 / VI-15 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing web and mobile screens to the CS-74 tag printing, confirmation-photo, manual activation, and trace APIs.

**Architecture:** Keep API access in the existing web Axios/TanStack Query and mobile Dio/Riverpod repositories. The web operator page manages tag lists, browser printing, and owner-only replacement; mobile reuses the existing KH-07 camera screen in tag mode and handles explicit activation; both public trace pages use the same backend endpoint.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Axios, `qrcode.react`; Flutter, Dart, Riverpod, Dio, GoRouter, existing `image_picker`/location capture.

**Spec:** `docs/superpowers/specs/2026-10-21-vi15-tag-frontend-design.md`

## Global Constraints

- Stay on the existing `feature/CS-74-in-kich-hoat-tem` branch and do not commit or push.
- Preserve all current uncommitted backend changes; this plan changes web/mobile only.
- Keep Evidence upload and tag activation as separate, explicit user actions; only Accepted Evidence may activate.
- Keep regular KH-07 box evidence upload using its existing batch/slot request.
- Void/replacement remains limited by backend rules to an eligible crab in `InStock`; do not add a Packed/Delivered override.
- Use existing packages and CrabShare UI patterns; add no dependencies.
- Do not add or run tests in this implementation unless the user asks for tests; run the web build and Flutter analyzer for compile/type verification.

## Review Focus

- Ordinary KH-07 upload still sends `batchCode` and `slotCode`; tag confirmation sends `tagCode` only. Manually exercise both paths and compile both clients.
- Evidence upload with `Accepted` still requires a separate activation tap; `Watch`/`Flagged` displays Evidence ID and pending review without activation. Manually exercise each response state.
- Wrong, rejected, or foreign Evidence IDs are submitted only by an explicit user action; show the server's error and keep the tag Printed. Manually exercise API failure rendering.
- Owner and Staff see different void controls, and backend conflicts after `Packed`/`Delivered` remain visible. Manually inspect role display and exercise an ineligible response.
- Public trace displays details only on success and gives clear states for unknown, Void, and Printed tags. Manually exercise each API response.

## File Map

- Web API: create `web/src/features/operator/tagsApi.ts` for tag list, label, activation/void request types and calls.
- Web tag management: create `web/src/features/operator/OperatorTags.tsx` and `web/src/features/operator/tags-print.css`; modify `web/src/app/router.tsx`, `web/src/features/operator/OperatorLayout.tsx`, and `web/src/features/operator/OperatorHarvest.tsx` for route/navigation.
- Web trace: create `web/src/features/trace/traceApi.ts`; modify `web/src/features/trace/TracePage.tsx` and create `web/src/features/trace/trace.css` as needed.
- Mobile tag flow: create `mobile/lib/features/operator/tags/tag_repository.dart` and `tags_page.dart`; modify `mobile/lib/app/routes.dart`, `mobile/lib/app/router.dart`, `mobile/lib/features/operator/harvest/harvest_page.dart`, `mobile/lib/features/operator/evidence/capture_page.dart`, and `mobile/lib/features/operator/evidence/evidence_repository.dart`.
- Mobile trace: modify `mobile/lib/features/trace/trace_repository.dart` and `trace_result_page.dart`.

### Task 1: Mobile tag data and tag-context evidence capture

**Files:**
- Create: `mobile/lib/features/operator/tags/tag_repository.dart`
- Modify: `mobile/lib/features/operator/evidence/evidence_repository.dart`
- Modify: `mobile/lib/features/operator/evidence/capture_page.dart`
- Modify: `mobile/lib/app/routes.dart`
- Modify: `mobile/lib/app/router.dart`

**Interfaces:**
- `TagPage` maps `{items,total,page,pageSize}`; each item maps `{tagId,tagCode,status,batchCode,itemUuid,printedAt}`.
- `TagLifecycle` maps `{tagId,tagCode,status,activationEvidenceId,activatedAt}`.
- `TagRepository.list({required String status, int page = 1}) -> Future<TagPage>` calls `GET /api/tags`.
- `TagRepository.activate(String tagCode, int evidenceId) -> Future<TagLifecycle>` calls `POST /api/tags/{tagCode}/activate`.
- Add `EvidenceRepository.uploadForTag({required String tagCode, required EvidencePhoto photo}) -> Future<EvidenceResult>`; preserve existing `upload({required BoxSlot box,...})` unchanged.
- Add `Routes.captureTag(String tagCode)`; pass optional `tagCode` into `CapturePage` from GoRouter.

- [ ] Add the tag DTOs/repository/provider using the current Dio provider, JSON field names, paging convention, and API error behavior.
- [ ] Add the isolated `uploadForTag` path that posts `tagCode`, capture metadata, and image; do not include `batchCode` or `slotCode` in that multipart request.
- [ ] Add optional `tagCode` capture mode to `CapturePage`; reuse camera, GPS, image limits, progress, and errors, while leaving the occupied-box mode unchanged.
- [ ] In tag mode, display returned Evidence ID/review status; render a separate activation action only for `Accepted`, call `TagRepository.activate`, and show pending-review state for `Watch`/`Flagged`.
- [ ] Add route parsing and run `flutter analyze` from `mobile/`; expected: no analyzer errors.

### Task 2: Mobile tag list, activation retry, and harvest entry point

**Files:**
- Create: `mobile/lib/features/operator/tags/tags_page.dart`
- Modify: `mobile/lib/app/routes.dart`
- Modify: `mobile/lib/app/router.dart`
- Modify: `mobile/lib/features/operator/harvest/harvest_page.dart`

**Interfaces:** consumes Task 1 `TagRepository`, `TagPage`, `Routes.operatorTags`, and `Routes.captureTag`.

- [ ] Build a refreshable `Printed` tag list with loading, empty, and retry states; show tag code and crab/batch identifiers.
- [ ] Each tag row opens capture in tag mode and provides a manual Evidence ID field for a reviewer-approved upload that is being resumed later; activation remains an explicit button and the API remains authoritative.
- [ ] After activation, invalidate/refetch the Printed list and show a success state; preserve the error and entered Evidence ID on failure.
- [ ] Add `Routes.operatorTags`, the authenticated Operator route, and a harvest result link to tag management; run `flutter analyze` from `mobile/`, expected: no analyzer errors.

### Task 3: Mobile public trace from live API

**Files:**
- Modify: `mobile/lib/features/trace/trace_repository.dart`
- Modify: `mobile/lib/features/trace/trace_result_page.dart`

**Interfaces:** `TraceRepository.lookup(String tagCode)` uses public `GET /api/trace/{tagCode}` and maps the backend `TraceResponse` and `TraceEventResponse` fields.

- [ ] Replace `MockTraceRepository` with a Dio-backed repository using the existing `dioProvider`; map dates, nullable weight/grade, farm address, slot and event note safely.
- [ ] Remove demo-only labels/data from `TraceResultPage`; render only API response details and expose appropriate failure states for `tag.not_found`, `tag.void`, and `tag.not_active`.
- [ ] Keep the existing manual code route, avoid displaying image/evidence internals, and run `flutter analyze` from `mobile/`, expected: no analyzer errors.

### Task 4: Web tag management, label preview/print, and replacement

**Files:**
- Create: `web/src/features/operator/tagsApi.ts`
- Create: `web/src/features/operator/OperatorTags.tsx`
- Create: `web/src/features/operator/tags-print.css`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/features/operator/OperatorLayout.tsx`
- Modify: `web/src/features/operator/OperatorHarvest.tsx`

**Interfaces:** tag API wrappers use shared `http`; `OperatorTags` uses TanStack Query and existing operator UI components.

- [ ] Add typed paginated tag list, label, and owner-only void/replace request functions using existing `/api/tags` contracts.
- [ ] Add status filters (`Printed`, `Active`, `Void`), pagination, refresh/error/empty states, and selection for Printed tags.
- [ ] Load label payloads for selected tags and render real QR codes with `QRCodeSVG`; print selected labels in monochrome 40 × 30 mm layout using `@page`/print media rules. Do not mutate tag state while viewing or printing.
- [ ] Show void/replace controls only to Operator Owner, require reason and confirmation, then show the replacement tag and printable label. Surface server state conflicts.
- [ ] Register `/operator/tags`, add navigation and harvest entry point, then run `npm --prefix web run build`; expected: TypeScript and Vite build pass.

### Task 5: Web public trace from live API

**Files:**
- Create: `web/src/features/trace/traceApi.ts`
- Modify: `web/src/features/trace/TracePage.tsx`
- Create/modify: `web/src/features/trace/trace.css`

**Interfaces:** `getTrace(tagCode, signal?) -> Promise<TraceResponse>` calls public `GET /api/trace/{tagCode}` with the shared HTTP client and React Query.

- [ ] Define the response type to match `TraceResponse` and map event data without exposing any photo/evidence values.
- [ ] Replace placeholder copy with the live provenance summary, dates, grade/weight, farm, slot, and event timeline.
- [ ] Render loading, retry, unknown, Void, and not-active states from the API error codes; never show mock trace details.
- [ ] Run `npm --prefix web run build`; expected: TypeScript and Vite build pass.

## Self-review

- Spec coverage: operator printing and replacement are Task 4; mobile upload/activation is Tasks 1–2; web/mobile live trace is Tasks 3 and 5; preserving existing KH-07 is explicitly pinned in Task 1 and Review Focus; lifecycle conflicts and privacy are covered in Review Focus and acceptance behavior.
- Interface consistency: Task 1 defines `TagRepository`, DTOs, upload-for-tag method, and route names used by Task 2. Task 3 owns its independent mobile trace adapter. Task 4 owns web operator API/UI; Task 5 owns the public trace adapter.
- Scope: no physical printer, automatic activation, backend changes, tag-evidence listing endpoint, packed/delivered exception, test additions, or commit is included.
- Verification: mobile tasks run `flutter analyze`; web tasks run the existing production build. No test command is added because the user has not requested test runs.
