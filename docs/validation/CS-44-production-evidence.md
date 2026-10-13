# CS-44 / KH-07 — Production evidence capture and upload

## Implemented

- `POST /api/evidence`: authenticated `OperatorMember`, multipart `batchCode`,
  `slotCode`, `capturedAt` (ISO 8601 with offset), `latitude`, `longitude`,
  optional `captureRequestId`, and `image`. Returns 201 with stored metadata,
  `reviewStatus`, `riskScore`, `duplicateMatch`, and nullable detection results.
- Current database role, active user, farm membership, approved farm, active
  production batch, occupied box, and live allocation are checked before image
  processing, then checked again within the SQL transaction.
- Original uploaded bytes are kept under private `Storage:RootPath` using a
  generated filename. Uploaded filenames are not used as storage paths.
  Static JPEG, PNG and WebP are accepted, up to 5 MB and 20 million pixels;
  corrupt, animated and MIME-mismatched input is rejected.
- SHA-256 uses original bytes and lowercase hexadecimal. dHash resizes to 9×8
  using linear sampling, compares adjacent luminance values (`299R+587G+114B`),
  and stores 64 bits as 16 lowercase hexadecimal characters. Comparison uses
  Hamming distance with `Evidence:SimilarityDistance` (default 4).
- Exact SHA duplicate: risk 100; similar dHash: risk 80; both are `Flagged`.
  A capture older than `Evidence:StaleCaptureHours` (default 24) has risk at
  least 40 (`Watch`). More than five minutes in the future returns 400.
  Perceptual similarity is a review signal and can have false positives.
- `ICrabDetector` is called with the original image. The current Noop provider
  records null conclusion/confidence and model `none`. Invalid results or an
  outage record null/null/`unavailable`. A negative model result contributes
  at most 15 risk points and never rejects evidence on its own.
- Evidence, detection, and audit are committed together. An eligible Open
  capture request is fulfilled in the same transaction unless evidence is
  Flagged. Duplicate uploads are serialized using the shared audit lock.
  Audit snapshots/hashes follow the shared CS-25 protocol.
- Failed SQL writes remove the saved file after verifying it is unreferenced.
  If the database is unavailable or commit outcome cannot be determined, the
  file is retained and cleanup is logged for later reconciliation. The same
  processing attempt uses one file URI across database retries.
- A minimal paged `GET /api/boxes?status=&search=&page=&pageSize=` provides
  `{ slotCode, status, batchCode }` scoped to the current farm. `batchCode`
  is populated only for a live allocation to a Stocked/InProduction batch.
  The rest of CS-29 box CRUD remains with the Boxes module owner.
- Mobile capture reads all pages of real occupied boxes, uses the camera only,
  checks location permission, obtains a fresh GPS reading after camera return,
  and uploads bytes with UTC capture time and GPS. It displays server results,
  keeps the photo after upload failure, and prevents simultaneous submissions.
  Photos/results and box data are cleared when the signed-in user changes.

## Database and dependencies

Run the migrator before starting this branch:

```powershell
dotnet run --project backend/tools/CrabShare.DbMigrator
```

`V007__evidence_detection_unknown.sql` makes detection conclusion/confidence
nullable so an absent model is not recorded as a negative result. Entities were
regenerated using `backend/scripts/scaffold-db.ps1`.

SkiaSharp 4.153.1 and its Linux native package implement dHash. This replaces
the planned ImageSharp dependency: current ImageSharp Release builds require
a Six Labors license key ([official documentation](https://docs.sixlabors.com/articles/imagesharp/index.html)).
SkiaSharp includes the [Linux native dependency](https://www.nuget.org/packages/SkiaSharp.NativeAssets.Linux.NoDependencies/)
for GitHub Actions. This changes the image decoder, not the duplicate policy.

## Validation

Local validation: 279 API tests plus 4 settlement tests passed in the full
database-enabled run. After adding storage path/failure tests, the Release
build passed with zero warnings/errors and all 177 CI tests passed (173 API +
4 settlement). All 46 Flutter tests passed, Flutter analysis reported no
issues, the web production build passed, and the Android debug APK built.

Backend integration tests use a fresh LocalDB database and isolated storage.
Coverage includes original byte integrity, capture/server timestamps and GPS,
exact/perceptual duplicates, concurrent uploads, current role revocation,
cross-farm access, released allocations, capture request expiry/fulfillment,
detector outage/invalid output, and SQL rollback with file cleanup. Audit rows
are verified against the shared hash protocol.

Mobile tests cover paginated boxes, multipart metadata, capture cancellation,
GPS denial, pending submission, server Flagged results, upload retry, and box
API failures. Camera/GPS are injected in tests; these tests do not exercise
hardware permissions or the operating system camera.

Manual Android acceptance: connect to this backend via the configured
`API_URL`, sign in as an operator with an allocated production box, allow
camera/location, take a photo and send it. Confirm server metadata and private
image storage. Re-upload the same bytes through the API and confirm Flagged.
Test location denial and airplane mode, then retry. Hardware acceptance is
pending; no Android emulator was used.

If the demo farm has no eligible boxes, run
`powershell -ExecutionPolicy Bypass -File backend/scripts/seed-evidence-demo.ps1`.
This explicitly adds the local `CS44-DEMO-01` batch and boxes 0014–0016, without
resetting other data. It is repeatable and restricted to LocalDB CrabShareDev.

Random capture request generation/listing (CS-50), the reviewer UI/verdict
(CS-54), and a validated crab model (TSK-13) remain separate tasks. Camera-only
selection in the mobile app is not server-side proof of device capture or GPS
authenticity.
