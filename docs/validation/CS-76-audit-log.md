# CS-76 / KH-15 — Audit log viewer and export

Branch `feature/CS-76-xuat-nhat-ky-kiem-toan` starts from develop `914f33f`, with the shared safe CSV commit also used by CS-73.

## API and behavior

- Admin-only, no-store `GET /api/admin/audit-log?entityType=&from=&to=&page=1&pageSize=20&throughAuditId=`. Validate active user and current database admin role, not just JWT claims. Rows contain the original event fields and lowercase hashes; no event is inserted, updated, removed, reserialized or rehashed by viewing/exporting.
- Optional inclusive date filters use Vietnam midnight boundaries; type is an exact match. `throughAuditId` fixes the observed prefix for paging and download, including an explicit empty prefix of zero. Refresh obtains a new boundary. Invalid dates, paging or future boundaries return 400.
- Every response checks **the whole observed chain**, independently of filters. `IAuditLog.VerifyChainAsync` verifies chunks of up to 1,000 rows, including predecessor hashes; return the exact first `brokenAuditId` and reason. Filtering out the corrupted event does not hide the warning. Verification does not attest to events appended after the displayed boundary or detect removal of a whole tail without an external trusted checkpoint.
- `GET /api/admin/audit-log/export` returns Excel UTF-8 BOM CSV with verification result, checked count, broken ID/reason and observed boundary before the filtered original events. A broken chain remains exportable as evidence. Maximum 5,000 matching events per export; larger requests require narrower filters. Strings are quoted/formula-safe. Original JSON escapes are preserved so exported evidence corresponds to the hashed source.
- The new `/admin/audit-log` page and admin menu retain existing slate/red styles, support raw text details without HTML execution, stable paging, date/type filters, loading/error/retry/empty states, chain warnings and authenticated CSV download. Shared pagination accepts an optional page size while preserving existing callers' default of 10.

## Verification — 2026-10-16

- Release backend build and **633 API + 4 settlement tests passed**, including isolated LocalDB tests. Seventeen focused query/CSV tests cover permission/validation, current-role revocation, no-store, filtered paging, empty prefix, unchanged history, Unicode/CSV, and >5,000-row verification/export limits.
- A test disables the append-only trigger **only in its isolated test database**, changes one row directly, and confirms the exact corrupted ID appears in both filtered list and CSV. It restores that test row and re-enables the trigger. No application or server audit rows were altered.
- Web build passed; **94 browser tests passed**, 2 existing real-API cases skipped without isolated configurations. Six audit scenarios cover actual CSV download, filter-independent corruption warnings, escaping, new-tail refresh, paging, failures and role routing. Final six scenarios rerun after a 390px filter-layout correction; screenshots inspected.
- Existing audit hash writer and legacy verifier protocol are unchanged. Existing transitive Pkcs warning remains visible for CS-88 remediation.
- Production audit routes remain unavailable until this reviewed PR is merged/deployed. Source/test artifacts and screenshots are under ignored `.artifacts/sprint3/`.
