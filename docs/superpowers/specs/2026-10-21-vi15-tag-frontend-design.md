# CS-74 / VI-15 — Frontend Design

## Goal and boundary

Connect the existing harvest, evidence capture, and trace screens to the CS-74 backend APIs. The basic operator flow is: harvest creates a `Printed` tag; the farm prints a QR label; the operator captures one confirmation photo from the app; after review, the operator explicitly activates the tag using the Evidence ID. Customers scan or enter the tag code and see trace data only when the tag is `Active`.

This phase covers the web and mobile clients. It does not implement printer hardware integration, automatic tag activation, or the exceptional replacement workflow after `Packed`/`Delivered`. Preserve the existing harvest and KH-07 capture flows.

## Existing code and API contracts

- Web uses React 19, React Router, TanStack Query, Axios, and `qrcode.react`; styles follow the existing operator feature classes and UI components.
- Mobile uses Flutter, Riverpod, Dio, GoRouter, `image_picker`, and `mobile_scanner`. `CapturePage` and `ApiEvidenceRepository` already implement app-camera capture, location, and multipart upload for occupied boxes.
- Backend tag APIs are already implemented on the current branch:
  - `GET /api/tags?status=Printed|Active|Void&page=1&pageSize=20`
  - `GET /api/tags/{tagCode}/label` → `{tagCode,traceUrl}`
  - `POST /api/tags/{tagCode}/activate` → `{evidenceId}`
  - `POST /api/tags/{tagCode}/void` → `{reason}`; owner-only and only while crab is `InStock`
  - `POST /api/evidence` accepts multipart `tagCode` for the harvest confirmation capture
  - public `GET /api/trace/{tagCode}` returns only `Active` trace details
- Tag list responses do not contain evidence/review state. The upload response returns `id` and `reviewStatus`; after leaving that result, the operator must enter the Evidence ID again to retry activation. The server remains authoritative and rejects evidence that is not accepted or does not belong to the tag's crab.

## User experience

### Web operator — tag management and printing

- Add an Operator route/page reachable from existing harvest navigation.
- List tags with `Printed`, `Active`, and `Void` filters and pagination using `GET /api/tags`.
- For each `Printed` tag, request the label payload and show the tag code plus QR for `traceUrl`. Allow selecting multiple Printed tags and printing them on a 40 × 30 mm label sheet using browser print CSS. The page must print the supplied URL and code; it must not create codes or change tag status.
- Provide an owner-only void/replace action with a required reason and a clear confirmation. After success, show the replacement `Printed` tag and allow printing its label. Surface the backend conflict for crabs no longer `InStock`; do not offer a Packed/Delivered override.
- No web photo-capture or activation workflow is required in this phase; the existing in-app camera flow is mobile-only.

### Mobile operator — capture and manual activation

- Add an authenticated tag screen reachable from the existing Operator navigation and harvest result. It lists `Printed` tags from the API and supports refresh.
- Open the existing `CapturePage` in a `tagCode` mode. Reuse its current camera, location, image validation, progress, and error handling; submit `tagCode` instead of batch/slot, without changing ordinary KH-07 capture.
- After upload, display Evidence ID and review status. When the response is `Accepted`, show a separate explicit “Kích hoạt tem” action. Never activate automatically as a side effect of upload.
- For `Watch` or `Flagged`, show a review-pending message and keep the Evidence ID visible. The operator may later enter that ID manually and submit activation; the API accepts only `Accepted`. On other statuses or IDs, show the API message and retain the tag as Printed.
- On success, refresh the tag list and show the Active state/result. Keep the existing void/replacement operation on web in this basic phase.

### Public trace — web and mobile

- Replace the web placeholder and mobile mock repository with the actual public trace endpoint.
- Render tag code, batch/crab type, grade/weight, operator/farm, slot, stocked/harvested timestamps, and event history from the API response. Preserve privacy: do not expose harvest-photo URLs or Evidence internals.
- Show understandable empty/error states for unknown, void, and not-yet-active tags; never render mock trace data as if it were real.
- Keep the existing mobile manual tag-code entry and route. The current viewfinder is a placeholder, so this phase does not claim real camera scanning; trace lookup uses the same public API as the web route.

## Visual and accessibility direction

Reading this as: an extension of CrabShare's existing farm-operations interface for operators working at a farm and customers scanning a tag, with a practical, trust-first visual language that follows the current web operator components and mobile Material-based application theme.

- Reuse established navigation, colors, spacing, typography, form controls, loading states, and status badges on both clients.
- Make statuses understandable in text and color; keep actions keyboard-accessible on web and touch-friendly on mobile.
- Printing uses a dedicated monochrome 40 × 30 mm layout with QR code and legible tag code; hide application navigation and controls in print media.
- Include loading, empty, retry/error, upload result, pending-review, and activation-confirmation states.

## Data flow and failure behavior

- Use existing API clients and authenticated request configuration; do not add dependencies unless the repo lacks a needed capability.
- Keep server data in TanStack Query/Riverpod. Invalidate relevant tag queries after activation or replacement.
- Upload and activation are separate requests. The activation button is explicit, disabled while in flight, and repeat attempts rely on backend idempotency.
- Keep the evidence ID in the immediate capture result. Do not persist photos, signed media URLs, or unaccepted evidence credentials locally.
- Treat server authorization/state responses as authoritative; no client-only permission or lifecycle bypass.
- Trace calls are public and unauthenticated by contract; never cache trace results in the client beyond normal short-lived screen state.

## Acceptance criteria

1. A web operator can view paged tags by status, select Printed tags, preview/print their real QR labels at 40 × 30 mm, and does not activate a tag by printing.
2. An Operator Owner can void/replace an eligible Printed or Active tag with a reason; Staff cannot see/complete that owner action, and server conflicts are clearly shown.
3. A mobile operator can list Printed tags, capture an in-app photo in tag context, see Evidence ID/review status, explicitly activate only after an Accepted response, and see the list update after success.
4. Watch/Flagged uploads remain pending; manual later activation submits the retained or re-entered Evidence ID and is enabled only through a deliberate user action.
5. Existing non-tag KH-07 capture and harvest flows continue to use their current batch/slot contracts.
6. Web and mobile trace screens consume the real endpoint; only Active tags render trace details, while unknown/Void/Printed states show safe explanatory states.
7. Web build and mobile analyze complete successfully; focused UI/API client tests cover the acceptance cases where the existing test harness supports them.

## Deferred

- Packed/Delivered replacement exception policy and order-history representation.
- Physical printer pairing, printer-specific calibration, and hardware validation.
- Automatic activation after Evidence Reviewer decision or remote notification/polling for review completion.
- Retaining Evidence IDs across app reinstall/account change or adding a server endpoint that lists evidence by tag.
