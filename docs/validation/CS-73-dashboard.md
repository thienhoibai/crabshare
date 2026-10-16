# CS-73 / KH-14 — Dashboard and reports

Branch `feature/CS-73-dashboard`, based on develop `914f33f` (includes CS-69).

## Live endpoints

- `GET /api/admin/dashboard?from=yyyy-MM-dd&to=yyyy-MM-dd`: current database admin role and active user required. Read-only, no-store, serializable snapshot. Confirmed contribution capital by Vietnam calendar day; current batches by status; current escalated alerts; orders placed in the period by status; completed-order revenue by completion date; Payout instructions created in the period by status; succeeded Payout amount by completion date. No expected-return or mock revenue claims.
- `GET /api/operators/me/dashboard?from=&to=&batchCode=`: active, currently approved farm membership and database role required. Farm identity comes from the current membership; mismatched token claims are rejected. Active-batch Growing crab count, open/escalated alerts, still-actionable capture requests, today's missing production logs, Paid/Packed orders, actual daily average pH/temperature and latest logs. Foreign/non-active batch codes return 404.
- `GET /api/admin/reports/{name}.csv`: whitelist `capital`, `batches`, `orders`, `payouts`; same snapshot/calculation as the dashboard. UTF-8 BOM, quoted fields, CRLF and formula-safe string cells; no bank details or customer addresses. Unknown names return 404. Exports use authenticated HTTP, not an unauthenticated browser URL.

Dates are inclusive local Vietnam dates, implemented as `[start +07:00, next-day +07:00)`; default 30 days, maximum 366 days. Future timestamps never contribute to period totals. Capital includes currently Confirmed receipts, excluding Reserved/Refunded; it is not a durable gross-cash-flow ledger. State counts are current unless explicitly labelled as a period cohort. An order placed earlier can contribute completed revenue today; likewise an older payment instruction can finish today without being in today's created-instruction cohort.

Admin keeps its existing slate/red cards and Recharts layout; farm UI keeps OperatorLayout, OpStat/OpPanel/OpTodo and its warm palette. Both use cancellation/account-scoped query keys, refresh, date validation, empty/error/retry states. No migration or audit writer/hash change.

## Validation — 2026-10-16

- Release build succeeded. 632 API tests + 4 settlement-engine tests passed, including isolated SQL Server LocalDB tests.
- 16 dashboard/CSV tests cover real SQL grouping across UTC offsets, midnight/exclusive boundaries, exact VND totals, completed/succeeded versus created cohorts, current role revocation, forged farm claims, foreign batch IDs, read-only audit counts, CSV UTF-8 and field quoting/formula safety.
- Web production build succeeded; 93 browser tests passed, 2 existing real-API scenarios skipped without their isolated configurations. Five new dashboard tests cover authenticated data/CSV download, filters, actual integer values, failures/recovery/empty states, and both mobile layouts.
- Desktop/390px screenshots inspected; ignored artifacts `.artifacts/sprint3/cs73-*.png`. Full logs under `.artifacts/sprint3/`.
- Existing transitive Pkcs 9.0.11 NU1902/NU1903 warnings are visible, not suppressed. Dependency remediation is part of CS-88 security review.
- Existing public API `/api/health/live` and `/ready` return 200; admin/operator/investor demo login returns 200, boxes/KYC/portfolio reads return 200. Dashboard/audit endpoints are 404 on the current server until the reviewed feature PRs are merged/deployed. No production business data was changed by this validation.

GitHub CI is checked after pushing the PR. Production deployment and real-device acceptance are tracked separately under CS-80/84/92.
