# CS-74 / VI-15 Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend foundation for tag label data, Evidence-backed tag activation, void/replacement, and safe public trace lookup.

**Architecture:** Add an optional harvested-crab context to KH-07 Evidence uploads, then implement tag reads and lifecycle writes in the Harvest feature using its existing authorization, audit, transaction, and code-generation patterns. Add a public trace endpoint that returns data only for Active tags and uses the configured public trace base URL for labels.

**Tech Stack:** ASP.NET Core .NET 10, EF Core, SQL Server, DbUp SQL migrations, xUnit, WebApplicationFactory.

**Spec:** `docs/superpowers/specs/2026-10-21-vi15-tag-backend-design.md`

## Global Constraints

- Work on the existing `feature/CS-74-in-kich-hoat-tem` branch; do not switch branches or create a worktree.
- Do not commit, push, or merge.
- Do not edit an applied migration; add forward-only `V017__...sql` for the nullable evidence-to-crab reference and FK.
- Reuse VI-14's 12-character generator and existing uniqueness constraints; do not generate a code during label GET.
- Require `Accepted` photo evidence for activation. Evidence in `Watch` or `Flagged` must be decided by an Evidence Reviewer; Operators cannot set review state.
- Do not add a unique constraint that limits evidence to one tag. Evidence linked to a crab may be reused only for that same crab.
- In this phase, void/replace only `Printed` or `Active` tags while the crab is `InStock`; require Operator Owner and a non-empty trimmed reason.
- Do not return trace details for `Printed` or `Void`; never redirect a void tag URL to a replacement.
- Do not add printer hardware integrations or claim real printer/camera tests.
- API JSON uses camelCase; errors follow the existing ProblemDetails code convention.

## Review Focus

- Cross-Operator tag/evidence IDs must not disclose labels, photos, or trace data. Test current database membership and owner scoping on direct routes.
- A stale, rejected, non-photo, non-InAppCapture, Watch, Flagged, or wrong-crab evidence ID must not activate a tag. Test each status/media/context gate.
- Concurrent/repeated activation and void requests must not create duplicate events or multiple non-void tags. Test same-evidence replay, different-evidence conflict, and concurrent replacement.
- Direct public trace requests must hide Printed and Void data even when called without the web page; verify cache headers prevent stale Active content after void.
- Failed writes or code collisions must roll back the whole replacement and preserve the old tag and event history. Test rollback and migration behavior without fabricating or deleting evidence.

---

### Task 1: Persist the Evidence-to-crab context

**Files:**
- Create: `database/migrations/V017__evidence_crab_item.sql`
- Modify: `backend/scripts/scaffold-db.ps1` only if the migration introduces another table or view (the existing `evidence` table is already scaffolded)
- Regenerate: `backend/src/CrabShare.Api/Infrastructure/Persistence/Entities/Evidence.cs`
- Regenerate: `backend/src/CrabShare.Api/Infrastructure/Persistence/AppDbContext.cs`
- Test: `backend/tests/CrabShare.Api.Tests/TagTests.Persistence.cs`

**Interfaces:**
- Produces: nullable `Evidence.CrabItemId` and `Evidence.CrabItem` navigation, mapped to `evidence.crab_item_id`; the migration adds the nullable `BIGINT` column, FK to `crab_item(crab_item_id)`, and an index. The FK is not unique.
- Existing evidence rows remain `NULL`; no evidence is synthesized or reassigned.

- [ ] **Step 1: Add a failing SQL persistence test** asserting an Active tag without evidence fails `ck_crab_tag_active`, a valid evidence FK persists, and an invalid crab-item FK fails.
- [ ] **Step 2: Run the targeted test** with `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~TagTests.Persistence --no-restore --verbosity quiet`.
  Expected: new schema assertions fail before migration/entity updates.
- [ ] **Step 3: Add V017** with a nullable evidence-to-crab column, FK, and non-unique lookup index. Include a preflight guard only for data the migration actually depends on; preserve all existing evidence rows.
- [ ] **Step 4: Apply V017 to the isolated test/development database and regenerate entities** using `backend/scripts/scaffold-db.ps1`; do not hand-edit generated entity/context files.
- [ ] **Step 5: Run the targeted test again** and confirm null legacy evidence remains valid, the FK works, and the existing Active/evidence CHECK still rejects invalid rows.

### Task 2: Add harvest-tag Evidence upload and manual review for Watch

**Files:**
- Modify: `backend/src/CrabShare.Api/Features/Evidence/EvidenceDtos.cs`
- Modify: `backend/src/CrabShare.Api/Features/Evidence/EvidenceService.cs`
- Modify: `backend/src/CrabShare.Api/Features/Evidence/EvidenceReviewService.cs`
- Test: `backend/tests/CrabShare.Api.Tests/EvidenceControllerTests.cs`
- Test: `backend/tests/CrabShare.Api.Tests/EvidenceDatabaseTests.cs`
- Test: `backend/tests/CrabShare.Api.Tests/EvidenceReviewDatabaseTests.cs`

**Interfaces:**
- Consumes: Task 1's `Evidence.CrabItemId` mapping.
- Produces: optional multipart field `tagCode` on `POST /api/evidence`. Without it, preserve the existing KH-07 flow. With it, resolve the tag's crab, batch, and historical slot; require a current Operator Owner/Staff membership, approved Operator, and `Printed` tag; persist `CrabItemId` along with the normal KH-07 photo metadata.
- Produces: `EvidenceReviewService.CanReview` permits a `Watch` row with no prior decision to be reviewed; preserve the existing `Flagged` explanation/re-review rules. `Pass`, `Fail`, and `NeedMoreEvidence` continue to map to `Accepted`, `Rejected`, and `Flagged`.

- [ ] **Step 1: Write failing tests** for valid post-harvest tag-context upload, wrong Operator, non-Printed tag, preserving ordinary uploads, reviewer Pass/Fail on Watch, reviewer conflict, and inability for Operator to set the review state.
- [ ] **Step 2: Run** `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter "FullyQualifiedName~EvidenceControllerTests|FullyQualifiedName~EvidenceDatabaseTests|FullyQualifiedName~EvidenceReviewDatabaseTests" --no-restore --verbosity quiet`.
  Expected: new tag-context and Watch-review cases fail.
- [ ] **Step 3: Add optional `TagCode` to `UploadEvidenceRequest`** and branch the existing `EvidenceService` context resolver. For a tag capture, derive the historical batch and slot from the Printed tag's crab; continue through existing image validation, private storage, duplicate detection, risk scoring, and audit flow.
- [ ] **Step 4: Persist the resolved crab ID** for tag-context uploads. Do not create a separate image upload endpoint or a uniqueness rule for evidence reuse.
- [ ] **Step 5: Extend reviewer eligibility for Watch** and preserve audit, investor-conflict, and concurrent-decision guards.
- [ ] **Step 6: Run the targeted Evidence tests** and confirm both legacy capture and new review behavior pass.

### Task 3: Implement paged tag list and label API

**Files:**
- Create: `backend/src/CrabShare.Api/Features/Harvest/TagsController.cs`
- Create: `backend/src/CrabShare.Api/Features/Harvest/TagsService.cs`
- Create: `backend/src/CrabShare.Api/Features/Harvest/TagsDtos.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/README.md`
- Modify: `backend/src/CrabShare.Api/appsettings.json` and environment-specific settings only for the `Trace:PublicBaseUrl` key
- Test: `backend/tests/CrabShare.Api.Tests/TagTests.Read.cs`

**Interfaces:**
- `GET /api/tags?status=Printed&page=1&pageSize=20` returns the existing Operator's paged Printed tags. Use the shared `PageQuery` and `ToPagedAsync()` convention.
- `GET /api/tags/{tag}/label` returns `{ tagCode, traceUrl }` plus only label product fields present in the approved model; `traceUrl` is built from configured `Trace:PublicBaseUrl` plus `/truy-xuat/{tag}`.
- Both endpoints use `[Authorize(Policy = Policies.Operator)]` and recheck current Active membership, Owner/Staff role, Operator approval, and tag ownership in the database.

- [ ] **Step 1: Write failing HTTP tests** for list paging/scoping, valid label URL, configured base URL, Void rejection, unknown tag, and cross-Operator denial.
- [ ] **Step 2: Run** `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~TagTests.Read --no-restore --verbosity quiet`.
  Expected: endpoint routes are not found.
- [ ] **Step 3: Implement `TagsController` and `TagsService`** with read-only queries; label GET never changes tag state or generates a code.
- [ ] **Step 4: Add validated trace URL configuration** and test startup/label behavior with a non-local configured base URL.
- [ ] **Step 5: Run the targeted tag read tests** and confirm no foreign tag data is returned.

### Task 4: Implement activation transaction

**Files:**
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsController.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsService.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsDtos.cs`
- Test: `backend/tests/CrabShare.Api.Tests/TagTests.Activation.cs`

**Interfaces:**
- Consumes: Task 1 Evidence-crab mapping, Task 2 upload/review rules, and Task 3 tag authorization.
- `POST /api/tags/{tag}/activate` accepts `{ evidenceId }`; returns the active tag and recorded evidence ID.
- Produces: same-evidence replay returns success without another event/audit; a different evidence ID after Active returns conflict.

- [ ] **Step 1: Write failing activation tests** for Accepted success, missing/foreign/wrong-crab evidence, non-photo/source mismatch, Watch/Flagged/Rejected, Void tag, duplicate replay, different-evidence conflict, and concurrent activation.
- [ ] **Step 2: Run** `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~TagTests.Activation --no-restore --verbosity quiet`.
  Expected: route is absent.
- [ ] **Step 3: Implement serializable activation** with the shared audit lock, live Operator membership check, evidence eligibility check, `Active` update, activation evidence/time, `TagActivated` event, and audit record in the same transaction.
- [ ] **Step 4: Make replay behavior explicit**: same evidence ID returns persisted state without duplicate event/audit; different evidence ID conflicts.
- [ ] **Step 5: Run activation tests** and add direct SQL assertions that Active cannot be stored without evidence and that the evidence FK is enforced.

### Task 5: Implement void and replacement transaction

**Files:**
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsController.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsService.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/TagsDtos.cs`
- Test: `backend/tests/CrabShare.Api.Tests/TagTests.Void.cs`

**Interfaces:**
- `POST /api/tags/{tag}/void` accepts `{ reason }` and returns the voided tag plus replacement tag details needed for label printing.
- Allowed old states: `Printed` or `Active`, with crab `InStock`, Operator Owner only. New tag is `Printed`, same crab, fresh code, no activation evidence.
- A second request for an already-void tag returns conflict and never creates another replacement.

- [ ] **Step 1: Write failing tests** for blank/trimmed reason validation, permitted Printed and Active replacement, denial for Staff, denial for Packed/Delivered, no inherited evidence, repeated void, unique-code collision, and rollback after a forced mid-transaction failure.
- [ ] **Step 2: Run** `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~TagTests.Void --no-restore --verbosity quiet`.
  Expected: route is absent.
- [ ] **Step 3: Implement the serializable replacement transaction** with existing Owner checks, audit lock, VI-14 code generator, old `Void` state/reason/time, new Printed row, `TagVoided`/`TagPrinted` events, and audit records.
- [ ] **Step 4: Retry only recognized `uq_crab_tag_tag_code` collisions**, using the existing bounded retry convention; other SQL conflicts must not be mislabeled as code collisions.
- [ ] **Step 5: Run void tests** and directly assert only one non-void tag can exist per crab.

### Task 6: Implement safe public trace lookup

**Files:**
- Create: `backend/src/CrabShare.Api/Features/Harvest/TraceController.cs`
- Create: `backend/src/CrabShare.Api/Features/Harvest/TraceService.cs`
- Create: `backend/src/CrabShare.Api/Features/Harvest/TraceDtos.cs`
- Modify: `backend/src/CrabShare.Api/Features/Harvest/README.md`
- Test: `backend/tests/CrabShare.Api.Tests/TagTests.Trace.cs`

**Interfaces:**
- Public `GET /api/trace/{tag}` returns the approved `v_traceability` fields and existing crab-item event history only when the tag is Active.
- Void returns the existing ProblemDetails shape with code `tag.void` and message “Tem đã bị hủy”; Printed returns no product trace details; unknown code is 404.
- Responses set non-cacheable headers so a previously Active result is not retained after void.

- [ ] **Step 1: Write failing direct HTTP tests** for Active payload, Void code/message/no trace data, Printed no trace data, unknown tag 404, and cache headers.
- [ ] **Step 2: Run** `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~TagTests.Trace --no-restore --verbosity quiet`.
  Expected: route is absent.
- [ ] **Step 3: Implement the public route and service**. Filter tag status in the server query before projecting any `v_traceability` fields; return event history ordered by `OccurredAt` and event ID.
- [ ] **Step 4: Run direct API tests** for all tag states; do not rely on the web route to hide invalid codes.

### Task 7: Update feature contract and run backend verification

**Files:**
- Modify: `backend/src/CrabShare.Api/Features/Harvest/README.md`
- Create: `docs/validation/CS-74-vi15-backend.md`

- [ ] **Step 1: Document Bruno request/response examples** for tag list, label, evidence upload with `tagCode`, reviewer decision for Watch, activate, void, and trace.
- [ ] **Step 2: Run targeted regression tests** for Harvest, Evidence capture, and Evidence review.
- [ ] **Step 3: Run** `dotnet test backend/CrabShare.sln --no-restore --verbosity quiet`.
- [ ] **Step 4: Record exact commands, pass/fail counts, unrelated baseline failures, migration application, and limitations** in the validation report. Do not claim printer or camera hardware verification.
- [ ] **Step 5: Review `git diff --check`, inspect the final changed-file list, and confirm no branch switch or commit occurred.**
