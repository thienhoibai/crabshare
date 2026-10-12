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

Local validation: all 18 alert backend tests passed; Flutter analysis and all 41 Flutter tests passed; four alert browser tests cover confirmation, conflicts, phone layout and cache isolation across accounts. Web production build and the Android debug APK build passed. The combined CS-37/CS-40 backend run passed all 182 tests. NuGet emitted NU1900 warnings because its vulnerability feed was unavailable locally.
