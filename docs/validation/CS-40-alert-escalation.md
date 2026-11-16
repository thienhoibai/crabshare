# CS-40 / KH-06 — Alert escalation and admin follow-up

Branch: `feature/CS-40-canh-bao-leo-thang`, created from develop and includes the CS-37 dependency. Merge CS-37 first.

Local validation after integrating CS-36 from develop: 204 backend tests passed (200 API + 4 Settlement), 26 browser tests passed, 41 Flutter tests passed; Flutter analysis, web production build and Android debug APK build passed. NuGet emitted NU1900 warnings because its vulnerability feed was unavailable locally; compilation and tests succeeded.

- `AlertJob.RunAsync` is a callable cycle for the shared scheduler. `AlertJobWorker` runs it at startup and every 15 minutes using BackgroundService/PeriodicTimer, the mechanism described in the repository architecture. No scheduler from TH-02 is currently merged into develop.
- `Alerts:Jobs` controls Enabled, IntervalMinutes, UtcOffsetHours (7), DailyLogDueHour (18) and AckWithinHours (2). The deadline/hour values are explicit development defaults. Invalid job settings fail startup. Disable this worker when registering the same job in a shared scheduler.
- Open alerts with `ack_deadline < now` become Escalated, using the same predicate as `v_overdue_alerts`. The injectable clock is the sole source of time; each cycle is atomic, serialized with the CS-25 audit chain, and safe to run concurrently from multiple hosts.
- After the local daily cutoff, InProduction batches without a log dated today receive DataSilence. Planned tranches dated before today on Stocked/InProduction batches receive MilestoneDelay. Requested/released tranches and inactive batches do not raise milestone warnings.
- Daily rules skip existing Open/Escalated alerts and any occurrence already raised today, including ones acknowledged/resolved today. Overdue tranches are grouped per batch. Repeating the cycle does not multiply alerts or escalation audit entries.
- GET `/api/admin/alerts?status=Escalated&severity=&q=&page=&pageSize=` supports current database admin permissions, search and pagination. POST `/api/admin/alerts/{id}/resolve` requires `{ note }` of 1–300 nonblank characters.
- Resolution retains the farm's response and stores the admin note in the immutable, lowercase-hashed audit record. Admin GET returns that persisted note for resolved rows. Repeated resolution or acknowledgement after closure returns 409.
- Web keeps AdminLayout/table/badges/filter styles. Only PlatformAdmin can open the page. Camera/contact/freeze sample actions are replaced with the implemented resolution dialog.
- No schema migration or generated entity edits are required. API tests disable automatic workers; job tests invoke cycles directly against an isolated LocalDB database and cover cutoffs, Vietnam dates, idempotence, concurrent workers, permissions and audit integrity.

Phone/emulator manual validation remains separate from automated Flutter and browser tests. The water and stock thresholds are configurable dev values pending confirmation against the team's SRS.
