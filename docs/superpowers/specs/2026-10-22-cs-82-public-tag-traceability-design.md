# CS-82 Public Tag Traceability Design

## Goal

Complete the existing CrabShare public tag traceability flow so a customer can scan a VI-15 tag in mobile or open its printed QR URL on web, see data from the real backend, and have a valid public scan recorded without exposing private farm or image data.

## Current Repository State

- The active branch is `feature/CS-82-truy-xuat-tem`, based on `develop`; the working tree was clean during discovery.
- Backend already has `GET /api/trace/{tag}`, `TraceService`, a dedicated response DTO, active/void checks, and cache prevention.
- Web already has the `/truy-xuat/:tagCode` route, API client/query, and responsive trace page.
- Mobile already has the trace result page/repository and `mobile_scanner: ^7.4.2`; the scanner page is still a visual placeholder with manual code entry.
- VI-15 emits a 12-character code in a URL at `/truy-xuat/{tagCode}`. Keep that QR contract unchanged.
- `v_traceability` contains fields beyond the public contract, including harvest photo URI, scan count, operator legal name/address, and order number. Public responses must continue to project only an explicit allowlist.
- `tag_scan` permits anonymous scans (`scanned_by` nullable), defaults `is_order_owner` to false, and timestamps scans in SQL Server.

## Design

### Backend contract and public data

Keep the existing `GET /api/trace/{tagCode}` endpoint and its dedicated `TraceResponse`; explicitly mark this action anonymous without changing authorization on sibling harvest/tag routes. Validate the existing 12-character tag alphabet before querying. Return the existing error conventions for malformed, missing, Printed, and Void tags, and only return trace details for Active tags with a matching `v_traceability` row.

The response is an allowlist projection, never a serialized entity or full view row. It includes the tag code, batch code, crab type, box/slot identifier, public lifecycle dates, harvest grade/weight, and safe event types/timestamps. It excludes `harvest_photo_uri`, all image URLs/metadata, scan counts, order identifiers, internal item identifiers, event notes, contact details, and personal/private operator identity or precise farm address. The current view's `operator_name` maps to `operator.legal_name`, so it is not treated as a public display name. Do not create a migration or broaden database access for this task.

If a verified public operator/farm display field already exists, it can be included only after confirming it is not a personal contact or private address; otherwise the page presents batch and box provenance without identifying the household. Include order-journey information only if an existing relationship provides public-safe order events; do not expose an order number or infer a journey from internal status fields.

For a valid Active public lookup, insert one `tag_scan` row with the matching `tag_id`; leave `scanned_by` null and use the schema default for `is_order_owner=false` and SQL timestamp. Do not log malformed, missing, Printed, or Void tag attempts. Scan insertion is best-effort: a write failure must not prevent a valid trace response, and any diagnostic logging must avoid tag data and personal data where possible. The normal HTTP request is one scan attempt; clients must avoid duplicate requests from repeated QR callbacks or component remounts.

### Web

Preserve the existing `/truy-xuat/:tagCode` direct-entry route and use the shared API client/query. Keep loading, retry, invalid/not-found/not-active/void/network error states. Ensure the page renders only fields present in the public contract and never uses a reusable evidence/photo component. Validate that a page load from the QR URL works without authentication and does not issue duplicate API calls.

### Mobile

Use the already-present `mobile_scanner` package after confirming current Flutter SDK constraints and the package's official platform/setup guidance; do not change framework or large dependency versions. Replace the placeholder scanner with the real camera scanner. Parse only the established VI-15 URL or raw 12-character tag code, then navigate once to the existing result route and call the existing API repository. Pause/stop the camera when a code is accepted or the route leaves view; handle permission denial, camera initialization errors, invalid payloads, and retry/rescan paths. Do not introduce a WebView or mock result.

### Error and lifecycle behavior

Malformed codes fail before database access. Backend exceptions use existing ProblemDetails/error mapping and never return raw SQL details. Mobile request state uses existing Riverpod/Dio patterns; public trace requests remain anonymous in effect even if the shared client attaches a logged-in user's bearer token. Camera and result navigation must be disposed or paused when leaving the scanner to prevent repeated API calls.

## Verification

- Backend tests cover anonymous success, valid active tag projection, 404/malformed/Printed/Void handling, grade and weight source data, omission of image/private fields, scan insertion semantics, and scan-write failure behavior.
- Web tests cover direct route loading, the real API call, loading/success/error states, no auth requirement, and no image/private fields.
- Mobile tests cover QR parsing, duplicate callbacks, real API repository/result wiring, denied permission and initialization/network/API errors, and returning to scan.
- Run supported backend, web, and mobile build/lint/test commands. Report any unavailable database/device/emulator verification separately; automated scanner tests do not establish camera hardware behavior.
- Keep the QR code/URL emitted by VI-15 unchanged and do not merge the branch.

## Scope boundaries

No changes to VI-15 tag printing/activation behavior, schema migrations, tag QR format, authentication policy outside the trace action, camera platform permission patterns outside this scanner, or unrelated harvest/order flows.
