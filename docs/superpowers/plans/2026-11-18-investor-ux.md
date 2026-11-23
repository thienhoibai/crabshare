# Investor UX implementation plan

**Goal:** Apply the investor UX audit to the existing web portal using the CrabShare brand.

**Architecture:** Keep routes, API contracts and financial calculations. Recompose existing page content and add investor-scoped CSS. Local helpers are limited to shared presentation of payout status and existing links.

**Spec:** `.hallmark/design.md` and the UX audit from this chat.

**Constraints:** Vietnamese copy, integer VND, no projected returns, no backend or schema changes, no new runtime dependency. Missing requirements remain unresolved.

- [x] Overview: test partial source failure and retry, pending source and deadline order; retain known actions. Implement compact money summary and action-first layout.
- [x] Funding: test payment receipt without signatures; expose signing alongside payment and current opening/cost terms.
- [x] Settlement: test unpaid/published/approved/paid labels and keyboard links; restack records on mobile.
- [x] Navigation: retain all tabs/routes, show the funding menu while contributing, link notifications to existing relevant tabs; make portfolio progress compact and money fields readable.
- [x] Visual system: apply brand tokens within the investor shell, sentence case labels, focus and reduced motion. Run Hallmark static/render checks and inspect desktop/mobile captures.
- [x] Verify web build, test typecheck and browser suite. Fix failures, obtain an independent finish review and record limitations.

**Review focus:** money received without signatures; approved statement with failed/pending payout; partial or slow todo sources; small viewport with long names; frozen versus provisional capital scope.

**Execution:** User asked to apply the reviewed improvements. Implement directly in the current clean checkout. Funding and settlement are independent edits delegated under Hallmark's multi-page workflow; remaining integration is handled in this chat. No commit or publish requested.
