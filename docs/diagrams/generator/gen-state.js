'use strict';
// State Machine Diagrams cho các main entity có cột status (Report 4, bổ sung theo Review 2).
// Trạng thái = đúng giá trị CHECK constraint trong V001–V017; nhãn chuyển = trigger [guard] / effect; nguồn = Controller.Method → Service.Method.
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · UML 2.5 · states = CHECK constraint values · label = trigger [guard] / effect';
const DASHED = 'dashed=1;strokeColor=#9a3412;fontColor=#9a3412;';

// Mỗi machine: page, fig, entity, column, source, states [{id, c, r, label?, final?}], trans [{f, t, l, style?, pts?}], notes[]
// f='[*]' = initial pseudostate; t='[*]' = final state.
const MACHINES = [
  {
    page: 'batch.status', fig: 'Figure 4.8', entity: 'batch', column: 'status', owner: 'Batches (Viên) · Funding, Settlement (Thiện) · Production, Harvest (Viên)',
    source: 'BatchesController/AdminBatchesController → BatchService · BatchReviewService · FundingCloseService · StockingService · HarvestService.StartAsync · SettlementService.CalculateAsync · SettlementClosing.CloseIfPaidAsync',
    states: [
      { id: 'Draft', c: 0, r: 0 }, { id: 'PendingApproval', c: 1, r: 0 }, { id: 'Funding', c: 2, r: 0 }, { id: 'Stocked', c: 3, r: 0 }, { id: 'InProduction', c: 4, r: 0 }, { id: 'Harvesting', c: 5, r: 0 },
      { id: 'Rejected', c: 1, r: 1, final: true }, { id: 'Cancelled', c: 2, r: 1, final: true }, { id: 'Settlement', c: 5, r: 1 }, { id: 'Closed', c: 4, r: 1, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Draft', l: 'create batch (Operator Owner) / standard_cost_version v1 Draft' },
      { f: 'Draft', t: 'PendingApproval', l: 'submit [cost items > 0, offtake price per grade] / cost version Submitted' },
      { f: 'PendingApproval', t: 'Draft', l: 'return for revision (Admin) / reason, new cost version', pts: [[280, 95]] },
      { f: 'PendingApproval', t: 'Rejected', l: 'reject (Admin) / rejection_reason' },
      { f: 'PendingApproval', t: 'Funding', l: 'approve (Admin) / lock Standard Cost, fee tier, batch account, tranches Planned, funding_open_at & deadline' },
      { f: 'Funding', t: 'Funding', l: 'capital reaches max or deadline [confirmed ≥ min_viable_capital] / capital_share snapshot, capital_closed_at (FundingCloseService)' },
      { f: 'Funding', t: 'Cancelled', l: 'funding deadline [confirmed < min_viable_capital] / refund every Confirmed contribution, void unsigned contracts' },
      { f: 'Funding', t: 'Stocked', l: 'record stocking (Operator Owner) [FundingReadiness: capital closed, confirmed sum = total, every contract FullySigned, count = seed_quantity, boxes Available] / boxes Occupied, crab_item Growing per box, stocked_at' },
      { f: 'Stocked', t: 'InProduction', l: '/ same transaction (Stocked is transient); audit batch/stocked then batch/start_production' },
      { f: 'InProduction', t: 'Harvesting', l: 'start harvest (Operator Owner) [no Open harvest session] / harvest Open, harvest_started_at, audit batch/start_harvest' },
      { f: 'Harvesting', t: 'Settlement', l: 'calculate settlement (Admin) [capital shares exist, Locked cost exists] / settlement Draft rev 1, audit batch/start_settlement' },
      { f: 'Settlement', t: 'Closed', l: 'every investor line paid (Succeeded) / closed_at, settlement PaidOut → Closed (SettlementClosing.CloseIfPaidAsync)' },
      { f: 'Rejected', t: '[*]' }, { f: 'Cancelled', t: '[*]' }, { f: 'Closed', t: '[*]' },
    ],
    notes: ['Transition rules live in the services (422 batch.invalid_transition); the DB only constrains the value list (ck_batch_status). docs/architecture.md §5 overstates a DB trigger — correct the SDD text.', 'Funding keeps its state when capital closes (self-transition, capital_closed_at set). Pre-orders are allowed only in InProduction; listings sell in Harvesting.', 'Not implemented: early liquidation (early_liquidation_at), Rejected → Draft resubmission.'],
  },
  {
    page: 'contribution.status', fig: 'Figure 4.9', entity: 'contribution', column: 'status', owner: 'Funding (Thiện)',
    source: 'FundingController.Reserve/Cancel → FundingService.ReserveAsync/CancelAsync · ContributionPaymentHandler.OnPaidAsync · FundingCloseService · PayoutSendService.SendAsync',
    states: [{ id: 'Reserved', c: 0, r: 0 }, { id: 'Confirmed', c: 1, r: 0 }, { id: 'Expired', c: 0, r: 1, final: true }, { id: 'Refunded', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Reserved', l: 'reserve (Investor) [batch Funding & open, risk acknowledged, min ≤ amount ≤ remaining cap] / payment_request Contribution (VietQR, 15 min)' },
      { f: 'Reserved', t: 'Confirmed', l: 'payment webhook [request Pending, amount matches] / confirmed_at; audit contribution/confirm' },
      { f: 'Reserved', t: 'Expired', l: 'after(expires_at) or funding deadline (FundingCloseJob) / expire QR, void unsigned contract' },
      { f: 'Reserved', t: 'Expired', l: 'cancel (Investor) / payment_request Cancelled, void unsigned contract', pts: [[30, 225]] },
      { f: 'Confirmed', t: 'Refunded', l: 'refund instruction Succeeded [batch Cancelled: under-subscribed] / refunded_at' },
      { f: 'Confirmed', t: '[*]', l: 'batch Closed (capital returned through settlement line)' },
      { f: 'Expired', t: '[*]' }, { f: 'Refunded', t: '[*]' },
    ],
    notes: ['Capital close snapshots Confirmed contributions into capital_share (immutable trigger trg_capital_share_immutable); the contribution row itself stays Confirmed.', 'A webhook arriving after Expired/Cancelled is booked as LatePayment with an automatic Refund instruction (TL-10).'],
  },
  {
    page: 'investment_contract.status', fig: 'Figure 4.10', entity: 'investment_contract', column: 'status', owner: 'Contracts (Thiện)',
    source: 'ContractsController.Create/Sign/OfflineUpload → ContractService · ContractVoiding.VoidUnsignedAsync',
    states: [{ id: 'Draft', c: 0, r: 0 }, { id: 'OperatorSigned', c: 1, r: 0 }, { id: 'FullySigned', c: 2, r: 0, final: true }, { id: 'Void', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Draft', l: 'create (Investor) [contribution Confirmed, batch Funding, active template] / fill CT-2026-01, render PDF, draft_hash' },
      { f: 'Draft', t: 'OperatorSigned', l: 'sign (Operator Owner) [role Owner else 403 contract.owner_only] / signature #1, new file hash' },
      { f: 'OperatorSigned', t: 'FullySigned', l: 'sign (Investor) [Draft → 422 contract.wrong_signing_order] / signature #2, final_hash, fully_signed_at' },
      { f: 'Draft', t: 'FullySigned', l: 'offline-upload (Admin) [PDF ≤ 10 MB, confirmedBothSigned] / signing_method OfflineUpload, final_hash', pts: [[290, 60]] },
      { f: 'Draft', t: 'Void', l: 'reservation expired / cancelled, or batch Cancelled / ContractVoiding' },
      { f: 'OperatorSigned', t: 'Void', l: 'reservation expired / cancelled, or batch Cancelled' },
      { f: 'FullySigned', t: '[*]' }, { f: 'Void', t: '[*]' },
    ],
    notes: ['Every version is stored as contracts/{no}/{sha256}.pdf and re-hashed on download (contract.file_tampered).', 'Offline upload is also accepted from OperatorSigned; Void and FullySigned are terminal (contract.void / contract.already_signed).'],
  },
  {
    page: 'payment_request.status', fig: 'Figure 4.11', entity: 'payment_request', column: 'status', owner: 'Payments (Thiện)',
    source: 'PaymentRequestService.CreateAsync · PaymentWebhookService.ProcessAsync · FundingCloseService / ReservationExpiryService · cancel paths',
    states: [{ id: 'Pending', c: 0, r: 0 }, { id: 'Paid', c: 1, r: 0, final: true }, { id: 'Expired', c: 0, r: 1, final: true }, { id: 'Cancelled', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Pending', l: 'create [purpose Contribution | OrderPayment | PreOrderDeposit | PreOrderBalance | OfftakeDeposit | OfftakePayment] / VietQR via IPaymentGateway, reference code, expires_at' },
      { f: 'Pending', t: 'Paid', l: 'webhook received [provider_txn_id new, account & amount match, before expires_at] / provider_transaction Matched; IPaymentPurposeHandler.OnPaidAsync' },
      { f: 'Pending', t: 'Expired', l: 'after(expires_at) [job: FundingClose, ReservationExpiry] / audit payment_request/expire' },
      { f: 'Pending', t: 'Cancelled', l: 'contribution cancelled or order cancelled / audit payment_request/cancel' },
      { f: 'Paid', t: '[*]' }, { f: 'Expired', t: '[*]' }, { f: 'Cancelled', t: '[*]' },
    ],
    notes: ['Idempotency: provider_txn_id is UNIQUE; a duplicate webhook is acknowledged (200) without a second booking (TL-10).', 'A webhook for an Expired/Cancelled/Paid request leaves the state unchanged, books the transaction as LatePayment and creates a Refund instruction.'],
  },
  {
    page: 'payment_instruction.status', fig: 'Figure 4.12', entity: 'payment_instruction', column: 'status', owner: 'Payments (Thiện)',
    source: 'RefundService · DisbursementService.ReleaseAsync · SettlementPayoutService.ApproveAsync · AdminPaymentsController.Send → PayoutSendService.SendAsync',
    states: [{ id: 'Created', c: 0, r: 0 }, { id: 'Sent', c: 1, r: 0 }, { id: 'Succeeded', c: 2, r: 0, final: true }, { id: 'Failed', c: 1, r: 1 }, { id: 'Disputed', c: 2, r: 1 }],
    trans: [
      { f: '[*]', t: 'Created', l: 'create [type Refund | Disbursement | Payout | TaxPayment] / audit payment_instruction/create' },
      { f: 'Created', t: 'Sent', l: 'send (Admin) / IPaymentGateway.SendPayoutAsync(reference CHI{id}), sent_at' },
      { f: 'Sent', t: 'Succeeded', l: 'gateway accepted / provider_transaction Out, completed_at; contribution Refunded; SettlementClosing.CloseIfPaidAsync' },
      { f: 'Sent', t: 'Failed', l: 'gateway rejected / completed_at, reason' },
      { f: 'Failed', t: 'Sent', l: 'resend (Admin) / same reference (idempotent at gateway)', pts: [[270, 150]] },
      { f: 'Succeeded', t: 'Disputed', l: 'provider dispute notice — reserved, no code path yet', style: DASHED },
      { f: 'Disputed', t: 'Succeeded', l: 'dispute closed — reserved', style: DASHED, pts: [[560, 150]] },
      { f: 'Succeeded', t: '[*]' },
    ],
    notes: ['The sandbox gateway answers synchronously, so Sent is transient in the demo; a real provider would hold Sent until its callback.', 'Disputed is allowed by the CHECK constraint but not written by any code on develop (documented gap, CS-85 review).'],
  },
  {
    page: 'disbursement_tranche.status', fig: 'Figure 4.13', entity: 'disbursement_tranche', column: 'status', owner: 'Payments (Thiện) · created by Batches (Viên)',
    source: 'BatchReviewService.ApproveAsync (create) · DisbursementsController.RequestTranche/Release/NeedExplanation/Block → DisbursementService',
    states: [{ id: 'Planned', c: 0, r: 0 }, { id: 'Requested', c: 1, r: 0 }, { id: 'Released', c: 2, r: 0, final: true }, { id: 'NeedsExplanation', c: 1, r: 1 }, { id: 'Blocked', c: 2, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Planned', l: 'batch approved / one row per Standard Cost tranche plan (planned_amount, anchor, offset)' },
      { f: 'Planned', t: 'Requested', l: 'request (Operator Owner) [previous tranche Released, planned date reached, T1: capital closed & contracts signed, T≥2: stocked, evidence Accepted, none Flagged, T≥3: harvest plan] / requested_at — else 422 tranche.not_eligible' },
      { f: 'Requested', t: 'Released', l: 'release (Admin) [gate re-checked, released total ≤ total_confirmed_capital] / Disbursement instruction Created, released_at' },
      { f: 'Requested', t: 'NeedsExplanation', l: 'need-explanation (Admin) / explanation_deadline = now + 72 h' },
      { f: 'NeedsExplanation', t: 'Released', l: 'release (Admin) [explanation accepted]' },
      { f: 'Requested', t: 'Blocked', l: 'block (Admin) / reason' },
      { f: 'NeedsExplanation', t: 'Blocked', l: 'block (Admin) [deadline passed or explanation rejected] / reason' },
      { f: 'Released', t: '[*]' }, { f: 'Blocked', t: '[*]' },
    ],
    notes: ['TrancheScheduleJob resolves planned_date from anchors (e.g. stocked_at + offset_days) without changing status.', 'A Blocked tranche stops later tranches (gate: previous Released); unblocking is a manual data decision, not an API on develop.'],
  },
  {
    page: 'settlement.status', fig: 'Figure 4.14', entity: 'settlement', column: 'status', owner: 'Settlement (Thiện)',
    source: 'AdminSettlementsController.Calculate/Approve/SendPayouts → SettlementService · SettlementPayoutService · SettlementsController.Propose/Feedback/Answer → SettlementReviewService · SettlementClosing',
    states: [{ id: 'Draft', c: 0, r: 0 }, { id: 'Proposed', c: 1, r: 0 }, { id: 'Disputed', c: 1, r: 1 }, { id: 'Approved', c: 2, r: 0 }, { id: 'PaidOut', c: 3, r: 0 }, { id: 'Closed', c: 4, r: 0, final: true }],
    trans: [
      { f: '[*]', t: 'Draft', l: 'calculate (Admin) [batch Harvesting | Settlement] / SettlementCalculator: pool, remuneration, largest-remainder lines, loss cap; batch → Settlement' },
      { f: 'Draft', t: 'Draft', l: 'recalculate (Admin) / revision_no++, lines replaced' },
      { f: 'Draft', t: 'Proposed', l: 'propose (Admin) [7 ≤ feedbackDays ≤ 14] / proposed_at, feedback_deadline' },
      { f: 'Proposed', t: 'Disputed', l: 'feedback (Investor) [now ≤ feedback_deadline] / settlement_feedback Open' },
      { f: 'Disputed', t: 'Proposed', l: 'answer (Admin) [no feedback left Open] / Answered | Unresolved', pts: [[500, 170]] },
      { f: 'Proposed', t: 'Approved', l: 'approve (Admin) [feedback_deadline passed, no Open feedback] / lock (BR-30, trigger trg_settlement_locked); instructions: TaxPayment, operator Payout, investor Payouts' },
      { f: 'Approved', t: 'PaidOut', l: 'payout Succeeded [every investor line paid] / SettlementClosing.CloseIfPaidAsync' },
      { f: 'PaidOut', t: 'Closed', l: '/ batch → Closed, closed_at (same transaction)' },
      { f: 'Closed', t: '[*]' },
    ],
    notes: ['uq_settlement_batch_id: one settlement per batch; revisions recalculate in place before approval.', 'Approve is refused with settlement.not_proposed, settlement.open_feedback or settlement.window_open; after approval the DB trigger blocks any update (409 settlement.locked).'],
  },
  {
    page: 'settlement_feedback.status', fig: 'Figure 4.15', entity: 'settlement_feedback', column: 'status', owner: 'Settlement (Thiện)',
    source: 'SettlementsController.Feedback/Answer → SettlementReviewService.FeedbackAsync/AnswerAsync',
    states: [{ id: 'Open', c: 0, r: 0 }, { id: 'Answered', c: 1, r: 0, final: true }, { id: 'Unresolved', c: 1, r: 1, final: true }, { id: 'Withdrawn', c: 0, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Open', l: 'feedback (Investor) [settlement Proposed, within window] / settlement → Disputed' },
      { f: 'Open', t: 'Answered', l: 'answer (Admin) [unresolved = false] / response, responded_at' },
      { f: 'Open', t: 'Unresolved', l: 'answer (Admin) [unresolved = true] / response recorded, disagreement kept in statement' },
      { f: 'Open', t: 'Withdrawn', l: 'withdraw (Investor) — reserved, no code path yet', style: DASHED },
      { f: 'Answered', t: '[*]' }, { f: 'Unresolved', t: '[*]' }, { f: 'Withdrawn', t: '[*]' },
    ],
    notes: ['When no feedback is Open the settlement returns to Proposed; Unresolved does not block approval but is shown on the statement (TL-14).'],
  },
  {
    page: 'batch_account.status', fig: 'Figure 4.16', entity: 'batch_account', column: 'status', owner: 'Funding / Payments (Thiện)',
    source: 'IBatchAccountProvisioner (FakePaymentGateway) on batch approval · no later writes on develop',
    states: [{ id: 'Requested', c: 0, r: 0 }, { id: 'Open', c: 1, r: 0 }, { id: 'Frozen', c: 2, r: 0 }, { id: 'Closed', c: 2, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Requested', l: 'batch approved / request dedicated account at the payment intermediary' },
      { f: 'Requested', t: 'Open', l: 'provider confirms account / provider_account_no, opened_at (sandbox: immediate)' },
      { f: 'Open', t: 'Frozen', l: 'provider or admin freezes (dispute) — reserved', style: DASHED },
      { f: 'Frozen', t: 'Open', l: 'freeze lifted — reserved', style: DASHED, pts: [[560, 60]] },
      { f: 'Open', t: 'Closed', l: 'batch Closed and balance zero / closed_at — reserved', style: DASHED },
      { f: 'Closed', t: '[*]' },
    ],
    notes: ['Every payment_request, provider_transaction and payment_instruction references this account; checkout, pre-order and offtake require status Open (order.batch_account_unavailable).', 'Dashed transitions exist in the model but are not implemented on develop (sandbox provisioner opens the account immediately).'],
  },
  // ---------- Nhân: Catalog / Orders / Offtake ----------
  {
    page: 'product_listing.status', fig: 'Figure 4.17', entity: 'product_listing', column: 'status', owner: 'Catalog (Nhân)',
    source: 'ListingsController.Create/Publish/RefreshStock/Close → CatalogService · HarvestService.CompleteAsync → CatalogService.SyncHarvestStockAsync',
    states: [{ id: 'Draft', c: 0, r: 0 }, { id: 'Published', c: 1, r: 0 }, { id: 'SoldOut', c: 2, r: 0 }, { id: 'Closed', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Draft', l: 'create listing (Operator Owner) [batch InProduction | Harvesting, grade not yet listed] / stock = InStock kg, PriceHistory Initial + PriceCheck' },
      { f: 'Draft', t: 'Published', l: 'publish (Owner) [InProduction: pre-order listing; Harvesting: stock − reserved > 0, not frozen-expired] / published_at, LowStockMonitor' },
      { f: 'Published', t: 'SoldOut', l: 'refresh-stock or harvest complete [available ≤ 0]' },
      { f: 'SoldOut', t: 'Published', l: 'refresh-stock or harvest complete [available > 0]', pts: [[400, 60]] },
      { f: 'Draft', t: 'Closed', l: 'close (Owner) [reserved_qty = 0]' },
      { f: 'Published', t: 'Closed', l: 'close (Owner) [reserved_qty = 0]' },
      { f: 'SoldOut', t: 'Closed', l: 'close (Owner) [reserved_qty = 0]' },
      { f: 'Closed', t: '[*]' },
    ],
    notes: ['Checkout and payment change stock_qty_kg / reserved_qty_kg only, never the status; a Published listing may show 0 available until refresh.', 'Admin moderation (hide) sets hidden_at without changing status. Price changes append price_history + price_check (MAD anomaly check).'],
  },
  {
    page: 'sales_order.status', fig: 'Figure 4.18', entity: 'sales_order', column: 'status', owner: 'Orders (Nhân)',
    source: 'OrderService.CheckoutAsync · PreorderService · OrderPaymentHandler / PreOrderDepositHandler / PreOrderBalanceHandler · OrderCancellationService · ReservationExpiryJob · OrderPackingService · OrderFulfilmentService · OrderCompletionJob · OrderReturnService · ComplaintService.ResolveAsync',
    states: [
      { id: 'PendingPayment', c: 0, r: 0 }, { id: 'Paid', c: 1, r: 0 }, { id: 'Packed', c: 2, r: 0 }, { id: 'Shipping', c: 3, r: 0 }, { id: 'Delivered', c: 4, r: 0 }, { id: 'Completed', c: 5, r: 0, final: true },
      { id: 'DepositPaid', c: 0, r: 1 }, { id: 'Cancelled', c: 1, r: 1, final: true }, { id: 'Returned', c: 4, r: 1, final: true },
    ],
    trans: [
      { f: '[*]', t: 'PendingPayment', l: 'checkout (Customer) [listings Published, batch Harvesting, atomic stock reserve] / one order per batch, reservations Active (15 min), VietQR' },
      { f: 'PendingPayment', t: 'Paid', l: 'payment webhook OrderPayment / reservations Committed, stock −, paid_at' },
      { f: 'PendingPayment', t: 'DepositPaid', l: 'webhook PreOrderDeposit [order_type PreOrder] / audit deposit_paid' },
      { f: 'DepositPaid', t: 'Paid', l: 'webhook PreOrderBalance [balance issued when batch Harvesting] / paid_at' },
      { f: 'PendingPayment', t: 'Cancelled', l: 'after(15 min) (ReservationExpiryJob) or cancel (Customer) / release reservations, expire QR' },
      { f: 'Paid', t: 'Cancelled', l: 'cancel (Customer) / stock returned, Refund instruction' },
      { f: 'Paid', t: 'Packed', l: 'pack by tag scan (Operator) [every line filled, tags Active & InStock & right grade] / crab_item Packed' },
      { f: 'Packed', t: 'Shipping', l: 'ship (Operator) [ETA within 7 days] / carrier, vehicle, driver' },
      { f: 'Shipping', t: 'Delivered', l: 'deliver (Operator) or receive (Customer) / return window = +72 h, crab_item Sold' },
      { f: 'Delivered', t: 'Completed', l: 'after(return window) (OrderCompletionJob) [no active complaint] / completed_at → counts in actual revenue' },
      { f: 'Shipping', t: 'Returned', l: 'return (Customer, in window) or approve return (Operator) / Refund instruction' },
      { f: 'Delivered', t: 'Returned', l: 'return / approve return / complaint resolved with full refund (Admin)' },
      { f: 'Completed', t: '[*]' }, { f: 'Cancelled', t: '[*]' }, { f: 'Returned', t: '[*]' },
    ],
    notes: ['order_type Retail | PreOrder | Offtake (Offtake path arrives with CS-75, PR #72).', 'Settlement revenue counts only Completed orders; refunds of Returned orders are subtracted (v_batch_actual_revenue).', 'Known gaps (CS-85 review): DepositPaid has no expiry; a cancelled Paid pre-order refunds only the balance.'],
  },
  {
    page: 'stock_reservation.status', fig: 'Figure 4.19', entity: 'stock_reservation', column: 'status', owner: 'Orders (Nhân)',
    source: 'OrderService.NewOrder · OrderPaymentHandler · StockRelease.ReleaseAsync (OrderCancellationService, ReservationExpiryService)',
    states: [{ id: 'Active', c: 0, r: 0 }, { id: 'Committed', c: 1, r: 0, final: true }, { id: 'Released', c: 0, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Active', l: 'checkout line reserved [UPDATE … WHERE stock − reserved ≥ q] / reserved_qty_kg += q, expires_at = now + 15 min' },
      { f: 'Active', t: 'Committed', l: 'order paid (webhook) / stock_qty_kg −= q, reserved_qty_kg −= q' },
      { f: 'Active', t: 'Released', l: 'order cancelled or after(expires_at) / reserved_qty_kg −= q' },
      { f: 'Committed', t: 'Released', l: 'Paid order cancelled (Customer) / stock_qty_kg += q' },
      { f: 'Committed', t: '[*]', l: 'order Packed (crabs assigned)' }, { f: 'Released', t: '[*]' },
    ],
    notes: ['All transitions are conditional UPDATEs (0 rows → already changed, skipped); this is what prevents overselling under 50 concurrent checkouts.'],
  },
  {
    page: 'complaint.status', fig: 'Figure 4.20', entity: 'complaint', column: 'status', owner: 'Orders (Nhân)',
    source: 'ComplaintsController.Create/Respond → ComplaintService · ComplaintEscalationJob · AdminComplaintsController.Resolve',
    states: [{ id: 'Open', c: 0, r: 0 }, { id: 'OperatorResponded', c: 1, r: 0 }, { id: 'Escalated', c: 0, r: 1 }, { id: 'Resolved', c: 2, r: 0, final: true }, { id: 'Rejected', c: 2, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Open', l: 'submit (Customer) [order Shipping | Delivered | Completed within return window, no active complaint] / audit complaint/create' },
      { f: 'Open', t: 'OperatorResponded', l: 'respond (Operator) / operator_response, evidence' },
      { f: 'Open', t: 'Escalated', l: 'after(24 h) (ComplaintEscalationJob) / escalated_at' },
      { f: 'Escalated', t: 'OperatorResponded', l: 'respond (Operator)' },
      { f: 'Open', t: 'Resolved', l: 'resolve (Admin) [Refund | Compensation | Replacement] / Refund instruction; full refund → order Returned' },
      { f: 'OperatorResponded', t: 'Resolved', l: 'resolve (Admin)' },
      { f: 'Escalated', t: 'Resolved', l: 'resolve (Admin)', pts: [[520, 170]] },
      { f: 'Open', t: 'Rejected', l: 'resolve (Admin) [Rejected | NoAction]', pts: [[80, 300], [560, 300]] },
      { f: 'OperatorResponded', t: 'Rejected', l: 'resolve (Admin) [Rejected | NoAction]' },
      { f: 'Escalated', t: 'Rejected', l: 'resolve (Admin) [Rejected | NoAction]' },
      { f: 'Resolved', t: '[*]' }, { f: 'Rejected', t: '[*]' },
    ],
    notes: ['An active complaint (Open, OperatorResponded, Escalated) blocks automatic order completion and customer returns.', 'Resolved refunds are deducted from the batch\'s actual revenue before the Revenue Pool is computed.'],
  },
  {
    page: 'offtake_commitment.status', fig: 'Figure 4.21', entity: 'offtake_commitment', column: 'status', owner: 'Offtake (Nhân)',
    source: 'OfftakeController.Create → OfftakeService · ReservationExpiryService.ExpireOfftakeDepositsAsync · [CS-75, PR #72] OfftakeWindowJob/OfftakeWindowService · OfftakeClaimService · OfftakePaymentHandler',
    states: [{ id: 'PendingHarvest', c: 0, r: 0 }, { id: 'WindowOpen', c: 1, r: 0 }, { id: 'Fulfilled', c: 2, r: 0, final: true }, { id: 'Cancelled', c: 0, r: 1, final: true }, { id: 'Expired', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'PendingHarvest', l: 'register (Investor) [batch Funding, own Confirmed contribution, grade price published, cap not exceeded, not related party] / deposit QR (BT)' },
      { f: 'PendingHarvest', t: 'Cancelled', l: 'deposit timeout (ReservationExpiryJob) / QR Expired, audit cancel_timeout' },
      { f: 'PendingHarvest', t: 'WindowOpen', l: 'batch Harvesting [deposit Held] (OfftakeWindowJob) / window = 48 h', style: DASHED },
      { f: 'WindowOpen', t: 'Fulfilled', l: 'claim (Investor) then balance paid (OfftakePaymentHandler) / Offtake order Paid, deposit Applied', style: DASHED },
      { f: 'WindowOpen', t: 'Expired', l: 'after(window) [stock was deliverable] / deposit Forfeited → revenue pool', style: DASHED },
      { f: 'WindowOpen', t: 'Cancelled', l: 'after(window) [not deliverable] or batch Cancelled / deposit Refunded', style: DASHED },
      { f: 'Fulfilled', t: 'Cancelled', l: 'Paid offtake order cancelled (Customer) / balance refunded, deposit Forfeited', style: DASHED, pts: [[330, 300], [80, 300]] },
      { f: 'Fulfilled', t: '[*]' }, { f: 'Cancelled', t: '[*]' }, { f: 'Expired', t: '[*]' },
    ],
    notes: ['Solid transitions exist on develop; dashed transitions are implemented in PR #72 (CS-75 claim window), pending merge.', 'deposit_status has its own machine (next page); the two columns change together.'],
  },
  {
    page: 'offtake_commitment.deposit_status', fig: 'Figure 4.22', entity: 'offtake_commitment', column: 'deposit_status', owner: 'Offtake (Nhân)',
    source: 'OfftakeDepositHandler.OnPaidAsync · [CS-75] OfftakePaymentHandler · OfftakeWindowService.CloseOneAsync/RefundOneAsync · OrderCancellationService.ForfeitOfftakeDepositAsync',
    states: [{ id: 'Pending', c: 0, r: 0 }, { id: 'Held', c: 1, r: 0 }, { id: 'Applied', c: 2, r: 0, final: true }, { id: 'Refunded', c: 1, r: 1, final: true }, { id: 'Forfeited', c: 2, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Pending', l: 'commitment registered / deposit = round(value × offtake_deposit_pct)' },
      { f: 'Pending', t: 'Held', l: 'deposit webhook OfftakeDeposit [status ≠ Cancelled] / audit deposit_held' },
      { f: 'Held', t: 'Applied', l: 'balance paid in window / deposit counted toward the offtake order', style: DASHED },
      { f: 'Held', t: 'Forfeited', l: 'window expired, stock deliverable / forfeited deposit → actual revenue', style: DASHED },
      { f: 'Held', t: 'Refunded', l: 'not deliverable or batch Cancelled / Refund instruction', style: DASHED },
      { f: 'Applied', t: 'Forfeited', l: 'paid offtake order cancelled', style: DASHED },
      { f: 'Pending', t: '[*]', l: 'commitment Cancelled on timeout (deposit never held)' },
      { f: 'Applied', t: '[*]' }, { f: 'Refunded', t: '[*]' }, { f: 'Forfeited', t: '[*]' },
    ],
    notes: ['On develop a timed-out deposit leaves deposit_status = Pending while status becomes Cancelled (documented gap).'],
  },
  // ---------- Viên: Operators / Boxes / Batches / Production / Harvest ----------
  {
    page: 'operator.status', fig: 'Figure 4.23', entity: 'operator', column: 'status', owner: 'Operators (Viên)',
    source: 'OperatorsController.Create/Update/Submit → OperatorService · AdminOperatorsController.Approve/Reject/Suspend → OperatorReviewService.DecideAsync',
    states: [{ id: 'Draft', c: 0, r: 0 }, { id: 'Submitted', c: 1, r: 0 }, { id: 'Approved', c: 2, r: 0 }, { id: 'Rejected', c: 1, r: 1, final: true }, { id: 'Suspended', c: 2, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Draft', l: 'create profile (any Active user) [not already a member] / operator_member Owner, role OperatorMember' },
      { f: 'Draft', t: 'Draft', l: 'edit profile (Owner | Staff)' },
      { f: 'Draft', t: 'Submitted', l: 'submit (Owner) [legal name, tax code, registration no, farm address filled] / submitted_at' },
      { f: 'Submitted', t: 'Approved', l: 'approve (Admin) [approvedSlotCapacity ≥ 0] / approved_at, approved_by; audit operator/approve' },
      { f: 'Submitted', t: 'Rejected', l: 'reject (Admin) [reason] / audit operator/reject' },
      { f: 'Rejected', t: 'Rejected', l: 'edit profile (no resubmit path on develop)' },
      { f: 'Approved', t: 'Suspended', l: 'suspend (Admin) [reason] / audit operator/suspend; existing batches untouched' },
      { f: 'Rejected', t: '[*]' }, { f: 'Suspended', t: '[*]' },
    ],
    notes: ['Status Approved is required by every write in Boxes, Batches (incl. admin approve), Stocking, Production logs, Box events, Harvest, Tags and Evidence upload.', 'Gap: a Rejected operator can edit but not resubmit (SubmitAsync requires Draft).'],
  },
  {
    page: 'physical_slot.status', fig: 'Figure 4.24', entity: 'physical_slot', column: 'status', owner: 'Boxes (Viên) · Production, Harvest (Viên)',
    source: 'BoxesController.Create/Range/Update → BoxService · StockingService.StockAsync · SlotEventService.RecordAsync (ClaimAvailableAsync / ReleaseSlotAsync) · HarvestService.RecordAsync',
    states: [{ id: 'Available', c: 0, r: 0 }, { id: 'Occupied', c: 1, r: 0 }, { id: 'Maintenance', c: 0, r: 1 }],
    trans: [
      { f: '[*]', t: 'Available', l: 'register boxes (Owner) [operator Approved, count ≤ approved_slot_capacity, code unique]' },
      { f: 'Available', t: 'Maintenance', l: 'set maintenance (Owner) [no open allocation]' },
      { f: 'Maintenance', t: 'Available', l: 'set available (Owner)', pts: [[30, 230]] },
      { f: 'Available', t: 'Occupied', l: 'stocking (Owner) | restock into box | relocation destination / slot_allocation opened' },
      { f: 'Occupied', t: 'Available', l: 'mortality event | relocation source | harvest of the crab / slot_allocation.released_at', pts: [[400, 240], [120, 240]] },
    ],
    notes: ['Occupied → Maintenance is refused (422 box.in_use); every claim requires Available. Boxes are never deleted.', 'Conditional UPDATEs guard races: 0 rows → 409 slot_events.conflict / stocking.slot_conflict / harvest.concurrent_change.'],
  },
  {
    page: 'standard_cost_version.status', fig: 'Figure 4.25', entity: 'standard_cost_version', column: 'status', owner: 'Batches (Viên)',
    source: 'BatchService.SaveCostAsync/SubmitAsync · BatchReviewService.ApproveAsync/RequestRevisionAsync · triggers tr_cost_version_locked, tr_cost_item_locked, tr_cost_plan_locked',
    states: [{ id: 'Draft', c: 0, r: 0 }, { id: 'Submitted', c: 1, r: 0 }, { id: 'Locked', c: 2, r: 0, final: true }, { id: 'Superseded', c: 1, r: 1, final: true }, { id: 'Approved', c: 2, r: 1 }],
    trans: [
      { f: '[*]', t: 'Draft', l: 'save standard cost (Owner) [batch Draft, no Locked version] / version_no = latest + 1' },
      { f: 'Draft', t: 'Draft', l: 'save again / items and tranche plan replaced' },
      { f: 'Draft', t: 'Submitted', l: 'submit batch (Owner) [mortality reserve item, schedule complete] / submitted_at' },
      { f: 'Submitted', t: 'Locked', l: 'approve batch (Admin) / locked_at, approved_by; items & plan immutable (triggers)' },
      { f: 'Submitted', t: 'Superseded', l: 'save cost after request-revision / new Draft version in the same transaction' },
      { f: 'Submitted', t: 'Approved', l: 'allowed by CHECK, never written by code', style: DASHED },
      { f: 'Locked', t: '[*]' }, { f: 'Superseded', t: '[*]' },
    ],
    notes: ['Reject leaves the version Submitted; a Locked version is the "Standard Cost locked before funding" of TL-11 and the settlement input (locked_standard_cost).'],
  },
  {
    page: 'crab_item.status', fig: 'Figure 4.26', entity: 'crab_item', column: 'status', owner: 'Production, Harvest (Viên) · Orders (Nhân)',
    source: 'StockingService.StockAsync · SlotEventService.RecordAsync (Mortality, Restocked, Molted, Relocated) · HarvestService.RecordAsync · OrderPackingService.PackAsync · OrderFulfilmentService.MarkCrabsSoldAsync',
    states: [{ id: 'Growing', c: 0, r: 0 }, { id: 'InStock', c: 1, r: 0 }, { id: 'Packed', c: 2, r: 0 }, { id: 'Sold', c: 3, r: 0, final: true }, { id: 'Dead', c: 0, r: 1, final: true }, { id: 'Lost', c: 1, r: 1, final: true }, { id: 'DeliveredInKind', c: 3, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Growing', l: 'stocking (Owner) | restock (Owner/Staff) [replaces a Dead crab in the same box, before restock cutoff, evidence photo] / crab_item_event Stocked' },
      { f: 'Growing', t: 'Growing', l: 'molted | relocated / crab_item_event Molted | Relocated (new allocation)' },
      { f: 'Growing', t: 'Dead', l: 'mortality event (Owner/Staff) [evidence photo of the box, not Rejected] / box Available, event Died, alert Mortality by policy' },
      { f: 'Growing', t: 'InStock', l: 'harvest record (Owner/Staff) [harvest Open] / weight_g, grade, harvest_record snapshot, tag Printed, box Available' },
      { f: 'InStock', t: 'Packed', l: 'pack order by tag scan (Operator) [order Paid, tag Active, grade matches line] / order_line_id, event Packed' },
      { f: 'Packed', t: 'Sold', l: 'deliver (Operator) | receive (Customer) / event Delivered' },
      { f: 'Growing', t: 'Lost', l: 'allowed by CHECK, never written', style: DASHED },
      { f: 'InStock', t: 'DeliveredInKind', l: 'in-kind settlement — allowed by CHECK, never written', style: DASHED, pts: [[500, 300], [860, 300]] },
      { f: 'Dead', t: '[*]' }, { f: 'Sold', t: '[*]' },
    ],
    notes: ['ck_crab_item_harvest_fields: Growing/Dead have no harvest; every other status needs harvest_id, grade_id and weight_g. One Growing crab per allocation; a crab is replaced at most once.', 'The crab code follows its box number; after harvest the printed tag carries it (per-crab traceability, Register v1.3 §3.2b).'],
  },
  {
    page: 'crab_tag.status', fig: 'Figure 4.27', entity: 'crab_tag', column: 'status', owner: 'Harvest (Viên)',
    source: 'HarvestService.RecordAsync (print) · TagsController.Activate/Void → TagsService.ActivateAsync/VoidAsync · TraceService (reads Active only)',
    states: [{ id: 'Printed', c: 0, r: 0 }, { id: 'Active', c: 1, r: 0 }, { id: 'Void', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Printed', l: 'harvest record / tag_code generated, event TagPrinted; also replacement after a void' },
      { f: 'Printed', t: 'Active', l: 'activate (Owner/Staff) [evidence photo of this crab: InAppCapture, Accepted] / activated_at, activation_evidence_id, event TagActivated' },
      { f: 'Active', t: 'Active', l: 'activate again with the same evidence (idempotent); other evidence → 409 tag.activation_conflict' },
      { f: 'Printed', t: 'Void', l: 'void (Owner) [crab InStock, reason] / voided_at, replacement tag Printed' },
      { f: 'Active', t: 'Void', l: 'void (Owner) [crab InStock, reason] / replacement tag Printed, events TagVoided + TagPrinted' },
      { f: 'Active', t: '[*]', l: 'crab Sold (tag stays Active for public trace)' }, { f: 'Void', t: '[*]' },
    ],
    notes: ['Public trace (GET /api/trace/{code}) and order packing accept Active tags only; a tag photo for activation must be taken on a Printed tag.'],
  },
  {
    page: 'harvest.lifecycle_status', fig: 'Figure 4.28', entity: 'harvest', column: 'lifecycle_status', owner: 'Harvest (Viên)',
    source: 'HarvestController.Start/Record/Complete → HarvestService.StartAsync/RecordAsync/CompleteAsync (V016)',
    states: [{ id: 'Open', c: 0, r: 0 }, { id: 'Completed', c: 1, r: 0, final: true }, { id: 'Legacy (NULL)', c: 0, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Open', l: 'start harvest (Owner) [batch InProduction | Harvesting, no Open session] / batch → Harvesting, audit harvest/start' },
      { f: 'Open', t: 'Open', l: 'record crab (Owner/Staff) [crab Growing in this batch] / harvest_record, tag Printed, counts updated' },
      { f: 'Open', t: 'Completed', l: 'complete (Owner) [serializable; listing stock ≥ reserved] / completed_at, listing stock synced per grade, grade summaries' },
      { f: 'Completed', t: '[*]' },
    ],
    notes: ['Rows created before V016 have NULL (read-only "Legacy"). One Open session per batch; StartAsync reuses it.'],
  },
  // ---------- Khôi: Accounts / Evidence / Alerts ----------
  {
    page: 'app_user.status', fig: 'Figure 4.29', entity: 'app_user', column: 'status', owner: 'Auth (Thiện) · Accounts (Khôi)',
    source: 'AuthController.Register → AuthService.RegisterAsync · AdminAccountsController.Lock/Unlock → AdminAccountService.SetLockedAsync · JwtBearer OnTokenValidated',
    states: [{ id: 'Active', c: 0, r: 0 }, { id: 'Locked', c: 1, r: 0 }, { id: 'PendingVerification', c: 0, r: 1 }],
    trans: [
      { f: '[*]', t: 'Active', l: 'register (anonymous) [email not taken] / roles Customer (+ Investor), JWT issued' },
      { f: 'Active', t: 'Locked', l: 'lock (Admin) [not self, reason] / audit AppUser/LockUser; existing JWTs rejected (401), login → 403 auth.locked' },
      { f: 'Locked', t: 'Active', l: 'unlock (Admin) [reason] / audit UnlockUser', pts: [[400, 60]] },
      { f: 'PendingVerification', t: 'Locked', l: 'lock (Admin) — DB default value, never created by the API', style: DASHED },
      { f: 'Locked', t: 'PendingVerification', l: 'unlock restores the previous value', style: DASHED, pts: [[540, 230]] },
    ],
    notes: ['No terminal state. Every service re-checks status == Active in the database, not only the JWT.'],
  },
  {
    page: 'investor.verification_status', fig: 'Figure 4.30', entity: 'investor', column: 'verification_status', owner: 'Accounts (Khôi)',
    source: 'AccountsController.Verify → AccountService.VerifyIdentityAsync (IEkycProvider) · AdminAccountsController.ApproveException → AdminAccountService.ApproveExceptionAsync',
    states: [{ id: 'Unverified', c: 0, r: 0 }, { id: 'Verified', c: 1, r: 0, final: true }, { id: 'Rejected', c: 0, r: 1 }],
    trans: [
      { f: '[*]', t: 'Unverified', l: 'register with role Investor' },
      { f: 'Unverified', t: 'Verified', l: 'eKYC passed (Investor) [consent, ID front/back + selfie ≤ 5 MB each, provider Passed] / kyc_check Passed, verified_at; images never stored' },
      { f: 'Unverified', t: 'Rejected', l: 'eKYC failed [provider Passed = false] / kyc_check Failed, failure_reason' },
      { f: 'Rejected', t: 'Rejected', l: 'retry failed' },
      { f: 'Rejected', t: 'Verified', l: 'retry passed | approve exception (Admin) [latest check Failed, consent given, not self] / kyc_check ExceptionApproved, reviewed_by' },
      { f: 'Verified', t: '[*]', l: 'resubmit → 409 kyc.already_verified' },
    ],
    notes: ['FundingService requires Verified before a reservation (FundingEligibility). Only the result and provider reference are persisted (TL-06).'],
  },
  {
    page: 'payout_account.status', fig: 'Figure 4.31', entity: 'payout_account', column: 'status (+ name_match_status)', owner: 'Accounts (Khôi)',
    source: 'PaymentProfilesController.SavePayout → PaymentProfileService.SavePayoutAsync (IBankNameMatcher) · one Active account per owner (ux_payout_active_*) · account_no encrypted (V012)',
    states: [{ id: 'Active', c: 0, r: 0, label: 'Active<br><font style="font-size:9px">name_match Matched</font>' }, { id: 'Locked', c: 1, r: 0, label: 'Locked<br><font style="font-size:9px">name_match Mismatched</font>' }, { id: 'Closed', c: 2, r: 0 }],
    trans: [
      { f: '[*]', t: 'Active', l: 'save account (Investor | Operator Owner) [holder name matches the verified name] / kyc_check BankNameMatch Passed, audit MaintainPayoutAccount' },
      { f: '[*]', t: 'Locked', l: 'save account [holder name does not match] / BankNameMatch Failed (HTTP 200)' },
      { f: 'Locked', t: 'Active', l: 're-save same bank + number with the corrected holder name' },
      { f: 'Active', t: 'Locked', l: 're-save with a non-matching name [no payment instruction yet, else 409 payout.holder_immutable]', pts: [[400, 60]] },
      { f: 'Active', t: 'Closed', l: 'owner saves a different account / previous accounts Closed', pts: [[160, 230], [680, 230]] },
      { f: 'Locked', t: 'Closed', l: 'owner saves a different account' },
      { f: 'Closed', t: 'Active', l: 'owner saves the same bank + number again [name matches] (row reused)', pts: [[680, 40], [160, 40]] },
      { f: 'Active', t: 'Active', l: 're-save same values' },
    ],
    notes: ['Only Active accounts receive instructions (PayoutSendService, DisbursementService, SettlementPayoutService resolve the active account at send time).', 'Locked + Matched (admin lock) is guarded (403 payout.locked) but no endpoint produces it. Closed is not terminal: the same account can be reused.'],
  },
  {
    page: 'evidence.review_status', fig: 'Figure 4.32', entity: 'evidence', column: 'review_status', owner: 'Evidence (Khôi)',
    source: 'EvidenceController.Upload → EvidenceService.UploadAsync (EvidenceImageProcessor, ICrabDetector) · EvidenceReviewController.Verdict → EvidenceReviewService.DecideAsync · EvidenceExplanationsController.Explain',
    states: [{ id: 'Accepted', c: 0, r: 0, final: true }, { id: 'Watch', c: 1, r: 0 }, { id: 'Flagged', c: 2, r: 0 }, { id: 'Rejected', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Accepted', l: 'upload (Operator) [risk < 20] — risk: exact duplicate 100, similar photo 80, stale > 24 h 40, detector "no crab" ≤ 15' },
      { f: '[*]', t: 'Watch', l: 'upload [20 ≤ risk < 70]' },
      { f: '[*]', t: 'Flagged', l: 'upload [risk ≥ 70] / linked capture request stays Open' },
      { f: 'Watch', t: 'Accepted', l: 'verdict Pass (Evidence Reviewer) [no capital share or confirmed contribution in the batch]' },
      { f: 'Watch', t: 'Rejected', l: 'verdict Fail (Reviewer)' },
      { f: 'Watch', t: 'Flagged', l: 'verdict NeedMoreEvidence (Reviewer)' },
      { f: 'Flagged', t: 'Accepted', l: 'verdict Pass (Reviewer)', pts: [[680, 40], [160, 40]] },
      { f: 'Flagged', t: 'Rejected', l: 'verdict Fail (Reviewer)' },
      { f: 'Flagged', t: 'Flagged', l: 'explanation (Operator) / explained_at re-opens review for the reviewer who asked for more' },
      { f: 'Accepted', t: '[*]' }, { f: 'Rejected', t: '[*]' },
    ],
    notes: ['Detection never rejects evidence alone (weight ≤ 15): a human Evidence Reviewer decides, and never on batches they invested in (Register v1.3 §3.2b/c).', 'Accepted evidence feeds the investor timeline, tag activation and tranche gates; Flagged evidence blocks tranche release.'],
  },
  {
    page: 'capture_request.status', fig: 'Figure 4.33', entity: 'capture_request', column: 'status', owner: 'Evidence (Khôi)',
    source: 'CaptureRequestWorker (every 5 min) → CaptureRequestJob.RunAsync · EvidenceService.UploadAsync (captureRequestId) · AlertService.RaiseAsync on expiry',
    states: [{ id: 'Open', c: 0, r: 0 }, { id: 'Fulfilled', c: 1, r: 0, final: true }, { id: 'Expired', c: 1, r: 1, final: true }],
    trans: [
      { f: '[*]', t: 'Open', l: 'CaptureRequestJob [local time ≥ 09:00, batch InProduction, operator Approved, no Open or same-day request, an occupied box] / random box, due_at = +120 min, audit CreateCaptureRequest' },
      { f: 'Open', t: 'Fulfilled', l: 'evidence upload with captureRequestId (Operator) [captured_at within [requested_at, due_at], result not Flagged] / fulfilled_at, audit FulfillCaptureRequest' },
      { f: 'Open', t: 'Open', l: 'Flagged upload linked / request stays Open' },
      { f: 'Open', t: 'Expired', l: 'job [due_at < now] / audit ExpireCaptureRequest; alert EvidenceFlag (Medium, ack 2 h)' },
      { f: 'Fulfilled', t: '[*]' }, { f: 'Expired', t: '[*]' },
    ],
    notes: ['Random capture requests are the anti-staging control of TL-04: one per eligible batch per day, two-hour response window.'],
  },
  {
    page: 'alert.status', fig: 'Figure 4.34', entity: 'alert', column: 'status', owner: 'Alerts (Khôi)',
    source: 'AlertService.RaiseAsync (callers: AlertJob, ProductionLogService, SlotEventService, LowStockMonitor, CaptureRequestJob) · AlertsController.Acknowledge · AlertJobWorker (15 min) → AlertJob.RunAsync · AdminAlertsController.Resolve',
    states: [{ id: 'Open', c: 0, r: 0 }, { id: 'Acknowledged', c: 1, r: 0 }, { id: 'Escalated', c: 0, r: 1 }, { id: 'Resolved', c: 2, r: 0, final: true }],
    trans: [
      { f: '[*]', t: 'Open', l: 'raise [no Open/Escalated alert of the same batch + type] / ack_deadline = now + ackWithin; types Mortality, WaterQuality, MilestoneDelay, LowStock, DataSilence, EvidenceFlag' },
      { f: 'Open', t: 'Open', l: 'raise again / message replaced, severity only raised, deadline = min' },
      { f: 'Open', t: 'Acknowledged', l: 'acknowledge (Operator) [before ack_deadline, note 1–300] / acknowledged_at, acknowledged_by' },
      { f: 'Open', t: 'Escalated', l: 'AlertJob [ack_deadline < now] | late acknowledge / escalated_at, audit EscalateAlert' },
      { f: 'Escalated', t: 'Escalated', l: 'acknowledge after escalation / note recorded, status unchanged' },
      { f: 'Open', t: 'Resolved', l: 'resolve (Admin) [note] / audit ResolveAlert (note kept in audit only)', pts: [[160, 40], [680, 40]] },
      { f: 'Acknowledged', t: 'Resolved', l: 'resolve (Admin)' },
      { f: 'Escalated', t: 'Resolved', l: 'resolve (Admin)', pts: [[680, 230]] },
      { f: 'Resolved', t: '[*]' },
    ],
    notes: ['Acknowledged alerts are never escalated; a new occurrence after Acknowledged/Resolved creates a new Open row (suppressed if one was raised today).'],
  },
];

function drawMachine(f, m) {
  const d = f.page(m.page);
  d.caption(m.fig, `State Machine Diagram – ${m.entity}.${m.column}`, `${META} · module: ${m.owner}`);
  d.text(`<font style="font-size:9px" color="#64748b"><b>Source:</b> ${m.source}</font>`, 20, 48, 1300, 20);
  const X = (c) => 80 + c * 340, Y = (r) => 130 + r * 200;
  const W = 170, H = 54;
  // Ngắt dòng nhãn chuyển trạng thái ở khoảng 44 ký tự để không tràn sang trạng thái bên cạnh
  const wrap = (s, n = 44) => { const out = []; let line = ''; for (const w of String(s ?? '').split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line = (line + ' ' + w); } if (line.trim()) out.push(line.trim()); return out.join('<br>'); };
  const lbl = 'labelBackgroundColor=#ffffff;';
  for (const s of m.states) d.vertex(s.label ?? s.id, s.final ? S.stateFinalLike : S.state, X(s.c), Y(s.r), W, H, { key: s.id, raw: true });
  const byId = Object.fromEntries(m.states.map(s => [s.id, s]));
  let n = 0;
  for (const t of m.trans) {
    const style = (t.style ?? '') + (t.f === t.t ? S.trans + 'exitX=0.75;exitY=0;entryX=1;entryY=0.5;' : S.trans) + lbl;
    if (t.f === '[*]') {
      const s = byId[t.t]; const k = `start${n++}`;
      d.vertex('', S.start, X(s.c) - 70, Y(s.r) + H / 2 - 12, 24, 24, { key: k });
      d.edge(k, t.t, S.transStraight + lbl, { label: wrap(t.l, 30), raw: true });
    } else if (t.t === '[*]') {
      const s = byId[t.f]; const k = `end${n++}`;
      d.vertex('', S.end, X(s.c) + W / 2 - 12, Y(s.r) + H + 60, 24, 24, { key: k });
      d.edge(t.f, k, S.transStraight + lbl, { label: wrap(t.l, 30), raw: true });
    } else {
      d.edge(t.f, t.t, style, { label: wrap(t.l), points: t.pts, raw: true });
    }
  }
  const maxR = Math.max(...m.states.map(s => s.r));
  d.vertex(`<b>Notes</b><br>${(m.notes ?? []).map(x => '• ' + x).join('<br>')}`, S.note, 60, Y(maxR) + 190, 1200, 24 + (m.notes?.length ?? 0) * 18, { raw: true });
}

function indexPage(f) {
  const d = f.page('Index');
  d.caption('Figure 4.8–4.28', 'State Machine Diagrams – index of main entities with a status column', META);
  const rows = MACHINES.map(m => `<tr><td style="padding:2px 8px"><b>${m.fig}</b></td><td style="padding:2px 8px">${m.entity}.${m.column}</td><td style="padding:2px 8px">${m.states.map(s => s.id).join(', ')}</td><td style="padding:2px 8px">${m.owner}</td></tr>`).join('');
  d.text(`<table style="font-size:10px;border-collapse:collapse"><tr><th align="left" style="padding:2px 8px">Figure</th><th align="left" style="padding:2px 8px">Entity.column</th><th align="left" style="padding:2px 8px">States (CHECK constraint)</th><th align="left" style="padding:2px 8px">Module</th></tr>${rows}</table>`, 20, 60, 1300, 40 + MACHINES.length * 22);
  d.vertex('<b>Status columns without a diagram (classifications, not lifecycles):</b><br>• provider_transaction.match_status: Matched | Unmatched | LatePayment — set once when the webhook is booked, never changes.<br>• contract_template.status, risk_disclosure.status: Draft → Active → Retired — document versioning handled by seed/admin data, no API transitions.<br>• payout_account.name_match_status: Pending | Matched | Mismatched — written together with payout_account.status (see that page).<br>• harvest_record.tag_status: immutable snapshot, always "Printed" at recording time (trigger tr_harvest_record_immutable); the live state is crab_tag.status.<br>• kyc_check.result: Passed | Failed | ExceptionApproved — one row per check; only Failed → ExceptionApproved changes (UC06).', S.note, 20, 80 + MACHINES.length * 22 + 40, 1300, 120, { raw: true });
}

function run(out) {
  const f = new DrawioFile();
  indexPage(f);
  for (const m of MACHINES) drawMachine(f, m);
  f.write(path.join(out, 'CrabShare_State_Machines.drawio'));
  console.log('State machines done:', MACHINES.length);
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, MACHINES };
