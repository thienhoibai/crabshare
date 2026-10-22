# SDD ledger — plan: docs/superpowers/plans/2026-10-22-cs-82-public-tag-traceability.md

## Pre-flight

- Task 1 → Task 2: backend publishes a stricter TraceResponse allowlist; web currently consumes `operatorName`, `farmAddress`, `itemUuid`, and event `note`. Task 2 must remove those fields from the type and page.
- Task 1 → Task 3: backend publishes the same stricter TraceResponse allowlist; mobile currently consumes `operatorName`, `farmAddress`, `itemUuid`, and event `note`. Task 3 must remove those fields from its model and result page.
- QR compatibility: VI-15 creates `/truy-xuat/{tagCode}` from its configured public base URL; mobile parser must accept any deployment hostname but require HTTP(S), exact path shape, and VI-15 code alphabet.

## Tasks

- Task 1: complete
- Task 2: complete
- Task 3: implementation and focused tests written; verification blocked because Flutter SDK is unavailable in this environment

## Decisions

Task 1: complete (commits b065055..7b436d4, tests: dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --no-restore --filter FullyQualifiedName~Trace_ → Passed!  - Failed:     0, Passed:     5, Skipped:     0, Total:     5, Duration: 9 s - CrabShare.Api.Tests.dll (net10.0))

- Task 1 broader-suite note: dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --no-restore emitted failures because OrderDatabaseFixture.InitializeAsync timed out while applying migrations to LocalDB (line 39); stopped after repeated fixture timeouts. Focused Trace tests remain green.

- Task 2 browser environment: Playwright config selects installed Chrome outside CI, but Chrome was absent. `npx playwright install --list` showed bundled Chromium, so verification used `CI=1` to select it. The initial focused run was then RED on leaked operator fields and missing invalid-code state; final Playwright run passed 4/4 and `npm run build` passed.
Task 2: complete (commits 7b436d4..052d223, tests: 'C:\Program Files\Git\bin\bash.exe' -lc 'cd web && CI=1 npx playwright test tests/traceability.spec.ts' →   4 passed (8.4s))

- Task 3: Flutter/Dart are not installed or available on PATH. `flutter test test/features/trace`, `flutter analyze`, and `flutter build apk --debug` were attempted and each failed before execution with “flutter is not recognized”. Proceeded with implementation and test authoring; parser, scanner behavior, and public response parsing tests are present but cannot be run here. Cost: Dart compilation, analyzer diagnostics, and mobile build remain unverified.
