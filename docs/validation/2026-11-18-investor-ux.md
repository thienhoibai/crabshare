# Investor web UX validation

Recorded 2026-11-18. Scope: the user-authorized investor web UX changes, preserving the CrabShare brand and existing API contracts.

## Result

- Web production build passed (`npm run build`).
- Browser test TypeScript check passed (`npx tsc -p tests/tsconfig.json --noEmit`).
- Final stable run: **141 passed** in 5.7 minutes, including investor screens, notifications and the cross-role prohibited-copy checks. Command: `CI=1 PW_PORT=5183 npx playwright test investor- notifications.spec.ts no-return-promises.spec.ts --workers=1 --timeout=60000 --reporter=line`.
- Full web suite was run: 455/467 initially passed. Twelve cases failed during the active development run. The first rerun passed eight; the remaining cases were Admin user filters, two notification copy assertions and the responsive settlement ready-text assertion. The copy assertions were updated for the authorized wording/links, and the ready check now selects visible desktop/mobile markup while still scanning all text for prohibited promises. All three affected cases passed in the final 141-test run. The Admin user-filter test passed separately on both the current code and a baseline using the original shared shell. No Admin source changes were made.
- New regression coverage includes pending/failed todo sources, failed money reads and retry, receiving payment without complete signatures, statement versus successful payout, mobile settlement records and keyboard links.
- Hallmark static/render check: **0 FAIL, 0 REFLEX** on the investor source and Overview/Settlement list at 320–1920px. Four finish warnings were reviewed: two JSX attribute quote false positives, fixed app heading scale rather than balanced marketing headings, and a naturally advancing fixture deadline clock. There is no removed financial figure.
- Independent finish review identified incomplete money totals; resolved by labeling partial totals, suppressing totals when all sources fail and retrying failed queries.

## Scope and remaining data limits

Screenshots use repository fixtures and are not evidence of live backend records. The configured minimum preorder threshold is not supplied in the current public response; the UI explicitly reports unavailable data and does not infer a value. Financial calculations, routes, permissions, contracts and consent text are preserved. No backend, schema or runtime dependency was added.

Local comparison: `.hallmark/compare.html`. Captures and the comparison are generated local artifacts and are ignored by Git. Existing risk and contract disclosures are unchanged; display wording now distinguishes payment receipt, signatures, contribution confirmation and actual payout.
