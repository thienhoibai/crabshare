# CS-50 / KH-08 — Random capture requests

Branch: `feature/CS-50-yeu-cau-chup-ngau-nhien`, from develop after CS-44 and CS-29.

## Behavior

- `CaptureRequestJob.RunAsync` is callable by a shared scheduler. The worker
  runs at startup and every five minutes by default. Disable this worker when
  registering the same job in another scheduler.
- After 09:00 Vietnam time, issue at most one request per InProduction batch
  per calendar day. The farm must be Approved. Select uniformly using the
  cryptographic RNG from currently Occupied boxes with live allocations owned
  by the same farm. Released, available, maintenance, future allocations and
  batches without eligible boxes are skipped.
- Existing Open requests prevent overlapping daily requests. A Fulfilled or
  Expired request issued today also prevents another request today. Restarting,
  repeating or concurrently running the job does not duplicate requests.
- The response window starts when the request is actually issued (default two
  hours), including when the API starts later than 09:00. No backfill of missed
  days is attempted.
- Open requests with `dueAt < now` become Expired. Expiration, its audit and
  EvidenceFlag alerts are committed atomically; failed alert writes roll back
  expiration. Multiple overdue requests for a batch are grouped into one
  alert operation using AlertService's existing deduplication policy.
- Jobs and uploads share the CS-25 audit lock. Lowercase SHA-256, camelCase
  snapshots, UTC millisecond precision and system actor null are preserved.
- `GET /api/operators/me/capture-requests?status=Open&page=1&pageSize=100`
  returns `{ items, total, page, pageSize }`. Items contain id, batchCode,
  slotCode, requestedAt, dueAt, status and fulfilledAt. Status may also be
  Fulfilled or Expired. Current active database role/membership is required;
  requests belonging to other farms are not exposed.
- Existing CS-44 upload verifies the exact batch/box/request, capture time and
  server receipt deadline. A valid, non-Flagged image fulfills an Open request
  with the evidence in one transaction. Duplicates leave the request Open.
  If expiration wins the transaction race, upload cannot overwrite Expired.
- Mobile Today reads the paged Open API and displays loading/error/retry/empty
  states. Countdown updates on the visible screen; the list refreshes every
  minute and on resume. No mock request fallback is used.
- Tapping a request opens the precise box/batch and carries captureRequestId
  through multipart upload. Request mode limits selection to that box and
  disables capture/send after its displayed deadline. Server checks remain
  authoritative. Fulfillment refreshes Today and displays confirmation;
  Flagged evidence continues to require another capture.

## Configuration and schema

`Evidence:CaptureRequests` controls Enabled, IntervalMinutes (5), UtcOffsetHours
(7), DailyRequestHour (9), ResponseWindowMinutes (120) and AlertAckWithinHours
(2). Defaults are explicit development policy, adjustable through configuration.
Invalid settings fail startup. Expiry processing can lag by the worker interval;
mobile disables an overdue request immediately, even if its stored status is
still Open until the next job cycle. Device clock should be set automatically.

No new migration or generated entity changes are required. All workers are
disabled in API tests; job tests use a separate LocalDB database.

## Validation and manual check

Local verification: all 319 API tests and four settlement tests passed with
LocalDB integration enabled. Release build has zero warnings/errors and all
185 API plus four settlement CI tests passed. All 50 Flutter tests passed,
Flutter analysis is clean, the web build passed and the Android debug APK built.
The running dev worker generated one real request for the CS-44 demo batch;
both operator and staff list it through the authenticated API.

Tests cover permissions, validation, farm scoping, live box selection, daily
cutoff/day rollover, concurrent/idempotent jobs, exact deadline, atomic expiry
and alert rollback, lowercase audit integrity, correct photo fulfillment, mobile
pagination, request routing/upload, completion refresh, expired controls and
API errors without mock data. Hardware camera/GPS uses the CS-44 implementation.

For a local phone test, use the CS-44 demo seed if necessary and run the updated
API after the daily cutoff. Sign in as operator or staff, refresh Today, open
the generated request and send a new photo before its deadline. Confirm the
request disappears from Open and is available with status Fulfilled. With a
shorter configured window in a separate dev test, let a request expire and
confirm an EvidenceFlag alert. The rest of Today (production summaries/batches)
still uses its existing repository until the production tasks supply those APIs.

GitHub Actions checks and Vercel deploy status must be reported separately:
the existing Vercel team membership block is an account issue, not resolved by
this feature.

## PR #25 integration with current develop

Merged `develop` at `bc76567` into the CS-50 feature branch and resolved all six
conflicting files. Keep the CS-50 request service/job alongside CS-54 review;
disable capture, alert and reservation-expiry workers in tests. On mobile,
keep the API-backed capture request provider and request metadata routes,
preserve CS-53 packing methods/routes and the Today packing entry point, and
register the harvest route once.

Validation after integration: **427 API tests + four settlement tests** passed
with isolated LocalDB; **52 Flutter tests** passed and analysis found no issues.
The strengthened real-router test additionally opens the packing list and order
detail, returns to Today, opens the exact capture request and submits a photo
through fulfillment. Web source is unchanged from develop; GitHub's web job
checks the integrated commit. Vercel deployment permission remains separate.
