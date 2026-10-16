# CS-69 / KH-13 — Mobile midterm polish

Branch: `feature/CS-69-hoan-thien-mobile`, created from `origin/develop` at `4d3226d`.

## Changes

- Shared static skeletons use the existing card palette and an accessible loading label. Errors remain scrollable on short screens. All API list/detail states support pull-to-refresh or retry without an uncaught refresh exception.
- Refresh failures show a readable network message. Malformed validation errors, cancellation and timeouts cannot crash error rendering. Payout edits survive a failed refresh; evidence photos and explanation drafts retain their existing retry behavior.
- Reads for KYC, payout, capture boxes/requests and packing lists stop automatic Riverpod retry loops. Explicit retry gestures and existing polling remain available. Mutation requests are never automatically replayed.
- A late 401 for an old token cannot sign out a newer session. Failed secure-storage writes do not publish a signed-in state. Pending login navigation, duplicate login submissions, harvest camera failures and external-browser launch failures are handled.
- Chip/metric wrapping, farmer metadata, daily-log input cards, harvest controls and the manual trace screen fit small viewports. The contribution instruction sheet scrolls. Packing manual entry now updates its Add button while typing, disables edits during submission and shows a readable load/camera error.
- Remaining mock screens explicitly say they are demonstrations. Harvest no longer claims an actual print or server activation; daily-log confirmation does not claim server persistence. No mock fallback is introduced for a failing live API.

## Screen audit against this branch

| Screen / action | Current source | Remaining work |
|---|---|---|
| Sign in | `POST /api/auth/login`, secure-storage session | Live |
| Investor overview / portfolio detail | `/api/investor/portfolio` and batch detail | Live; empty portfolio is valid |
| Batch discovery / published detail | `GET /api/batches`, `GET /api/batches/{code}` | Live; contribution opens the web workflow |
| Investor notifications / unread badges | `GET /api/me/notifications`; device read markers | Live; foreground polling, no FCM |
| eKYC | `GET /api/me/kyc`, `POST /api/kyc/ekyc` | Live API; backend eKYC provider remains a sandbox |
| Payout account | `GET/PUT /api/me/payout-account` | Live API; bank-name matching remains simulated server-side |
| Operator Today — capture requests | `/api/operators/me/capture-requests` | Live; countdown / fulfillment preserved |
| Operator Today — task gauge / active batches | `MockOperatorRepository` | Demo labels; production repository integration remains pending |
| Daily logs / new log form | `MockOperatorRepository` | Demo only; submit currently returns without server or local-list persistence |
| Camera/GPS production evidence | `GET /api/boxes`, `POST /api/evidence` | Live; camera/GPS permission required, failed upload keeps photo |
| Alerts / acknowledge | Real alert repository | Live |
| Flagged evidence / private photo / explanation | Operator-scoped evidence APIs | Live; explanation still requires reviewer decision |
| Packing / scanner / shipping / delivery | Operator orders APIs; `mobile_scanner` camera | Live; `MockOperatorOrdersRepository` is test-only |
| Harvest / label generation / photo marker | `MockOperatorRepository`, page-local rows | Demo only; no printer command or tag activation API |
| Trace scan / trace result | Illustrative viewfinder, manual code, `MockTraceRepository` | Demo only; public trace QR/API integration pending |
| Account | Current session + live KYC and payout entry | Farm profile, numbered-box directory, printer setup and language actions still show “Đang xây dựng” |
| Onboarding / unsupported role | Static content / role routing | Intentional static screens |

Unused mock `alerts`, `acknowledgeAlert` and `boxes` methods in `MockOperatorRepository` are not the data sources of the live Alerts and Capture pages. No backend, web, migration, audit hash or dependency changes are needed for this task.

## Repeatable checks

From `mobile/`:

```powershell
flutter analyze
flutter test
flutter build apk --release --dart-define=API_URL=http://localhost:5233 --dart-define=WEB_URL=http://localhost:5173
```

The smoke matrix opens and scrolls 24 screens at 360×780 with normal text and 320×568 with text scale 1.3. Additional tests open every screen with a failing Dio adapter, invoke failed refreshes on all live pages, recover batch discovery, preserve a payout draft, leave pending reads/login, render a skeleton and exercise manual trace with a keyboard. Existing tests cover evidence retry drafts, KYC consent/camera, account isolation, alert acknowledgment and shipping validation.

## Trial release APK

The APK uses the existing **debug signing key** in a release build. It is a local trial artifact, not a store distribution build. Release network policy permits HTTP only for `localhost`, `127.0.0.1` and Android emulator host `10.0.2.2`; other hosts require HTTPS. Debug LAN behavior is unchanged. No custom trust store, TLS bypass or broad release cleartext permission is added.

To install the USB build after starting the local API on port 5233:

```powershell
adb devices
adb -s <device-id> reverse tcp:5233 tcp:5233
adb -s <device-id> reverse tcp:5173 tcp:5173
adb -s <device-id> install -r .artifacts/cs69/CrabShare-CS69-release.apk
```

Run installation from the repository root. Port 5173 is only needed for the external contribution web page; start the web app separately. Reapply forwarding after reconnecting USB. Use `operator@crabshare.local` for farm flows and `investor1@crabshare.local` for investor flows against the development seed (`CrabShare@2026`). Use a newly registered investor to test unverified eKYC.

Manual device check: sign in, open live lists, disable the API/network, refresh and submit a prepared evidence photo, confirm the error/retry and draft remain, restore connectivity and retry, then reopen the screen to check server persistence. Exercise camera/location denial and a long form with the keyboard open. No Android device was connected during this run, so physical camera/GPS and installed-release network toggles are not claimed by widget tests.

## Verified results — 2026-10-16

- `flutter analyze --no-pub`: no issues.
- `flutter test --no-pub`: **151 passed**, including 48 scrolling screen smoke cases, 24 offline screen cases and the new failure/lifecycle/keyboard/form/action checks.
- `flutter build apk --release ...`: exit **0**. Android release lint enabled; the domain policy explicitly uses `includeSubdomains="false"`. No lint baseline or suppression was added.
- APK: `.artifacts/cs69/CrabShare-CS69-release.apk`, **75,436,219 bytes** (71.9 MiB).
- SHA-256: `a4a0b31f27e0f43e199bf75ee241179c559f19b92c71fa9dfe40b34e6e2e3bc0`.
- Android Build Tools inspection: package `vn.crabshare.crabshare_mobile`, version 1.0.0 (1), minimum API 24 / target 36; Internet/camera/coarse/fine location permissions present. AOT libraries exist for armeabi-v7a, arm64-v8a and x86_64; bundled DM Sans assets are retained. Packaged manifest references the release network configuration and is not debuggable.
- `apksigner verify --verbose --print-certs`: valid APK Signature Scheme v2; certificate `CN=Android Debug` as expected for this trial.
- Latest `origin/develop` check: no additional commits beyond the starting base. No device appeared in `adb devices`; physical release installation, camera/GPS and network toggling remain manual checks.
- Existing Java native-access / plugin Java 8/deprecation warnings appeared during the build. The build passed without dependency changes or warning suppression.

APKs, screenshots and logs stay under ignored `.artifacts/cs69/`. GitHub Actions and deployment checks are reported separately in the PR; no merge or Jira status change is performed by this task.
