# CS-92 — Server acceptance and demo phones

Scope is Khôi's UC02,03,06,16,19,20,42,43,45,47,48. Test results must identify the deployed source revision and APK checksum; passing local tests is not a substitute for actual server/device acceptance.

## Repeatable server checks

Use Python 3 and a private environment variable `CRABSHARE_DEMO_PASSWORD` for the team's demo password. Do not pass passwords on command lines, paste JWTs into reports or upload server response bodies containing identity/bank data.

```powershell
python tools/acceptance/server_acceptance.py --output .artifacts/cs92-server.json
# Optional, specifically for the existing demo with fake eKYC/name matching:
python tools/acceptance/server_acceptance.py --exercise-synthetic-account --output .artifacts/cs92-synthetic.json
python -m unittest discover -s tools/acceptance -p test_server_acceptance.py
```

For actual deployed web checks, install web dependencies/browser tooling and run `node tools/acceptance/admin_smoke.cjs`. Optional environment variables are `CRABSHARE_WEB_URL`, `CRABSHARE_API_URL`, `CS92_OUTPUT_DIR` and `PLAYWRIGHT_CHANNEL` (`chrome` locally). The script signs in through the actual `/dang-nhap` route, opens read-only admin pages and requires their real API request; a static placeholder is not a passing dashboard. It saves redacted JSON/screenshots and no JWT state or traces. `PLAYWRIGHT_MODULE_PATH` can point at an existing local Playwright installation.

The default checks five seeded roles, authenticated reads, cross-role 403, dashboards/reports, audit-chain validity and UTF-8 export. Missing new dashboard/audit routes are `BLOCKED_DEPLOYMENT`, not a pass. HTTP is rejected except an explicit loopback-only opt-in for a local integration host. Cross-origin/downgrade redirects are rejected before sending credentials onward.

The optional exercise creates one new investor with a random private password and synthetic 1-pixel PNGs. It checks consent→400, Verified persistence, matching bank number round trip, address create/update/delete, lock/unlock revocation of an unexpired token, and finally locks only that newly created test account. It preserves audit history. It does not make payments or modify seeded users/farm operations. Use it only on the agreed demo with fake providers; do not submit synthetic identity checks to a real commercial KYC provider.

The redacted JSON intentionally keeps `fullAcceptancePassed=false`: HTTP alone cannot prove no files were retained on the server, bank encryption at rest, camera/GPS behavior, installation on two phones or real QR scanning. Identity image retention is covered by isolated backend storage tests; verify encrypted rows/key continuity after CS-88 deployment using the private operational process, without copying account numbers/keys into evidence.

## Use-case evidence

| Use cases | Automated server coverage | Further acceptance |
|---|---|---|
| UC02 | Investor KYC status; optional synthetic consent rejection and Verified persistence | Existing isolated image-retention tests; actual phone capture flow |
| UC03 | Investor/operator payout reads, customer address list; optional synthetic bank match + address CRUD | SQL ciphertext/key continuity after CS-88 deployment |
| UC06/45 | Admin users/KYC lists; optional synthetic lock/unlock JWT revocation | Manual admin filters/dialogs; no real seeded account lock |
| UC16 | Boxes and current capture-request lists | Actual photo/GPS/upload/reopen; no forged telemetry to satisfy a test |
| UC19 | Operator alerts | Acknowledge only a coordinated test alert; isolated job/ownership cases already tested |
| UC20 | Reviewer evidence and household explanation lists, wrong-role 403 | Review/explain a coordinated test evidence record |
| UC42/43 | Investor portfolio and notifications | Actual phone refresh/notification navigation and session restore |
| UC47 | Admin/farm dashboard and all four CSV reports | Actual admin chart/filter/export smoke; local SQL aggregate tests |
| UC48 | Admin audit list, complete observed chain validity and CSV | Local isolated tamper test; never tamper with actual server audit rows |

## Two physical phones

Install the same signed CS-84 APK from the release link and compare SHA-256. Follow `docs/demo-app.md` after CS-84 merges. Connect via USB only if installation/log capture is needed; the HTTPS demo needs no laptop backend or port reverse. Do not substitute an emulator for either row.

| Evidence | Phone A | Phone B |
|---|---|---|
| Model / Android version / tester / timestamp | PENDING | PENDING |
| APK SHA-256 / signing fingerprint / version code | PENDING | PENDING |
| Install from release link / launch / no blocking error | PENDING | PENDING |
| Operator login / camera + location permission | PENDING | PENDING |
| Real photo + captured location / upload / persisted status after reopen | PENDING | PENDING |
| Investor login / portfolio / notifications / logout + session restore | PENDING | PENDING |
| Real activated tag / camera scan / matching trace record | PENDING CS-82 | PENDING CS-82 |
| Denied camera/GPS permission handled / retry after permission restored | PENDING | PENDING |
| Battery >=80%, charger, mobile data/hotspot, spare login ready | PENDING | PENDING |

CS-82 (Viên) is the real scanner/trace implementation; mock scan/trace screens do not count as passing. CS-71/74 supply harvested/activated tags. Do not implement or mark these teammate tasks complete as part of Khôi's six-task scope.

## Browser and release gate

With an actual admin login, open Dashboard, Users/KYC, Alerts and Audit Log. Check data/error/empty states, filters, CSV download and the complete-chain banner; a missing page/404 or broken-chain warning blocks acceptance. Avoid altering production audit rows to demo corruption. Run local browser tests with isolated fixtures for that case.

All PRs require another team member's review and green CI before merge (`docs/git-workflow.md`). Vercel author's access may block Preview even when code CI passes; the project owner must resolve that. Apply CS-80's maintenance workflow before CS-88 V012; preserve the private key directory. After deployment, rerun both scripts and record the actual SHA and results below. A draft APK or code-only checks do not close CS-84/92.

## Session results

On 2026-10-16, actual Azure API checks passed 36 items. Two audit routes remain `BLOCKED_DEPLOYMENT` (404) until CS-76 is reviewed/merged/deployed. The synthetic account was verified with fake PNGs, exercised for payout/address and lock/unlock, then successfully disabled. No payments were made and no seeded account was modified. Redacted results: `CS-92-server-2026-10-16.json`.

Actual Vercel browser: admin login, Users API, Alerts API and no unhandled browser errors passed. Dashboard and Audit did not issue their expected API request; the deployed frontend is still missing those live screens. Redacted results: `CS-92-admin-2026-10-16.json`. The Vercel checks report that author `rakkiu` needs access to the project; the project owner must allow deployment and redeploy the reviewed code with the correct API URL.

A separate local checkout combining CS-73/76/80/84/88 passed 691 API tests and 4 settlement tests, web production build and 101 browser tests (2 existing real-API scenarios skipped). This included the final V012 migration, four-digit legacy payout compatibility and both dashboard/audit registrations. The CS-84 source passed Flutter analyze, 151 tests, signed HTTPS APK build and signature/checksum checks. Script safety tests passed 4 cases. None of these replace the pending two-phone and CS-82 checks above.

The subsequent CS-88 fix keeping CORS headers on throttled login responses passed 35 focused security/authentication tests. The deployed source revision remains unconfirmed until CS-80's version endpoint and revision smoke are deployed; the reports describe observed endpoint behavior only.

Remaining acceptance gates: team review/merge/deployment, fresh server/admin retest, two real phones, and real activated-tag scanning supplied by CS-82/71/74. CS-84/92 are prepared and tested as far as the available deployment/hardware allows; full acceptance is still pending.
