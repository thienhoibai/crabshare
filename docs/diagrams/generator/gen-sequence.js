'use strict';
// Sequence Diagrams (Report 4 mục 3 Detailed Design): một sơ đồ cho mỗi luồng chính; message = operation thật của lớp nhận
// (lớp có trong Class Diagram, xem gen-class.js). Gọi controller ghi bằng tên action + route HTTP, không ghi route trơn.
//
// v3.0 · 04/11/2026 · vẽ lại theo Phiếu đăng ký v1.4 (code đối chiếu: develop @ 420a379, V001–V017).
// Sửa đợt 1 · 05/11/2026 theo ba báo cáo duyệt (R1, R2, R3):
// - SQ-01: message tới «persistence» AppDbContext là operation EF Core (Set<T>().Where(…).ToListAsync(), Add(…),
//   SaveChangesAsync(), ExecuteUpdateAsync(…), Database.BeginTransactionAsync(…)…), kèm chú thích ngắn sau dấu " — ";
//   điều kiện lỗi chuyển vào guard của alt;
// - SQ-02: UC28, UC41 ghi lý do không có sơ đồ riêng ở trang Index; ND-08: thứ tự hợp đồng ∥ VietQR theo ContributePage;
// - ND-12: QR của đơn phát khi Operator lập phiếu giao; ND-15: Crab.OrderId thay order_line_id; ND-23, ND-26, ND-36, ND-40;
// - UC-06, ND-28: tên "Rate Order", "Resolve Order Complaint"; UC54 Forfeit Deposit;
// - G-01: chữ tối thiểu 11 px; G-02: «planned» xám #64748b (lifeline và fragment nét đứt; message giữ nét liền vì nét đứt
//   là message trả về theo UML) kèm nhãn «planned»; phần đã bỏ ở v1.4 chỉ ghi trong Notes;
// - bố cục: nhãn dài hơn mũi tên bắt đầu ngay sau đầu trái (không tràn ra ngoài khung fragment), chừa chỗ sau khung
//   đóng / note / ref để nhãn kế tiếp không chạm viền; khung tiêu đề rộng bằng sơ đồ để trang hẹp in to hơn.
// Đợt 2 · 05/11/2026 (nhánh chính giao; D1–D8 đã được trưởng nhóm xác nhận):
// - D1 điều kiện mở Lô và hoàn tiền (hình chốt vốn), D2 góp theo hàng hộp, RowAllocation Held → Allocated | Released
//   (hình UC10), D3 bốn trường hợp mất cọc a–d (UC54), D4 tỷ lệ sống và D6 Standard Cost của số hộp được cấp vốn (UC38),
//   D5 tiền còn lại theo kg cân (UC29/UC30), D8 InvoicedSale với saleReason LowGrade | ForfeitResale (UC50);
// - tên UC theo brief §9.1 (UC31, UC38, UC42, UC52); §9.6 PreOrderQuota, PreOrderHold, Batch.SalesWindowDays «planned»;
// - UC17: kiểm ngưỡng nước, số đo pH / nhiệt độ / độ mặn và cảnh báo WaterQuality chuyển xuống Notes (removed in v1.4);
// - G-01: mỗi hình tự tách thành các phần (k/N) để in A4 ngang chữ ≥ 5 pt (≤ 7 lifeline, cao ≤ 1000 px), nối bằng ref;
//   chú giải chung chuyển lên trang Index; tên trang ghi "(k of N)" (dấu "/" làm hỏng tên file khi xuất ảnh).
//
// DSL: 'a->b: text' (sync) | 'a-->b: text' (reply) | 'a->>b: text' (async) | 'a->a: text' (self)
//      'alt [c]' | 'else [c]' | 'opt [c]' | 'loop [c]' | 'par' | 'end' | 'note: text' | 'ref: text'
//      tiền tố '~' cho message/fragment chưa có trong code; '{fig:KEY}' được thay bằng số hình của sơ đồ có key đó.
const path = require('path');
const { DrawioFile, S, escHtml } = require('./lib');

const VERSION = 'v3.2 · 05/11/2026 · Register v1.4';
const SEQ_FIG_BASE = 36; // Figure 4.36–4.70; bộ Class Diagram nối tiếp ngay sau (gen-class.js đọc SEQS.length)
// Số hình của các bộ khác trong SDD v3.0 (nhánh chính chốt 04/11/2026): State Machine 4.8–4.30, Activity 4.31–4.35.
const NEIGHBOUR_FIGS = 'state machines 4.8–4.30, activity 4.31–4.35';

// kind: actor | ctrl | svc | static | engine | port | db | job | ext
const L = (id, name, kind, planned = false) => [id, name, kind, planned];
const DB = L('db', 'AppDbContext', 'db'), AUD = L('audit', 'IAuditLog', 'port');

const SEQS = [
  // ======================= TP1 Thiện: gọi vốn, hợp đồng, thanh toán, quyết toán =======================
  {
    key: 'UC10', page: 'UC10 Reserve rows & capital', was: '4.40', status: 'modified', owner: 'Thiện', uc: 'UC10, UC11, UC12',
    title: 'Reserve Box Rows and Commit Capital — risk acknowledgement, reservation, contract step, VietQR, webhook confirmation',
    lifelines: [L('inv', 'Investor', 'actor'), L('fc', 'FundingController', 'ctrl'), L('fs', 'FundingService', 'svc'), L('prs', 'PaymentRequestService', 'svc'), L('gw', 'IPaymentGateway', 'port'), DB, AUD, L('psp', 'Payment intermediary', 'ext'), L('whc', 'PaymentWebhookController', 'ctrl'), L('sig', 'WebhookSignature', 'static'), L('ws', 'PaymentWebhookService', 'svc'), L('h', 'ContributionPaymentHandler', 'svc')],
    steps: [
      'inv->fc: Batch(code) · GET /api/funding/batches/{code} [web ContributePage]',
      'fc->fs: GetBatchAsync(code)',
      'fs->db: Set<Batch>().Include(BatchAccount).SingleOrDefaultAsync(code) — Funding, window, minimum contribution',
      'fs->db: Set<Contribution>().Where(batch).ToListAsync() — remaining to max_capital',
      '~fs->db: Set<BoxRow>().Where(batch, no Held or Allocated RowAllocation).ToListAsync() — open rows; CapitalVnd = BoxCount × Standard Cost per box',
      'fs-->fc: FundingBatchResponse (eligibility: KYC, risk acknowledgement; open rows «planned»)',
      'inv->fc: Acknowledge(req) · POST /api/risk-acknowledgements {versionCode} [step "Risk", UC11]',
      'fc->fs: AcknowledgeAsync(req)',
      'fs->db: InTransactionAsync(work)',
      'fs->audit: LockAsync()',
      'fs->db: Set<RiskDisclosure>().SingleOrDefaultAsync(Active)',
      'alt [not scrolled to the end | a newer disclosure is active]',
      'fs-->fc: 422 funding.must_scroll_to_end | funding.disclosure_outdated',
      'else [ok]',
      'fs->db: Add(acknowledgement)',
      'fs->db: SaveChangesAsync()',
      'fs->audit: WriteAsync("risk_acknowledgement", investorId, "acknowledge")',
      'fs-->fc: RiskAcknowledgementResponse',
      'end',
      'inv->fc: Reserve(code, req) · POST /api/batches/{code}/contributions {amount, rowCodes[] «planned»} [step "Amount"]',
      'fc->fs: ReserveAsync(code, req)',
      'fs->db: InTransactionAsync(work)',
      'fs->audit: LockAsync()',
      'fs->fs: RequireInvestorAsync()',
      'fs->fs: HasAcknowledgedActiveAsync(investorId)',
      'fs->db: Set<Batch>().FromSqlInterpolated(code, UPDLOCK HOLDLOCK).SingleOrDefaultAsync()',
      'fs->fs: IsOpen(batch, now)',
      'fs->db: Set<Contribution>().AnyAsync(live reservation of the investor)',
      'fs->db: Set<Contribution>().SumAsync(Confirmed + live Reserved)',
      'alt [not Verified | risk not acknowledged | not open | below min_contribution | reservation open | above max_capital − committed]',
      'fs-->fc: 422 funding.kyc_required | funding.risk_ack_required | funding.not_open | funding.below_min_contribution | 409 funding.reservation_exists | 422 funding.over_max_capital',
      '~else [no row chosen | a chosen row already has a Held or Allocated RowAllocation | amount ≠ Σ CapitalVnd of the chosen rows]',
      '~fs-->fc: 422 funding.row_required | 409 funding.rows_unavailable | 422 funding.amount_mismatch',
      'else [ok]',
      'fs->db: Add(contribution) — Reserved, expires_at = min(now + 30 min, funding_deadline)',
      '~fs->fs: AllocateRowsAsync(contribution, rowCodes) — one RowAllocation per chosen BoxRow, status Held',
      'fs->db: SaveChangesAsync()',
      'fs->audit: WriteAsync("contribution", id, "reserve", null, snapshot)',
      'fs-->fc: ContributionResponse (201 Created)',
      'end',
      'ref: step "Contract" — UC14 Sign Investment Contract (Figure {fig:UC14}): created while the contribution is Reserved; signing does not block the payment',
      'inv->fc: RequestPayment(id) · POST /api/contributions/{id}/payment-requests [step "VietQR", UC12]',
      'fc->fs: RequestPaymentAsync(contributionId)',
      'fs->db: InTransactionAsync(work)',
      'fs->db: Set<Contribution>().Include(Batch).SingleOrDefaultAsync(id)',
      'fs->db: Set<PaymentRequest>().FirstOrDefaultAsync(Pending, not expired)',
      'alt [not Reserved or expired | batch not open | no Open batch account]',
      'fs-->fc: 422 contribution.not_payable | funding.not_open | funding.batch_account_unavailable',
      'else [a Pending request is still valid]',
      'fs->prs: DescribeAsync(request, account, batchCode) — the same QR again',
      'else [none]',
      'fs->prs: CreateAsync("Contribution", amount, batchAccountId, accountNo, expiresAt, ForContribution(id), null)',
      'prs->gw: CreateVietQrAsync(request)',
      'gw-->prs: VietQrPayment(qrContent)',
      'prs->db: Add(paymentRequest) — Pending, reference GV…',
      'fs->db: SaveChangesAsync()',
      'fs->audit: WriteAsync("payment_request", id, "create")',
      'end',
      'fs-->fc: PaymentRequestResponse — VietQR to the batch account, countdown to expires_at',
      'inv->psp: transfer from the bank app (reference code in the memo)',
      'psp->>whc: Receive() · POST /api/webhooks/payment-provider {providerTxnId, accountNo, amount, content} + X-Signature',
      'whc->sig: Verify(secret, body, signature) — 401 webhook.bad_signature',
      'whc->ws: ProcessAsync(txn)',
      'ws->db: InTransactionAsync(work)',
      'ws->audit: LockAsync()',
      'ws->db: Set<ProviderTransaction>().SingleOrDefaultAsync(providerTxnId) — already booked → Duplicate, answered 200',
      'ws->db: Set<BatchAccount>().SingleOrDefaultAsync(accountNo)',
      'ws->ws: FindRequestAsync(content) — payment request by the reference code in the memo',
      'alt [Pending, same batch account, not expired, amount matches]',
      'ws->db: Add(providerTransaction) — In, Matched; payment request → Paid',
      'ws->db: SaveChangesAsync()',
      'ws->h: OnPaidAsync(request, paidAt)',
      'h->db: Set<Contribution>().SingleOrDefaultAsync(contributionId)',
      'h->db: SaveChangesAsync() — Reserved → Confirmed, confirmed_at',
      '~h->db: SaveChangesAsync() — RowAllocation Held → Allocated',
      'h->audit: WriteAsync("contribution", id, "confirm")',
      'else [expired, cancelled or already paid]',
      'ws->db: SaveChangesAsync() — provider transaction LatePayment; refund instruction by RefundService.CreateRefundAsync',
      'end',
      'ws->audit: WriteAsync("provider_transaction", id, "receive")',
      'ws-->whc: WebhookResult(Matched)',
      'whc-->psp: 200',
      'note: the page polls PaymentsController.Get(id) → PaymentRequestService.GetMineAsync(id) and moves to "Done" when Paid. A transfer with a different amount stays Unmatched for manual reconciliation.',
    ],
    notes: [
      'Wizard order in code (ContributePage): Risk → Amount → Contract → VietQR → Done. The contract step (Figure {fig:UC14}) and the payment can finish in either order; stocking needs both a Confirmed contribution and a fully signed contract.',
      'v1.4: investors pick box rows when reserving and later see box details only for their own rows (UC53, Figure {fig:UC53}); payment is made in full once, before the Batch opens. Contribution by box rows: amount = Σ (boxes of the row × Standard Cost per box); the minimum contribution is one row (the admin minimum stays as a floor for row capital, checked in UC07); each BoxRow belongs to the Batch, groups the allocated boxes by Box.RowCode and has no status of its own; it has at most one Held or Allocated RowAllocation — Held during the 30-minute reservation, Allocated when the contribution is Confirmed, Released when it expires or is refunded. Not on develop @ 420a379: rowCodes, BoxRow / RowAllocation, AllocateRowsAsync and the row errors («planned»).',
      'The reservation lasts Funding:ReservationMinutes = 30 (appsettings.json), capped at the funding deadline.',
    ],
  },
  {
    key: 'UC14', page: 'UC14 Sign contract', was: '4.41', status: 'kept', owner: 'Thiện', uc: 'UC14',
    title: 'Sign Investment Contract — created at the contract step, Operator first, Investor second (TL-19)',
    lifelines: [L('inv', 'Investor', 'actor'), L('op', 'Operator Owner', 'actor'), L('cc', 'ContractsController', 'ctrl'), L('cs', 'ContractService', 'svc'), L('tpl', 'ContractTemplateDocuments', 'svc'), L('pdf', 'ContractPdfRenderer', 'svc'), L('store', 'ContractFileStore', 'svc'), L('sign', 'IDigitalSigningService', 'port'), DB, AUD],
    steps: [
      'inv->cc: Create(id) · POST /api/contributions/{id}/contract [ContributePage step "Contract"]',
      'cc->cs: CreateForContributionAsync(contributionId)',
      'cs->db: InTransactionAsync(work)',
      'cs->audit: LockAsync()',
      'cs->db: Set<Contribution>().Include(Batch, InvestmentContract).SingleOrDefaultAsync(id)',
      'cs->cs: IsActive(contribution, now) — Reserved (not expired) or Confirmed',
      'alt [a contract exists]',
      'cs-->cc: the existing ContractResponse (200)',
      'else [contribution not active | batch not Funding | no Active template]',
      'cs-->cc: 422 contract.contribution_inactive | contract.batch_not_funding | 500 contract.no_active_template',
      'else [new]',
      'cs->db: Set<ContractTemplate>().FirstOrDefaultAsync(Active, effective now)',
      'cs->tpl: Read(versionCode, contentHash)',
      'cs->tpl: Fill(template, values) — loss rule, floor price and remuneration tiers come from the template (Register v1.4, section 4)',
      'cs->pdf: Render(doc)',
      'pdf-->cs: byte[] pdf',
      'cs->store: SaveAsync(contractNo, pdf)',
      'store-->cs: (uri, sha256)',
      'cs->db: Add(contract) — Draft, DigitalSignature, draft_hash',
      'cs->db: SaveChangesAsync()',
      'cs->audit: WriteAsync("investment_contract", id, "create")',
      'cs-->cc: ContractResponse (Draft)',
      'end',
      'note: signing does not block the payment: the Investor can go on to the VietQR step at once (Figure {fig:UC10}); stocking needs a Confirmed contribution and a fully signed contract (FundingReadiness).',
      'op->cc: Sign(id) · POST /api/contracts/{id}/sign',
      'cc->cs: SignAsync(contractId)',
      'cs->db: InTransactionAsync(work)',
      'cs->audit: LockAsync()',
      'cs->db: Set<InvestmentContract>().Include(Contribution, Template).SingleOrDefaultAsync(id)',
      'cs->cs: SignerRoleAsync(contract) — "Operator" for the Owner of the batch operator',
      'alt [not a party | Void | FullySigned | offline-signed | contribution not active]',
      'cs-->cc: 403 contract.owner_only | contract.not_party | 422 contract.void | 409 contract.already_signed | 422 contract.not_digital | contract.contribution_inactive',
      'else [Draft]',
      'cs->store: ReadAsync(contractNo, sha256)',
      'cs->sign: SignAsync(pdf, signerName, "Operator")',
      'sign-->cs: SignedDocument (sandbox: FakeSigningService stamp)',
      'cs->store: SaveAsync(contractNo, pdf) — new version, new sha256',
      'cs->db: Add(signature) — Operator, order 1; contract → OperatorSigned',
      'cs->db: SaveChangesAsync()',
      'cs->audit: WriteAsync("investment_contract", id, "sign")',
      'cs-->cc: ContractResponse (OperatorSigned)',
      'end',
      'inv->cc: Sign(id) · POST /api/contracts/{id}/sign',
      'cc->cs: SignAsync(contractId)',
      'alt [still Draft — the Investor tries first]',
      'cs-->cc: 422 contract.wrong_signing_order',
      'else [OperatorSigned]',
      'cs->sign: SignAsync(pdf, signerName, "Investor")',
      'cs->db: Add(signature) — Investor, order 2; FullySigned, final_hash, final_file_uri',
      'cs->db: SaveChangesAsync()',
      'cs->audit: WriteAsync("investment_contract", id, "sign")',
      'cs-->cc: ContractResponse (FullySigned)',
      'end',
      'inv->cc: Download(id) · GET /api/contracts/{id}/file',
      'cc->cs: GetFileAsync(contractId) — re-hash the stored file (409 contract.file_tampered)',
      'cc-->inv: application/pdf',
    ],
    notes: ['Signing runs through the Viettel signing service in sandbox (IDigitalSigningService; FakeSigningService on develop). UC15 offline upload: OfflineUpload(id, file, confirmedBothSigned) → ContractService.UploadOfflineAsync (admin). A contract is created and signed while the contribution is Reserved (not expired) or Confirmed.'],
  },
  {
    key: 'CLOSE', page: 'Funding close job', was: '4.42', status: 'modified', owner: 'Thiện', uc: 'UC10, UC27 (background job)',
    title: 'Funding Close — expire reservations; open the Batch when the minimum viable capital and the minimum pre-order ratio are reached, otherwise cancel it and refund investors and depositing Customers',
    lifelines: [L('job', 'FundingCloseJob', 'job'), L('fcs', 'FundingCloseService', 'svc'), AUD, DB, L('void', 'ContractVoiding', 'static'), L('ref', 'RefundService', 'svc')],
    steps: [
      'job->fcs: RunAsync() — every minute',
      'fcs->fcs: ExpireReservationsAsync()',
      'fcs->db: InTransactionAsync(work)',
      'fcs->audit: LockAsync()',
      'fcs->db: Set<Contribution>().Where(Reserved, expires_at < now).ToListAsync()',
      'fcs->fcs: ExpireAsync(contribution, reason, now) — the contribution and its Pending payment requests → Expired',
      'fcs->db: SaveChangesAsync()',
      '~fcs->db: SaveChangesAsync() — RowAllocation of the expired contributions Held → Released',
      'fcs->void: VoidUnsignedAsync(db, audit, contributionIds, reason, now)',
      'fcs->fcs: DueBatchIdsAsync()',
      'fcs->db: Set<Batch>().Where(Funding, capital not closed, deadline passed or confirmed ≥ max_capital).ToListAsync()',
      'loop [each due Batch]',
      'fcs->fcs: CloseBatchAsync(batchId)',
      'fcs->db: InTransactionAsync(work)',
      'fcs->audit: LockAsync()',
      'fcs->db: Set<Batch>().FromSqlInterpolated(batchId, UPDLOCK HOLDLOCK).Include(BatchAccount).SingleOrDefaultAsync()',
      'fcs->db: Set<Contribution>().Where(batch).ToListAsync()',
      'fcs->fcs: ExpireAsync(contribution, reason, now) — the remaining Reserved ones',
      '~fcs->fcs: PreOrderRatioAsync(batch) — DepositedCrabCount ÷ MaxCrabCount (PreOrderQuota)',
      'alt [minimum viable capital reached (confirmed ≥ min_viable_capital) AND pre-order ratio ≥ minPreOrderRatioPct «planned»]',
      'fcs->fcs: CloseCapitalAsync(batch, confirmed, total, reason, now)',
      'fcs->db: AddRange(capitalShares) — one per investor; total_confirmed_capital, capital_closed_at',
      'fcs->db: SaveChangesAsync()',
      '~fcs->fcs: ReleaseUnfundedRowsAsync(batch) — only the boxes of Allocated rows go into production; rows without an allocation are not stocked',
      '~fcs->fcs: ConfirmPreOrdersAsync(batch) — DepositPaid pre-orders → Confirmed',
      '~fcs->fcs: ForfeitCancelledDepositsAsync(batch) — pre-orders cancelled after paying the deposit → Forfeited; the deposit becomes ForfeitedDeposit revenue (case a: cancelled under UC55, forfeited under UC54)',
      'fcs->audit: WriteAsync("batch", id, "close_capital")',
      'else [minimum viable capital not reached, or the pre-order ratio not reached «planned»]',
      'fcs->fcs: CancelUnderfundedAsync(batch, confirmed, total, now)',
      'fcs->db: SaveChangesAsync() — batch → Cancelled',
      'fcs->audit: WriteAsync("batch", id, "cancel_underfunded")',
      'fcs->void: VoidUnsignedAsync(db, audit, contributionIds, reason, now)',
      'loop [each Confirmed contribution]',
      'fcs->ref: CreateRefundAsync(batchAccountId, amount, contributionId, null, note, now)',
      'ref->db: Add(instruction) — Refund, Created',
      'ref->db: SaveChangesAsync()',
      'ref->audit: WriteAsync("payment_instruction", id, "create")',
      'end',
      '~fcs->db: SaveChangesAsync() — RowAllocation Allocated → Released',
      '~fcs->fcs: RefundPreOrderDepositsAsync(batch)',
      '~loop [each paid deposit: DepositPaid, or cancelled after paying under UC55 (case b)]',
      '~fcs->ref: CreateRefundAsync(batchAccountId, deposit, null, orderId, note, now)',
      '~fcs->db: SaveChangesAsync() — pre-order → Refunded',
      'end',
      '~fcs->fcs: CancelPendingPreOrdersAsync(batch) — PendingPayment pre-orders → Cancelled with their Pending PreOrderDeposit requests (case d of UC55: nothing is lost)',
      'fcs->db: Set<PaymentRequest>().Where(batch account, Contribution, Pending).ToListAsync()',
      'fcs->db: SaveChangesAsync() — those requests → Cancelled',
      'end',
      'end',
      'fcs-->job: FundingCloseResult(expiredReservations, batches[])',
    ],
    notes: [
      'Opening condition: a Batch opens when the confirmed capital reaches the minimum viable capital (min_viable_capital, as in code) and the pre-order ratio reaches the admin minimum (snapshot on the Batch, UC41); otherwise it is cancelled and both investors and depositing Customers are refunded. Between minimum and target capital only the boxes of funded rows go into production (capital that cannot buy whole boxes is refunded — none with row-based contributions), and settlement subtracts the locked Standard Cost of those boxes (Figure {fig:UC38}).',
      'Not on develop @ 420a379 («planned»): the pre-order ratio, PreOrderQuota, ReleaseUnfundedRowsAsync, ConfirmPreOrdersAsync, ForfeitCancelledDepositsAsync, RefundPreOrderDepositsAsync and CancelPendingPreOrdersAsync; the code refunds contributions only and cancels only the Pending Contribution requests.',
      'Refund instructions are sent by PayoutSendService (Figure {fig:UC18}); a contribution becomes Refunded when the intermediary confirms the refund. Deposit cases a–d: Figure {fig:FORFEIT}.',
    ],
  },
  {
    key: 'UC18', page: 'UC18 UC40 Tranche & payout', was: '4.43', status: 'kept', owner: 'Thiện', uc: 'UC18, UC40',
    title: 'Request Milestone Disbursement — gate check, release, send through the intermediary (TL-03)',
    lifelines: [L('op', 'Operator Owner', 'actor'), L('adm', 'Platform Administrator', 'actor'), L('dc', 'DisbursementsController', 'ctrl'), L('ds', 'DisbursementService', 'svc'), DB, AUD, L('apc', 'AdminPaymentsController', 'ctrl'), L('pss', 'PayoutSendService', 'svc'), L('gw', 'IPaymentGateway', 'port')],
    steps: [
      'op->dc: RequestTranche(code, no) · POST /api/batches/{code}/tranches/{no}/request',
      'dc->ds: RequestAsync(batchCode, trancheNo)',
      'ds->db: InTransactionAsync(work)',
      'ds->audit: LockAsync()',
      'ds->db: Set<Batch>().Include(DisbursementTranches, BatchAccount).SingleOrDefaultAsync(code)',
      'ds->ds: GateAsync(batch, tranche, now) — previous Released; planned date reached; T1: FundingReadiness.ReadyAt; T≥2: stocked, evidence since the last release, none Flagged; T≥3: expected harvest date',
      'ds->db: Set<Evidence>().Where(batch).CountAsync(Accepted | Watch since the last release; Flagged)',
      'alt [not the Owner | the gate fails]',
      'ds-->dc: 403 tranche.owner_only | 422 tranche.not_eligible (reason)',
      'else [eligible]',
      'ds->db: SaveChangesAsync() — tranche → Requested, requested_at',
      'ds->audit: WriteAsync("disbursement_tranche", id, "request")',
      'ds-->dc: TrancheResponse',
      'end',
      'adm->dc: Release(id) · POST /api/admin/tranches/{id}/release',
      'dc->ds: ReleaseAsync(trancheId)',
      'ds->db: InTransactionAsync(work)',
      'ds->audit: LockAsync()',
      'ds->db: Set<DisbursementTranche>().Include(Batch).SingleOrDefaultAsync(id)',
      'ds->ds: GateAsync(batch, tranche, now) — re-checked, status ignored',
      'ds->db: Set<PayoutAccount>().FirstOrDefaultAsync(operator, Active)',
      'ds->db: Set<PaymentInstruction>().SumAsync(Disbursement, not Failed)',
      'alt [not Requested | gate fails | batch account not Open | no payout account | released + amount > total_confirmed_capital]',
      'ds-->dc: 422 tranche.not_requested | tranche.not_eligible | payment.batch_account_unavailable | payment.no_payout_account | payment.insufficient_capital',
      'else [ok]',
      'ds->db: Add(instruction) — Disbursement, Created; tranche → Released, released_at',
      'ds->db: SaveChangesAsync()',
      'ds->audit: WriteAsync("disbursement_tranche", id, "release")',
      'ds-->dc: TrancheResponse (Released)',
      'end',
      'note: NeedExplanation(id, req) / Block(id, req) → RequestExplanationAsync / BlockAsync move a Requested tranche to NeedsExplanation or Blocked.',
      'adm->apc: Send(id) · POST /api/admin/payment-instructions/{id}/send',
      'apc->pss: SendAsync(instructionId)',
      'pss->db: InTransactionAsync(work)',
      'pss->db: Set<PaymentInstruction>().Include(BatchAccount, Contribution).SingleOrDefaultAsync(id)',
      'alt [not Created / Failed | batch account not Open | no payout account]',
      'pss-->apc: 409 payment.instruction_already_sent | 422 payment.batch_account_unavailable | payment.no_payout_account',
      'else [ok]',
      'pss->gw: SendPayoutAsync(request) — reference CHI{id}; to the payout account, the original sender (refund) or the state treasury (tax)',
      'gw-->pss: PayoutResult(accepted | rejected, providerTxnId)',
      'pss->db: Add(providerTransaction) — Out, Matched, when accepted',
      'pss->db: SaveChangesAsync() — instruction → Succeeded (completed_at) or Failed (can be sent again)',
      'pss->audit: WriteAsync("payment_instruction", id, "send")',
      'pss-->apc: PaymentInstructionResponse',
      'end',
    ],
    notes: ['UC40: Unmatched() → PayoutSendService.ListUnmatchedAsync() lists provider transactions that need manual reconciliation. No real money moves: the intermediary runs in sandbox.'],
  },
  {
    key: 'UC38', page: 'UC38 Run settlement calculation', was: '4.44', status: 'modified', owner: 'Thiện', uc: 'UC38',
    title: 'Run Settlement Calculation — four revenue sources, Revenue Pool, survival rate and remuneration tier, largest-remainder lines, loss cap',
    lifelines: [L('adm', 'Platform Administrator', 'actor'), L('asc', 'AdminSettlementsController', 'ctrl'), L('ss', 'SettlementService', 'svc'), DB, L('calc', 'SettlementCalculator', 'engine'), L('alloc', 'LargestRemainderAllocator', 'engine'), AUD],
    steps: [
      'adm->asc: Calculate(code, req) · POST /api/admin/batches/{code}/settlements {taxWithholdingPct}',
      'asc->ss: CalculateAsync(batchCode, req)',
      'ss->db: InTransactionAsync(work)',
      'ss->audit: LockAsync()',
      'ss->db: Set<Batch>().FromSqlInterpolated(code, UPDLOCK HOLDLOCK).Include(Settlement).SingleOrDefaultAsync()',
      'ss->db: Set<CapitalShare>().Where(batch).ToListAsync()',
      'ss->ss: LockedCostAsync(batchId) — Locked Standard Cost and depreciation; v1.4: Standard Cost per box × funded boxes, the unused mortality reserve is not added back',
      'ss->db: Set<VBatchActualRevenue>().SingleOrDefaultAsync(batchId) — code: Completed orders + forfeited offtake deposits − complaint refunds',
      '~ss->ss: RevenueLinesAsync(batchId) — DeliveredOrder (past the return window) + InvoicedSale (LowGrade, ForfeitResale) + ForfeitedDeposit + FinalOrder (≥ floor price) − Customer refunds',
      '~ss->ss: SurvivalRateAsync(batchId) — 1 − deaths in the cycle ÷ crabs first stocked in funded boxes; a restocked crab that dies counts, transit deaths do not',
      'alt [not Harvesting / Settlement | settlement locked | no capital shares | no locked cost]',
      'ss-->asc: 422 settlement.batch_not_ready | 409 settlement.locked | 422 settlement.no_capital_shares | settlement.no_locked_cost',
      'else [ok]',
      'ss->calc: Calculate(input) — SettlementInput(actualRevenue, lockedStandardCost, operatorSharePct, taxWithholdingPct, shares[]) + survivalRatePct, remunerationTiers «planned»',
      '~calc->calc: RemunerationPct(survivalRatePct, tiers) — full % at or above the threshold, cut by tier below it',
      'note: inside Calculate: pool = revenue − lockedCost; remuneration = floor(pool × pct / 100) only when pool > 0; money is integer VND.',
      'alt [pool > 0]',
      'calc->alloc: Allocate(total, weights) — distributable amount by confirmed capital',
      'alloc-->calc: shares that sum exactly to the distributable amount',
      'else [pool ≤ 0]',
      'calc->calc: AllocateLoss(loss, capital) — pro rata, each capped at own capital, re-spread; the rest is uncovered loss (Operator)',
      'end',
      'calc-->ss: SettlementResult(revenuePool, operatorRemuneration, distributable, uncoveredLoss, taxTotal, lines[])',
      'alt [first calculation]',
      'ss->db: Add(settlement) — Draft, revision 1, one SettlementLine per investor; batch Harvesting → Settlement',
      '~ss->db: AddRange(revenueLines) — type DeliveredOrder | InvoicedSale | ForfeitedDeposit | FinalOrder',
      'ss->db: SaveChangesAsync()',
      'ss->audit: WriteAsync("batch", id, "start_settlement")',
      'ss->audit: WriteAsync("settlement", id, "calculate", null, snapshot + revenue sources)',
      'else [recalculate Draft | Proposed | Disputed]',
      'ss->db: RemoveRange(lines)',
      'ss->db: SaveChangesAsync() — revision + 1, new lines, back to Draft',
      'ss->audit: WriteAsync("settlement", id, "recalculate", before, after)',
      'end',
      'ss-->asc: SettlementResponse (revenue sources, pool, remuneration, lines, audit anchors)',
      'asc-->adm: 200 — amounts only, never an expected return or yield (BR-49)',
      'end',
    ],
    notes: [
      'Worked example (Register v1.4): revenue 300,000,000 = delivered 190,000,000 + invoiced sale (low-grade) 10,000,000 + forfeited deposit 6,000,000 + final order 94,000,000; locked Standard Cost 100,000,000 → Pool 200,000,000; survival 90 % ≥ 85 % → remuneration 10 % = 20,000,000; A 42,000,000, B 42,000,000, C 196,000,000. At 80 % survival the remuneration halves to 10,000,000.',
      'Not on develop @ 420a379: RevenueLine, RemunerationTier, RevenueLinesAsync, SurvivalRateAsync and RemunerationPct («planned»); the code applies a fixed operator_share_pct (5–10 %) and reads one total from v_batch_actual_revenue. RevenueLine type InvoicedSale covers both the low-grade sale and the resale after a forfeit (saleReason LowGrade | ForfeitResale).',
      'Survival rate = 1 − deaths in the cycle ÷ crabs first stocked in the funded boxes (restocked crabs that die count as deaths; transit deaths only lower revenue) and picks the remuneration tier; settlement always subtracts the full locked Standard Cost of the funded boxes — savings, including the unused mortality reserve, stay with the Operator and are not added to the Pool; unspent capital is returned only on early liquidation.',
    ],
  },
  {
    key: 'UC37', page: 'UC37 UC35 UC36 Proposal & feedback', was: '4.45', status: 'kept', owner: 'Thiện', uc: 'UC37, UC35, UC36',
    title: 'Publish Settlement Proposal, Review Statement, Submit Feedback in the window (TL-14)',
    lifelines: [L('adm', 'Platform Administrator', 'actor'), L('inv', 'Investor', 'actor'), L('sc', 'SettlementsController', 'ctrl'), L('srs', 'SettlementReviewService', 'svc'), L('ss', 'SettlementService', 'svc'), DB, AUD],
    steps: [
      'adm->sc: Propose(id, req) · POST /api/admin/settlements/{id}/propose {feedbackDays}',
      'sc->srs: ProposeAsync(settlementId, req)',
      'srs->db: InTransactionAsync(work)',
      'srs->db: Set<Settlement>().SingleOrDefaultAsync(id)',
      'alt [not Draft]',
      'srs-->sc: 422 settlement.not_draft',
      'else [Draft; 7 ≤ feedbackDays ≤ 14]',
      'srs->db: SaveChangesAsync() — Proposed, proposed_at, feedback_deadline = now + feedbackDays',
      'srs->audit: WriteAsync("settlement", id, "propose")',
      'srs-->sc: SettlementResponse',
      'end',
      'inv->sc: Get(id) · GET /api/settlements/{id}',
      'sc->srs: GetForPartyAsync(settlementId)',
      'srs->srs: RequireViewerAsync(settlementId) — investor with a line | batch operator | admin; Draft hidden from parties',
      'srs->ss: DescribeAsync(settlementId, viewer)',
      'ss->db: Set<Settlement>().Include(Batch, SettlementLines, SettlementFeedbacks).SingleOrDefaultAsync(id)',
      'ss->db: Set<VBatchActualRevenue>().SingleOrDefaultAsync(batchId)',
      'ss->db: Set<AuditLog>().Where(close_capital, approve, close anchors).ToListAsync()',
      'ss-->srs: SettlementResponse — an investor sees only its own line and feedback',
      'srs-->sc: SettlementResponse',
      'sc-->inv: 200 — statement',
      'inv->sc: Feedback(id, req) · POST /api/settlements/{id}/feedback {content}',
      'sc->srs: FeedbackAsync(settlementId, req)',
      'srs->db: InTransactionAsync(work)',
      'srs->db: Set<Settlement>().Include(SettlementLines).SingleOrDefaultAsync(id)',
      'alt [not an investor of the Batch | past feedback_deadline | not Proposed / Disputed]',
      'srs-->sc: 403 settlement.investor_only | 422 settlement.feedback_closed',
      'else [in the window]',
      'srs->db: Add(feedback) — Open; settlement → Disputed',
      'srs->db: SaveChangesAsync()',
      'srs->audit: WriteAsync("settlement_feedback", id, "create")',
      'srs-->sc: SettlementResponse (Disputed)',
      'end',
      'adm->sc: Answer(id, req) · POST /api/admin/settlement-feedback/{id}/answer {response, unresolved}',
      'sc->srs: AnswerAsync(feedbackId, req)',
      'srs->db: Set<SettlementFeedback>().Include(Settlement).SingleOrDefaultAsync(id)',
      'alt [feedback not Open]',
      'srs-->sc: 409 settlement.feedback_answered',
      'else [Open]',
      'srs->db: SaveChangesAsync() — Answered | Unresolved, responded_at; no Open feedback left → settlement Proposed',
      'srs->audit: WriteAsync("settlement_feedback", id, "answer")',
      'srs-->sc: SettlementResponse',
      'end',
    ],
    notes: ['v1.4: the statement lists the four revenue sources and the remuneration tier applied (Figure {fig:UC38}); no expected return or yield is shown.'],
  },
  {
    key: 'UC39', page: 'UC39 Approve & pay out', was: '4.46', status: 'kept', owner: 'Thiện', uc: 'UC39',
    title: 'Approve Settlement and Issue Payouts — lock, payment instructions, close the Batch (TL-14, BR-30)',
    lifelines: [L('adm', 'Platform Administrator', 'actor'), L('asc', 'AdminSettlementsController', 'ctrl'), L('sps', 'SettlementPayoutService', 'svc'), DB, AUD, L('pss', 'PayoutSendService', 'svc'), L('gw', 'IPaymentGateway', 'port'), L('close', 'SettlementClosing', 'static')],
    steps: [
      'adm->asc: Approve(id) · POST /api/admin/settlements/{id}/approve',
      'asc->sps: ApproveAsync(settlementId)',
      'sps->db: InTransactionAsync(work)',
      'sps->audit: LockAsync()',
      'sps->db: Set<Settlement>().Include(Batch, SettlementLines, SettlementFeedbacks).SingleOrDefaultAsync(id)',
      'alt [Draft | already approved | open feedback | window open | batch account not Open]',
      'sps-->asc: 422 settlement.not_proposed | 409 settlement.already_approved | 422 settlement.open_feedback | settlement.window_open | payment.batch_account_unavailable',
      'else [ok]',
      'sps->db: Set<PayoutAccount>().Where(operator and investors, Active).ToListAsync()',
      'sps->db: AddRange(instructions) — TaxPayment (tax_total → state treasury), Payout (remuneration + depreciation → operator), Payout per line with net_payout > 0',
      'sps->db: SaveChangesAsync() — settlement → Approved, approved_at / by (trigger trg_settlement_locked, BR-30)',
      'sps->audit: WriteAsync("settlement", id, "approve")',
      'sps->audit: WriteAsync("payment_instruction", id, "create") — once per instruction',
      'opt [no line with net_payout > 0]',
      'sps->close: CloseIfPaidAsync(db, audit, batchId, now)',
      'end',
      'sps-->asc: SettlementResponse (Approved)',
      'end',
      'adm->asc: SendPayouts(id) · POST /api/admin/settlements/{id}/send-payouts',
      'asc->sps: SendPayoutsAsync(settlementId)',
      'sps->db: Set<PaymentInstruction>().Where(Payout | TaxPayment, Created | Failed).ToListAsync()',
      'alt [settlement not Approved]',
      'sps-->asc: 422 settlement.not_approved',
      'else [Approved]',
      'loop [each pending instruction]',
      'sps->pss: SendAsync(instructionId)',
      'pss->gw: SendPayoutAsync(request) — reference CHI{id}',
      'gw-->pss: PayoutResult(accepted | rejected)',
      'pss->db: SaveChangesAsync() — Succeeded with a ProviderTransaction Out, or Failed',
      'opt [the instruction has settlement_line_id]',
      'pss->close: CloseIfPaidAsync(db, audit, batchId, now)',
      'close->db: Set<SettlementLine>().Where(settlement).ToListAsync() — every line paid?',
      'close->db: SaveChangesAsync() — settlement PaidOut → batch Closed (closed_at) → settlement Closed',
      'close->audit: WriteAsync("settlement", id, "paid_out")',
      'close->audit: WriteAsync("batch", id, "close")',
      'close->audit: WriteAsync("settlement", id, "close")',
      'end',
      'end',
      'sps-->asc: SettlementResponse (PaidOut | Closed, audit anchors)',
      'end',
    ],
    notes: ['Approved settlements cannot be changed (trigger, BR-30). The tax line is informational: the Operator declares and pays on behalf of investors (TL-07).'],
  },

  // ======================= TP2 Viên: hộ nuôi, hộp, Lô, sản xuất, thu hoạch, truy xuất =======================
  {
    key: 'UC04', page: 'UC04 UC05 Operator application', was: '4.47', status: 'kept', owner: 'Viên', uc: 'UC04, UC05',
    title: 'Submit and Review the Operator Application',
    lifelines: [L('u', 'User (future Operator)', 'actor'), L('adm', 'Platform Administrator', 'actor'), L('oc', 'OperatorsController', 'ctrl'), L('os', 'OperatorService', 'svc'), L('aoc', 'AdminOperatorsController', 'ctrl'), L('ors', 'OperatorReviewService', 'svc'), DB, AUD],
    steps: [
      'u->oc: Create(req) · POST /api/operators {legalName, taxCode, businessRegNo, farmAddress, farm location «planned»}',
      'oc->os: CreateAsync(req)',
      'os->os: RequireActiveUserAsync(userId)',
      'os->db: Set<OperatorMember>().AnyAsync(userId)',
      'alt [already a member of a farm]',
      'os-->oc: 409 operator.already_member',
      'else [ok]',
      'os->db: Add(operator) — Draft, with OperatorMember (Owner) and AppUserRole OperatorMember',
      'os->db: SaveChangesAsync()',
      'os-->oc: OperatorResponse (201)',
      'end',
      'u->oc: Submit() · POST /api/operators/me/submit',
      'oc->os: SubmitAsync()',
      'os->os: RequireMembershipAsync(forWrite) — Owner (403 operator.owner_required)',
      'os->db: Set<Operator>().Where(Draft, required fields filled).ExecuteUpdateAsync(Submitted, submitted_at)',
      'alt [0 rows]',
      'os-->oc: 422 operator.cannot_submit',
      'else [1 row]',
      'os-->oc: OperatorResponse (Submitted)',
      'end',
      'adm->aoc: List(filter, paging) · GET /api/admin/operators?status=Submitted',
      'aoc->ors: ListAsync(filter, paging)',
      'ors->db: Set<Operator>().Where(status).ToPagedAsync(paging)',
      'ors-->aoc: PagedResult<AdminOperatorResponse>',
      'adm->aoc: Approve(id, req) · POST /api/admin/operators/{id}/approve {approvedSlotCapacity}',
      'aoc->ors: DecideAsync(id, "approve", capacity, null)',
      'ors->db: InTransactionAsync(work)',
      'ors->ors: RequireAdminAsync()',
      'ors->audit: LockAsync()',
      'ors->db: Set<Operator>().SingleOrDefaultAsync(id)',
      'alt [capacity < 0 | not found | not Submitted]',
      'ors-->aoc: 422 operator.invalid_capacity | 404 operator.not_found | 422 operator.invalid_transition',
      'else [ok]',
      'ors->db: SaveChangesAsync() — Approved, approved_slot_capacity, approved_at / by',
      'ors->audit: WriteAsync("operator", id, "approve", old, new, now)',
      'ors-->aoc: AdminOperatorResponse',
      'end',
      'note: Reject(id, req) and Suspend(id, req) use the same DecideAsync ("reject": Submitted → Rejected, "suspend": Approved → Suspended; 422 operator.reason_required).',
    ],
    notes: ['v1.4: the farm location (latitude, longitude) used by the map and the delivery radius (UC25, Figure {fig:UC25}) is «planned»; today the operator has only farm_address.'],
  },
  {
    key: 'UC44', page: 'UC44 Boxes & box rows', was: '4.48', status: 'modified', owner: 'Viên', uc: 'UC44',
    title: 'Register Boxes and Box Rows — numbered boxes within the approved capacity',
    lifelines: [L('op', 'Operator Owner', 'actor'), L('bc', 'BoxesController', 'ctrl'), L('bs', 'BoxService', 'svc'), DB],
    steps: [
      'op->bc: Range(request) · POST /api/boxes/range {from, to, width, rowCode «planned»}',
      'bc->bs: CreateRangeAsync(request)',
      'bs->bs: WriteAsync(action) — one transaction, operator row locked',
      'bs->db: Database.BeginTransactionAsync()',
      'bs->bs: MemberAsync(write) — Owner (403 box.owner_required)',
      'bs->db: Set<Operator>().FromSqlInterpolated(operatorId, UPDLOCK HOLDLOCK).SingleAsync()',
      'bs->bs: EnsureCapacityAsync(farm, added)',
      'bs->db: Set<PhysicalSlot>().CountAsync(farm)',
      'bs->db: Set<PhysicalSlot>().Where(farm).ToListAsync() — existing box codes',
      'alt [operator not Approved | count + n > approved_slot_capacity | duplicate code]',
      'bs-->bc: 422 box.operator_not_approved | box.over_capacity | 409 box.duplicate',
      'else [ok]',
      'bs->db: Database.GetDbConnection() — SqlBulkCopy.WriteToServerAsync(boxes: Available, row code «planned»)',
      'bs-->bc: BoxRangeResponse(created, from, to) — 201',
      'end',
      'op->bc: Create(request) · POST /api/boxes {slotCode, rowCode, rackNo, tierNo, columnNo}',
      'bc->bs: CreateAsync(request)',
      'bs->db: Set<PhysicalSlot>().AnyAsync(farm, slotCode) — 409 box.duplicate',
      'bs->db: Database.ExecuteSqlInterpolatedAsync(insert box) — Available, row_code = the farm row',
      'bs-->bc: BoxResponse',
      'op->bc: Update(slotCode, request) · PATCH /api/boxes/{slotCode} {status: Maintenance}',
      'bc->bs: UpdateAsync(slotCode, request)',
      'bs->db: Set<PhysicalSlot>().Where(box, Available | Maintenance, no open allocation).ExecuteUpdateAsync(status)',
      'alt [0 rows]',
      'bs-->bc: 422 box.in_use',
      'else [1 row]',
      'bs-->bc: BoxResponse',
      'end',
      'op->bc: List(query, paging) · GET /api/boxes?status=&search=&batchCode=',
      'bc->bs: ListAsync(query, paging)',
      'bs->db: Set<PhysicalSlot>().Where(filters).ToPagedAsync(paging) — with the open allocation (Batch) and the latest InAppCapture evidence',
      'bs-->bc: PagedResult<BoxResponse> — shown grouped by row_code',
    ],
    notes: [
      'v1.4: boxes are registered with their row; a BoxRow of a Batch is formed from the farm rows chosen in UC07 (Figure {fig:UC07}). physical_slot.row_code already exists (V001); the range request has no rowCode yet and the BoxRow table is «planned».',
      'Assumption to confirm: a box row = the farm boxes that share one row_code.',
    ],
  },
  {
    key: 'UC07', page: 'UC07 Batch by box rows', was: '4.49', status: 'modified', owner: 'Viên', uc: 'UC07 (uses UC49)',
    title: 'Create Batch by Box Rows and Define Standard Cost — price per kg, floor price, survival tiers, delivery radius',
    lifelines: [L('op', 'Operator Owner', 'actor'), L('bc', 'BatchesController', 'ctrl'), L('bs', 'BatchService', 'svc'), AUD, DB],
    steps: [
      'ref: UC49 Get Sale Price Range Suggestion — a seasonal price range is shown before the Operator types the price per kg (Figure {fig:UC49})',
      'op->bc: Create(req) · POST /api/batches {title, crabType, seedQuantity, cycleDays, capital range, operatorSharePct, rowCodes[], pricePerKgVnd, floorPriceVnd, survivalThresholdPct, remunerationTiers[], deliveryRadiusKm, salesWindowDays «planned»}',
      'bc->bs: CreateAsync(req)',
      'bs->bs: WriteAsync(work) — Serializable',
      'bs->db: InTransactionAsync(work, Serializable)',
      'bs->audit: LockAsync()',
      'bs->bs: MemberAsync(write) — Owner',
      'bs->db: Set<Operator>().FromSqlInterpolated(operatorId, UPDLOCK HOLDLOCK).SingleAsync()',
      'bs->bs: Validate(request)',
      '~bs->db: Set<PhysicalSlot>().Where(farm, chosen row codes, Available).ToListAsync() — Σ boxes = seed_quantity',
      'alt [not the Owner | operator not Approved | invalid data]',
      'bs-->bc: 403 batch.owner_required | 422 batch.operator_not_approved | batch.invalid_data',
      'else [ok]',
      'bs->db: Add(batch) — Draft, batch_code B-…, operator_share_pct 5–10 %',
      '~bs->bs: SyncBoxRowsAsync(batch, rowCodes) — one BoxRow per chosen row',
      '~bs->bs: SyncRemunerationTiersAsync(batch, tiers) — survival bands; remuneration never higher when survival is lower',
      'bs->db: SaveChangesAsync() — PricePerKgVnd, FloorPriceVnd, SurvivalThresholdPct, DeliveryRadiusKm, SalesWindowDays «planned» on the Batch',
      'bs->audit: WriteAsync("batch", id, "create", null, response)',
      'bs-->bc: BatchResponse (201)',
      'end',
      'op->bc: SaveCost(code, req) · PUT /api/batches/{code}/standard-cost {items[], tranches[]}',
      'bc->bs: SaveCostAsync(code, req)',
      'bs->bs: RequireUnlockedAsync(batchId) — owned Draft batch, cost not Locked',
      'bs->bs: ValidateCosts(items) — a MortalityReserve line, no overflow',
      'bs->bs: ValidateSchedule(items, plans, complete) — complete = false while drafting',
      'alt [cost locked | invalid cost lines]',
      'bs-->bc: 422 batch.cost_locked | batch.mortality_reserve_required | batch.invalid_cost',
      'else [no version yet, or the latest is not Draft]',
      'bs->db: Add(costVersion) — Draft, version_no + 1; the old version → Superseded',
      'else [a Draft version exists]',
      'bs->db: RemoveRange(costItems) — the items of the draft',
      'end',
      'bs->bs: AddCostItems(cost, items, now)',
      'bs->bs: UpdateTranchePlans(cost, tranches)',
      'bs->db: SaveChangesAsync()',
      'bs->audit: WriteAsync("batch", id, "standard_cost", before, after)',
      'bs-->bc: BatchResponse',
      'op->bc: Submit(code) · POST /api/batches/{code}/submit',
      'bc->bs: SubmitAsync(code)',
      'bs->bs: ValidateBatchTerms(batch)',
      '~bs->bs: ValidateSalesTerms(batch) — price per kg set, floor price ≤ price per kg, tiers valid, radius > 0; each row capital (boxes × Standard Cost per box) ≥ the admin minimum contribution',
      'bs->bs: ValidateSchedule(items, plans, complete) — complete = true',
      'alt [not Draft | no Draft cost with MortalityReserve | schedule incomplete]',
      'bs-->bc: 422 batch.invalid_transition | batch.mortality_reserve_required | batch.invalid_cost',
      'else [ok]',
      'bs->db: SaveChangesAsync() — batch → PendingApproval; cost → Submitted (submitted_at); rejection_reason cleared',
      'bs->audit: WriteAsync("batch", id, "submit", before, after)',
      'bs-->bc: BatchResponse (PendingApproval)',
      'end',
    ],
    notes: [
      'Not on develop @ 420a379 («planned»): box rows, price per kg, floor price, survival threshold and tiers, delivery radius (no columns in V001–V017).',
      'Removed in v1.4 (still in code): per-grade offtake prices (SyncOfftakePricesAsync → batch_offtake_price, required at submit) and the fixed caps offtake_preorder_cap_pct 60 % / offtake_deposit_pct 15 % set at create.',
    ],
  },
  {
    key: 'UC08', page: 'UC08 Approve batch', was: '4.50', status: 'modified', owner: 'Viên', uc: 'UC08',
    title: 'Review and Approve Batch — lock Standard Cost with price per kg and floor price, approve tiers, open batch account, plan tranches',
    lifelines: [L('adm', 'Platform Administrator', 'actor'), L('abc', 'AdminBatchesController', 'ctrl'), L('brs', 'BatchReviewService', 'svc'), L('bs', 'BatchService', 'svc'), AUD, DB, L('prov', 'IBatchAccountProvisioner', 'port')],
    steps: [
      'adm->abc: Get(code) · GET /api/admin/batches/{code}',
      'abc->brs: GetAsync(code)',
      'brs->brs: RequireAdminAsync()',
      'brs->db: Set<Batch>().Include(Operator, FeeTier).SingleOrDefaultAsync(code)',
      'brs->bs: CostAsync(batchId)',
      '~brs->db: Set<BoxRow>().Where(batch).ToListAsync() — with tiers, price per kg, floor price, radius',
      'brs-->abc: AdminBatchResponse (dossier, cost, tranche plan)',
      'adm->abc: Approve(code, req) · POST /api/admin/batches/{code}/approve {fundingOpenAt, fundingDeadline}',
      'abc->brs: ApproveAsync(code, req)',
      'brs->db: InTransactionAsync(work, Serializable)',
      'brs->audit: LockAsync()',
      'brs->brs: RequireAdminAsync()',
      'brs->db: Set<Operator>().FromSqlInterpolated(operatorId, UPDLOCK HOLDLOCK).SingleAsync()',
      'brs->db: Set<Batch>().FromSqlInterpolated(code, UPDLOCK HOLDLOCK).SingleAsync()',
      'brs->bs: CostAsync(batchId)',
      'brs->bs: ValidateSchedule(items, plans, complete)',
      'brs->db: Set<FeeTier>().Where(effective today, matches target capital).ToListAsync()',
      '~brs->brs: ApproveSalesTerms(batch) — floor price and remuneration tiers approved with the cost; snapshot minPreOrderRatioPct from the platform parameters (UC41)',
      'alt [not PendingApproval | bad funding window | not one Submitted cost version | schedule before funding close | not one fee tier]',
      'brs-->abc: 422 batch.invalid_transition | batch.invalid_funding_time | batch.invalid_cost_version | batch.schedule_before_funding_close | batch.invalid_fee_tier',
      'else [ok]',
      'opt [no batch account yet]',
      'brs->prov: OpenBatchAccountAsync(batchCode)',
      'prov-->brs: (providerName, accountNo)',
      'brs->db: Add(batchAccount) — Open',
      'end',
      'brs->db: AddRange(tranches) — DisbursementTranche (Planned) per tranche plan, with planned_amount',
      'brs->db: SaveChangesAsync() — batch → Funding (window, fee tier, platform fee, approved_at / by); cost version → Locked (locked_at)',
      '~brs->db: SaveChangesAsync() — PricePerKgVnd and FloorPriceVnd locked with the Standard Cost',
      'brs->audit: WriteAsync("batch", id, "approve", before, after, now)',
      'brs->audit: WriteAsync("batch_account", id, "create") — only when opened now',
      'brs-->abc: AdminBatchResponse (Funding)',
      'end',
      'note: RequestRevision(code, req) → Draft with a reason; Reject(code, req) → Rejected. TrancheScheduleJob later resolves relative tranche dates.',
    ],
    notes: [
      'v1.4: the Standard Cost is locked when funding opens, together with the price per kg and the floor price; the admin approves the floor price and the remuneration tiers. ApproveSalesTerms and the locked sales terms are «planned».',
      'Removed in v1.4 (still in code): the per-grade offtake price required at approval (422 batch.offtake_price_required).',
    ],
  },
  {
    key: 'UC09', page: 'UC09 Explore offerings', was: '4.51', status: 'modified', owner: 'Viên', uc: 'UC09',
    title: 'Explore Batch Offerings — published Standard Cost, box rows, floor price; no expected return (BR-49)',
    lifelines: [L('inv', 'Investor', 'actor'), L('bc', 'BatchesController', 'ctrl'), L('bes', 'BatchExploreService', 'svc'), DB],
    steps: [
      'inv->bc: List(query, paging) · GET /api/batches?status=&crabType=&page= [InvestorBatches / batch_explore_page.dart]',
      'bc->bes: ListAsync(query, paging)',
      'bes->bes: ReadAsync(read) — Serializable read; active user with the Investor role',
      'bes->db: Database.BeginTransactionAsync(Serializable)',
      'bes->bes: Published() — published status, approved_at ≤ now, funding_open_at ≤ now, Locked cost version',
      'bes->db: Set<Batch>().Where(published, filters).ToPagedAsync(paging) — with v_batch_funding_progress and the operator name',
      '~bes->db: Set<BoxRow>().Where(batches on the page).ToListAsync() — rows open / funded; price per kg, floor price',
      'alt [not an active investor]',
      'bes-->bc: 403 batch.investor_required',
      'else [ok]',
      'bes-->bc: PagedResult<ExploreBatchResponse> — funding progress, no expected return or yield',
      'end',
      'inv->bc: Get(code) · GET /api/batches/{code}',
      'bc->bes: GetAsync(code)',
      'bes->db: Set<Batch>().Where(published, code).SingleOrDefaultAsync() — 404 batch.not_found',
      'bes->db: Set<StandardCostVersion>().Include(StandardCostItems).SingleAsync(Locked)',
      'bes-->bc: ExploreBatchResponse — Standard Cost by category, floor price «planned», risk disclosure link',
    ],
    notes: ['Removed in v1.4 (still in code): per-grade offtake prices in the offering (LoadOfftakePricesAsync / batch_offtake_price).'],
  },
  {
    key: 'UC17', page: 'UC17 Production logs & box events', was: '4.52', status: 'kept', owner: 'Viên', uc: 'UC17',
    title: 'Record Production Logs and Box Events — stocking, daily log, mortality with evidence',
    lifelines: [L('op', 'Operator (Owner / Staff)', 'actor'), L('stc', 'StockingController', 'ctrl'), L('sts', 'StockingService', 'svc'), L('plc', 'ProductionLogsController', 'ctrl'), L('pls', 'ProductionLogService', 'svc'), L('sec', 'SlotEventsController', 'ctrl'), L('ses', 'SlotEventService', 'svc'), L('al', 'AlertService', 'svc'), AUD, DB],
    steps: [
      'op->stc: Stock(code, request) · POST /api/batches/{code}/stocking {slotCodes | range}',
      'stc->sts: StockAsync(code, request)',
      'sts->db: InTransactionAsync(work)',
      'sts->audit: LockAsync()',
      'sts->sts: RequireOwnerAsync() — Owner (403 stocking.owner_required)',
      'sts->db: Set<Operator>().FromSqlInterpolated(operatorId, UPDLOCK HOLDLOCK).SingleAsync()',
      'sts->db: Set<Batch>().FromSqlInterpolated(code, UPDLOCK HOLDLOCK).SingleOrDefaultAsync()',
      'sts->db: Set<CrabItem>().AnyAsync(batch) — stocking data already exists?',
      'sts->sts: LoadAvailableSlotsAsync(batch, request, operatorId) — count = seed_quantity, boxes exist and Available',
      '~sts->db: Set<BoxRow>().Where(batch, Allocated).ToListAsync() — only the boxes of funded rows are stocked',
      'alt [operator not Approved | already stocked | not ready (FundingReadiness) | wrong count | box unavailable]',
      'sts-->stc: 422 stocking.operator_not_approved | 409 stocking.already_stocked | 422 stocking.not_ready | stocking.quantity_mismatch | stocking.slot_unavailable',
      'else [ok]',
      'sts->db: Set<PhysicalSlot>().Where(chosen boxes, Available).ExecuteUpdateAsync(Occupied)',
      'sts->sts: AddStockingRecords(batch, slots, now) — SlotAllocation, SlotEvent Stocked, CrabItem Growing, CrabItemEvent per box',
      'sts->db: SaveChangesAsync() — batch Stocked → InProduction, stocked_at',
      'sts->audit: WriteAsync("batch", id, "stocked")',
      'sts->audit: WriteAsync("batch", id, "start_production")',
      'sts-->stc: StockingResponse (InProduction)',
      'end',
      'op->plc: Record(code, request) · POST /api/batches/{code}/production-logs {feedKg, note}',
      'plc->pls: RecordAsync(code, request)',
      'pls->db: InTransactionAsync(work)',
      'pls->audit: LockAsync()',
      'pls->db: Set<Batch>().FromSqlInterpolated(code, UPDLOCK HOLDLOCK).SingleOrDefaultAsync()',
      'pls->db: Set<ProductionLog>().AnyAsync(batch, today, Manual)',
      'alt [not InProduction / Harvesting | a Manual log today]',
      'pls-->plc: 422 production.invalid_state | 409 production.log_exists',
      'else [ok]',
      'pls->db: Add(log) — Manual: feeding (FeedKg) and note',
      'pls->db: SaveChangesAsync()',
      'pls->audit: WriteAsync("production_log", id, "record")',
      'pls-->plc: ProductionLogResponse',
      'end',
      'op->sec: Record(code, request) · POST /api/batches/{code}/slot-events {requestId, slotCode, eventType Mortality, occurredAt, evidenceId}',
      'sec->ses: RecordAsync(code, request)',
      'ses->db: InTransactionAsync(work)',
      'ses->audit: LockAsync()',
      'ses->db: Set<SlotEventDetail>().SingleOrDefaultAsync(batch, requestId) — a replay returns the stored event',
      'ses->db: Set<PhysicalSlot>().FromSqlInterpolated(slotCode, UPDLOCK HOLDLOCK).SingleOrDefaultAsync()',
      'ses->db: Set<CrabItem>().SingleOrDefaultAsync(open allocation, Growing)',
      'ses->ses: EvidenceAsync(id, batchId, slotId, earliest, now) — InAppCapture photo of this box, not Rejected, inside the allocation window',
      'alt [requestId reused | batch not recording | no Growing crab | evidence missing]',
      'ses-->sec: 409 slot_events.request_reused | 422 slot_events.invalid_state | slot_events.no_current_crab | slot_events.evidence_required',
      'else [ok]',
      'ses->db: AddRange(events) — SlotEvent, CrabItemEvent, SlotEventDetail (alive_count)',
      'ses->db: SaveChangesAsync() — crab Dead; allocation released_at; box Occupied → Available',
      'ses->ses: EnsureCountsAsync(batchId, alive) — v_crab_count_reconciliation (422 slot_events.reconciliation_failed)',
      'ses->audit: WriteAsync("slot_event", id, "record")',
      'ses->ses: RaiseMortalityAlertIfNeededAsync(batch, policy, now) — deaths in the policy window above the threshold',
      'opt [threshold exceeded]',
      'ses->al: RaiseAsync(batchId, Mortality, policy severity, message, ackWithin)',
      'end',
      'ses-->sec: SlotEventResponse',
      'end',
      'note: the same daily logs and box events can arrive from the device simulator through the Ingestion API with source FarmApi (UC52, Figure {fig:UC52}).',
    ],
    notes: ['Removed in v1.4 (still in code): water-quality thresholds (ProductionThresholdVersion; ProductionLogsController.Thresholds / Configure → ProductionLogService.ThresholdsAsync / ConfigureAsync), the Ph / WaterTempC / SalinityPpt measurements and ThresholdVersionId of ProductionLog, the plausibility check Violations(request, thresholds) → OutOfRange and the WaterQuality alert; the v1.4 simulator sends only meaningful data (feeding, photos, box events) and TL-22 dropped alerts on environmental measurements. The daily log keeps feeding and notes; health and photos are recorded as box events and evidence (UC45) or sent by the simulator (UC52).',
      'Molted, Restocked and Relocated use the same RecordAsync; restocking replaces a dead crab within the restock cut-off (mortality reserve). A few deaths are restocked; heavier losses lower revenue for all investors pro rata (Register v1.4).'],
  },
  {
    key: 'UC52', page: 'UC52 Farm device & camera data', was: '—', status: 'new', owner: 'Viên', uc: 'UC52',
    title: 'Submit Farm Device and Camera Data — the Device & Camera Simulator posts farm data through one Ingestion API',
    lifelines: [L('sim', 'Device & Camera Simulator', 'ext'), L('ic', 'IngestionController', 'ctrl', true), L('is', 'IngestionService', 'svc', true), DB, AUD, L('pls', 'ProductionLogService', 'svc'), L('ses', 'SlotEventService', 'svc'), L('fs', 'IFileStorage', 'port')],
    steps: [
      '~sim->>ic: Ingest(envelope) · POST /api/ingest/v1/messages {messages[{clientMessageId, messageType, batchCode, boxCode?, occurredAt, payload}]} + X-Api-Key',
      '~ic->is: IngestAsync(apiKey, envelope)',
      '~is->is: AuthenticateAsync(apiKey) — farm-scoped key (stored hashed), farm Approved',
      '~alt [key unknown or farm not Approved]',
      '~is-->ic: 401 ingest.unauthorized',
      '~else [ok]',
      '~loop [each message]',
      '~is->db: Set<IngestionMessage>().SingleOrDefaultAsync(operatorId, clientMessageId) — Duplicate → the stored result is returned',
      '~is->db: Add(message) — Received, payload, server ReceivedAt',
      '~is->is: DispatchAsync(message)',
      '~alt [DailyLog | Feeding | Health]',
      '~is->pls: RecordFromApiAsync(operatorId, code, request) — ProductionLog with Source FarmApi',
      '~else [BoxEvent: Molted | Mortality | Restocked | Relocated]',
      '~is->ses: RecordFromApiAsync(operatorId, code, request) — SlotEvent with Source FarmApi, same idempotency and reconciliation',
      '~else [Photo from the camera simulator]',
      '~is->fs: SaveAsync(stream, fileName, contentType, "ingest/yyyy/MM")',
      '~is->db: Add(evidence) — Source FarmApi, Photo, box: a box photo for UC53, never live evidence',
      'end',
      '~is->db: SaveChangesAsync() — message → Accepted | Rejected (RejectReason)',
      'end',
      '~is->audit: WriteAsync("ingestion_message", id, "ingest")',
      '~is-->ic: IngestionResult(accepted, duplicates, rejected[])',
      'end',
      '~ic-->sim: 202 Accepted',
    ],
    notes: [
      'UC52 «planned» — no Ingestion API on develop @ 420a379. It replaces per-farm software integration and IoT / camera hardware (out of scope); the simulator sends only meaningful farm data (feeding, health, box events, daily logs, photos), not temperature or salinity.',
      'Existing hooks: Source = FarmApi is already allowed on production_log, slot_event and evidence (V001) but not written by code. Gaps: ProductionLogRequest still requires ph / waterTempC / salinityPpt; DisbursementService.GateAsync counts evidence of every source, so it must keep only InAppCapture once device photos arrive.',
    ],
  },
  {
    key: 'UC53', page: 'UC53 Box details of own rows', was: '—', status: 'new', owner: 'Viên / Khôi', uc: 'UC53',
    title: 'View Box Details of Own Rows — row-scoped visibility; others see Batch-level figures',
    lifelines: [L('inv', 'Investor', 'actor'), L('bdc', 'BoxDetailsController', 'ctrl', true), L('bds', 'BoxDetailService', 'svc', true), DB, L('img', 'EvidenceImageReader', 'svc'), L('fs', 'IFileStorage', 'port'), L('tc', 'TimelineController', 'ctrl'), L('ts', 'TimelineService', 'svc')],
    steps: [
      '~inv->bdc: Get(code, slotCode) · GET /api/batches/{code}/boxes/{slotCode} [investor box page]',
      '~bdc->bds: GetAsync(code, slotCode)',
      '~bds->db: Set<Batch>().SingleOrDefaultAsync(code)',
      '~bds->bds: RequireRowAccessAsync(batchId, slotId) — admin and the batch operator always allowed',
      '~bds->db: Set<RowAllocation>().AnyAsync(investor, row of the box, Allocated)',
      '~alt [the box is in one of the investor\'s rows]',
      '~bds->db: Set<SlotEvent>().Where(box).ToListAsync() — stocked, molted, mortality, restocked, harvested',
      '~bds->db: Set<IngestionMessage>().Where(box, Feeding | Health).ToListAsync() — from the simulator (UC52)',
      '~bds->db: Set<Evidence>().Where(box, Accepted).ToListAsync() — InAppCapture and FarmApi photos',
      '~bds-->bdc: BoxDetailResponse (photos, feeding, health, events) — 200, no-store',
      '~inv->bdc: Photo(code, slotCode, id) · GET /api/batches/{code}/boxes/{slotCode}/photos/{id}',
      '~bdc->bds: OpenPhotoAsync(code, slotCode, id)',
      '~bds->img: OpenAsync(fileUri, "Photo")',
      'img->fs: OpenReadAsync(uri)',
      'fs-->img: stream',
      'img-->bds: EvidenceImageContent',
      '~bdc-->inv: image bytes (nosniff)',
      '~else [not an own row]',
      '~bds-->bdc: 403 box.row_access_denied',
      'inv->tc: Get(code, query) · GET /api/batches/{code}/timeline',
      'tc->ts: ReadAsync(code, query)',
      'ts-->tc: TimelinePage — Batch-level logs, events, Accepted evidence, alerts only',
      'end',
    ],
    notes: ['UC53 «planned»: BoxRow / RowAllocation, BoxDetailsController and BoxDetailService do not exist yet. Today TimelineService shows every investor of the Batch the same Batch-level timeline (Figure {fig:UC21}).'],
  },
  {
    key: 'UC21', page: 'UC21 Production timeline', was: '4.53', status: 'kept', owner: 'Viên', uc: 'UC21',
    title: 'View Production Timeline (Investor, Operator, Admin)',
    lifelines: [L('inv', 'Investor', 'actor'), L('tc', 'TimelineController', 'ctrl'), L('ts', 'TimelineService', 'svc'), DB, L('img', 'EvidenceImageReader', 'svc'), L('fs', 'IFileStorage', 'port')],
    steps: [
      'inv->tc: Get(code, query) · GET /api/batches/{code}/timeline?days=7&before= [BatchTimeline / batch_timeline.dart]',
      'tc->ts: ReadAsync(code, query)',
      'ts->ts: RequireBatchAsync(code) — Admin | operator member of the farm | investor with capital_share or a Confirmed contribution',
      'ts->db: Set<Batch>().SingleOrDefaultAsync(code)',
      'ts->db: Set<CapitalShare>().AnyAsync(investor, batch) — or a Confirmed Contribution',
      'alt [no access]',
      'ts-->tc: 403 timeline.access_denied',
      'else [ok]',
      'ts->db: Set<ProductionLog>().Where(batch, before).ToListAsync() — business dates (UTC+7) unioned with SlotEvent, Accepted Evidence and Alert; TOP(days + 1)',
      'ts->ts: ReadItemsAsync(batchId, code, first, last) — logs, box events (+ detail), Accepted evidence (file URL), alerts',
      'ts-->tc: TimelinePage(groups by day, nextBefore, hasMore) — 200, no-store; box details only for own rows (UC53 «planned»)',
      'end',
      'inv->tc: FileContent(code, id) · GET /api/batches/{code}/timeline/evidence/{id}/file',
      'tc->ts: OpenFileAsync(code, id)',
      'ts->db: Set<Evidence>().SingleOrDefaultAsync(id, batch, Accepted) — 404 timeline.evidence_not_found',
      'ts->img: OpenAsync(fileUri, "Photo")',
      'img->fs: OpenReadAsync(uri) — local file or Cloudinary',
      'fs-->img: stream',
      'img-->ts: EvidenceImageContent',
      'ts-->tc: TimelineFile',
      'tc-->inv: image bytes (X-Content-Type-Options: nosniff)',
    ],
    notes: ['v1.4 keeps this Batch-level timeline for everybody with a stake in the Batch; the per-box view of own rows is UC53 (Figure {fig:UC53}).'],
  },
  {
    key: 'UC22', page: 'UC22 Harvest per box', was: '4.54', status: 'modified', owner: 'Viên', uc: 'UC22',
    title: 'Record Harvest per Box — open a session, weigh and grade each box, complete and reconcile',
    lifelines: [L('op', 'Operator (Owner / Staff)', 'actor'), L('hc', 'HarvestController', 'ctrl'), L('hs', 'HarvestService', 'svc'), L('grade', 'HarvestGrading', 'static'), AUD, DB],
    steps: [
      'op->hc: Start(code, request) · POST /api/batches/{code}/harvests {requestId, name, note}',
      'hc->hs: StartAsync(code, request)',
      'hs->hs: WriteAsync(action) — Serializable, audit chain locked first',
      'hs->db: InTransactionAsync(work, Serializable)',
      'hs->audit: LockAsync()',
      'hs->hs: MemberAsync(owner) — Owner (403 harvest.owner_required)',
      'hs->hs: BatchAsync(code, operatorId, write) — operator Approved; batch row locked',
      'hs->db: Set<Batch>().FromSqlInterpolated(code, UPDLOCK HOLDLOCK).SingleOrDefaultAsync()',
      'hs->db: Set<HarvestStartRequestLog>().SingleOrDefaultAsync(requestId) — a replay returns the same session',
      'hs->db: Set<Harvest>().SingleOrDefaultAsync(batch, Open)',
      'alt [requestId reused with other content | batch not InProduction / Harvesting]',
      'hs-->hc: 409 harvest.request_reused | 422 harvest.invalid_state',
      'else [no Open session]',
      'hs->db: Add(harvest) — Open, revision 1; batch InProduction → Harvesting, harvest_started_at',
      'hs->audit: WriteAsync("batch", id, "start_harvest")',
      'hs->db: SaveChangesAsync()',
      'hs->audit: WriteAsync("harvest", id, "start")',
      'else [an Open session exists]',
      'hs->audit: WriteAsync("harvest", id, "continue")',
      'end',
      'hs-->hc: HarvestWriteResult (201 created | 200 existing)',
      'loop [each box of the Batch]',
      'op->hc: Record(id, request) · POST /api/harvests/{id}/crabs {requestId, slotCode, expectedCrabItemId, weightG, shellCondition}',
      'hc->hs: RecordAsync(id, request)',
      'hs->db: InTransactionAsync(work, Serializable)',
      'hs->audit: LockAsync()',
      'hs->db: Set<SlotEventDetail>().SingleOrDefaultAsync(batch, requestId) — a replay returns the stored HarvestRecord',
      'hs->hs: EnsureOpen(session, batch) — Open session of a Harvesting batch',
      'hs->db: Set<PhysicalSlot>().FromSqlInterpolated(slotCode, UPDLOCK HOLDLOCK).SingleOrDefaultAsync()',
      'hs->db: Set<CrabItem>().SingleOrDefaultAsync(open allocation of this Batch, Growing)',
      'alt [requestId reused | session not open | box empty or another crab]',
      'hs-->hc: 409 harvest.request_reused | 422 harvest.invalid_state | 409 harvest.crab_changed',
      'else [ok]',
      'hs->grade: Select(grades, weightG, shellCondition)',
      'grade-->hs: ProductGrade (L1–L4 | SOFT)',
      'hs->db: Set<CrabItem>().Where(crab, Growing).ExecuteUpdateAsync(InStock, weight_g, grade_id, harvest_id)',
      'hs->db: Set<SlotAllocation>().Where(open allocation).ExecuteUpdateAsync(released_at)',
      'hs->db: Set<PhysicalSlot>().Where(box, Occupied).ExecuteUpdateAsync(Available)',
      'hs->db: AddRange(events) — SlotEvent Harvested, CrabItemEvent Harvested, SlotEventDetail (alive_count)',
      'hs->db: Add(harvestRecord) — immutable per-box snapshot: box code, weight, shell condition, grade, recorded_at',
      'hs->db: SaveChangesAsync() — session counters + 1, revision + 1',
      'hs->hs: EnsureCountsAsync(batchId, alive)',
      'hs->audit: WriteAsync("harvest", id, "record_crab")',
      'hs-->hc: HarvestCrabResponse',
      'end',
      'end',
      'op->hc: Complete(id, request) · POST /api/harvests/{id}/complete {expectedRevision}',
      'hc->hs: CompleteAsync(id, request)',
      'hs->db: Set<HarvestRecord>().Where(harvest).ToListAsync() — grade summaries (crab count and kg per grade)',
      'alt [revision changed]',
      'hs-->hc: 409 harvest.harvest_changed',
      'else [ok]',
      'hs->db: SaveChangesAsync() — harvest → Completed, completed_at / by, revision + 1',
      'hs->audit: WriteAsync("harvest", id, "complete", before, after)',
      'hs-->hc: HarvestResponse (grade summaries)',
      'end',
    ],
    notes: [
      'v1.4: harvested boxes are assigned to delivery orders (UC29, Figure {fig:UC29}) and the order QR traces the Batch and its boxes (UC33, Figure {fig:UC33}). Each crab lives in its own numbered box, so one record per box = one record per crab.',
      'Removed in v1.4 (still in code): RecordAsync also prints a per-crab tag (IHarvestTagCodeGenerator.NewCode → crab_tag Printed, crab_item_event TagPrinted; harvest_record.tag_id / tag_code NOT NULL in V016) and CompleteAsync calls CatalogService.SyncHarvestStockAsync to refresh listings.',
    ],
  },
  {
    key: 'UC33', page: 'UC33 Trace order by QR', was: 'replaces 4.56', status: 'new', owner: 'Viên', uc: 'UC33',
    title: 'Trace Order by QR Code — farm, Batch, boxes and harvest record of a delivered order (public)',
    lifelines: [L('cus', 'Customer', 'actor'), L('trc', 'TraceController', 'ctrl'), L('trs', 'TraceService', 'svc'), DB],
    steps: [
      '~cus->trc: GetOrder(token) · GET /api/trace/orders/{token} — QR on the delivery note [TracePage / scan_page.dart]',
      '~trc->trs: GetOrderAsync(token)',
      '~trs->trs: ValidateToken(token) — format check',
      '~trs->db: Set<OrderQrCode>().Include(Order).SingleOrDefaultAsync(token)',
      '~alt [bad format | unknown or revoked token | order not Delivered / Completed]',
      '~trs-->trc: 400 trace.invalid_code | 404 trace.not_found',
      '~else [ok]',
      '~trs->db: Set<CrabItem>().Where(OrderId).Include(SlotAllocation).ToListAsync() — the boxes of the order',
      '~trs->db: Set<HarvestRecord>().Where(crabs of the order).ToListAsync() — weight, grade, shell condition, recorded_at',
      '~trs-->trc: OrderTraceResponse (farm, Batch, boxes, harvest record; no personal data, no prices) — 200, no-store',
      'end',
    ],
    notes: [
      'UC33 «planned» in v1.4: one QR per delivery order, issued when the Operator prepares the delivery note (Figure {fig:UC29}); the boxes are found through CrabItem.OrderId «planned». Traceability is still pending confirmation by Viên and Nhân.',
      'Removed in v1.4 (still in code): per-crab tag trace — TraceController.Get(tag) → TraceService.GetAsync(code) over crab_tag, tag_scan and v_traceability (v2.0 Figure 4.56).',
    ],
  },

  // ======================= TP3 Nhân: bán hàng, giao hàng, module giá =======================
  {
    key: 'UC49', page: 'UC49 Price range suggestion', was: '—', status: 'new', owner: 'Nhân', uc: 'UC49',
    title: 'Get Sale Price Range Suggestion — seasonal and holiday range from 2–3 years of prices, MAPE backtest',
    lifelines: [L('op', 'Operator Owner', 'actor'), L('psc', 'PriceSuggestionsController', 'ctrl', true), L('pss', 'PriceSuggestionService', 'svc', true), DB, L('model', 'SeasonalPriceModel', 'engine', true), L('bt', 'PriceBacktester', 'engine', true)],
    steps: [
      '~op->psc: Suggest(query) · GET /api/price-suggestions?crabType=&targetFrom=&targetTo= [batch form, UC07]',
      '~psc->pss: SuggestAsync(query)',
      '~pss->pss: LoadObservationsAsync(crabType, years) — the last 2–3 years',
      '~pss->db: Set<PriceObservation>().Where(crabType, last 3 years).ToListAsync() — Source FarmInterview | Press | Simulated',
      '~alt [too few observations]',
      '~pss-->psc: 422 price.insufficient_data',
      '~else [enough data]',
      '~pss->model: Fit(observations) — monthly seasonal index + Tết and holiday windows',
      '~model-->pss: SeasonalModel',
      '~pss->bt: Mape(model, heldOutYear) — backtest on the most recent year, held out from fitting',
      '~bt-->pss: mapePct',
      '~pss->model: PredictRange(model, targetFrom, targetTo)',
      '~model-->pss: (lowVndPerKg, midVndPerKg, highVndPerKg)',
      '~pss->db: Add(suggestion) — CrabType, TargetFrom / To, Low / Mid / High, MapePct, DataFrom / To, GeneratedAt; BatchId set later',
      '~pss->db: SaveChangesAsync()',
      '~pss-->psc: PriceSuggestion — a range with a warning, never an expected profit, return or yield (BR-49)',
      'end',
    ],
    notes: ['UC49 «planned» (TP3 deliverable: price dataset, suggestion module, evaluation report). The suggestion is advisory: the Operator still types pricePerKgVnd in UC07 (Figure {fig:UC07}). It is asked before the Batch exists, so PriceSuggestion.BatchId is optional and set when the Batch is saved; names follow the Logical ERD (TargetFrom / To, DataFrom / To, Source FarmInterview).'],
  },
  {
    key: 'UC25', page: 'UC25 Farms on map', was: 'replaces 4.58', status: 'new', owner: 'Nhân / Khôi', uc: 'UC25',
    title: 'Find Farms and Batches on Map — only Batches open for pre-order whose delivery radius covers the Customer',
    lifelines: [L('cus', 'Customer (bulk buyer)', 'actor'), L('fmc', 'FarmMapController', 'ctrl', true), L('fms', 'FarmMapService', 'svc', true), DB],
    steps: [
      '~cus->fmc: Search(query) · GET /api/farm-map?lat=&lng=&crabType= [map page]',
      '~fmc->fms: FindAsync(query)',
      '~fms->db: Set<Batch>().Where(Funding, pre-order open, crabs left).Include(Operator).ToListAsync() — farm location, DeliveryRadiusKm',
      '~loop [each farm]',
      '~fms->fms: DistanceKm(from, to) — great-circle distance from the address to the farm',
      'end',
      '~fms-->fmc: MapFarmResponse[] — farms whose radius covers the address: Batch, price per kg incl. delivery, crabs left, minimum order, funding deadline',
      'ref: the Customer picks a Batch → UC27 Place Bulk Pre-order with Deposit (Figure {fig:UC27})',
    ],
    notes: [
      'UC25 «planned» in v1.4. Farm location and delivery radius are «planned» columns.',
      'Removed in v1.4 (still in code): UC25 Browse Product Catalogue — ListingsController.Browse / GetPublic / Image → CatalogService.BrowseAsync over product_listing (v2.0 Figure 4.58).',
    ],
  },
  {
    key: 'UC27', page: 'UC27 Bulk pre-order', was: '4.60', status: 'modified', owner: 'Nhân', uc: 'UC27, UC12',
    title: 'Place Bulk Pre-order with Deposit — by number of crabs from a minimum quantity, while the Batch is funding',
    lifelines: [L('cus', 'Customer (bulk buyer)', 'actor'), L('pc', 'PreordersController', 'ctrl'), L('ps', 'PreorderService', 'svc'), L('prs', 'PaymentRequestService', 'svc'), L('gw', 'IPaymentGateway', 'port'), DB, AUD, L('ws', 'PaymentWebhookService', 'svc'), L('dh', 'PreOrderDepositHandler', 'svc'), L('job', 'ReservationExpiryJob', 'job'), L('rex', 'ReservationExpiryService', 'svc')],
    steps: [
      'cus->pc: Place(req) · POST /api/preorders {batchCode «planned», crabCount «planned» | quantityKg, addressId}',
      'pc->ps: PlaceAsync(req)',
      'ps->db: InTransactionAsync(work)',
      'ps->audit: LockAsync()',
      'ps->db: Set<CustomerAddress>().FirstOrDefaultAsync(addressId, customer)',
      '~ps->db: Set<Batch>().Include(BatchAccount, Operator).SingleOrDefaultAsync(batchCode) — Funding, pre-order open, the address within DeliveryRadiusKm',
      'ps->db: Set<OperatorMember>().AnyAsync(customer, operator of the Batch) — related party?',
      '~ps->ps: ValidateQuantity(req, batch) — crabCount ≥ minimum order quantity (UC41); estimatedKg = crabCount × expected kg per crab',
      'ps->db: Database.ExecuteSqlInterpolatedAsync(lock the batch row WITH (UPDLOCK, HOLDLOCK))',
      'ps->db: Set<VBatchCommitmentCap>().SingleAsync(batch) — remaining pre-order cap in kg (code)',
      '~ps->db: Set<PreOrderQuota>().SingleAsync(batch) — MaxCrabCount − HeldCrabCount − DepositedCrabCount ≥ crabCount (no overselling)',
      'alt [address not found | Batch not open for pre-order | no Open batch account | related party | cap exceeded]',
      'ps-->pc: 404 order.address_not_found | 422 preorder.batch_not_in_production (v1.4: not funding) | order.batch_account_unavailable | preorder.related_party | preorder.cap_exceeded',
      'else [ok]',
      'ps->ps: ComputeDeposit(totalAmount, depositPct) — total = estimated kg × price per kg locked on the Batch «planned»',
      'ps->db: Add(order) — PreOrder, PendingPayment, total_amount, deposit_amount',
      '~ps->db: Add(hold) — PreOrderHold of crabCount, Active until ExpiresAt (Orders:ReservationMinutes = 15)',
      'ps->prs: CreateAsync("PreOrderDeposit", deposit, batchAccountId, accountNo, now + 15 min, ForOrder(order), null)',
      'prs->gw: CreateVietQrAsync(request)',
      'gw-->prs: VietQrPayment',
      'prs->db: Add(paymentRequest) — Pending, reference DC…',
      'ps->db: SaveChangesAsync()',
      'ps->db: Set<VBatchCommitmentCap>().SingleAsync(batch) — cap re-checked after the insert',
      'ps->audit: WriteAsync("sales_order", id, "preorder")',
      'ps-->pc: PreorderResponse — deposit VietQR, expires_at (201)',
      'end',
      'alt [deposit paid before the QR expires]',
      'ref: webhook as in Figure {fig:UC10}: PaymentWebhookController.Receive → PaymentWebhookService.ProcessAsync',
      'ws->dh: OnPaidAsync(request, paidAt)',
      'dh->db: Set<SalesOrder>().SingleOrDefaultAsync(orderId)',
      'dh->db: SaveChangesAsync() — PendingPayment → DepositPaid',
      '~dh->db: SaveChangesAsync() — PreOrderHold Active → Deposited',
      'dh->audit: WriteAsync("sales_order", id, "deposit_paid")',
      'else [QR expired unpaid]',
      'job->rex: ReleaseExpiredAsync() — every minute',
      'rex->db: Set<PaymentRequest>().Where(PreOrderDeposit, Pending, expired).ToListAsync()',
      'rex->db: Set<SalesOrder>().Where(id, PendingPayment).ExecuteUpdateAsync(Cancelled, payment_timeout)',
      '~rex->db: Set<PreOrderHold>().Where(order, Active).ExecuteUpdateAsync(Released) — the crabs return to the quota; nothing is lost (case d of UC55)',
      'rex->audit: WriteAsync("sales_order", id, "cancel")',
      'end',
      'ref: Funding close (Figure {fig:CLOSE}) — Batch opens: DepositPaid → Confirmed, orders cancelled after paying → Forfeited «planned»; Batch does not open: every paid deposit refunded, pending deposit QRs cancelled «planned»',
    ],
    notes: [
      'v1.4: pre-orders are taken only while the Batch is funding, by number of crabs (or by kg) from a minimum quantity, at the price per kg fixed on the Batch (delivery included); an Investor may pre-order like a Customer, except the Operator of the Batch and related parties. The money is the weighed kg × price per kg (Figure {fig:UC29}).',
      'Code @ 420a379: the pre-order is placed on a listing while the Batch is InProduction, priced from price_history, deposit % from batch.offtake_deposit_pct, cap from v_batch_commitment_cap. Removed in v1.4 (still in code): the listing path and the balance issued at harvest (PreorderBalanceService).',
      'The pre-order quota and the 15-minute holds are PreOrderQuota (batch_preorder_quota) and PreOrderHold (preorder_hold), «planned»; the code caps kg through v_batch_commitment_cap.',
    ],
  },
  {
    key: 'UC29', page: 'UC29 UC30 Delivery & balance', was: '4.61', status: 'modified', owner: 'Nhân', uc: 'UC29, UC30',
    title: 'Deliver Order and Record Weighed Quantity; Confirm Receipt and Pay Balance — delivery note with the order QR',
    lifelines: [L('op', 'Operator (mobile)', 'actor'), L('ooc', 'OperatorOrdersController', 'ctrl'), L('pk', 'OrderPackingService', 'svc'), L('ful', 'OrderFulfilmentService', 'svc'), L('prs', 'PaymentRequestService', 'svc'), DB, AUD, L('cus', 'Customer (bulk buyer)', 'actor'), L('otc', 'OrderTrackingController', 'ctrl'), L('ws', 'PaymentWebhookService', 'svc'), L('bh', 'PreOrderBalanceHandler', 'svc'), L('job', 'OrderCompletionJob', 'job'), L('cmp', 'OrderCompletionService', 'svc')],
    steps: [
      '~op->ooc: AssignBoxes(orderNo, req) · POST /api/orders/{orderNo}/boxes {slotCodes[]} — prepare the delivery note',
      '~ooc->pk: AssignBoxesAsync(orderNo, req)',
      '~pk->db: Set<SalesOrder>().SingleOrDefaultAsync(orderNo) — Confirmed, of the operator\'s Batch',
      '~pk->db: Set<CrabItem>().Where(chosen boxes, harvested in this Batch, InStock, no OrderId).ToListAsync()',
      '~alt [order not Confirmed | box not harvested or already on an order | box count ≠ crabCount]',
      '~pk-->ooc: 422 order.boxes_invalid',
      '~else [ok]',
      '~pk->db: Set<CrabItem>().Where(chosen boxes).ExecuteUpdateAsync(Packed, OrderId)',
      '~pk->pk: IssueOrderQrAsync(order) — OrderQrCode token printed on the delivery note (UC33)',
      '~pk->db: SaveChangesAsync() — order → Packed; OrderQrCode',
      '~pk->audit: WriteAsync("sales_order", id, "assign_boxes")',
      'end',
      'op->ooc: Ship(orderNo, req) · POST /api/orders/{orderNo}/ship {carrierName, vehiclePlate, driverPhone, expectedArrivalAt}',
      'ooc->ful: ShipAsync(orderNo, req)',
      'ful->db: InTransactionAsync(work)',
      'ful->audit: LockAsync()',
      'ful->db: Set<SalesOrder>().Where(orderNo, Packed).ExecuteUpdateAsync(Shipping, shipped_at)',
      'alt [ETA outside now − 5 min … now + 7 d | not Packed | changed meanwhile]',
      'ful-->ooc: 422 fulfil.eta_invalid | fulfil.invalid_status | 409 fulfil.status_changed',
      'else [ok]',
      'ful->audit: WriteAsync("sales_order", id, "ship")',
      'ful-->ooc: OperatorOrderDetailResponse',
      'end',
      'note: at the door the Customer checks the crabs; crabs that died or spoiled in transit are set aside and not charged.',
      'alt [the Customer accepts the crabs]',
      '~op->ooc: Deliver(orderNo, req) · POST /api/orders/{orderNo}/deliver {weighedKg, transitLossKg}',
      '~ooc->ful: DeliverAsync(orderNo, req)',
      '~ful->ful: IssueBalanceAsync(order, weighedKg) — balance = weighedKg × price per kg − deposit; weighedKg = live crabs accepted (dead or spoiled left out), transitLossKg only recorded',
      '~ful->prs: CreateAsync("PreOrderBalance", balance, batchAccountId, accountNo, expiresAt, ForOrder(order), null)',
      '~prs-->ful: balance VietQR (DT…); when the result is negative the difference is refunded to the Customer',
      '~ful->db: SaveChangesAsync() — WeighedKg, TransitLossKg, BalanceVnd',
      '~ful->audit: WriteAsync("sales_order", id, "weigh")',
      '~ful-->ooc: OperatorOrderDetailResponse (balance QR)',
      'ref: the Customer pays the balance VietQR; webhook as in Figure {fig:UC10} dispatches by purpose PreOrderBalance',
      'ws->bh: OnPaidAsync(request, paidAt)',
      'bh->db: Set<SalesOrder>().SingleOrDefaultAsync(orderId)',
      '~bh->db: SaveChangesAsync() — Shipping → Delivered, paid_at, delivered_at, return_window_ends_at = + 72 h; crabs Packed → Sold',
      '~bh->db: Add(invoice) — every delivered order has one Invoice',
      'bh->audit: WriteAsync("sales_order", id, "paid")',
      'opt [the Customer also confirms in the app]',
      'cus->otc: Receive(orderNo) · POST /api/orders/{orderNo}/receive',
      'otc->ful: ReceiveAsync(orderNo)',
      'ful->db: Set<SalesOrder>().Where(orderNo, Delivered, not received).ExecuteUpdateAsync(received_at)',
      'ful->audit: WriteAsync("sales_order", id, "receive")',
      'end',
      'else [the Customer refuses the delivery or does not pay the balance]',
      'ref: UC54 Forfeit Deposit, case (c) (Figure {fig:FORFEIT})',
      'end',
      'job->cmp: CompleteDueAsync() — every minute',
      'cmp->db: Set<SalesOrder>().Where(Delivered, return window ended, no active complaint).ToListAsync() — at most 200',
      'loop [each order]',
      'cmp->audit: LockAsync()',
      'cmp->db: Set<SalesOrder>().Where(id, Delivered).ExecuteUpdateAsync(Completed, completed_at) — DeliveredOrder revenue (Figure {fig:UC38})',
      'cmp->audit: WriteAsync("sales_order", id, "complete")',
      'end',
    ],
    notes: [
      'Not on develop @ 420a379 («planned»): AssignBoxesAsync, IssueOrderQrAsync (QR issued when the Operator prepares the delivery note), the weighed DeliverAsync(orderNo, req), IssueBalanceAsync and the weighed columns; boxes are linked by CrabItem.OrderId. Today DeliverAsync(orderNo) has no weight and PreOrderBalanceHandler turns DepositPaid into Paid.',
      'Balance = weighedKg × price per kg − deposit (example: 15 kg × 420,000 = 6,300,000 VND of goods, minus the deposit); weighedKg counts only the live crabs the Customer accepts, transitLossKg is recorded but not subtracted again, and a negative result is refunded.',
      'Removed in v1.4 (still in code): PackAsync(orderNo, tagCodes) — packing by scanning crab tags — and the balance issued at harvest by PreorderBalanceService (v2.0 Figure 4.61). Vehicle dispatch is out of scope: only the delivered status is recorded.',
    ],
  },
  {
    key: 'FORFEIT', page: 'UC55 UC54 Cancel & forfeit deposit', was: '—', status: 'new', owner: 'Nhân', uc: 'UC55, UC54',
    title: 'Cancel Bulk Pre-order and Forfeit Deposit («extend» of UC27 / UC30) — (d) cancelled before paying · (a) cancelled after paying, the Batch opens · (b) the Batch does not open · (c) delivery refused or balance unpaid',
    lifelines: [L('cus', 'Customer or Investor (pre-order buyer)', 'actor'), L('otc', 'OrderTrackingController', 'ctrl'), L('ocs', 'OrderCancellationService', 'svc'), L('op', 'Operator', 'actor'), L('ooc', 'OperatorOrdersController', 'ctrl'), L('dfs', 'DepositForfeitService', 'svc', true), DB, AUD],
    steps: [
      'alt [(d) the Customer cancels before paying the deposit — PendingPayment]',
      'cus->otc: Cancel(orderNo, req) · POST /api/orders/{orderNo}/cancel {reason}',
      'otc->ocs: CancelAsync(orderNo, req)',
      'ocs->db: InTransactionAsync(work)',
      'ocs->audit: LockAsync()',
      'ocs->db: Set<SalesOrder>().Include(PaymentRequests).SingleOrDefaultAsync(orderNo)',
      'ocs->db: SaveChangesAsync() — order → Cancelled with its Pending deposit request; nothing is lost',
      'ocs->audit: WriteAsync("sales_order", id, "cancel")',
      'else [(a) or (b) the Customer cancels after paying the deposit, while the Batch is funding]',
      'cus->otc: Cancel(orderNo, req) · POST /api/orders/{orderNo}/cancel {reason}',
      'otc->ocs: CancelAsync(orderNo, req)',
      '~ocs->db: SaveChangesAsync() — DepositPaid → Cancelled; the deposit stays in the batch account until funding close (code: 422 order.cannot_cancel)',
      'ref: Funding close (Figure {fig:CLOSE}): (a) the Batch opens → ForfeitCancelledDepositsAsync: order → Forfeited, the deposit becomes ForfeitedDeposit revenue; (b) the Batch does not open → the deposit is refunded with every other deposit',
      'else [(a) the Customer cancels after the Batch has opened — Confirmed]',
      'cus->otc: Cancel(orderNo, req) · POST /api/orders/{orderNo}/cancel {reason}',
      'otc->ocs: CancelAsync(orderNo, req)',
      '~ocs->dfs: ForfeitAsync(orderNo, "customer_cancelled")',
      'else [(c) the Customer refuses the delivery or does not pay the balance]',
      '~op->ooc: RefuseDelivery(orderNo, req) · POST /api/orders/{orderNo}/refused {reason}',
      '~ooc->dfs: ForfeitAsync(orderNo, "refused_delivery")',
      'end',
      'note: ForfeitAsync(orderNo, reason) runs the same steps for both callers; an unpaid or already forfeited deposit is refused (409 order.already_forfeited «planned»).',
      '~dfs->db: InTransactionAsync(work)',
      '~dfs->audit: LockAsync()',
      '~dfs->db: Set<SalesOrder>().Include(PaymentRequests).SingleOrDefaultAsync(orderNo)',
      '~dfs->db: SaveChangesAsync() — order → Forfeited, ForfeitedAt; the deposit stays in the batch account; a Pending balance request → Cancelled',
      '~opt [case (c): crabs already packed for the order]',
      '~dfs->dfs: ReleaseBoxesForResaleAsync(order)',
      '~dfs->db: Set<CrabItem>().Where(order, Packed).ExecuteUpdateAsync(InStock, OrderId cleared)',
      'end',
      '~dfs->audit: WriteAsync("sales_order", id, "forfeit")',
      'ref: (c) the released crabs are resold through an invoiced sale with saleReason ForfeitResale (UC50, Figure {fig:UC50}); every forfeited deposit counts once as ForfeitedDeposit revenue (Figure {fig:UC38})',
    ],
    notes: [
      'Deposit cases: (a) a Customer who cancels after paying the deposit loses it once the Batch opens, and the deposit becomes Batch revenue (RevenueLine ForfeitedDeposit); (b) if the Batch does not open, every deposit is refunded, including those of cancelled orders; (c) a Customer who refuses the delivery or does not pay the balance loses the deposit and the crabs are resold through an InvoicedSale (saleReason ForfeitResale); (d) cancelling before paying the deposit (PendingPayment) costs nothing.',
      'UC55 Cancel Bulk Pre-order (Customer or Investor; the code already cancels through OrderCancellationService) covers cases (d) and (a); UC54 Forfeit Deposit extends UC27 / UC30 and is the outcome of a late cancellation (UC55) or of a refused delivery or unpaid balance (UC30). DepositForfeitService, RefuseDelivery, the Forfeited status, ForfeitedAt and cancelling a DepositPaid order are «planned»; code @ 420a379 cancels only PendingPayment and Paid orders and has no pre-order forfeiture (v_batch_actual_revenue counts only offtake deposits with deposit_status = Forfeited, which no code path writes).',
    ],
  },
  {
    key: 'UC50', page: 'UC50 Invoiced sale', was: '—', status: 'new', owner: 'Nhân', uc: 'UC50',
    title: 'Record Invoiced Sale — low-grade crabs (saleReason LowGrade) or crabs released by a forfeited order (saleReason ForfeitResale), sold with an invoice',
    lifelines: [L('op', 'Operator Owner', 'actor'), L('isc', 'InvoicedSalesController', 'ctrl', true), L('iss', 'InvoicedSaleService', 'svc', true), L('fs', 'IFileStorage', 'port'), L('prs', 'PaymentRequestService', 'svc'), DB, AUD, L('ws', 'PaymentWebhookService', 'svc'), L('iph', 'InvoicedSalePaymentHandler', 'svc', true)],
    steps: [
      '~op->isc: CreateInvoicedSale(code, req) · POST /api/batches/{code}/invoiced-sales {saleReason: LowGrade | ForfeitResale, slotCodes[] | quantityKg, buyerName, buyerTaxCode, amountVnd, invoiceNo, invoice file}',
      '~isc->iss: RecordInvoicedSaleAsync(code, req)',
      '~iss->db: InTransactionAsync(work)',
      '~iss->audit: LockAsync()',
      '~iss->db: Set<Batch>().Include(BatchAccount).SingleOrDefaultAsync(code) — Harvesting, of the operator',
      '~iss->db: Set<CrabItem>().Where(chosen boxes, InStock, no OrderId).ToListAsync() — LowGrade: weak, watery or frozen crabs; ForfeitResale: crabs released by a forfeited order (Figure {fig:FORFEIT})',
      '~alt [batch not Harvesting | crabs not available | amount ≤ 0]',
      '~iss-->isc: 422 invoiced_sale.invalid',
      '~else [ok]',
      '~iss->fs: SaveAsync(stream, "invoice.pdf", contentType, "invoices/yyyy/MM")',
      '~iss->iss: IssueInvoiceAsync(order, req) — InvoiceNo, IssuedAt, BuyerName, BuyerTaxCode, AmountVnd; the file is an Evidence (MediaType Invoice, Source DocumentUpload)',
      '~iss->db: Add(order) — InvoicedSale with saleReason, PendingPayment, TotalAmount; Invoice',
      '~iss->prs: CreateAsync("OrderPayment", amount, batchAccountId, accountNo, expiresAt, ForOrder(order), null)',
      '~prs-->iss: VietQR for the buyer',
      '~iss->db: SaveChangesAsync() — crabs InStock → Sold',
      '~iss->audit: WriteAsync("sales_order", id, "invoiced_sale")',
      '~iss-->isc: InvoicedSaleResponse (invoice, VietQR) — 201',
      'end',
      'ref: the buyer pays into the batch account; PaymentWebhookService.ProcessAsync dispatches by purpose (Figure {fig:UC10})',
      '~ws->iph: OnPaidAsync(request, paidAt) — purpose OrderPayment',
      '~iph->db: SaveChangesAsync() — order → Completed, PaidAt (counted as InvoicedSale revenue)',
    ],
    notes: [
      'One InvoicedSale order type for the low-grade sale and for the resale after a forfeit; SalesOrder.orderType ∈ {BulkPreOrder, InvoicedSale, FinalOrder}, saleReason ∈ {LowGrade, ForfeitResale}; every delivered order (BulkPreOrder, InvoicedSale, FinalOrder) has one Invoice.',
      'UC50 «planned»: no invoiced orders on develop @ 420a379. Existing hooks: Evidence already allows MediaType Invoice and Source DocumentUpload (V001, not written by code). Invoiced orders reuse the purpose OrderPayment, as in the Logical ERD (no CHECK change). Assumption to confirm: the buyer pays into the batch account, so the sale counts as collected revenue like every other order.',
    ],
  },
  {
    key: 'UC51', page: 'UC51 Final order', was: '—', status: 'new', owner: 'Nhân', uc: 'UC51',
    title: 'Record Final Order at Floor Price — leftover stock to the committed buyer, never below the floor price',
    lifelines: [L('job', 'FinalOrderReminderJob', 'job', true), L('al', 'AlertService', 'svc'), L('op', 'Operator Owner', 'actor'), L('isc', 'InvoicedSalesController', 'ctrl', true), L('iss', 'InvoicedSaleService', 'svc', true), DB, L('prs', 'PaymentRequestService', 'svc'), AUD],
    steps: [
      '~job->db: Set<Batch>().Where(Harvesting, sales window of SalesWindowDays closed, leftover crabs, no FinalOrder).ToListAsync()',
      '~job->al: RaiseAsync(batchId, FinalOrderDue, Medium, message, ackWithin)',
      'note: the committed buyer is outside the system; it committed to the floor price published before funding (UC08). The platform does not guarantee that price.',
      '~op->isc: CreateFinal(code, req) · POST /api/batches/{code}/final-order {buyerName, buyerTaxCode, quantityKg, pricePerKgVnd, invoiceNo, invoice file}',
      '~isc->iss: RecordFinalOrderAsync(code, req)',
      '~iss->db: InTransactionAsync(work)',
      '~iss->audit: LockAsync()',
      '~iss->iss: LeftoverAsync(batchId) — harvested crabs not delivered, not invoiced and not held by a pre-order',
      '~iss->db: Set<SalesOrder>().AnyAsync(batch, FinalOrder)',
      '~alt [price below FloorPriceVnd | a final order exists | quantity above leftover]',
      '~iss-->isc: 422 final_order.below_floor_price | 409 final_order.exists | 422 final_order.over_leftover',
      '~else [ok]',
      '~iss->iss: IssueInvoiceAsync(order, req)',
      '~iss->db: Add(order) — FinalOrder, total = kg × price per kg; Invoice',
      '~iss->prs: CreateAsync("OrderPayment", amount, batchAccountId, accountNo, expiresAt, ForOrder(order), null)',
      '~iss->db: SaveChangesAsync() — leftover crabs → Sold',
      '~iss->audit: WriteAsync("sales_order", id, "final_order")',
      '~iss-->isc: InvoicedSaleResponse',
      'end',
      'ref: the buyer pays into the batch account; InvoicedSalePaymentHandler.OnPaidAsync completes the order (Figure {fig:UC50}) — counted as FinalOrder revenue (Figure {fig:UC38})',
    ],
    notes: [
      'UC51 «planned»: final order, floor price column, FinalOrderReminderJob and the FinalOrderDue alert type (alert.alert_type CHECK) are not on develop @ 420a379. The committed buyer\'s resale channel is out of scope.',
      'Research invariant (Register v1.4, section 3.3, objective O1): the final order is never below the floor price; each forfeited deposit is counted once.',
    ],
  },
  {
    key: 'UC31', page: 'UC31 UC32 Return or complaint', was: '4.62', status: 'kept', owner: 'Nhân', uc: 'UC31, UC32',
    title: 'Submit Return or Complaint (complaint path) and Resolve Order Complaint — operator response, escalation, admin resolution',
    lifelines: [L('cus', 'Customer (bulk buyer)', 'actor'), L('cc', 'ComplaintsController', 'ctrl'), L('cs', 'ComplaintService', 'svc'), DB, AUD, L('op', 'Operator', 'actor'), L('job', 'ComplaintEscalationJob', 'job'), L('adm', 'Platform Administrator', 'actor'), L('acc', 'AdminComplaintsController', 'ctrl'), L('ref', 'RefundService', 'svc')],
    steps: [
      'cus->cc: Create(orderNo, req) · POST /api/orders/{orderNo}/complaints {complaintType, description, evidenceUri}',
      'cc->cs: SubmitAsync(orderNo, req)',
      'cs->db: InTransactionAsync(work)',
      'cs->audit: LockAsync()',
      'cs->db: Set<SalesOrder>().SingleOrDefaultAsync(orderNo)',
      'cs->db: Set<Complaint>().AnyAsync(order, active)',
      'alt [not the owner | not Shipping / Delivered / Completed within the return window | an active complaint]',
      'cs-->cc: 403 complaint.order_not_owner | 422 complaint.order_not_eligible | complaint.already_has_active',
      'else [ok]',
      'cs->db: Add(complaint) — Open, opened_at',
      'cs->db: SaveChangesAsync()',
      'cs->audit: WriteAsync("complaint", id, "create")',
      'cs-->cc: ComplaintDetailResponse',
      'end',
      'op->cc: Respond(id, req) · POST /api/complaints/{id}/respond {response, evidenceUri}',
      'cc->cs: RespondAsync(complaintId, req)',
      'cs->db: Set<Complaint>().Include(Order).SingleOrDefaultAsync(id) — the operator owns the Batch',
      'cs->db: SaveChangesAsync() — Open | Escalated → OperatorResponded, responded_at (422 complaint.cannot_respond)',
      'cs->audit: WriteAsync("complaint", id, "operator_respond")',
      'job->cs: EscalateOverdueAsync() — every minute',
      'cs->db: Set<Complaint>().Where(Open, opened_at ≤ now − 24 h).ToListAsync()',
      'cs->db: SaveChangesAsync() — → Escalated, escalated_at',
      'cs->audit: WriteAsync("complaint", id, "escalate")',
      'adm->acc: Resolve(id, req) · POST /api/admin/complaints/{id}/resolve {resolution, refundAmount, adminNotes}',
      'acc->cs: ResolveAsync(complaintId, req)',
      'cs->db: InTransactionAsync(work)',
      'cs->audit: LockAsync()',
      'cs->db: Set<Complaint>().Include(Order).SingleOrDefaultAsync(id)',
      'alt [already resolved | refund amount outside 0 … order total]',
      'cs-->acc: 422 complaint.already_resolved | complaint.refund_amount_invalid',
      'else [resolution Refund]',
      'cs->ref: CreateRefundAsync(batchAccountId, amount, null, orderId, note, now)',
      'ref->db: Add(instruction) — Refund, Created',
      'cs->db: SaveChangesAsync() — complaint Resolved (Refund, refund_amount); a full refund → order Returned',
      'else [Compensation | Replacement]',
      'cs->db: SaveChangesAsync() — complaint Resolved',
      'else [Rejected | NoAction]',
      'cs->db: SaveChangesAsync() — complaint Rejected (resolution NoAction)',
      'end',
      'cs->audit: WriteAsync("complaint", id, "resolve")',
      'cs-->acc: ComplaintDetailResponse',
    ],
    notes: ['Use case names: UC31 Submit Return or Complaint, UC32 Resolve Order Complaint (named after the Complaint entity). Customer refunds are settled before the Revenue Pool is computed (Figure {fig:UC38}). Returns inside the window use OrderReturnService (Return → ApproveByOperator / RejectByOperator).'],
  },
  {
    key: 'UC34', page: 'UC34 Rate order', was: '4.63', status: 'kept', owner: 'Nhân', uc: 'UC34',
    title: 'Rate Order — only Completed orders, after the return window',
    lifelines: [L('cus', 'Customer (bulk buyer)', 'actor'), L('otc', 'OrderTrackingController', 'ctrl'), L('rs', 'OrderRatingService', 'svc'), AUD, DB],
    steps: [
      'cus->otc: GetRating(orderNo) · GET /api/orders/{orderNo}/rating',
      'otc->rs: GetAsync(orderNo)',
      'rs->db: Set<SalesOrder>().SingleOrDefaultAsync(orderNo) — canRate = Completed and not rated yet',
      'rs-->otc: OrderRatingView',
      'cus->otc: Rate(orderNo, req) · POST /api/orders/{orderNo}/rating {stars, comment}',
      'otc->rs: RateAsync(orderNo, req)',
      'rs->db: InTransactionAsync(work)',
      'rs->audit: LockAsync()',
      'rs->rs: LoadOwnedWithLinesAsync(orderNo)',
      'alt [not found | not the owner | not Completed | already rated]',
      'rs-->otc: 404 order.not_found | 403 order.not_owner | 422 rating.order_not_completed | 409 rating.already_exists',
      'else [ok]',
      'rs->db: Add(rating) — one per order',
      'rs->db: SaveChangesAsync()',
      'rs->audit: WriteAsync("product_rating", id, "rate")',
      'rs-->otc: RatingResponse (201)',
      'end',
    ],
    notes: ['One name, "Rate Order"; the code allows a rating only when the order is Completed (OrderRatingService). v1.4 rates the delivered order and its farm. Removed in v1.4 (still in code): per-listing item ratings serialised as "#ITEMS:" JSON keyed by listingId.'],
  },

  // ======================= TP4 Khôi: tài khoản, bằng chứng, cảnh báo, danh mục, admin =======================
  {
    key: 'UC01', page: 'UC01 Register & login', was: '4.65', status: 'kept', owner: 'Khôi', uc: 'UC01',
    title: 'Register Account and Log In (JWT)',
    lifelines: [L('u', 'User', 'actor'), L('ac', 'AuthController', 'ctrl'), L('as', 'AuthService', 'svc'), L('lim', 'LoginAttemptLimiter', 'svc'), L('tok', 'TokenService', 'svc'), DB],
    steps: [
      'u->ac: Register(req) · POST /api/auth/register {email, password, fullName, phone, role} — rate limit "auth-attempts" [RegisterPage]',
      'ac->as: RegisterAsync(req)',
      'as->db: Set<AppUser>().AnyAsync(email)',
      'alt [email taken]',
      'as-->ac: 409 auth.email_taken',
      'else [new]',
      'as->db: Add(user) — Active, password hash; AppUserRole Customer (+ Investor); Customer (+ Investor Unverified)',
      'as->db: SaveChangesAsync()',
      'as->as: IssueTokenAsync(user)',
      'as->tok: Create(userId, email, name, roles, operatorId)',
      'tok-->as: (token, expiresAt)',
      'as-->ac: AuthResponse(accessToken, expiresAt, me) — signed in',
      'end',
      'u->ac: Login(req) · POST /api/auth/login {email, password} [LoginPage]',
      'ac->as: LoginAsync(req)',
      'as->lim: Begin(email) — more than 5 attempts in 15 min → 429 auth.rate_limited',
      'as->db: Set<AppUser>().Include(AppUserRoles).FirstOrDefaultAsync(email) — password hash checked in constant time (dummy hash when missing)',
      'alt [wrong email or password]',
      'as-->ac: 401 auth.invalid_credentials',
      'else [user Locked]',
      'as-->ac: 403 auth.locked',
      'else [ok]',
      'as->lim: Success(email)',
      'as->db: SaveChangesAsync() — last_login_at = now',
      'as->as: IssueTokenAsync(user)',
      'as->tok: Create(userId, email, name, roles, operatorId)',
      'tok-->as: token',
      'as-->ac: AuthResponse — redirect by role',
      'end',
    ],
    notes: ['Every later request: JwtBearer validates the token, then OnTokenValidated reloads app_user.status (must be Active) and the role claims from the database (AuthSetup). In v1.4 the Customer is a bulk buyer (restaurant, small trader).'],
  },
  {
    key: 'UC02', page: 'UC02 eKYC', was: '4.66', status: 'kept', owner: 'Khôi', uc: 'UC02, UC06',
    title: 'Complete Identity Verification (eKYC) — only the result is stored (TL-06)',
    lifelines: [L('inv', 'Investor', 'actor'), L('ac', 'AccountsController', 'ctrl'), L('as', 'AccountService', 'svc'), L('ekyc', 'IEkycProvider', 'port'), DB],
    steps: [
      'inv->ac: Verify(req) · POST /api/kyc/ekyc multipart {idCardFront, idCardBack, selfie, consent} [KycVerification / kyc_page.dart]',
      'ac->as: VerifyIdentityAsync(req)',
      'as->as: ValidateImage(image) — consent required; 3 images ≤ 5 MB, JPEG / PNG / WebP by magic bytes',
      'as->db: Set<Investor>().Include(User).SingleOrDefaultAsync(userId)',
      'as->as: RequireUnverified(investor)',
      'alt [no consent | bad image | already Verified]',
      'as-->ac: 400 kyc.consent_required | kyc.image_format | 409 kyc.already_verified',
      'else [ok]',
      'as->ekyc: VerifyAsync(idCardFront, idCardBack, selfie) — outside the transaction',
      'ekyc-->as: EkycResult(passed, providerReference, failureReason)',
      'as->db: Database.BeginTransactionAsync(Serializable) — AuditChain.LockAndReadTailAsync(db) locks the audit tail',
      'as->db: Add(kycCheck) — EkycIdFace, Passed | Failed, provider_ref, consent_at; investor Verified | Rejected',
      'as->as: AppendAudit(userId, old, new, now, previousHash) — Investor / VerifyIdentity on the hash chain',
      'as->db: SaveChangesAsync() — then COMMIT',
      'as-->ac: KycStatusResponse — images discarded, never stored',
      'end',
    ],
    notes: ['UC06: the admin approves an exception on the latest Failed check — AdminAccountsController.ApproveException(id, req) → AdminAccountService.ApproveExceptionAsync → kyc_check ExceptionApproved, investor Verified. eKYC runs in sandbox (FakeEkycProvider).'],
  },
  {
    key: 'UC03', page: 'UC03 Payout account', was: '4.67', status: 'kept', owner: 'Khôi', uc: 'UC03',
    title: 'Maintain Payout Account — bank name match, encryption, one active account per owner',
    lifelines: [L('u', 'Investor / Operator Owner', 'actor'), L('pc', 'PaymentProfilesController', 'ctrl'), L('ps', 'PaymentProfileService', 'svc'), L('bank', 'IBankNameMatcher', 'port'), L('prot', 'PayoutAccountProtection', 'svc'), DB],
    steps: [
      'u->pc: SavePayout(ownerType, req) · PUT /api/me/payout-account?ownerType=Investor|Operator {bankCode, accountNo, accountHolderName}',
      'pc->ps: SavePayoutAsync(ownerType, req)',
      'ps->ps: RequireOwnerAsync(type, forWrite) — active user; Investor row | Operator Owner member',
      'ps->bank: MatchAsync(expectedName, holderName)',
      'bank-->ps: BankNameMatchResult(matched, providerReference)',
      'ps->db: Database.BeginTransactionAsync(Serializable) — AuditChain.LockAndReadTailAsync(db); owner re-read with UPDLOCK',
      'ps->prot: Digest(bankCode, number) — HMAC lookup key',
      'ps->db: Set<PayoutAccount>().SingleOrDefaultAsync(digest)',
      'alt [not the owner | owner changed | account of another owner | holder changed with instructions]',
      'ps-->pc: 403 payout.owner_required | 409 payout.owner_changed | payout.account_taken | payout.holder_immutable',
      'else [ok]',
      'ps->db: Set<PayoutAccount>().Where(owner, not Closed).ToListAsync() — the other accounts → Closed',
      'ps->db: Add(payoutAccount) — Active / Matched or Locked / Mismatched; AccountNo encrypted by the value converter',
      'ps->db: Add(kycCheck) — BankNameMatch, Passed | Failed',
      'ps->db: SaveChangesAsync() — audit PayoutAccount / MaintainPayoutAccount (no account number), then COMMIT',
      'ps-->pc: PayoutProfileResponse — a mismatch still answers 200 with the account Locked',
      'end',
      'u->pc: Payout(ownerType) · GET /api/me/payout-account?ownerType=',
      'pc->ps: GetPayoutAsync(ownerType)',
      'ps->db: Set<PayoutAccount>().FirstOrDefaultAsync(owner, not Closed) — decrypted',
      'ps-->pc: PayoutProfileResponse',
    ],
    notes: ['Customers keep delivery addresses through the same controller (Addresses / CreateAddress / UpdateAddress / DeleteAddress → PaymentProfileService); in v1.4 the address is the delivery point checked against the farm radius (UC27).'],
  },
  {
    key: 'UC45', page: 'UC45 Capture evidence', was: '4.68', status: 'modified', owner: 'Khôi', uc: 'UC45',
    title: 'Capture Production Evidence — live photo, hashing, crab detection module, risk score, capture request',
    lifelines: [L('op', 'Operator (mobile capture page)', 'actor'), L('ec', 'EvidenceController', 'ctrl'), L('es', 'EvidenceService', 'svc'), L('acc', 'EvidenceAccess', 'svc'), L('img', 'EvidenceImageProcessor', 'svc'), L('det', 'ICrabDetector', 'port'), L('fs', 'IFileStorage', 'port'), DB, L('crw', 'CaptureRequestWorker', 'job'), L('crj', 'CaptureRequestJob', 'job'), L('al', 'AlertService', 'svc')],
    steps: [
      'crw->crj: RunAsync() — every 5 min; new requests from 09:00 local time',
      'crj->db: Set<Batch>().Where(InProduction, no Open or today\'s request).ToListAsync()',
      'crj->db: Add(captureRequest) — Open, a random occupied box, due_at = + 120 min; audit CreateCaptureRequest',
      'crj->db: SaveChangesAsync()',
      'op->ec: Upload(request) · POST /api/evidence multipart {batchCode, slotCode, capturedAt, latitude, longitude, captureRequestId?, slotEventType?, image}',
      'ec->es: UploadAsync(request)',
      'es->es: Validate(request) — capturedAt ≤ receivedAt + 5 min',
      'es->es: RequireContextAsync(request, receivedAt) — Batch recording; box Occupied with an open allocation; capture request Open and in its window',
      'es->acc: RequireOperatorAsync()',
      'es->db: Set<Batch>().Include(Operator).SingleOrDefaultAsync(batchCode, operator)',
      'es->db: Set<PhysicalSlot>().SingleOrDefaultAsync(operator, slotCode)',
      'alt [capture in the future | not an operator | Batch not recording | box not allocated | capture request invalid]',
      'es-->ec: 400 evidence.capture_in_future | 403 evidence.access_denied | 422 evidence.batch_inactive | evidence.slot_not_allocated | evidence.capture_request_invalid',
      'else [ok]',
      'es->img: ReadAsync(file) — bytes, SHA-256, dHash (400 evidence.invalid_image)',
      'es->es: DetectAsync(bytes) — an invalid or failing result becomes "unavailable" and never blocks the upload',
      'es->det: DetectAsync(image) — crab detection module: is a crab present in the box?',
      'det-->es: CrabDetectionResult(crabDetected?, confidence?, modelVersion)',
      'es->fs: SaveAsync(stream, "capture.ext", contentType, "evidence/yyyy/MM")',
      'fs-->es: StoredFile(uri, sha256, size)',
      'es->db: Database.BeginTransactionAsync(Serializable) — AuditChain.LockAndReadTailAsync(db); idempotent retry by file_uri',
      'es->es: DuplicateAsync(image) — Exact (SHA-256) → 100 | Similar (dHash distance ≤ 4) → 80 | None',
      'es->db: Set<Evidence>().AnyAsync(sha256) — then the perceptual hashes of earlier photos',
      'es->db: Add(evidence) — risk = max(duplicate, stale over 24 h → 40, no crab → confidence × 15); Accepted below 20, Watch 20–69, Flagged from 70; EvidenceDetection',
      'opt [captureRequestId and not Flagged]',
      'es->db: SaveChangesAsync() — capture request → Fulfilled, fulfilled_at; audit CaptureRequest / FulfillCaptureRequest',
      'end',
      'es->db: SaveChangesAsync() — audit Evidence / UploadEvidence; COMMIT (on failure the stored file is deleted)',
      'es-->ec: EvidenceResponse(riskScore, reviewStatus, detection) — 201',
      'end',
      'crj->db: Set<CaptureRequest>().Where(Open, due_at < now).ToListAsync() — → Expired; audit ExpireCaptureRequest',
      'crj->al: RaiseAsync(batchId, EvidenceFlag, Medium, message, 2 h)',
    ],
    notes: [
      'v1.4: the crab detection module only checks whether a crab is present in the box photo; its weight in the risk score is capped (≤ 15), so detection never rejects evidence alone — Flagged photos go to the human Evidence Reviewer (UC47, Figure {fig:UC47}). develop @ 420a379 wires NoopCrabDetector ("no conclusion"); the trained detection module behind ICrabDetector is «planned».',
      'Removed in v1.4 (still in code): the tagCode path of UploadAsync (confirmation photo of a printed crab tag for UC46).',
    ],
  },
  {
    key: 'UC47', page: 'UC47 UC48 Review evidence', was: '4.69', status: 'kept', owner: 'Khôi', uc: 'UC47, UC48',
    title: 'Review Flagged Evidence (no conflict of interest) and Submit Operator Explanation',
    lifelines: [L('rev', 'Evidence Reviewer (Platform Administrator)', 'actor'), L('erc', 'EvidenceReviewController', 'ctrl'), L('ers', 'EvidenceReviewService', 'svc'), L('img', 'EvidenceImageReader', 'svc'), DB, L('op', 'Operator', 'actor'), L('eec', 'EvidenceExplanationsController', 'ctrl'), L('ees', 'EvidenceExplanationService', 'svc')],
    steps: [
      'rev->erc: List(query, paging) · GET /api/review/evidence?status=Flagged',
      'erc->ers: ListAsync(filter, paging)',
      'ers->ers: RequireReviewerAsync() — EvidenceReviewer role in the database (403 evidence.reviewer_required)',
      'ers->db: Set<Evidence>().Where(Flagged, not on own investments).ToPagedAsync(paging) — oldest first',
      'ers-->erc: PagedResult<ReviewEvidenceSummary>',
      'rev->erc: Get(id) · GET /api/review/evidence/{id}',
      'erc->ers: GetAsync(id)',
      'ers->ers: RequireAccessAsync(id) — 404 evidence.not_found | 403 evidence.reviewer_conflict',
      'ers->db: Set<Evidence>().Include(EvidenceDetections, EvidenceReviews).SingleAsync(id)',
      'ers-->erc: ReviewEvidenceDetail (detections, reviews, explanation, canReview)',
      'rev->erc: Image(id) · GET /api/review/evidence/{id}/image',
      'erc->ers: OpenImageAsync(id)',
      'ers->img: OpenAsync(fileUri, "Photo")',
      'img-->ers: EvidenceImageContent',
      'erc-->rev: image (no-store, nosniff)',
      'op->eec: Explain(id, request) · POST /api/evidence/{id}/explanation {text}',
      'eec->ees: ExplainAsync(id, request)',
      'ees->db: Database.BeginTransactionAsync(Serializable) — audit tail locked',
      'ees->db: Set<Evidence>().SingleOrDefaultAsync(id, operator)',
      'alt [not Flagged]',
      'ees-->eec: 409 evidence.explanation_closed',
      'else [Flagged]',
      'ees->db: SaveChangesAsync() — explanation, explained_at; audit Evidence / ExplainEvidence',
      'ees-->eec: OperatorEvidenceItem',
      'end',
      'rev->erc: Verdict(id, request) · POST /api/review/evidence/{id}/verdict {verdict: Pass | Fail | NeedMoreEvidence, note}',
      'erc->ers: DecideAsync(id, request)',
      'ers->db: Database.BeginTransactionAsync(Serializable) — AuditChain.LockAndReadTailAsync(db)',
      'ers->ers: RequireAccessAsync(id)',
      'ers->ers: CanReview(evidence, mine) — nothing changed since read (409 evidence.review_changed)',
      'ers->db: Add(review) — one per reviewer (upsert); review_status Accepted | Rejected | Flagged',
      'ers->db: SaveChangesAsync() — audit Evidence / ReviewEvidence; COMMIT',
      'ers-->erc: ReviewEvidenceDetail',
    ],
    notes: ['The Evidence Reviewer is a separate permission held by a Platform Administrator, never on own investments (Register v1.4, section 3.2c). Detection results are shown as a weak signal only.'],
  },
  {
    key: 'UC19', page: 'UC19 UC20 Alerts', was: '4.70', status: 'kept', owner: 'Khôi', uc: 'UC19, UC20',
    title: 'Acknowledge Operations Alert and Monitor Escalated Alerts',
    lifelines: [L('src', 'SlotEventService', 'svc'), L('al', 'AlertService', 'svc'), DB, L('op', 'Operator', 'actor'), L('alc', 'AlertsController', 'ctrl'), L('ajw', 'AlertJobWorker', 'job'), L('aj', 'AlertJob', 'job'), L('adm', 'Platform Administrator', 'actor'), L('aac', 'AdminAlertsController', 'ctrl')],
    steps: [
      'src->al: RaiseAsync(batchId, type, severity, message, ackWithin)',
      'al->al: TransactionAsync(action) — Serializable + AuditChain.LockAndReadTailAsync',
      'al->db: Set<Alert>().FirstOrDefaultAsync(batch, type, Open | Escalated)',
      'alt [none]',
      'al->db: Add(alert) — Open, raised_at, ack_deadline; audit Alert / RaiseAlert',
      'else [one exists]',
      'al->db: SaveChangesAsync() — message updated, severity only raised, earliest ack_deadline; audit UpdateAlert',
      'end',
      'al-->src: AlertResponse',
      'op->alc: Acknowledge(id, request) · POST /api/alerts/{id}/acknowledge {responseNote}',
      'alc->al: AcknowledgeAsync(id, note)',
      'al->db: Set<Alert>().SingleOrDefaultAsync(id, operator)',
      'alt [already acknowledged or resolved]',
      'al-->alc: 409 alerts.status_changed',
      'else [before ack_deadline]',
      'al->db: SaveChangesAsync() — Acknowledged, acknowledged_at / by, response_note; audit AcknowledgeAlert',
      'else [late]',
      'al->db: SaveChangesAsync() — Escalated (escalated_at) with the acknowledgement recorded',
      'end',
      'al-->alc: AlertResponse',
      'ajw->aj: RunAsync() — every 15 min',
      'aj->al: RaiseAsync(batchId, DataSilence | MilestoneDelay, Medium, message, ackWithin) — no daily log after 18:00 / tranche overdue',
      'aj->al: Escalate(alert, previous, now) — Open past ack_deadline → Escalated; audit EscalateAlert',
      'adm->aac: List(filter, paging) · GET /api/admin/alerts?status=Escalated',
      'aac->al: ListAdminAsync(filter, paging)',
      'al->db: Set<Alert>().Where(filter).ToPagedAsync(paging)',
      'al-->aac: PagedResult<AlertResponse>',
      'adm->aac: Resolve(id, request) · POST /api/admin/alerts/{id}/resolve {note}',
      'aac->al: ResolveAsync(id, note)',
      'al->db: SaveChangesAsync() — not Resolved yet → Resolved; audit ResolveAlert (note kept in the audit)',
      'al-->aac: AlertResponse',
    ],
    notes: ['Callers of RaiseAsync: SlotEventService (Mortality), CaptureRequestJob (EvidenceFlag), AlertJob (DataSilence, MilestoneDelay); FinalOrderReminderJob (FinalOrderDue) is «planned» (UC51, Figure {fig:UC51}). Removed in v1.4 (still in code): WaterQuality alerts raised by ProductionLogService (TL-22 dropped alerts on environmental measurements) and LowStock alerts raised by Catalog through IAlertRaiser.'],
  },
  {
    key: 'UC16', page: 'UC16 Portfolio', was: '4.71', status: 'kept', owner: 'Khôi', uc: 'UC16',
    title: 'Track Investment Portfolio and Notifications (read-only)',
    lifelines: [L('inv', 'Investor', 'actor'), L('pc', 'PortfolioController', 'ctrl'), L('ps', 'PortfolioService', 'svc'), L('nc', 'NotificationsController', 'ctrl'), L('ns', 'NotificationService', 'svc'), DB],
    steps: [
      'inv->pc: List(filter, paging) · GET /api/investor/portfolio?page=&pageSize=&status=&q= [InvestorPortfolio / investor_home_page.dart]',
      'pc->ps: ListAsync(filter, paging)',
      'ps->ps: RequireInvestorAsync() — Serializable read (403 portfolio.investor_required)',
      'ps->ps: PositionsAsync(code) — capital shares and settlement amounts ∪ Confirmed contributions before capital close',
      'ps->db: Set<VInvestorPortfolio>().Where(investor).ToListAsync()',
      'ps->db: Set<Batch>().Where(positions, filters).ToPagedAsync(paging) — with summary totals',
      'ps-->pc: PortfolioPage(items, summary) — no expected return (BR-49)',
      'inv->pc: Get(batchCode) · GET /api/investor/portfolio/{batchCode}',
      'pc->ps: GetAsync(code)',
      'ps->db: Set<Contribution>().Where(investor, batch).Include(InvestmentContract).ToListAsync() — 404 portfolio.not_found',
      'ps->db: Set<ProductionLog>().Where(batch).ToListAsync() — timeline: batch dates, 20 logs, 20 Accepted evidence, at most 30 events',
      '~ps->db: Set<RowAllocation>().Where(investor, batch).ToListAsync() — the investor\'s box rows, with links to box details (UC53)',
      'ps-->pc: PortfolioDetail',
      'inv->nc: List(query, paging) · GET /api/me/notifications?until=&page= (polled)',
      'nc->ns: ListAsync(filter, paging)',
      'ns->db: Set<Contribution>().Where(investor).ToListAsync() — unioned with contracts, production logs, alerts, settlement lines, succeeded payouts in the window',
      'ns-->nc: NotificationPage(items, asOf) — read markers kept in the browser',
    ],
    notes: ['Read-only: Serializable read transactions, no audit rows. Box details of own rows: UC53 (Figure {fig:UC53}).'],
  },
  {
    key: 'UC42', page: 'UC42 UC43 Platform reports & audit log', was: '4.72', status: 'kept', owner: 'Khôi', uc: 'UC42, UC43',
    title: 'Monitor Platform Reports; Export the hash-chained Audit Log',
    lifelines: [L('adm', 'Platform Administrator', 'actor'), L('dc', 'AdminDashboardController', 'ctrl'), L('ds', 'DashboardService', 'svc'), L('csv', 'CsvExport', 'static'), DB, L('alc', 'AuditLogController', 'ctrl'), L('aqs', 'AuditLogQueryService', 'svc'), AUD],
    steps: [
      'adm->dc: Get(query) · GET /api/admin/dashboard?from=&to=',
      'dc->ds: AdminAsync(query)',
      'ds->ds: RequireAdminAsync() — Serializable read; range ≤ 366 days (400 reports.invalid_range)',
      'ds->db: Set<Contribution>().Where(Confirmed, range).ToListAsync() — capital by day (Asia/Ho_Chi_Minh), with batches by status, escalated alerts, orders by status, completed revenue, payouts by status, user count',
      'ds-->dc: AdminDashboardResponse',
      'adm->dc: Report(name, query) · GET /api/admin/reports/{capital|batches|orders|payouts}.csv',
      'dc->ds: ReportAsync(name, query)',
      'ds->csv: Encode(rows)',
      'csv-->ds: UTF-8 BOM CSV (formula-safe cells)',
      'ds-->dc: byte[] — text/csv',
      'adm->alc: List(query, paging) · GET /api/admin/audit-log?entityType=&from=&to=&throughAuditId=&page=',
      'alc->aqs: ListAsync(query, paging)',
      'aqs->aqs: BoundaryAsync(requested) — tail audit id',
      'aqs->aqs: Filtered(query, boundary) — newest first',
      'aqs->db: Set<AuditLog>().Where(filters, ≤ boundary).ToPagedAsync(paging)',
      'aqs->aqs: VerifyAsync(boundary)',
      'aqs->audit: VerifyChainAsync(fromAuditId, toAuditId) — chunks of 1000 → AuditChainVerifier.Verify',
      'audit-->aqs: AuditChainResult(isValid, checkedRows, brokenAuditId?)',
      'aqs-->alc: AuditLogPage(items, throughAuditId, chain)',
      'adm->alc: Export(query) · GET /api/admin/audit-log/export?…',
      'alc->aqs: ExportAsync(query)',
      'aqs->db: Set<AuditLog>().Where(filters).CountAsync() — ≤ 5000 (400 audit.export_too_large)',
      'aqs->db: Set<AuditLog>().Where(filters).ToListAsync() — oldest first',
      'aqs->audit: VerifyChainAsync(fromAuditId, toAuditId) — prefix 1..boundary',
      'aqs->csv: Encode(rows) — header block (chain valid, boundary, checked rows), then data rows',
      'aqs-->alc: AuditLogExport(bytes, throughAuditId, chain) — crabshare-audit-through-{id}.csv',
    ],
    notes: ['AuditChainCheckJob verifies the whole chain every 6 hours and logs Critical when it is broken (TL-08). v1.4 reports add revenue by source (delivered orders, invoiced sales, forfeited deposits, final order) «planned».'],
  },
];

// Mục bị bỏ theo phiếu v1.4 nhưng code vẫn còn — ghi ở trang Index (bộ 2.0 ngày 22/10/2026 có các hình này).
const REMOVED = [
  ['4.55', 'UC46 Print and Activate Crab Tag', 'TagsController (Label, Activate, Void) → TagsService; IHarvestTagCodeGenerator; crab_tag, crab_item_event TagPrinted / TagActivated'],
  ['4.56', 'UC33 Trace Crab by Tag Scan', 'TraceController.Get(tag) → TraceService.GetAsync(code); tag_scan, v_traceability — replaced by UC33 Trace Order by QR Code «planned»'],
  ['4.57', 'UC24 Publish Product Listings', 'ListingsController, OperatorListingsController, AdminListingsController → CatalogService, PriceAnomaly, ListingModerationService, LowStockMonitor; product_listing, price_history, price_check'],
  ['4.58', 'UC25 Browse Product Catalogue', 'ListingsController.Browse / GetPublic / Image → CatalogService.BrowseAsync — replaced by UC25 Find Farms and Batches on Map «planned»'],
  ['4.59', 'UC26 Place Order (cart, retail checkout)', 'OrdersController.Checkout → OrderService.CheckoutAsync, OrderPaymentHandler, StockReservation / StockRelease, ReservationExpiryService (retail part)'],
  ['4.64', 'UC13 Register Offtake Commitment (and UC23 claim window, PR #72 not merged)', 'OfftakeController → OfftakeService, OfftakeDepositHandler; offtake_commitment, batch_offtake_price (the pre-order cap of UC27 still reads v_batch_commitment_cap)'],
  ['in 4.61', 'Pack by tag scan (UC29)', 'OperatorOrdersController.Pack → OrderPackingService.PackAsync(orderNo, tagCodes)'],
  ['in 4.52', 'Water-quality thresholds and WaterQuality alert (UC17)', 'ProductionLogsController.Thresholds / Configure → ProductionLogService.ThresholdsAsync / ConfigureAsync, Violations(request, thresholds); production_threshold_version; ph / water_temp_c / salinity_ppt of production_log; AlertType WaterQuality'],
  ['in 4.60', 'Pre-order balance issued at harvest', 'PreorderBalanceJob → PreorderBalanceService.IssueForHarvestingBatchesAsync (total − deposit) — v1.4 issues the balance on the weighed kg at delivery'],
];
// SQ-02: use case chính không có sơ đồ riêng — ghi lý do ở trang Index.
const NO_OWN_DIAGRAM = [
  ['UC28 Track Order Status', 'read only, the same pattern as UC16: OrderTrackingController.List(filter, paging) / Get(orderNo) → OrderQueryService.ListMineAsync / GetMineAsync → Set<SalesOrder>().Where(customer).ToPagedAsync(paging); the status changes it shows are drawn in Figures ' + '{fig:UC27}, {fig:UC29} and {fig:FORFEIT}'],
  ['UC41 Configure Platform Parameters', 'CRUD only: FeeTiersController.List / Create / Update → FeeTierService.ListAsync / SaveAsync (fee tiers are the only parameters wired on develop); the deposit ratio, minimum contribution, reservation expiry, minimum order quantity and minimum pre-order ratio are «planned» parameters, snapshot on the Batch at approval (Figure {fig:UC08})'],
];

const SEQ_FIGS = Object.fromEntries(SEQS.map((q, i) => [q.key, `4.${SEQ_FIG_BASE + i}`]));
const CLASS_FIG_FIRST = SEQ_FIG_BASE + SEQS.length;
const META = `${VERSION} · UML 2.5 · code: develop @ 420a379 · classes: Figure 4.${CLASS_FIG_FIRST} onwards`;
const fill = (s) => String(s).replace(/\{fig:(\w+)\}/g, (m, k) => {
  if (!SEQ_FIGS[k]) throw new Error('unknown figure key ' + k);
  return SEQ_FIGS[k];
});
// Cột "was" của bảng: '4.40' = cùng luồng ở bộ v2.0; 'replaces 4.56' = thay luồng đã bỏ; '—' = luồng mới.
const wasText = (was) => /^\d/.test(was) ? `was v2.0 Figure ${was}` : /^replaces/.test(was) ? `${was.replace('replaces', 'replaces v2.0 Figure')} (removed in v1.4)` : 'new for Register v1.4';
const STATUS = { kept: 'kept — refreshed against code', modified: 'modified for v1.4', new: 'new «planned»' };

// ---------- Vẽ ----------
const GREY = '#64748b';
const PLANNED = `strokeColor=${GREY};fontColor=${GREY};`;
const CHAR = 6.2; // bề rộng trung bình một ký tự 11px
// Bề rộng từng ký tự Segoe UI 11px (đo bằng canvas.measureText trong Chrome, 05/11/2026) — để biết nhãn có dài hơn mũi tên không.
const CW = { ' ': 3.01, a: 5.6, b: 6.47, c: 5.08, d: 6.48, e: 5.75, f: 3.44, g: 6.48, h: 6.23, i: 2.66, j: 2.66, k: 5.47, l: 2.66, m: 9.47, n: 6.23, o: 6.45, p: 6.47, q: 6.48, r: 3.82, s: 4.67, t: 3.73, u: 6.23, v: 5.27, w: 7.95, x: 5.05, y: 5.32, z: 4.97, A: 7.1, B: 6.31, C: 6.81, D: 7.71, E: 5.56, F: 5.37, G: 7.55, H: 7.81, I: 2.93, J: 3.93, K: 6.38, L: 5.18, M: 9.88, N: 8.23, O: 8.29, P: 6.16, Q: 8.29, R: 6.58, S: 5.84, T: 5.76, U: 7.56, V: 6.83, W: 10.27, X: 6.49, Y: 6.08, Z: 6.27, '.': 2.38, ',': 2.38, ':': 2.38, ';': 2.38, '|': 2.63, '!': 3.13, "'": 2.53, '(': 3.32, ')': 3.32, '[': 3.32, ']': 3.32, '{': 3.32, '}': 3.32, '-': 4.4, '/': 4.29, '"': 4.31, '?': 4.93, '«': 5.56, '»': 5.56, '*': 4.59, '+': 7.52, '=': 7.52, '<': 7.52, '>': 7.52, '~': 7.52, '_': 4.57, '#': 6.5, '@': 10.51, '%': 9, '&': 8.8, '…': 8.06, '⟶': 12.97, '—': 11, '–': 5.5, '·': 2.38, '×': 7.52, '≥': 7.54, '≤': 7.54, '→': 9.49 };
const tw = (html) => [...String(html).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')].reduce((w, ch) => w + (CW[ch] ?? (/[0-9]/.test(ch) ? 5.93 : 6.6)), 0) * 1.03;
function parseStep(s) {
  let m; const planned = s.startsWith('~'); const t = planned ? s.slice(1) : s;
  if ((m = t.match(/^(\w+)(->>|-->|->)(\w+):\s*(.*)$/))) return { kind: 'msg', from: m[1], to: m[3], arrow: m[2], text: m[4], planned };
  if ((m = t.match(/^(alt|opt|loop|par|break)\s*(.*)$/))) return { kind: 'open', op: m[1], guard: m[2], planned };
  if ((m = t.match(/^else\s*(.*)$/))) return { kind: 'else', guard: m[1], planned };
  if (t === 'end') return { kind: 'close' };
  if ((m = t.match(/^note:\s*(.*)$/))) return { kind: 'note', text: m[1] };
  if ((m = t.match(/^ref:\s*(.*)$/))) return { kind: 'ref', text: m[1] };
  throw new Error('bad step: ' + s);
}
const plannedTag = (text) => (/«planned»/.test(text) ? text : `${text} «planned»`);
const escText = (s) => String(s).replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tiêu đề rộng bằng phần sơ đồ (không cố định 2000 px) để trang hẹp không bị thu nhỏ thêm khi in; cao theo số dòng.
function caption(d, fig, title, meta, w = 1600) {
  const tl = Math.ceil(tw(`${fig} – ${title}`) * 15 / 11 * 1.1 / (w - 8)), ml = Math.ceil(tw(meta) / (w - 8));
  d.text(`<b>${fig} – ${title}</b><br><font style="font-size:11px" color="${GREY}">${meta}</font>`, 20, 10, w, Math.min(84, 8 + 19 * tl + 15 * ml), 'fontSize=15;');
}


// ---------- Phân trang (G-01, brief §9.5 và quyết định đợt 2) ----------
// Mỗi phần phải đọc được khi in: thu vừa vùng in A4 ngang (931 × 605 px ở 96 dpi) mà chữ 11 px vẫn ≥ 5 pt, tức trang
// rộng ≤ 1536 px và cao ≤ 998 px. Vì vậy mỗi phần có tối đa 7 lifeline (rộng 1500 px) và mọi khối nằm trên y ≤ 1000.
// Phần sau nối với phần trước bằng fragment ref; fragment đang mở ở chỗ tách được đóng lại và mở lại với "(continued)".
// Số hình giữ nguyên, caption và tên trang ghi "(k/N)".
const COL_W = 210, LL_W = 190, ACTOR_W = 40, X0 = 40, TOP = 96, HEAD_H = 54, ROW_H = 28, GUARD_GAP = 10;
const FIRST_Y = TOP + HEAD_H + 40; // chừa chỗ cho tên actor dưới hình người
const PAGE_BOTTOM = 1000;
const MAX_LL = 7;
const REF_H = ROW_H + 24, GUARD_H = ROW_H + GUARD_GAP, CLOSE_H = 20;
// note và ref cao theo số dòng chữ; span = bề rộng giữa hai mép khung (khi chưa biết số lifeline thì lấy 3 lifeline, 610 px)
const textLines = (html, w) => Math.max(1, Math.ceil(tw(html) / Math.max(120, w)));
// phần hẹp (1–2 lifeline): note và ref vẫn rộng tối thiểu 500 / 520 px để chữ không bị ép xuống nhiều dòng
const noteW = (span) => Math.max(500, span - 80), refW = (span) => Math.max(520, span - 60);
const noteBoxH = (html, span) => Math.max(ROW_H + 6, 10 + textLines(html, noteW(span) - 30) * 14);
const refBoxH = (html, span) => Math.max(ROW_H + 4, 8 + textLines(html, refW(span) - 90) * 14);
const stepH = (s, span = 610) => (s.kind === 'open' || s.kind === 'else') ? GUARD_H : s.kind === 'close' ? CLOSE_H
  : s.kind === 'note' ? noteBoxH(escText(fill(s.text)), span) + 18 : s.kind === 'ref' ? refBoxH(escText(fill(s.text)), span) + 20
  : s.from === s.to ? ROW_H + 14 : ROW_H;
const notesWidth = (n) => Math.max(1000, Math.min(1460, n * COL_W));
// Hình áp dụng các quyết định thiết kế ngày 05/11/2026 (điều kiện mở Lô, hàng hộp, mất cọc, tỷ lệ sống, tiền theo kg cân,
// Standard Cost dùng không hết, InvoicedSale) thì Notes có thêm một dòng chuẩn "confirmed by the lead".
const DECISION = /RowAllocation|BoxRow|InvoicedSale|ForfeitResale|Forfeit|PreOrderRatio|minPreOrderRatio|MinPreOrderRatio|SurvivalRate|survival rate|weighedKg|WeighedKg|funded boxes|funded rows|ReleaseUnfundedRows|PreOrderQuota|PreOrderHold|Invoice\b/;
const appliesDecisions = (q) => DECISION.test([...q.steps, ...(q.notes ?? [])].join(' '));
const notesHtml = (q) => [`<b>Notes</b> · use case: ${q.uc} · owner: ${q.owner} · ${STATUS[q.status]}`, ...(q.notes ?? []).map(n => '• ' + escText(fill(n))), ...(appliesDecisions(q) ? ['• Design decisions of 05/11/2026 applied here were confirmed by the lead.'] : [])];
const notesHeight = (lines, w) => 20 + lines.reduce((a, n) => a + Math.ceil(tw(n) / (w - 16)) * 15, 0);

// Fragment đang mở trước mỗi bước (để đóng / mở lại khi tách phần).
function openStacks(q, steps) {
  const res = []; const st = [];
  for (const s of steps) {
    res.push(st.map(x => ({ ...x })));
    if (s.kind === 'open') st.push({ op: s.op, guard: s.guard, planned: s.planned, guardPlanned: s.planned });
    else if (s.kind === 'else') { const t = st[st.length - 1]; if (!t) throw new Error(`${q.key}: else without fragment`); t.guard = s.guard; t.guardPlanned = s.planned; }
    else if (s.kind === 'close') { if (!st.length) throw new Error(`${q.key}: end without fragment`); st.pop(); }
  }
  if (st.length) throw new Error(`${q.key}: unclosed fragment`);
  res.push([]);
  return res;
}

// Chia bước thành các phần: tham lam theo chiều cao và số lifeline, ưu tiên điểm tách ở mức ngoài cùng; nếu được thì
// chia đều chiều cao cho các phần (lần 2) để phần cuối không quá ngắn.
function paginate(q, steps, open) {
  const n = steps.length;
  const allowed = (i) => (i === n || ['msg', 'note', 'ref', 'open'].includes(steps[i].kind)) && !(i > 0 && ['open', 'else'].includes(steps[i - 1].kind));
  const notesH = notesHeight(notesHtml(q), 1000);
  const run = (target) => {
    const parts = []; let s0 = 0;
    while (s0 < n) {
      const k = parts.length;
      let y = FIRST_Y + (k ? REF_H : 0) + open[s0].length * GUARD_H, acc = 0;
      const ll = new Set(); let best = -1, bestTop = -1;
      for (let e = s0 + 1; e <= n; e++) {
        const st = steps[e - 1];
        y += stepH(st); acc += stepH(st);
        if (st.kind === 'msg') { ll.add(st.from); ll.add(st.to); }
        if (ll.size > MAX_LL) break;
        if (!allowed(e)) continue;
        const last = e === n;
        const tail = last ? 0 : open[e].length * CLOSE_H + REF_H;
        if (y + tail > PAGE_BOTTOM - 50 - (last ? 20 + notesH : 0)) break;
        best = e; if (!open[e].length) bestTop = e;
        if (target && !last && acc >= target && !open[e].length) break; // đủ phần chia đều, dừng ở điểm ngoài cùng
      }
      if (best < 0) { best = s0 + 1; while (!allowed(best)) best++; }
      let e = best;
      if (bestTop > s0 && best < n && (bestTop - s0) >= 0.6 * (best - s0)) e = bestTop;
      parts.push({ s: s0, e });
      s0 = e;
    }
    return parts;
  };
  const greedy = run(0);
  if (greedy.length < 2) return greedy;
  const total = steps.reduce((a, s) => a + stepH(s), 0);
  const even = run(total / greedy.length);
  return even.length <= greedy.length ? even : greedy;
}

function drawPart(f, q, i, steps, open, part, k, N) {
  const figNo = `Figure 4.${SEQ_FIG_BASE + i}`;
  // tên trang dùng "(k of N)": dấu "/" trong tên trang làm hỏng tên file khi xuất ảnh (path.basename); caption vẫn ghi "(k/N)"
  const tag = N > 1 ? ` (${k + 1}/${N})` : '', pageTag = N > 1 ? ` (${k + 1} of ${N})` : '';
  const d = f.page(q.page + pageTag);
  const list = [];
  if (k > 0) list.push({ kind: 'ref', text: `continued from part ${k}/${N} of ${figNo}` });
  for (const fr of open[part.s]) list.push({ kind: 'open', op: fr.op, guard: `${fr.guard} (continued)`, planned: fr.planned, guardPlanned: fr.guardPlanned });
  list.push(...steps.slice(part.s, part.e));
  if (k < N - 1) {
    for (let j = 0; j < open[part.e].length; j++) list.push({ kind: 'close' });
    list.push({ kind: 'ref', text: `continues in part ${k + 2}/${N} of ${figNo}` });
  }
  const used = new Set(); for (const s of list) if (s.kind === 'msg') { used.add(s.from); used.add(s.to); }
  for (const s of list) if (s.kind === 'msg' && !q.lifelines.some(l => l[0] === s.from || l[0] === s.to)) throw new Error(`${q.key}: unknown lifeline in ${s.from}->${s.to}`);
  const lls = q.lifelines.filter(l => used.has(l[0]));
  if (!lls.length) lls.push(q.lifelines[0]);
  const ids = lls.map(l => l[0]);
  const xc = (id) => {
    const p = ids.indexOf(id);
    if (p < 0) throw new Error(`${q.key}: unknown lifeline ${id}`);
    return X0 + p * COL_W + LL_W / 2; // tâm lifeline
  };
  // toạ độ y. Nhãn message nằm trên mũi tên (cao ~14 px): sau khung đóng, note và ref phải chừa chỗ.
  const span = (X0 + (ids.length - 1) * COL_W + LL_W + 10) - (X0 + 10);
  let y = FIRST_Y;
  const frames = []; const stack = []; const items = [];
  for (const s of list) {
    if (s.kind === 'open') { stack.push({ op: s.op, guard: s.guard, planned: s.planned, guardPlanned: s.guardPlanned ?? s.planned, y0: y, seps: [] }); y += GUARD_H; continue; }
    if (s.kind === 'else') { const fr = stack[stack.length - 1]; fr.seps.push({ y, guard: s.guard, planned: s.planned }); y += GUARD_H; continue; }
    if (s.kind === 'close') { const fr = stack.pop(); fr.y1 = y; frames.push(fr); y += CLOSE_H; continue; }
    items.push({ ...s, y }); y += stepH(s, span);
  }
  const total = y - TOP + 50;
  lls.forEach(([id, name, kind, planned], p) => {
    const base = kind === 'actor' ? S.lifelineActor : S.lifeline + (kind === 'db' ? 'fillColor=#f1f5f9;' : kind === 'port' ? 'fillColor=#fef3c7;' : kind === 'ext' ? 'fillColor=#fee2e2;' : kind === 'job' ? 'fillColor=#ede9fe;' : kind === 'ctrl' ? 'fillColor=#e0f2fe;' : kind === 'engine' ? 'fillColor=#ecfdf5;' : '');
    const style = base + `size=${HEAD_H};fontSize=12;` + (planned ? `dashed=1;${PLANNED}fillColor=#f8fafc;` : '');
    const stereo = { port: '«interface»', ext: '«external system»', job: '«background job»', ctrl: '«controller»', db: '«persistence»', engine: '«pure library»', static: '«static»', svc: '«service»' }[kind] ?? '';
    const label = kind === 'actor' ? name : `${stereo}${planned ? ' «planned»' : ''}<br><b>:${name}</b>`;
    if (kind === 'actor') d.vertex(label, style + 'whiteSpace=nowrap;', X0 + p * COL_W + (LL_W - ACTOR_W) / 2, TOP, ACTOR_W, total, { key: 'll_' + id, raw: true });
    else d.vertex(label, style, X0 + p * COL_W, TOP, LL_W, total, { key: 'll_' + id, raw: true });
  });
  const xl = X0 + 10, xr = X0 + (ids.length - 1) * COL_W + LL_W + 10;
  const RIGHT = 1500; // mép phải tối đa của khối chữ (trang ≤ 1536 px)
  const guardBox = (x, html) => Math.max(120, Math.min(RIGHT - x, tw(html) + 30));
  for (const fr of frames) {
    const depth = frames.filter(o => o.y0 < fr.y0 && o.y1 > fr.y1).length;
    const col = fr.planned ? PLANNED + 'dashed=1;' : '';
    d.vertex(`<b>${fr.op}</b>`, S.frame + 'fillColor=none;fontSize=11;' + col, xl + depth * 8, fr.y0 - 6, xr - xl - depth * 16, fr.y1 - fr.y0 + 6, { raw: true });
    const gx = xl + depth * 8 + 66, gHtml = escText(fill(fr.guardPlanned ? plannedTag(fr.guard) : fr.guard));
    d.text(`<font style="font-size:11px"${fr.guardPlanned ? ` color="${GREY}"` : ''}>${gHtml}</font>`, gx, fr.y0 - 6, guardBox(gx, gHtml), 24, 'verticalAlign=middle;');
    for (const sp of fr.seps) {
      d.freeEdge(xl + depth * 8, sp.y + 4, xr - depth * 8, sp.y + 4, 'dashed=1;endArrow=none;strokeColor=#1e293b;html=1;');
      const sx = xl + depth * 8 + 6, sHtml = escText(fill(sp.planned ? plannedTag(sp.guard) : sp.guard));
      d.text(`<font style="font-size:11px"${sp.planned ? ` color="${GREY}"` : ''}>${sHtml}</font>`, sx, sp.y + 5, guardBox(sx, sHtml), 18, 'verticalAlign=middle;');
    }
  }
  for (const it of items) {
    if (it.kind === 'note') {
      const html = escText(fill(it.text));
      d.vertex(html, S.note + 'fontSize=11;', xl + 40, it.y, noteW(xr - xl), noteBoxH(html, xr - xl), { raw: true });
      continue;
    }
    if (it.kind === 'ref') {
      const html = escText(fill(it.text)), rh = refBoxH(html, xr - xl);
      d.vertex(`<b>ref</b>`, S.frame + 'fillColor=#ffffff;width=40;height=20;fontSize=11;', xl + 30, it.y, refW(xr - xl), rh, { raw: true });
      d.text(`<font style="font-size:11px">${html}</font>`, xl + 80, it.y + 2, refW(xr - xl) - 80, rh - 4, 'align=center;verticalAlign=middle;');
      continue;
    }
    const x1 = xc(it.from), x2 = xc(it.to);
    let style = it.arrow === '-->' ? S.msgReturn : it.arrow === '->>' ? S.msgAsync : S.msgSync;
    style += 'fontSize=11;';
    if (it.planned) style += PLANNED;
    const text = escText(fill(it.planned ? plannedTag(it.text) : it.text));
    if (it.from === it.to) {
      d.freeEdge(x1 + 5, it.y, x1 + 5, it.y + 24, style + 'edgeStyle=orthogonalEdgeStyle;align=left;', { label: `<font style="font-size:11px">${text}</font>`, points: [[x1 + 60, it.y], [x1 + 60, it.y + 24]], raw: true });
      d.vertex('', S.activation + (it.planned ? `dashed=1;strokeColor=${GREY};` : ''), x1 - 5, it.y - 2, 10, 30);
      continue;
    }
    if (it.arrow !== '-->') d.vertex('', S.activation + (it.planned ? `dashed=1;strokeColor=${GREY};` : ''), x2 - 5, it.y - 4, 10, 22);
    // Nhãn dài hơn mũi tên: bắt đầu ngay sau đầu trái của mũi tên và chạy sang phải, để không tràn ra ngoài khung
    // fragment bên trái; nhãn ngắn thì đặt giữa mũi tên như thường lệ.
    const label = escHtml(`<font style="font-size:11px">${text}</font>`);
    const long = tw(text) > Math.abs(x2 - x1) - 16;
    const geo = long ? `x="${x1 < x2 ? -1 : 1}" ` : '';
    const offset = long ? '<mxPoint x="8" y="0" as="offset"/>' : '';
    d.cells.push(`<mxCell id="${d.id()}" value="${label}" style="${style}labelBackgroundColor=#ffffff;${long ? 'align=left;' : ''}" edge="1" parent="1"><mxGeometry ${geo}relative="1" as="geometry"><mxPoint x="${x1}" y="${it.y}" as="sourcePoint"/><mxPoint x="${x2}" y="${it.y}" as="targetPoint"/>${offset}</mxGeometry></mxCell>`);
  }
  const lw = notesWidth(ids.length);
  caption(d, figNo + tag, `Sequence Diagram: ${q.uc} ${q.title}`, `${META} · ${STATUS[q.status]} · ${wasText(q.was)} · legend: Index page`, Math.max(xr + 10, X0 + lw) - 20);
  if (k === N - 1) {
    const notes = notesHtml(q);
    d.vertex(notes.join('<br>'), S.note + 'fontSize=11;', X0, TOP + total + 20, lw, notesHeight(notes, lw), { raw: true });
  }
  return { page: q.page + pageTag, lifelines: ids.length, bottom: TOP + total };
}

const LEGEND = '<b>Legend</b> (every Sequence Diagram, Figure 4.' + SEQ_FIG_BASE + '–4.' + (SEQ_FIG_BASE + SEQS.length - 1) + ') — solid filled arrow: synchronous call named after an operation of the receiving class · open arrow: asynchronous message · dashed: reply · «controller» = boundary (HTTP API), «service» / «background job» = control, «persistence» AppDbContext = entity access: every message to it is an EF Core operation (Set&lt;T&gt;() queries, Add, SaveChangesAsync, ExecuteUpdateAsync…, Figure 4.' + (CLASS_FIG_FIRST + 16) + ') with its effect after "—" · «interface» = port to an external system (sandbox or fake adapter) · grey dashed lifeline / fragment and grey message labelled «planned» = Register v1.4, not on develop @ 420a379 (planned calls keep a solid line, because a dashed line means a reply in UML) · ProblemDetails code on error replies.<br>Long flows are split into parts "(k/N)" with the same figure number, so that each part stays readable when printed on A4: a part shows only the lifelines it uses, and consecutive parts are joined by a ref fragment; a fragment cut by the split is closed and reopened with "(continued)".';

function indexPages(f, plan) {
  const last = SEQ_FIG_BASE + SEQS.length - 1;
  const fig = `Figure 4.${SEQ_FIG_BASE}–4.${last}`;
  const W = 1480;
  // (1/2): bảng hình và chú giải chung
  const d1 = f.page('Index of figures (1 of 2)');
  caption(d1, 'Sequence Diagrams', `index of Figures 4.${SEQ_FIG_BASE}–4.${last} (page 1 of 2) — ${SEQS.length} main flows`, `${VERSION} · UML 2.5 · code: develop @ 420a379 (V001–V017, 19 modules)`, W);
  const counts = { kept: 0, modified: 0, new: 0 };
  for (const q of SEQS) counts[q.status]++;
  const th = (t) => `<th align="left" style="padding:2px 8px;border-bottom:1px solid #94a3b8">${t}</th>`;
  const td = (t, extra = '') => `<td style="padding:2px 8px${extra}">${t}</td>`;
  const rows = SEQS.map((q, i) => `<tr>${td('<b>4.' + (SEQ_FIG_BASE + i) + '</b>')}${td(q.uc)}${td(q.title.split(' — ')[0])}${td(String(plan[i].length))}${td(STATUS[q.status], q.status === 'new' ? ';color:' + GREY : '')}${td(q.owner)}${td(q.was)}</tr>`).join('');
  d1.text(`<table style="font-size:12px;border-collapse:collapse"><tr>${th('Figure')}${th('Use case')}${th('Flow')}${th('Parts')}${th('v1.4 status')}${th('Owner')}${th('Was (v2.0)')}</tr>${rows}</table>`, 20, 70, W, 34 + SEQS.length * 19);
  const legH = 24 + Math.ceil(tw(LEGEND) / (W - 16)) * 15;
  d1.vertex(LEGEND, S.legend + 'fontSize=11;', 20, 80 + SEQS.length * 19 + 30, W, legH, { raw: true });
  // (2/2): ghi chú
  const d2 = f.page('Index of figures (2 of 2)');
  caption(d2, 'Sequence Diagrams', `notes on Figures 4.${SEQ_FIG_BASE}–4.${last} (page 2 of 2) — removed flows, use cases without an own diagram, conventions`, `${VERSION} · UML 2.5 · code: develop @ 420a379`, W);
  const parts = plan.reduce((a, p) => a + p.length, 0);
  const indexNote = `<b>Notes</b><br>• ${SEQS.length} flows on ${parts} pages: ${counts.kept} kept (refreshed against code), ${counts.modified} modified for Register v1.4, ${counts.new} new «planned»; ${REMOVED.filter(r => !r[0].startsWith('in ')).length} flows of the v2.0 set removed.<br>• <b>Removed in v1.4 (still in code)</b> — not drawn any more; the code on develop @ 420a379 still has them:<br>${REMOVED.map(r => `&nbsp;&nbsp;– ${r[1]} (${r[0].startsWith('in ') ? 'part of v2.0 Figure ' + r[0].slice(3) : 'v2.0 Figure ' + r[0]}): ${r[2]}.`).join('<br>')}<br>• <b>Main use cases without an own diagram</b>:<br>${NO_OWN_DIAGRAM.map(r => `&nbsp;&nbsp;– ${r[0]}: ${escText(fill(r[1]))}.`).join('<br>')}<br>• Design decisions of 05/11/2026, confirmed by the lead: Batch opening condition and refunds (Figure ${SEQ_FIGS.CLOSE}), contribution by box rows (Figure ${SEQ_FIGS.UC10}), deposit cases a–d with UC55 Cancel Bulk Pre-order (Figure ${SEQ_FIGS.FORFEIT}), survival rate and the Standard Cost of funded boxes (Figure ${SEQ_FIGS.UC38}), balance on the weighed kg (Figure ${SEQ_FIGS.UC29}), InvoicedSale (Figure ${SEQ_FIGS.UC50}); every page that applies them carries the line "Design decisions of 05/11/2026 applied here were confirmed by the lead."<br>• «planned» = required by Register v1.4 but not in the code yet (grey dashed lifeline and fragment, grey message labelled «planned»). Physical ERD and database script stay on the code (V001–V017).<br>• Messages to controllers are action names followed by the HTTP route; messages to the «persistence» AppDbContext are EF Core operations. Every lifeline class and every message name exists in the Class Diagrams (Figure 4.${CLASS_FIG_FIRST} onwards). Figure numbers follow the other diagram sets (${NEIGHBOUR_FIGS}); the Was column and every "v2.0 Figure" reference keep the old v2.0 numbers.`;
  const indexH = 24 + indexNote.split('<br>').reduce((a, l) => a + Math.ceil(tw(l.replace(/&nbsp;/g, ' ')) * 12 / 11 / (W - 16)) * 16, 0);
  d2.vertex(indexNote, S.note + 'fontSize=12;', 20, 80, W, indexH, { raw: true });
}

function run(out) {
  const f = new DrawioFile();
  const parsed = SEQS.map(q => q.steps.map(parseStep));
  const opens = SEQS.map((q, i) => openStacks(q, parsed[i]));
  const plan = SEQS.map((q, i) => paginate(q, parsed[i], opens[i]));
  indexPages(f, plan);
  const report = [];
  SEQS.forEach((q, i) => plan[i].forEach((part, k) => report.push(drawPart(f, q, i, parsed[i], opens[i], part, k, plan[i].length))));
  f.write(path.join(out, 'CrabShare_Sequence_Diagrams.drawio'));
  const split = SEQS.map((q, i) => [q.key, plan[i].length]).filter(([, n]) => n > 1);
  console.log('Sequence diagrams done:', SEQS.length, 'figures on', report.length, 'pages + 2 index pages; split:', split.map(([k, n]) => `${k}×${n}`).join(' '));
  return { plan, report };
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, SEQS, SEQ_FIG_BASE, REMOVED };
