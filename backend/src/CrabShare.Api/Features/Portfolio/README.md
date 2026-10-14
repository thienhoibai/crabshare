# Portfolio — CS-61 / KH-11

Read-only investor portfolio. No migration, funding writes, audit writes or projected yield fields.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/investor/portfolio?page=1&pageSize=10&q=&status=` | Own positions, paged metadata, global summary. `pageSize` 1–100; `q` up to 100 characters. |
| GET | `/api/investor/portfolio/{batchCode}` | Own position, contribution/contract metadata, latest received production log, recent actual timeline and approved settlement amounts. Foreign/absent positions return 404. |

Both require an Investor JWT, an active user with the current Investor database role and an investor profile. Reading historical holdings does not require passing eKYC again. Responses set `Cache-Control: no-store`.

## Capital and settlement

- Frozen positions read `v_investor_portfolio`: `capital_share.confirmed_amount` and the view's decimal(9,6) ratio. Later contribution changes never replace frozen amounts. A missing denominator stays unknown.
- Before a batch has any capital shares or `capital_closed_at`, confirmed contributions aggregate into `LiveConfirmed` positions. Ratio = own confirmed / all confirmed, rounded to six decimals. Clients label it provisional. Reserved, expired and refunded money is excluded.
- After freezing, a confirmed contribution without a capital share does not synthesize a position. The TH-07 freeze job remains owned by Funding.
- Money is integer VND (`long` DTO fields); ratios are capital fractions, not returns. Summary is global even when the page has filters. Active capital excludes Closed/Cancelled batches.
- Settlement amounts are exposed only for Approved/PaidOut/Closed settlements with actual approval at or before now. Draft/Proposed/Disputed amounts are hidden. Approved net payout does not imply payment has occurred.
- The configured SQL execution strategy wraps each read in a serializable read transaction, keeping snapshot/confirmation totals consistent during concurrent writes. No global audit lock is taken.

## Operational metadata

Cycle uses Vietnam calendar dates, starting at day 1 on the actual stocking date and stopping at closure. Clients clamp gauge progress while showing the actual day. Alive count comes from Growing registry items, or is null without a registry. Alerts count Open/Escalated. Expected harvest date comes from the batch.

Timeline includes actual batch milestones, own confirmations/signed contract timestamps, received logs and Accepted evidence only. Future events, other investor identities and private file paths are not returned. It is limited to 30 recent events. Notifications are a separate CS-65 task.

## Clients and verification

Web: overview `/nha-dau-tu`, list `/nha-dau-tu/danh-muc`, detail `/nha-dau-tu/danh-muc/{code}`. Mobile: Investor Tổng quan and `/i/portfolio/{code}`. Existing design components handle loading, error/retry, empty portfolios and account changes.

See [validation notes](../../../../../docs/validation/CS-61-investor-portfolio.md). SQL integration tests compare view amounts; browser/mobile tests cover API and layout. Unrelated exploration and notification mock repositories remain outside this task.
