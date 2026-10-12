# CS-37 / KH-05 — Operations alerts

Branch: `feature/CS-37-canh-bao-loi`, based on develop.

- `AlertService.RaiseAsync(long batchId, AlertType type, AlertSeverity severity, string message, TimeSpan ackWithin, CancellationToken ct = default)` is available to Production, Catalog and Evidence through DI.
- Repeated raises update the existing Open/Escalated alert, retain the earliest deadline, and never downgrade severity. New occurrences after acknowledgement/resolution can create a new alert.
- GET `/api/operators/me/alerts?status=` and POST `/api/alerts/{id}/acknowledge` use current database role, active user and farm membership. Owner and Staff can respond. Cross-farm IDs return 404.
- GET `/api/batches/{code}/alerts?status=` requires a confirmed contribution or capital share belonging to the current investor.
- A response note of 1–300 characters is required; whitespace-only input returns 400. Duplicate acknowledgement returns 409. Late responses remain Escalated for admin follow-up.
- All mutations use the shared CS-25 audit protocol, including lowercase SHA-256. State changes and audit records commit/roll back together. No schema migration is needed.
- RaiseAsync joins an existing transaction. Callers must acquire `AuditChain.LockAndReadTailAsync` before their business locks, and save any preceding audit entries before calling RaiseAsync. An outer rollback also rolls back the raised alert.
- Water-quality, mortality and stock thresholds are configurable under `Alerts:Thresholds`. Values supplied are development defaults, to be confirmed against the team's SRS before operational use.
- Web uses existing OperatorLayout, Op components and ActionDialog. Mobile uses the existing cards and confirmation sheet with the real alert API; other unfinished operator features retain their existing repository.

Verification: backend tests include concurrent raises, farm isolation, stale roles, investor access, late acknowledgements and audit-chain verification. Browser and Flutter tests cover notes, real request payloads, server status, errors and phone layout. Database tests use an isolated LocalDB database and are excluded from Linux CI.

Local results before CS-40: the full backend suite passed before the last two concurrency/rollback additions; all 18 alert tests then passed. Flutter analysis and all 41 Flutter tests passed, three alert browser tests passed, and web production build passed. The integrated CS-40 run passed all 182 backend and 23 browser tests. NuGet vulnerability feed warnings (NU1900) were observed locally; compilation/tests succeeded.
