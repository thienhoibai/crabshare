'use strict';
// Class Diagrams (Report 4 mục 3 Detailed Design) — một sơ đồ cho mỗi nhóm tính năng; lớp, thuộc tính (dependency tiêm vào), phương thức public thật trong code.
const path = require('path');
const { DrawioFile, S, stackBox } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · UML 2.5 · classes as on develop @ 22/10/2026 · attributes = injected dependencies / fields · operations = public API';

// stereo: controller | service | job | port | adapter | entity | static | record | engine
const C = (id, name, stereo, attrs = [], ops = []) => ({ id, name, stereo, attrs, ops });
const FILL = { controller: '#e0f2fe', service: '#ffffff', job: '#ede9fe', port: '#fef3c7', adapter: '#fff7ed', entity: '#f1f5f9', static: '#ffffff', record: '#ffffff', engine: '#ecfdf5', ui: '#ecfdf5' };

const DIAGRAMS = [
  {
    page: 'Funding', fig: 'Figure 4.73', title: 'Class Diagram – Funding module (UC09–UC12 reservation, VietQR, funding close)',
    groups: [
      { x: 20, items: [
        C('fc', 'FundingController', 'controller', ['- funding: FundingService', '- payments: PaymentRequestService'], ['+ ActiveDisclosure(): RiskDisclosureResponse', '+ Acknowledge(req): RiskAcknowledgementResponse', '+ OpenBatches(): FundingBatchSummary[]', '+ Batch(code): FundingBatchResponse', '+ Reserve(code, req): ContributionResponse', '+ RequestPayment(id): PaymentRequestResponse', '+ Cancel(id)', '+ Mine(): ContributionResponse[]']),
        C('fac', 'FundingAdminController', 'controller', ['- admin: FundingAdminService', '- close: FundingCloseService'], ['+ Batches(): AdminFundingBatch[]', '+ CloseDue(): FundingCloseResult']),
        C('fcj', 'FundingCloseJob', 'job', ['# Interval = 1 min', '- config Funding:CloseJob:Enabled'], ['# RunAsync(services, ct)']),
      ] },
      { x: 360, items: [
        C('fs', 'FundingService', 'service', ['- db: AppDbContext', '- me: ICurrentUser', '- audit: IAuditLog', '- payments: PaymentRequestService', '- disclosures: RiskDisclosureDocuments', '- clock: TimeProvider'], ['+ GetActiveDisclosureAsync()', '+ AcknowledgeAsync(req)', '+ ListOpenAsync()', '+ GetBatchAsync(code)', '+ ReserveAsync(code, req): ContributionResponse', '+ CancelAsync(contributionId)', '+ MineAsync()', '- IsOpen(batch, now): bool']),
        C('fcs', 'FundingCloseService', 'service', ['- db, audit, clock', '- refunds: RefundService'], ['+ RunAsync(): FundingCloseResult', '+ ExpireReservationsAsync(): int', '+ DueBatchIdsAsync(): long[]', '+ CloseBatchAsync(batchId): BatchCloseOutcome?', '- CloseCapitalAsync(batch, confirmed, total)', '- CancelUnderfundedAsync(batch, confirmed, total)', '- ExpireAsync(contribution, reason, now)']),
        C('fas', 'FundingAdminService', 'service', ['- db: AppDbContext'], ['+ ListAsync(): AdminFundingBatch[]']),
        C('cph', 'ContributionPaymentHandler', 'service', ['+ Purpose = "Contribution"'], ['+ OnPaidAsync(request, paidAt)']),
        C('rdd', 'RiskDisclosureDocuments', 'static', [], ['+ Read(versionCode, contentHash): string']),
      ] },
      { x: 720, items: [
        C('iph', 'IPaymentPurposeHandler', 'port', ['+ Purpose: string'], ['+ OnPaidAsync(request, paidAt)']),
        C('prs', 'PaymentRequestService', 'service', ['- gateway: IPaymentGateway'], ['+ CreateAsync(purpose, amount, batchAccountId, accountNo, expiresAt, target, referenceCode)']),
        C('ref', 'RefundService', 'service', [], ['+ CreateRefundAsync(batchAccountId, amount, contributionId?, orderId?, note, now)']),
        C('cv', 'ContractVoiding', 'static', [], ['+ VoidUnsignedAsync(db, audit, contributionIds, now)']),
        C('ial', 'IAuditLog', 'port', [], ['+ LockAsync()', '+ WriteAsync(entityType, entityId, action, old, new)']),
      ] },
      { x: 1080, items: [
        C('e_batch', 'Batch', 'entity', ['batch_code, status', 'min_viable/target/max_capital', 'funding_open_at, funding_deadline', 'capital_closed_at, total_confirmed_capital']),
        C('e_contr', 'Contribution', 'entity', ['investor_id, batch_id', 'amount, status', 'reserved_at, expires_at, confirmed_at']),
        C('e_share', 'CapitalShare', 'entity', ['batch_id, investor_id', 'confirmed_amount, snapshotted_at']),
        C('e_rd', 'RiskDisclosure / RiskAcknowledgement', 'entity', ['version_code, content_hash', 'investor_id, acknowledged_at']),
        C('e_pr', 'PaymentRequest', 'entity', ['reference_code, purpose, amount', 'status, expires_at']),
      ] },
    ],
    edges: [['fc', 'fs', 'assoc'], ['fc', 'prs', 'assoc'], ['fac', 'fas', 'assoc'], ['fac', 'fcs', 'assoc'], ['fcj', 'fcs', 'dep', 'runs every minute'], ['fs', 'prs', 'assoc'], ['fs', 'rdd', 'dep'], ['fs', 'ial', 'dep'], ['fcs', 'ref', 'assoc'], ['fcs', 'cv', 'dep'], ['fcs', 'ial', 'dep'], ['cph', 'iph', 'realize'], ['fs', 'e_contr', 'dep', 'creates'], ['fs', 'e_rd', 'dep'], ['fcs', 'e_share', 'dep', 'snapshots'], ['fcs', 'e_batch', 'dep', 'closes / cancels'], ['prs', 'e_pr', 'dep', 'creates'], ['cph', 'e_contr', 'dep', 'confirms']],
    notes: 'Money never passes through CrabShare: PaymentRequest carries the VietQR to the batch account at the intermediary; confirmation arrives through the webhook (Payments module). Every write locks the audit chain first (IAuditLog.LockAsync) so job and webhook run one after another.',
  },
  {
    page: 'Contracts', fig: 'Figure 4.74', title: 'Class Diagram – Contracts module (UC14 sequential e-signing, UC15 offline upload)',
    groups: [
      { x: 20, items: [C('cc', 'ContractsController', 'controller', ['- contracts: ContractService'], ['+ Create(contributionId): ContractResponse', '+ Get(id)', '+ Download(id): FileContentResult', '+ Sign(id): ContractResponse', '+ OfflineUpload(id, file, confirmedBothSigned)', '+ Mine()', '+ BatchContracts(code)', '+ OperatorContracts()'])] },
      { x: 360, items: [
        C('cs', 'ContractService', 'service', ['- db, me, audit, clock', '- templates: ContractTemplateDocuments', '- renderer: ContractPdfRenderer', '- files: ContractFileStore', '- signing: IDigitalSigningService'], ['+ CreateForContributionAsync(contributionId)', '+ SignAsync(contractId): ContractResponse', '+ GetAsync(contractId)', '+ GetFileAsync(contractId): byte[]', '+ UploadOfflineAsync(contractId, file, length, contentType, confirmed)', '+ ListMineAsync() / ListForBatchAsync(code) / ListForOperatorAsync()', '- SignerRoleAsync(contract): "Operator" | "Investor"', '- CurrentHash(contract): string']),
        C('cv', 'ContractVoiding', 'static', [], ['+ VoidUnsignedAsync(db, audit, contributionIds, now): int']),
      ] },
      { x: 720, items: [
        C('tpl', 'ContractTemplateDocuments', 'service', ['- logger'], ['+ Read(versionCode, contentHash): string', '+ Fill(template, values): string']),
        C('pdf', 'ContractPdfRenderer', 'service', ['- fonts: Reference/Fonts (Plus Jakarta Sans)'], ['+ Render(doc: ContractDocument): byte[]']),
        C('store', 'ContractFileStore', 'service', ['- root: Storage:RootPath'], ['+ UriFor(contractNo, sha256): string', '+ ReadAsync(contractNo, sha256): byte[]']),
        C('ids', 'IDigitalSigningService', 'port', [], ['+ SignAsync(document, signer): byte[]']),
        C('fake', 'FakeSigningService', 'adapter', [], ['+ SignAsync(…) — appends %CrabShare-FakeSign stamp']),
      ] },
      { x: 1080, items: [
        C('e_ic', 'InvestmentContract', 'entity', ['contract_no, contribution_id, template_id', 'status, signing_method', 'draft_hash, final_hash, final_file_uri', 'fully_signed_at']),
        C('e_sig', 'ContractSignature', 'entity', ['contract_id, signer_role, signing_order', 'signer_user_id, signed_hash, signed_at']),
        C('e_tpl', 'ContractTemplate', 'entity', ['version_code, content_hash', 'status, effective_from']),
      ] },
    ],
    edges: [['cc', 'cs', 'assoc'], ['cs', 'tpl', 'assoc'], ['cs', 'pdf', 'assoc'], ['cs', 'store', 'assoc'], ['cs', 'ids', 'dep'], ['fake', 'ids', 'realize'], ['cs', 'e_ic', 'dep', 'creates / signs'], ['cs', 'e_sig', 'dep', 'adds 1..2'], ['cs', 'e_tpl', 'dep', 'reads active'], ['cv', 'e_ic', 'dep', 'voids unsigned'], ['e_ic', 'e_sig', 'compos', '1 ⟶ 0..2']],
    notes: 'Each version of the PDF is content-addressed (contracts/{no}/{sha256}.pdf) and re-hashed on download (contract.file_tampered). Signing order is enforced in SignerRoleAsync: Operator Owner first, then Investor (contract.wrong_signing_order).',
  },
  {
    page: 'Payments', fig: 'Figure 4.75', title: 'Class Diagram – Payments module (webhook reconciliation, disbursement tranches, payouts, refunds)',
    groups: [
      { x: 20, items: [
        C('wc', 'PaymentWebhookController', 'controller', ['- webhook: PaymentWebhookService', '- secret: Payments:WebhookSecret'], ['+ Receive(): WebhookResult  [AllowAnonymous, X-Signature]']),
        C('dvc', 'DevPaymentsController', 'controller', [], ['+ Simulate(req) — Development only']),
        C('pc', 'PaymentsController', 'controller', [], ['+ Get(id): PaymentRequestResponse']),
        C('dc', 'DisbursementsController', 'controller', ['- disbursements: DisbursementService'], ['+ OperatorTranches()', '+ RequestTranche(code, no)', '+ AdminTranches(status)', '+ Release(id) / NeedExplanation(id, req) / Block(id, req)']),
        C('apc', 'AdminPaymentsController', 'controller', ['- queries: PaymentInstructionQueryService', '- payouts: PayoutSendService'], ['+ Instructions(query)', '+ Send(id)', '+ Unmatched()']),
      ] },
      { x: 380, items: [
        C('ws', 'PaymentWebhookService', 'service', ['- db, audit, clock, refunds', '- handlers: IEnumerable<IPaymentPurposeHandler>'], ['+ ProcessAsync(txn): WebhookResult', '- FindRequestAsync(content)', '- IsDuplicateProviderTxn(ex)']),
        C('sig', 'WebhookSignature', 'static', [], ['+ Compute(secret, body)', '+ Verify(secret, body, signature)']),
        C('prs', 'PaymentRequestService', 'service', ['- db, me, clock', '- gateway: IPaymentGateway'], ['+ CreateAsync(purpose, amount, …): CreatedPaymentRequest', '+ CreateForOrderAsync(order, …): VietQrPayment', '+ GetMineAsync(id)', '+ EffectiveStatus(request, now)']),
        C('ds', 'DisbursementService', 'service', ['- db, me, audit, clock'], ['+ ListForOperatorAsync()', '+ RequestAsync(batchCode, trancheNo)', '+ ListForAdminAsync(status)', '+ ReleaseAsync(trancheId)', '+ RequestExplanationAsync(trancheId, reason)', '+ BlockAsync(trancheId, reason)', '- GateAsync(batch, tranche, now): string?']),
        C('pss', 'PayoutSendService', 'service', ['- db, audit, clock, gateway'], ['+ SendAsync(instructionId)', '+ ListUnmatchedAsync()']),
        C('ref', 'RefundService', 'service', ['- db, audit'], ['+ CreateRefundAsync(…): PaymentInstruction']),
        C('piq', 'PaymentInstructionQueryService', 'service', [], ['+ ListAsync(query)']),
      ] },
      { x: 760, items: [
        C('iph', 'IPaymentPurposeHandler', 'port', ['+ Purpose'], ['+ OnPaidAsync(request, paidAt)']),
        C('h1', 'ContributionPaymentHandler · OrderPaymentHandler · PreOrderDepositHandler · PreOrderBalanceHandler · OfftakeDepositHandler', 'service', [], ['(Funding / Orders / Offtake modules)']),
        C('igw', 'IPaymentGateway', 'port', [], ['+ CreateVietQrAsync(req): VietQrPayment', '+ SendPayoutAsync(req): PayoutResult']),
        C('ibp', 'IBatchAccountProvisioner', 'port', [], ['+ OpenBatchAccountAsync(batchCode)']),
        C('fgw', 'FakePaymentGateway', 'adapter', [], ['sandbox: QR content, idempotent FAKE-OUT-{reference}']),
      ] },
      { x: 1120, items: [
        C('e_pr', 'PaymentRequest', 'entity', ['reference_code, purpose, amount, status', 'contribution_id | order_id | offtake_id']),
        C('e_pt', 'ProviderTransaction', 'entity', ['provider_txn_id (UNIQUE), direction', 'amount, match_status', 'payment_request_id | instruction_id']),
        C('e_pi', 'PaymentInstruction', 'entity', ['instruction_type, amount, status', 'payout_account_id', 'tranche_id | settlement_line_id | contribution_id | order_id']),
        C('e_tr', 'DisbursementTranche', 'entity', ['tranche_no, planned_amount, planned_date', 'status, explanation_deadline, released_at']),
        C('e_ba', 'BatchAccount', 'entity', ['provider_account_no, status']),
      ] },
    ],
    edges: [['wc', 'ws', 'assoc'], ['wc', 'sig', 'dep'], ['dvc', 'ws', 'dep'], ['pc', 'prs', 'assoc'], ['dc', 'ds', 'assoc'], ['apc', 'piq', 'assoc'], ['apc', 'pss', 'assoc'], ['ws', 'iph', 'dep', 'dispatch by Purpose'], ['h1', 'iph', 'realize'], ['ws', 'ref', 'assoc', 'late payment'], ['prs', 'igw', 'dep'], ['pss', 'igw', 'dep'], ['fgw', 'igw', 'realize'], ['fgw', 'ibp', 'realize'], ['ws', 'e_pt', 'dep', 'books once'], ['ws', 'e_pr', 'dep'], ['ds', 'e_tr', 'dep'], ['ds', 'e_pi', 'dep', 'creates Disbursement'], ['pss', 'e_pi', 'dep', 'sends'], ['ref', 'e_pi', 'dep', 'creates Refund'], ['e_pi', 'e_ba', 'assoc', '* ⟶ 1']],
    notes: 'Idempotency (TL-10): provider_txn_id is UNIQUE; a duplicate webhook is acknowledged without a second booking; payouts carry the reference CHI{id} so a retried send cannot create a second outgoing transaction.',
  },
  {
    page: 'Settlement', fig: 'Figure 4.76', title: 'Class Diagram – Settlement module and SettlementEngine (UC35–UC39)',
    groups: [
      { x: 20, items: [
        C('asc', 'AdminSettlementsController', 'controller', ['- settlements: SettlementService', '- payouts: SettlementPayoutService'], ['+ List()', '+ Calculate(code, req)', '+ Get(id)', '+ Approve(id)', '+ SendPayouts(id)']),
        C('sc', 'SettlementsController', 'controller', ['- review: SettlementReviewService'], ['+ Propose(id, req)', '+ Answer(feedbackId, req)', '+ Get(id)', '+ Feedback(id, req)', '+ Mine()', '+ OperatorSettlements()']),
        C('dsc', 'DevSettlementsController', 'controller', [], ['+ EndFeedbackWindow(id) — Development only']),
      ] },
      { x: 380, items: [
        C('ss', 'SettlementService', 'service', ['- db, me, audit, clock'], ['+ CalculateAsync(code, req): SettlementResponse', '+ ListForAdminAsync()', '+ GetForAdminAsync(id)', '~ DescribeAsync(id, viewer): SettlementResponse', '~ LockedStatuses']),
        C('srs', 'SettlementReviewService', 'service', ['- db, me, audit, clock', '- settlements: SettlementService'], ['+ ProposeAsync(id, req)', '+ AnswerAsync(feedbackId, req)', '+ GetForPartyAsync(id)', '+ FeedbackAsync(id, req)', '+ ListMineAsync() / ListForOperatorAsync()']),
        C('sps', 'SettlementPayoutService', 'service', ['- db, me, audit, clock', '- payouts: PayoutSendService'], ['+ ApproveAsync(id)', '+ SendPayoutsAsync(id)', '+ EndFeedbackWindowForDemoAsync(id)']),
        C('cl', 'SettlementClosing', 'static', [], ['+ CloseIfPaidAsync(db, audit, batchId, now): bool']),
      ] },
      { x: 760, items: [
        C('calc', 'SettlementCalculator', 'engine', ['(pure, no DB, no framework)'], ['+ Calculate(input: SettlementInput): SettlementResult', '- AllocateLoss(shares, loss)']),
        C('alloc', 'LargestRemainderAllocator', 'engine', [], ['+ Allocate(total: long, weights: long[]): long[]']),
        C('rin', 'SettlementInput', 'record', ['ActualRevenue, LockedStandardCost', 'OperatorSharePct, DepreciationAmount', 'TaxWithholdingPct', 'Shares: (InvestorId, Capital)[]']),
        C('rout', 'SettlementResult', 'record', ['RevenuePool, OperatorRemuneration', 'Distributable, UncoveredLoss, TaxTotal', 'Lines: SettlementLineResult[]']),
        C('rline', 'SettlementLineResult', 'record', ['InvestorId, CapitalReturn', 'ProfitShare, TaxWithheld, NetPayout']),
      ] },
      { x: 1120, items: [
        C('e_s', 'Settlement', 'entity', ['batch_id (UNIQUE), revision_no', 'actual_revenue, locked_standard_cost, revenue_pool', 'operator_share_pct, operator_remuneration', 'status, proposed_at, feedback_deadline, approved_at']),
        C('e_sl', 'SettlementLine', 'entity', ['settlement_id, investor_id', 'capital_return, profit_share', 'tax_withheld, net_payout, in_kind_qty_kg']),
        C('e_sf', 'SettlementFeedback', 'entity', ['settlement_id, user_id, content', 'status, response, responded_at']),
        C('e_v', 'v_batch_actual_revenue (view)', 'entity', ['order_revenue (Completed)', 'forfeited_deposits', 'complaint_refunds']),
      ] },
    ],
    edges: [['asc', 'ss', 'assoc'], ['asc', 'sps', 'assoc'], ['sc', 'srs', 'assoc'], ['dsc', 'sps', 'dep'], ['srs', 'ss', 'assoc'], ['ss', 'calc', 'dep', 'uses'], ['calc', 'alloc', 'dep'], ['calc', 'rin', 'dep', 'in'], ['calc', 'rout', 'dep', 'out'], ['rout', 'rline', 'compos', '1 ⟶ *'], ['sps', 'cl', 'dep'], ['ss', 'e_s', 'dep', 'creates / revises'], ['ss', 'e_v', 'dep', 'reads'], ['srs', 'e_sf', 'dep'], ['sps', 'e_sl', 'dep', 'instruction per line'], ['e_s', 'e_sl', 'compos', '1 ⟶ *'], ['e_s', 'e_sf', 'compos', '1 ⟶ *']],
    notes: 'The engine is a pure library (CrabShare.SettlementEngine) so TSK-12 can test it with property-based (FsCheck), metamorphic and model-based suites and measure mutation score (Stryker.NET). Money is long (integer VND); allocation sums exactly to the distributable amount.',
  },
  {
    page: 'Operators & Boxes', fig: 'Figure 4.77', title: 'Class Diagram – Operators and Boxes modules (UC04, UC05, UC44)',
    groups: [
      { x: 20, items: [
        C('oc', 'OperatorsController', 'controller', ['- operators: OperatorService'], ['+ Create(req) / Me() / Update(req) / Submit()', '+ Members() / AddMember(req) / RemoveMember(userId)']),
        C('aoc', 'AdminOperatorsController', 'controller', ['- review: OperatorReviewService'], ['+ List(filter, paging)', '+ Approve(id, req) / Reject(id, req) / Suspend(id, req)']),
        C('bc', 'BoxesController', 'controller', ['- boxes: BoxService'], ['+ List(query, paging)', '+ Range(req) / Create(req)', '+ Update(slotCode, req)']),
      ] },
      { x: 400, items: [
        C('os', 'OperatorService', 'service', ['- db, me, clock'], ['+ CreateAsync(req) / GetMeAsync() / UpdateAsync(req) / SubmitAsync()', '+ ListMembersAsync() / AddMemberAsync(req) / RemoveMemberAsync(userId)', '- RequireMembershipAsync(forWrite)']),
        C('ors', 'OperatorReviewService', 'service', ['- db, me, clock, audit'], ['+ ListAsync(filter, paging)', '+ DecideAsync(id, action, capacity?, reason?)']),
        C('bs', 'BoxService', 'service', ['- db, me, clock'], ['+ ListAsync(query, paging)', '+ CreateRangeAsync(req) — SqlBulkCopy', '+ CreateAsync(req)', '+ UpdateAsync(slotCode, req)', '- CapacityAsync(farm, added)']),
      ] },
      { x: 800, items: [
        C('e_op', 'Operator', 'entity', ['legal_name, tax_code (UNIQUE), business_reg_no', 'farm_address, approved_slot_capacity', 'status, submitted_at, approved_at/by']),
        C('e_om', 'OperatorMember', 'entity', ['user_id, operator_id', 'member_role: Owner | Staff']),
        C('e_slot', 'PhysicalSlot', 'entity', ['operator_id, slot_code (UNIQUE per farm)', 'row_code, rack_no, tier_no, column_no', 'status: Available | Occupied | Maintenance']),
        C('e_alloc', 'SlotAllocation', 'entity', ['batch_id, slot_id', 'allocated_at, released_at']),
        C('e_u', 'AppUser / AppUserRole', 'entity', ['email, full_name, status', 'role_code']),
      ] },
    ],
    edges: [['oc', 'os', 'assoc'], ['aoc', 'ors', 'assoc'], ['bc', 'bs', 'assoc'], ['os', 'e_op', 'dep'], ['os', 'e_om', 'dep'], ['os', 'e_u', 'dep', 'grants role'], ['ors', 'e_op', 'dep', 'approve / reject / suspend'], ['bs', 'e_slot', 'dep'], ['bs', 'e_alloc', 'dep', 'reads open allocation'], ['e_op', 'e_om', 'compos', '1 ⟶ 1..*'], ['e_op', 'e_slot', 'compos', '1 ⟶ *'], ['e_slot', 'e_alloc', 'assoc', '1 ⟶ *']],
    notes: 'Operator.status = Approved is the precondition for every write in Boxes, Batches, Production, Harvest, Tags and Evidence. Box capacity is capped at approved_slot_capacity.',
  },
  {
    page: 'Batches', fig: 'Figure 4.78', title: 'Class Diagram – Batches module (UC07, UC08, UC09, fee tiers, tranche schedule)',
    groups: [
      { x: 20, items: [
        C('bc', 'BatchesController', 'controller', ['- batches: BatchService', '- explore: BatchExploreService'], ['+ Create(req) / Update(code, req)', '+ SaveCost(code, req) / Submit(code)', '+ Get(code) — investor → explore', '+ List(query) [Investor]', '+ Mine(filter) / MineByCode(code)']),
        C('abc', 'AdminBatchesController', 'controller', ['- review: BatchReviewService'], ['+ List(filter) / Get(code)', '+ Approve(code, req) / Reject(code, req) / RequestRevision(code, req)']),
        C('ftc', 'FeeTiersController', 'controller', ['- fees: FeeTierService'], ['+ List() / Create(req) / Update(id, req)']),
        C('tsj', 'TrancheScheduleJob', 'job', ['# Interval = 60 s'], ['# RunAsync → TrancheScheduleResolver.ResolveAsync']),
      ] },
      { x: 400, items: [
        C('bs', 'BatchService', 'service', ['- db, me, clock, audit'], ['+ CreateAsync(req) / UpdateAsync(code, req)', '+ SaveCostAsync(code, req)', '+ SubmitAsync(code)', '+ GetAsync(code) / ListMineAsync(filter)', '~ CostAsync(batchId): StandardCostVersion?', '~ ValidateCosts(items) / ValidateSchedule(items, plans, complete)', '~ Validate(request)']),
        C('brs', 'BatchReviewService', 'service', ['- db, batches, me, clock, audit', '- gateway: IPaymentGateway'], ['+ ListAsync(filter) / GetAsync(code)', '+ ApproveAsync(code, req)', '+ RejectAsync(code, req)', '+ RequestRevisionAsync(code, req)']),
        C('bes', 'BatchExploreService', 'service', ['- db, me, clock'], ['+ ListAsync(query, paging)', '+ GetAsync(code)', '~ Funding(view, target): ExploreFundingProgress']),
        C('fts', 'FeeTierService', 'service', ['- db, me, clock, audit'], ['+ ListAsync() / SaveAsync(id?, req)']),
        C('fr', 'FundingReadiness', 'static', [], ['~ ReadyAt(batch): DateTimeOffset?', '~ StockingBlockedReason(batch, now, hasRegistry): string?']),
        C('tsr', 'TrancheScheduleResolver', 'service', ['- db, audit, clock'], ['+ ResolveAsync(): int']),
      ] },
      { x: 800, items: [
        C('ibp', 'IBatchAccountProvisioner', 'port', [], ['+ OpenBatchAccountAsync(batchCode)']),
        C('e_b', 'Batch', 'entity', ['batch_code, operator_id, crab_type, title', 'seed_quantity, cycle_days, restock_cutoff_days', 'min_viable/target/max_capital, min_contribution', 'operator_share_pct, offtake caps, fee_tier_id', 'status, funding window, stocked_at, …']),
        C('e_scv', 'StandardCostVersion', 'entity', ['batch_id, version_no, status', 'submitted_at, approved_by, locked_at']),
        C('e_sci', 'StandardCostItem', 'entity', ['category, description, quantity, unit', 'unit_price, tranche_no']),
        C('e_plan', 'StandardCostTranchePlan', 'entity', ['tranche_no, planned_date, anchor_code', 'offset_days, unlock_condition']),
        C('e_tr', 'DisbursementTranche', 'entity', ['tranche_no, planned_amount, planned_date, status']),
        C('e_fee', 'FeeTier', 'entity', ['tier_code, min/max_capital, fee_amount', 'effective_from/to']),
        C('e_bop', 'BatchOfftakePrice', 'entity', ['batch_id, grade_id, unit_price']),
      ] },
    ],
    edges: [['bc', 'bs', 'assoc'], ['bc', 'bes', 'assoc'], ['abc', 'brs', 'assoc'], ['ftc', 'fts', 'assoc'], ['tsj', 'tsr', 'dep'], ['brs', 'bs', 'assoc'], ['brs', 'ibp', 'dep'], ['bs', 'fr', 'dep'], ['tsr', 'fr', 'dep'], ['bs', 'e_b', 'dep'], ['bs', 'e_scv', 'dep'], ['bs', 'e_bop', 'dep'], ['brs', 'e_tr', 'dep', 'plans'], ['brs', 'e_fee', 'dep', 'applies'], ['bes', 'e_b', 'dep', 'reads published'], ['fts', 'e_fee', 'dep'], ['e_b', 'e_scv', 'compos', '1 ⟶ 1..*'], ['e_scv', 'e_sci', 'compos', '1 ⟶ 1..*'], ['e_scv', 'e_plan', 'compos', '1 ⟶ *'], ['e_b', 'e_tr', 'compos', '1 ⟶ *']],
    notes: 'The Standard Cost is locked when the batch is approved (TL-11): triggers tr_cost_version_locked / tr_cost_item_locked / tr_cost_plan_locked make the Locked version immutable; the settlement later deducts exactly this total.',
  },
  {
    page: 'Production', fig: 'Figure 4.79', title: 'Class Diagram – Production module (UC17 stocking, daily logs, box events; UC21 timeline)',
    groups: [
      { x: 20, items: [
        C('stc', 'StockingController', 'controller', ['- stocking: StockingService'], ['+ Stock(code, req): StockingResponse']),
        C('plc', 'ProductionLogsController', 'controller', ['- production: ProductionLogService'], ['+ Record(code, req) / List(code, filter)', '+ Mine(filter) / Batches(paging)', '+ Thresholds(code) / Configure(code, req)']),
        C('sec', 'SlotEventsController', 'controller', ['- events: SlotEventService'], ['+ Record(code, req) / List(code)', '+ Context(code, slotCode)', '+ Policy(code) / Configure(code, req)']),
        C('tlc', 'TimelineController', 'controller', ['- timeline: TimelineService'], ['+ Get(code, query): TimelinePage', '+ FileContent(code, id)']),
      ] },
      { x: 400, items: [
        C('sts', 'StockingService', 'service', ['- db, me, clock, audit'], ['+ StockAsync(code, req): StockingResponse']),
        C('pls', 'ProductionLogService', 'service', ['- db, me, clock, audit', '- alerts: AlertService'], ['+ ConfigureAsync(code, req)', '+ RecordAsync(code, req)', '+ ThresholdsAsync(code)', '+ ListAsync(code, filter) / ListMineAsync(filter)', '+ BatchesAsync(paging)', '- Violations(req, threshold)']),
        C('ses', 'SlotEventService', 'service', ['- db, me, clock, audit', '- alerts: AlertService'], ['+ PolicyAsync(code) / ConfigureAsync(code, req)', '+ RecordAsync(code, req): SlotEventResponse', '+ ContextAsync(code, slotCode)', '+ ListAsync(code, paging)', '- ClaimAvailableAsync(slot) / ReleaseSlotAsync(slot)', '- EnsureCountsAsync(batchId, alive)']),
        C('tls', 'TimelineService', 'service', ['- db, me', '- images: EvidenceImageReader', '- storage: IFileStorage'], ['+ ReadAsync(code, query): TimelinePage', '+ OpenFileAsync(code, id): TimelineFile']),
        C('al', 'AlertService', 'service', [], ['+ RaiseAsync(batchId, type, severity, message, ackWithin)']),
      ] },
      { x: 800, items: [
        C('e_log', 'ProductionLog', 'entity', ['batch_id, log_date, source', 'water_temp_c, salinity_ppt, ph, feed_kg', 'plausibility_flag, threshold_version_id']),
        C('e_thr', 'ProductionThresholdVersion', 'entity', ['batch_id, version_no', 'ph / temp / salinity min & max (immutable)']),
        C('e_se', 'SlotEvent', 'entity', ['slot_allocation_id, batch_id, event_type', 'occurred_at, quantity, source']),
        C('e_sed', 'SlotEventDetail', 'entity', ['crab_item_id, destination_slot_allocation_id', 'request_id, request_hash, policy_version_id, alive_count']),
        C('e_pol', 'SlotEventPolicyVersion', 'entity', ['restock_cutoff_basis/days', 'mortality window, threshold, severity (immutable)']),
        C('e_ci', 'CrabItem / CrabItemEvent', 'entity', ['batch_id, slot_allocation_id, status', 'replaces_crab_item_id', 'event_type, occurred_at']),
        C('e_rec', 'v_crab_count_reconciliation (view)', 'entity', ['growing, stocked_total, dead, harvested, alive']),
      ] },
    ],
    edges: [['stc', 'sts', 'assoc'], ['plc', 'pls', 'assoc'], ['sec', 'ses', 'assoc'], ['tlc', 'tls', 'assoc'], ['pls', 'al', 'assoc'], ['ses', 'al', 'assoc'], ['sts', 'e_ci', 'dep', 'one Growing crab per box'], ['sts', 'e_se', 'dep', 'Stocked'], ['pls', 'e_log', 'dep'], ['pls', 'e_thr', 'dep'], ['ses', 'e_se', 'dep'], ['ses', 'e_sed', 'dep'], ['ses', 'e_pol', 'dep'], ['ses', 'e_ci', 'dep', 'Dead / Relocated / Restocked'], ['ses', 'e_rec', 'dep', 'reconciles'], ['tls', 'e_log', 'dep', 'reads'], ['e_se', 'e_sed', 'compos', '1 ⟶ 0..1']],
    notes: 'Box events are idempotent by (batch, request_id, request_hash); mortality and restock require an InAppCapture evidence photo of the box; alive counts are reconciled against v_crab_count_reconciliation after every event. The ingestion API (source FarmApi) is planned, not implemented.',
  },
  {
    page: 'Harvest & Tags', fig: 'Figure 4.80', title: 'Class Diagram – Harvest module (UC22 harvest sessions, UC46 tags, UC33 trace)',
    groups: [
      { x: 20, items: [
        C('hc', 'HarvestController', 'controller', ['- harvests: HarvestService'], ['+ Start(code, req) / List(code) / Context(code, slotCode)', '+ Get(id) / Crabs(id, paging)', '+ Record(id, req) / Update(id, req) / Complete(id, req)']),
        C('tc', 'TagsController', 'controller', ['- tags: TagsService'], ['+ List(query) / Label(tag)', '+ Activate(tag, req) / Void(tag, req)']),
        C('trc', 'TraceController', 'controller', ['- trace: TraceService'], ['+ Get(tag) [AllowAnonymous, no-store]']),
      ] },
      { x: 400, items: [
        C('hs', 'HarvestService', 'service', ['- db, me, clock, audit', '- tagCodes: IHarvestTagCodeGenerator', '- catalog: CatalogService'], ['+ StartAsync(code, req): HarvestWriteResult', '+ RecordAsync(id, req): HarvestWriteResult<HarvestCrabResponse>', '+ UpdateAsync(id, req) / CompleteAsync(id, req)', '+ GetAsync(id) / ListAsync(code) / ContextAsync(code, slotCode) / CrabsAsync(id)', '- EnsureOpen(session, batch) / EnsureCountsAsync(batchId, alive)']),
        C('hg', 'HarvestGrading', 'static', [], ['+ Select(grades, weightG, shellCondition): ProductGrade']),
        C('ts', 'TagsService', 'service', ['- db, me, audit, codes, clock', '- traceOptions: TraceOptions'], ['+ ListAsync(query, paging)', '+ LabelAsync(code): TagLabelResponse', '+ ActivateAsync(code, req): TagLifecycleResponse', '+ VoidAsync(code, req): TagVoidResponse']),
        C('trs', 'TraceService', 'service', ['- db, logger'], ['+ GetAsync(code): TraceResponse']),
        C('gen', 'IHarvestTagCodeGenerator', 'port', ['Length = 12, alphabet without 0/1/I/O/L'], ['+ NewCode(): string']),
        C('cat', 'CatalogService', 'service', [], ['~ SyncHarvestStockAsync(batchId)']),
      ] },
      { x: 820, items: [
        C('e_h', 'Harvest', 'entity', ['batch_id, name, lifecycle_status', 'harvested_at, harvested_count, total_weight_kg', 'revision_no, completed_at/by']),
        C('e_hr', 'HarvestRecord', 'entity', ['slot_event_id, harvest_id, crab_item_id, tag_id', 'weight_g, shell_condition, grade_code, tag_code (immutable)']),
        C('e_hsr', 'HarvestStartRequest', 'entity', ['request_id, request_hash (idempotency)']),
        C('e_tag', 'CrabTag', 'entity', ['crab_item_id, tag_code (UNIQUE, 12)', 'status, printed_at/by, activated_at', 'activation_evidence_id, voided_at, void_reason']),
        C('e_scan', 'TagScan', 'entity', ['tag_id, scanned_at, scanned_by, is_order_owner']),
        C('e_grade', 'ProductGrade', 'entity', ['grade_code, grade_name, min/max_weight_g']),
        C('e_vt', 'v_traceability (view)', 'entity', ['tag_code, batch_code, crab_type, grade, weight', 'stocked_at, harvested_at, slot_code']),
      ] },
    ],
    edges: [['hc', 'hs', 'assoc'], ['tc', 'ts', 'assoc'], ['trc', 'trs', 'assoc'], ['hs', 'hg', 'dep'], ['hs', 'gen', 'dep'], ['ts', 'gen', 'dep'], ['hs', 'cat', 'assoc', 'on complete'], ['hs', 'e_h', 'dep'], ['hs', 'e_hr', 'dep', 'snapshot per crab'], ['hs', 'e_hsr', 'dep'], ['hs', 'e_tag', 'dep', 'prints'], ['hs', 'e_grade', 'dep'], ['ts', 'e_tag', 'dep', 'activates / voids'], ['trs', 'e_vt', 'dep', 'reads'], ['trs', 'e_scan', 'dep', 'records'], ['e_h', 'e_hr', 'compos', '1 ⟶ *']],
    notes: 'Each harvested crab gets a printed tag; activation needs one Accepted confirmation photo of that crab (Evidence module). Public trace serves Active tags only and never exposes personal data.',
  },
  {
    page: 'Catalog', fig: 'Figure 4.81', title: 'Class Diagram – Catalog module (UC24 listings, UC25 store, price anomaly, moderation)',
    groups: [
      { x: 20, items: [
        C('lc', 'ListingsController', 'controller', ['- catalog: CatalogService'], ['+ Browse(query) / GetPublic(id) / Image(id) [anonymous]', '+ Create(req) / PreviewPrice(id, price) / ChangePrice(id, req)', '+ Publish(id) / Close(id) / RefreshStock(id) / UploadImage(id, file)']),
        C('olc', 'OperatorListingsController', 'controller', [], ['+ List() / Get(id) / Options()']),
        C('alc', 'AdminListingsController', 'controller', ['- moderation: ListingModerationService'], ['+ List(query, paging) / Hide(id, req) / GetAudit(id)']),
      ] },
      { x: 400, items: [
        C('cs', 'CatalogService', 'service', ['- db, me, clock', '- files: IFileStorage', '- lowStock: LowStockMonitor', '+ MaxImageBytes = 5 MB'], ['+ ListMineAsync() / GetMineAsync(id) / ListOptionsAsync()', '+ CreateAsync(req) / PreviewPriceAsync(id, price) / ChangePriceAsync(id, req)', '+ PublishAsync(id) / CloseAsync(id) / RefreshStockAsync(id)', '+ UploadImageAsync(id, file) / OpenImageAsync(id)', '+ BrowseAsync(query) / GetPublicAsync(id)', '~ SyncHarvestStockAsync(batchId)', '~ SellUntil(storageType, frozenAt, capMonths)']),
        C('pa', 'PriceAnomaly', 'static', ['AlgorithmVersion "mad-v1", MinSamples 20, MinOperators 3', 'ModifiedZThreshold 3.5, PercentThreshold 0.20'], ['+ Evaluate(pricePerKg, samples, now): Result']),
        C('mod', 'ListingModerationService', 'service', ['- db, me, clock'], ['+ ListAsync(query, paging)', '+ HideAsync(id, req)', '+ GetAuditDetailAsync(id)']),
        C('low', 'LowStockMonitor', 'service', ['- alerts: IAlertRaiser', '- thresholds: AlertThresholds'], ['+ CheckAsync(listingIds)', '+ IsLow(snapshot, thresholdKg)']),
      ] },
      { x: 820, items: [
        C('ifs', 'IFileStorage', 'port', [], ['+ SaveAsync(stream, name, contentType, folder): StoredFile', '+ OpenReadAsync(uri) / DeleteAsync(uri)']),
        C('iar', 'IAlertRaiser', 'port', [], ['+ RaiseAsync(batchId, type, severity, message, ackWithin)']),
        C('e_pl', 'ProductListing', 'entity', ['batch_id, grade_id, title, storage_type, frozen_at', 'current_price_per_kg, stock_qty_kg, reserved_qty_kg', 'status, published_at, image_uri, hidden_at/by/reason']),
        C('e_ph', 'PriceHistory', 'entity', ['listing_id, price_per_kg, previous_price_per_kg', 'reason_code, flagged_abnormal, changed_by (append-only)']),
        C('e_pc', 'PriceCheck', 'entity', ['price_history_id, method, median, mad', 'score, threshold, is_flagged (append-only)']),
        C('e_cap', 'v_batch_commitment_cap (view)', 'entity', ['cap_kg, committed_kg, remaining_kg']),
      ] },
    ],
    edges: [['lc', 'cs', 'assoc'], ['olc', 'cs', 'assoc'], ['alc', 'mod', 'assoc'], ['cs', 'pa', 'dep'], ['cs', 'low', 'assoc'], ['cs', 'ifs', 'dep'], ['low', 'iar', 'dep'], ['cs', 'e_pl', 'dep'], ['cs', 'e_ph', 'dep', 'appends'], ['cs', 'e_pc', 'dep', 'appends'], ['cs', 'e_cap', 'dep', 'reads'], ['mod', 'e_pl', 'dep', 'hides'], ['e_pl', 'e_ph', 'compos', '1 ⟶ 1..*'], ['e_ph', 'e_pc', 'compos', '1 ⟶ 0..1']],
    notes: 'Public price history (TL-27): every price change appends price_history + price_check (MAD-based anomaly score); admins see flagged listings and may hide them without changing status. Catalog writes no audit rows (gap noted in CS-85 review).',
  },
  {
    page: 'Orders – checkout & payment', fig: 'Figure 4.82', title: 'Class Diagram – Orders module, part 1 (UC26 checkout, UC27 pre-order, cancellation, expiry)',
    groups: [
      { x: 20, items: [
        C('oc', 'OrdersController', 'controller', ['- orders: OrderService'], ['+ Checkout(req): CheckoutResponse']),
        C('otc', 'OrderTrackingController', 'controller', ['- queries, cancellations, fulfilment, ratings, returns'], ['+ List(query) / Get(orderNo)', '+ Cancel(orderNo, req) / Receive(orderNo)', '+ GetRating(orderNo) / Rate(orderNo, req) / Return(orderNo, req)']),
        C('prc', 'PreordersController', 'controller', ['- preorders: PreorderService'], ['+ Place(req): PreorderResponse']),
        C('rej', 'ReservationExpiryJob', 'job', ['# Interval = 1 min'], ['# RunAsync → ReservationExpiryService.ReleaseExpiredAsync']),
        C('pbj', 'PreorderBalanceJob', 'job', ['# Interval = 1 min'], ['# RunAsync → PreorderBalanceService.IssueForHarvestingBatchesAsync']),
      ] },
      { x: 420, items: [
        C('os', 'OrderService', 'service', ['- db, me, clock', '- payments: PaymentRequestService', '- lowStock: LowStockMonitor', '- options: OrderOptions (ReservationMinutes 15)'], ['+ CheckoutAsync(req): CheckoutResponse', '+ NormalizeLines(lines)', '+ SplitByBatch(lines)', '+ LineAmount(quantityKg, unitPrice)']),
        C('ps', 'PreorderService', 'service', ['- db, me, payments, audit, options, clock'], ['+ PlaceAsync(req): PreorderResponse', '+ ComputeDeposit(total, depositPct)']),
        C('pbs', 'PreorderBalanceService', 'service', ['- db, payments, audit, clock', '+ BalanceDueHours = 48'], ['+ IssueForBatchAsync(batchId)', '+ IssueForHarvestingBatchesAsync(): int']),
        C('oqs', 'OrderQueryService', 'service', ['- db, me, clock'], ['+ ListMineAsync(query, paging)', '+ GetMineAsync(orderNo): OrderTrackingResponse', '+ IsCancellable(status)', '+ Timeline(order)']),
        C('ocs', 'OrderCancellationService', 'service', ['- db, me, audit, refunds, clock'], ['+ CancelAsync(orderNo, req): CancelOrderResponse']),
        C('rex', 'ReservationExpiryService', 'service', ['- db, audit, clock', '+ TimeoutReason = "payment_timeout"'], ['+ ReleaseExpiredAsync(): int', '- ExpireOrderAsync(order) / ExpireOfftakeDepositsAsync()']),
        C('sr', 'StockRelease', 'static', [], ['+ ReleaseAsync(db, reservation, now): Released?']),
        C('on', 'OrderNumber', 'static', ['Prefix "OD", length 13, Crockford base32'], ['+ New(): string']),
      ] },
      { x: 840, items: [
        C('h1', 'OrderPaymentHandler', 'service', ['+ Purpose = "OrderPayment"'], ['+ OnPaidAsync(request, paidAt) — commit reservations, stock −, order Paid']),
        C('h2', 'PreOrderDepositHandler', 'service', ['+ Purpose = "PreOrderDeposit"'], ['+ OnPaidAsync — order DepositPaid']),
        C('h3', 'PreOrderBalanceHandler', 'service', ['+ Purpose = "PreOrderBalance"'], ['+ OnPaidAsync — order Paid']),
        C('iph', 'IPaymentPurposeHandler', 'port', [], ['+ OnPaidAsync(request, paidAt)']),
        C('e_so', 'SalesOrder', 'entity', ['order_no (UNIQUE), customer_id, batch_id', 'order_type: Retail | PreOrder | Offtake, offtake_id', 'status, total_amount, deposit_amount, balance_due_at', 'recipient, shipping_address, paid_at, …']),
        C('e_ol', 'OrderLine', 'entity', ['order_id, batch_id, listing_id, price_history_id', 'quantity_kg, unit_price']),
        C('e_sres', 'StockReservation', 'entity', ['order_line_id, listing_id, quantity_kg', 'expires_at, status']),
      ] },
    ],
    edges: [['oc', 'os', 'assoc'], ['otc', 'oqs', 'assoc'], ['otc', 'ocs', 'assoc'], ['prc', 'ps', 'assoc'], ['rej', 'rex', 'dep'], ['pbj', 'pbs', 'dep'], ['os', 'on', 'dep'], ['ocs', 'sr', 'dep'], ['rex', 'sr', 'dep'], ['h1', 'iph', 'realize'], ['h2', 'iph', 'realize'], ['h3', 'iph', 'realize'], ['os', 'e_so', 'dep', 'creates per batch'], ['os', 'e_sres', 'dep', 'Active 15 min'], ['ps', 'e_so', 'dep', 'PreOrder'], ['h1', 'e_sres', 'dep', 'Committed'], ['ocs', 'e_so', 'dep', 'Cancelled + refund'], ['rex', 'e_so', 'dep', 'timeout'], ['e_so', 'e_ol', 'compos', '1 ⟶ 1..*'], ['e_ol', 'e_sres', 'compos', '1 ⟶ 0..1']],
    notes: 'No overselling: the reservation is a conditional UPDATE on product_listing (stock − reserved ≥ q) inside one transaction per checkout; 0 rows affected aborts the whole cart (409 order.insufficient_stock). Verified by the 50-concurrent-checkout test.',
  },
  {
    page: 'Orders – fulfilment & disputes', fig: 'Figure 4.83', title: 'Class Diagram – Orders module, part 2 (UC28–UC32, UC34 packing, delivery, returns, complaints, ratings)',
    groups: [
      { x: 20, items: [
        C('ooc', 'OperatorOrdersController', 'controller', ['- packing, fulfilment, returns'], ['+ List(status) / GetCounts() / Get(orderNo)', '+ Pack(orderNo, req) / Ship(orderNo, req) / Deliver(orderNo)', '+ ApproveReturn(orderNo, req) / RejectReturn(orderNo, req)']),
        C('cc', 'ComplaintsController', 'controller', ['- complaints: ComplaintService'], ['+ Create(orderNo, req) / GetByOrderNo(orderNo)', '+ Respond(id, req) / Get(id)', '+ ListForOperator() / ListForCustomer()']),
        C('acc', 'AdminComplaintsController', 'controller', [], ['+ List(status, page) / Get(id) / Resolve(id, req)']),
        C('ocj', 'OrderCompletionJob', 'job', ['# Interval = 1 min'], ['# RunAsync → OrderCompletionService.CompleteDueAsync']),
        C('cej', 'ComplaintEscalationJob', 'job', ['# Interval = 1 min'], ['# RunAsync → ComplaintService.EscalateOverdueAsync']),
      ] },
      { x: 420, items: [
        C('pk', 'OrderPackingService', 'service', ['- db, me, audit, returns, clock'], ['+ ListMineAsync(status) / GetMineAsync(orderNo) / GetCountsAsync()', '+ PackAsync(orderNo, req): OperatorOrderDetailResponse', '~ ExtractTagCode(raw): string?']),
        C('ful', 'OrderFulfilmentService', 'service', ['- db, me, audit, clock, options (ReturnWindowHours 72)'], ['+ ShipAsync(orderNo, req)', '+ DeliverAsync(orderNo)', '+ ReceiveAsync(orderNo)', '+ CanConfirmReceipt(status, receivedAt)', '- MarkCrabsSoldAsync(order)']),
        C('ret', 'OrderReturnService', 'service', ['- db, me, audit, refunds, clock'], ['+ CanReturnAsync(orderNo) / GetStateAsync(orderNo)', '+ ReturnAsync(orderNo, req)', '+ ApproveByOperatorAsync(orderNo, req) / RejectByOperatorAsync(orderNo, req)']),
        C('rat', 'OrderRatingService', 'service', ['- db, me, audit, clock'], ['+ GetAsync(orderNo): OrderRatingView', '+ RateAsync(orderNo, req): RatingResponse']),
        C('cmp', 'OrderCompletionService', 'service', ['- db, audit, clock'], ['+ CompleteDueAsync(): int']),
        C('cps', 'ComplaintService', 'service', ['- db, me, audit, refunds, clock', '+ DefaultEscalateHours = 24'], ['+ SubmitAsync(orderNo, req) / RespondAsync(id, req) / ResolveAsync(id, req)', '+ EscalateOverdueAsync(): int', '+ GetByIdAsync(id) / GetByOrderNoAsync(orderNo)', '+ ListForAdminAsync(status, page, size) / ListForOperatorAsync() / ListForCustomerAsync()']),
      ] },
      { x: 860, items: [
        C('ref', 'RefundService', 'service', [], ['+ CreateRefundAsync(batchAccountId, amount, contributionId?, orderId?, note, now)']),
        C('e_so', 'SalesOrder', 'entity', ['status, shipped_at, carrier_name, vehicle_plate, driver_phone', 'delivered_at, received_at, return_window_ends_at, completed_at']),
        C('e_ci', 'CrabItem / CrabItemEvent', 'entity', ['status InStock → Packed → Sold, order_line_id', 'event Packed / Delivered (tag_id)']),
        C('e_tag', 'CrabTag', 'entity', ['tag_code, status Active']),
        C('e_cm', 'Complaint', 'entity', ['order_id, complaint_type, description, evidence_uri', 'status, operator_response, escalated_at', 'resolution, refund_amount, resolved_by/at, admin_notes']),
        C('e_rt', 'ProductRating', 'entity', ['order_id (UNIQUE), stars, comment (#ITEMS: json)']),
        C('e_pi', 'PaymentInstruction', 'entity', ['instruction_type Refund, order_id']),
      ] },
    ],
    edges: [['ooc', 'pk', 'assoc'], ['ooc', 'ful', 'assoc'], ['ooc', 'ret', 'assoc'], ['cc', 'cps', 'assoc'], ['acc', 'cps', 'assoc'], ['ocj', 'cmp', 'dep'], ['cej', 'cps', 'dep'], ['ful', 'pk', 'assoc'], ['ret', 'ref', 'assoc'], ['cps', 'ref', 'assoc'], ['pk', 'e_ci', 'dep', 'Packed'], ['pk', 'e_tag', 'dep', 'scans Active'], ['pk', 'e_so', 'dep'], ['ful', 'e_so', 'dep', 'Shipping / Delivered'], ['ful', 'e_ci', 'dep', 'Sold'], ['ret', 'e_so', 'dep', 'Returned'], ['cmp', 'e_so', 'dep', 'Completed'], ['cps', 'e_cm', 'dep'], ['rat', 'e_rt', 'dep'], ['ref', 'e_pi', 'dep', 'creates'], ['e_so', 'e_cm', 'assoc', '1 ⟶ *'], ['e_so', 'e_rt', 'assoc', '1 ⟶ 0..1']],
    notes: 'Packing links physical crabs (tags) to order lines, which is what makes the sold unit traceable slot → batch → order (NFR traceability). Return requests live in audit_log (actions return_request / return_reject / return).',
  },
  {
    page: 'Offtake', fig: 'Figure 4.84', title: 'Class Diagram – Offtake module (UC13 commitment; UC23 claim window in PR #72)',
    groups: [
      { x: 20, items: [C('oc', 'OfftakeController', 'controller', ['- offtake: OfftakeService'], ['+ Create(code, req): OfftakeCommitmentResponse', '+ Mine()', '+ Cap(code): OfftakeCapResponse', '+ Claim(id, req) [CS-75]'])] },
      { x: 380, items: [
        C('os', 'OfftakeService', 'service', ['- db, me, payments, audit, fundingOptions, clock', '+ MaxAttempts = 3'], ['+ GetCapAsync(code)', '+ ListMineAsync()', '+ CreateAsync(code, req)', '+ ComputeDeposit(value, depositPct)']),
        C('dh', 'OfftakeDepositHandler', 'service', ['+ Purpose = "OfftakeDeposit"'], ['+ OnPaidAsync — deposit Held']),
        C('cl', 'OfftakeClaimService [CS-75]', 'service', ['- db, me, payments, audit, clock'], ['+ ClaimAsync(offtakeId, req): offtake order + balance QR']),
        C('wsv', 'OfftakeWindowService [CS-75]', 'service', ['- db, audit, refunds, clock'], ['+ RunAsync() / OpenWindowsAsync() / CloseExpiredAsync() / RefundCancelledAsync()']),
        C('wj', 'OfftakeWindowJob [CS-75]', 'job', ['# Interval = 1 min'], ['# RunAsync → OfftakeWindowService.RunAsync']),
        C('ph', 'OfftakePaymentHandler [CS-75]', 'service', ['+ Purpose = "OfftakePayment"'], ['+ OnPaidAsync — order Paid, commitment Fulfilled, deposit Applied']),
      ] },
      { x: 800, items: [
        C('iph', 'IPaymentPurposeHandler', 'port', [], ['+ OnPaidAsync(request, paidAt)']),
        C('prs', 'PaymentRequestService', 'service', [], ['+ CreateAsync(purpose, amount, …, PaymentTarget.ForOfftake(id))']),
        C('e_oc', 'OfftakeCommitment', 'entity', ['contribution_id (UNIQUE), batch_id, grade_id', 'committed_qty_kg, fixed_unit_price, deposit_amount', 'deposit_status, status', 'window_opens_at, window_expires_at']),
        C('e_bop', 'BatchOfftakePrice', 'entity', ['batch_id, grade_id, unit_price']),
        C('e_cap', 'v_batch_commitment_cap (view)', 'entity', ['cap_kg (60 % of expected output), remaining_kg']),
        C('e_so', 'SalesOrder (Offtake)', 'entity', ['order_type Offtake, offtake_id, balance_due_at']),
      ] },
    ],
    edges: [['oc', 'os', 'assoc'], ['oc', 'cl', 'assoc'], ['os', 'prs', 'assoc'], ['cl', 'prs', 'assoc'], ['dh', 'iph', 'realize'], ['ph', 'iph', 'realize'], ['wj', 'wsv', 'dep'], ['os', 'e_oc', 'dep', 'creates'], ['os', 'e_bop', 'dep', 'fixed price'], ['os', 'e_cap', 'dep', 'cap check'], ['cl', 'e_so', 'dep', 'creates'], ['wsv', 'e_oc', 'dep', 'opens / closes window'], ['e_oc', 'e_so', 'assoc', '0..1 ⟶ *']],
    notes: 'Offtake Investor = Investor with ≥ 1 commitment on an own Confirmed contribution; the batch Operator and related parties are barred (offtake.related_party). Forfeited deposits count as revenue in v_batch_actual_revenue (TL-12).',
  },
  {
    page: 'Auth & Accounts', fig: 'Figure 4.85', title: 'Class Diagram – Auth and Accounts modules (UC01–UC03, UC06, user management, payout protection)',
    groups: [
      { x: 20, items: [
        C('ac', 'AuthController', 'controller', ['- auth: AuthService', '- me: ICurrentUser'], ['+ Register(req) [rate limited]', '+ Login(req) [rate limited]', '+ Me()']),
        C('acc', 'AccountsController', 'controller', ['- accounts: AccountService'], ['+ Verify(req) multipart ≤ 16 MB', '+ Kyc(): KycStatusResponse']),
        C('aac', 'AdminAccountsController', 'controller', ['- admin: AdminAccountService'], ['+ Users(query, paging) / GetUser(id)', '+ Lock(id, req) / Unlock(id, req)', '+ Checks(query, paging) / ApproveException(id, req)']),
        C('ppc', 'PaymentProfilesController', 'controller', ['- profiles: PaymentProfileService'], ['+ Payout(ownerType) / SavePayout(ownerType, req)', '+ Addresses() / Address(id) / CreateAddress(req) / UpdateAddress(id, req) / DeleteAddress(id)']),
      ] },
      { x: 420, items: [
        C('as', 'AuthService', 'service', ['- db, tokens: TokenService, clock', '- limiter: LoginAttemptLimiter'], ['+ RegisterAsync(req): AuthResponse', '+ LoginAsync(req): AuthResponse', '+ GetMeAsync(userId): MeResponse']),
        C('acs', 'AccountService', 'service', ['- db, me, clock', '- ekyc: IEkycProvider'], ['+ GetKycAsync()', '+ VerifyIdentityAsync(req): KycStatusResponse']),
        C('aas', 'AdminAccountService', 'service', ['- db, me, clock'], ['+ ListUsersAsync(query, paging) / GetUserAsync(id)', '+ ListChecksAsync(query, paging)', '+ SetLockedAsync(id, locked, reason)', '+ ApproveExceptionAsync(id, reason)']),
        C('pps', 'PaymentProfileService', 'service', ['- db, me, clock', '- matcher: IBankNameMatcher'], ['+ GetPayoutAsync(ownerType) / SavePayoutAsync(ownerType, req)', '+ ListAddressesAsync() / GetAddressAsync(id) / SaveAddressAsync(id?, req) / DeleteAddressAsync(id)']),
        C('aaw', 'AccountAuditWriter', 'static', [], ['~ Append(db, actorId, entityType, entityId, action, old, new, now, previousHash)']),
      ] },
      { x: 860, items: [
        C('tok', 'TokenService', 'service', ['- options: JwtOptions (HS256, 480 min)'], ['+ Create(userId, email, name, roles, operatorId): (token, expiresAt)']),
        C('lim', 'LoginAttemptLimiter', 'service', ['5 attempts / 15 min per email hash'], ['+ Begin(email) / Success(email)']),
        C('cu', 'CurrentUser : ICurrentUser', 'adapter', ['claims sub, role, operator_id'], ['+ UserId / OperatorId / IsInRole(role) / RequireOperatorId()']),
        C('iek', 'IEkycProvider', 'port', [], ['+ VerifyAsync(front, back, selfie): EkycResult']),
        C('ibn', 'IBankNameMatcher', 'port', [], ['+ MatchAsync(expectedName, holderName): BankNameMatchResult']),
        C('pap', 'PayoutAccountProtection', 'service', ['DataProtection purpose PayoutAccount.AccountNo.v1'], ['+ Protect(number) / Unprotect(stored)', '+ Digest(bankCode, number): HMAC hex']),
        C('e_u', 'AppUser / AppUserRole', 'entity', ['email (UNIQUE), password_hash, status', 'role_code: Investor | Customer | OperatorMember | PlatformAdmin | EvidenceReviewer']),
        C('e_inv', 'Investor / KycCheck', 'entity', ['investor_kind, verification_status, verified_at', 'check_type, result, provider_ref, consent_at']),
        C('e_pa', 'PayoutAccount / CustomerAddress', 'entity', ['bank_code, account_no (encrypted), account_no_digest', 'name_match_status, status', 'recipient, address_line, province, is_default']),
      ] },
    ],
    edges: [['ac', 'as', 'assoc'], ['acc', 'acs', 'assoc'], ['aac', 'aas', 'assoc'], ['ppc', 'pps', 'assoc'], ['as', 'tok', 'assoc'], ['as', 'lim', 'assoc'], ['acs', 'iek', 'dep'], ['pps', 'ibn', 'dep'], ['pps', 'aaw', 'dep'], ['pps', 'pap', 'dep', 'via AppDbContext'], ['as', 'e_u', 'dep'], ['acs', 'e_inv', 'dep'], ['aas', 'e_u', 'dep', 'lock / unlock'], ['aas', 'e_inv', 'dep', 'exception'], ['pps', 'e_pa', 'dep']],
    notes: 'JwtBearer OnTokenValidated reloads app_user.status and roles from the DB on every request, so a lock takes effect immediately. Accounts write audit rows through AccountAuditWriter on the same hash chain as IAuditLog.',
  },
  {
    page: 'Evidence', fig: 'Figure 4.86', title: 'Class Diagram – Evidence module (UC45 capture, UC47 review, UC48 explanation, capture requests, detection port)',
    groups: [
      { x: 20, items: [
        C('ec', 'EvidenceController', 'controller', ['- evidence: EvidenceService'], ['+ Upload(req) multipart → 201 EvidenceResponse']),
        C('erc', 'EvidenceReviewController', 'controller', ['- review: EvidenceReviewService  [Policy Reviewer]'], ['+ List(query, paging) / Get(id) / Image(id)', '+ Verdict(id, req)']),
        C('eec', 'EvidenceExplanationsController', 'controller', ['- explanations: EvidenceExplanationService'], ['+ List(query, paging) / Get(id) / Image(id)', '+ Explain(id, req)']),
        C('crc', 'CaptureRequestsController', 'controller', [], ['+ List(query, paging)']),
        C('crw', 'CaptureRequestWorker', 'job', ['PeriodicTimer 5 min (BackgroundService)'], ['# ExecuteAsync → CaptureRequestJob.RunAsync']),
      ] },
      { x: 440, items: [
        C('es', 'EvidenceService', 'service', ['- db, me, clock, logger', '- access: EvidenceAccess', '- images: EvidenceImageProcessor', '- storage: IFileStorage', '- detector: ICrabDetector', '- options: EvidenceOptions (SimilarityDistance 4, StaleCaptureHours 24)'], ['+ UploadAsync(req): EvidenceResponse', '- RequireContextAsync(req, receivedAt)', '- DuplicateAsync(image): Exact | Similar | None', '- DetectAsync(bytes)']),
        C('ers', 'EvidenceReviewService', 'service', ['- db, me, images, clock'], ['+ ListAsync(query, paging) / GetAsync(id) / OpenImageAsync(id)', '+ DecideAsync(id, req): ReviewEvidenceDetail', '- RequireAccessAsync(id) — conflict of interest']),
        C('ees', 'EvidenceExplanationService', 'service', ['- db, access, me, images, clock'], ['+ ListAsync(query, paging) / GetAsync(id) / OpenImageAsync(id)', '+ ExplainAsync(id, req): OperatorEvidenceItem']),
        C('crs', 'CaptureRequestService', 'service', ['- db, access'], ['+ ListAsync(query, paging)']),
        C('crj', 'CaptureRequestJob', 'service', ['- db, alerts: AlertService, options, clock'], ['+ RunAsync(): CaptureRequestJobResult (created, expired)']),
        C('ea', 'EvidenceAccess', 'service', ['- db, me'], ['+ RequireOperatorAsync(): operatorId']),
        C('eip', 'EvidenceImageProcessor', 'service', ['MaxImageBytes 5 MB, MaxPixels 20 M'], ['+ ReadAsync(file): EvidenceImage (sha256, dHash)', '+ Distance(a, b): int']),
        C('eir', 'EvidenceImageReader', 'service', ['- storage: IFileStorage'], ['+ OpenAsync(fileUri, mediaType): EvidenceImageContent']),
      ] },
      { x: 900, items: [
        C('icd', 'ICrabDetector', 'port', [], ['+ DetectAsync(image): CrabDetectionResult(crabDetected?, confidence?, modelVersion)']),
        C('noop', 'NoopCrabDetector', 'adapter', [], ['returns (null, null, "none") — OnnxCrabDetector planned (TSK-13)']),
        C('ifs', 'IFileStorage', 'port', [], ['+ SaveAsync / OpenReadAsync / DeleteAsync']),
        C('e_ev', 'Evidence', 'entity', ['batch_id, slot_id, slot_event_id, tranche_id, crab_item_id, capture_request_id', 'media_type, file_uri, sha256, perceptual_hash', 'captured_at, received_at, latitude, longitude, source', 'risk_score, review_status, explanation, explained_at']),
        C('e_det', 'EvidenceDetection', 'entity', ['evidence_id, model_version, crab_detected, confidence, detected_at']),
        C('e_rev', 'EvidenceReview', 'entity', ['evidence_id, reviewer_id (one per reviewer), verdict, note, reviewed_at']),
        C('e_cr', 'CaptureRequest', 'entity', ['batch_id, slot_id, requested_at, due_at, status, fulfilled_at']),
      ] },
    ],
    edges: [['ec', 'es', 'assoc'], ['erc', 'ers', 'assoc'], ['eec', 'ees', 'assoc'], ['crc', 'crs', 'assoc'], ['crw', 'crj', 'dep'], ['es', 'ea', 'assoc'], ['es', 'eip', 'assoc'], ['es', 'icd', 'dep'], ['es', 'ifs', 'dep'], ['ers', 'eir', 'assoc'], ['ees', 'eir', 'assoc'], ['eir', 'ifs', 'dep'], ['noop', 'icd', 'realize'], ['es', 'e_ev', 'dep', 'creates + risk'], ['es', 'e_det', 'dep'], ['es', 'e_cr', 'dep', 'fulfils'], ['ers', 'e_rev', 'dep', 'upserts'], ['ers', 'e_ev', 'dep', 'review_status'], ['crj', 'e_cr', 'dep', 'creates / expires'], ['e_ev', 'e_det', 'compos', '1 ⟶ 0..1'], ['e_ev', 'e_rev', 'compos', '1 ⟶ *']],
    notes: 'The detector is a replaceable port (ICrabDetector) so the ONNX model can be plugged in without touching EvidenceService; its weight in the risk score is capped (≤ 15), so detection never rejects evidence alone (Register v1.3 §3.2b).',
  },
  {
    page: 'Alerts, Portfolio & Admin', fig: 'Figure 4.87', title: 'Class Diagram – Alerts, Portfolio/Notifications and Admin (dashboards, audit log) modules',
    groups: [
      { x: 20, items: [
        C('alc', 'AlertsController', 'controller', ['- alerts: AlertService'], ['+ Mine(filter) / Batch(code, filter)', '+ Acknowledge(id, req)']),
        C('aac', 'AdminAlertsController', 'controller', [], ['+ List(filter, paging) / Resolve(id, req)']),
        C('ajw', 'AlertJobWorker', 'job', ['PeriodicTimer 15 min'], ['# ExecuteAsync → AlertJob.RunAsync']),
        C('pc', 'PortfolioController', 'controller', ['- portfolio: PortfolioService'], ['+ List(query, paging) / Get(batchCode)']),
        C('nc', 'NotificationsController', 'controller', ['- notifications: NotificationService'], ['+ List(query, paging): NotificationPage']),
        C('adc', 'AdminDashboardController', 'controller', ['- dashboard: DashboardService'], ['+ Get(query) / Report(name)']),
        C('odc', 'OperatorDashboardController', 'controller', [], ['+ Get(query)']),
        C('auc', 'AuditLogController', 'controller', ['- queries: AuditLogQueryService'], ['+ List(query, paging) / Export(query)']),
      ] },
      { x: 440, items: [
        C('al', 'AlertService', 'service', ['- db, me, clock'], ['+ RaiseAsync(batchId, type, severity, message, ackWithin)', '+ ListMineAsync(status) / ListInvestorAsync(code, status) / ListAdminAsync(filter, paging)', '+ AcknowledgeAsync(id, note) / ResolveAsync(id, note)', '~ TransactionAsync(action) / Escalate(alert, previous, now)']),
        C('aj', 'AlertJob', 'service', ['- alerts, db, options (DailyLogDueHour 18, AckWithinHours 2), clock'], ['+ RunAsync(): int — DataSilence, MilestoneDelay, escalation']),
        C('asr', 'AlertServiceRaiser : IAlertRaiser', 'adapter', [], ['+ RaiseAsync(…) → AlertService']),
        C('ps', 'PortfolioService', 'service', ['- db, me, clock'], ['+ ListAsync(query, paging): PortfolioPage', '+ GetAsync(code): PortfolioDetail']),
        C('ns', 'NotificationService', 'service', ['- db, me, clock'], ['+ ListAsync(query, paging): NotificationPage — 6 event sources, no table']),
        C('ds', 'DashboardService', 'service', ['- db, me, clock'], ['+ AdminAsync(query) / OperatorAsync(query)', '+ ReportAsync(name, query): byte[] CSV']),
        C('aqs', 'AuditLogQueryService', 'service', ['- db, me, audit: IAuditLog', '+ ExportLimit = 5000'], ['+ ListAsync(query, paging): AuditLogPage', '+ ExportAsync(query): AuditLogExport']),
        C('csv', 'CsvExport', 'static', [], ['+ Encode(rows): byte[] — UTF-8 BOM, formula-safe']),
      ] },
      { x: 880, items: [
        C('iar', 'IAlertRaiser', 'port', [], ['+ RaiseAsync(batchId, type, severity, message, ackWithin)']),
        C('e_al', 'Alert', 'entity', ['batch_id, alert_type, severity, message', 'raised_at, ack_deadline, acknowledged_at/by, response_note', 'escalated_at, status']),
        C('e_vp', 'v_investor_portfolio (view)', 'entity', ['investor_id, batch_id, confirmed_amount, capital_ratio', 'settlement amounts when approved']),
        C('e_audit', 'AuditLog', 'entity', ['entity_type, entity_id, action_type', 'old_value, new_value, actor_user_id, occurred_at', 'prev_hash, row_hash (append-only trigger)']),
      ] },
    ],
    edges: [['alc', 'al', 'assoc'], ['aac', 'al', 'assoc'], ['ajw', 'aj', 'dep'], ['aj', 'al', 'assoc'], ['asr', 'iar', 'realize'], ['asr', 'al', 'assoc'], ['pc', 'ps', 'assoc'], ['nc', 'ns', 'assoc'], ['adc', 'ds', 'assoc'], ['odc', 'ds', 'assoc'], ['auc', 'aqs', 'assoc'], ['ds', 'csv', 'dep'], ['aqs', 'csv', 'dep'], ['al', 'e_al', 'dep'], ['ps', 'e_vp', 'dep', 'reads'], ['aqs', 'e_audit', 'dep', 'reads + verifies chain'], ['al', 'e_audit', 'dep', 'writes rows (AuditChain)']],
    notes: 'Portfolio, Notifications, Dashboard and AuditLogQuery are read-only (Serializable read transactions, no audit writes). Alerts write audit rows directly with AuditChain on the shared hash chain.',
  },
  {
    page: 'Cross-cutting infrastructure', fig: 'Figure 4.88', title: 'Class Diagram – Common and Infrastructure (auditing hash chain, jobs, security, ports and adapters)',
    groups: [
      { x: 20, items: [
        C('ial', 'IAuditLog', 'port', [], ['+ LockAsync()', '+ WriteAsync(entityType, entityId, action, old, new, [occurredAt])', '+ VerifyChainAsync(from?, to?): AuditChainResult']),
        C('als', 'AuditLogService : IAuditLog', 'adapter', ['- db, me, clock'], ['+ LockAsync → AuditChain.LockAndReadTailAsync (TABLOCKX, HOLDLOCK)', '+ WriteAsync — requires an open transaction; RowHash = AuditChain.Hash']),
        C('ach', 'AuditChain', 'static', [], ['+ Snapshot(obj) / Timestamp(t)', '+ LockAndReadTailAsync(db)', '+ Hash(row): SHA-256(prevHash + json) / VerifyHash(row)']),
        C('acv', 'AuditChainVerifier', 'static', [], ['+ Verify(rows, previousRowHash?): AuditChainResult']),
        C('acj', 'AuditChainCheckJob', 'job', ['# Interval = 6 h'], ['# RunAsync → VerifyChainAsync(null, null); LogCritical if broken']),
        C('rj', 'RecurringJob (abstract)', 'job', ['# Interval: TimeSpan', '- Jobs:Enabled switch'], ['# RunAsync(services, ct)', '+ RunOnceAsync(ct)', '# ExecuteAsync — PeriodicTimer, own DI scope']),
      ] },
      { x: 460, items: [
        C('icu', 'ICurrentUser', 'port', ['+ IsAuthenticated, UserId, OperatorId'], ['+ IsInRole(role) / RequireOperatorId()']),
        C('cu', 'CurrentUser', 'adapter', ['- http: IHttpContextAccessor'], []),
        C('aus', 'AuthSetup', 'static', ['Roles · Policies (Admin, Operator, Investor, Customer, Reviewer)'], ['+ AddAppAuth(services, config) — JwtBearer, OnTokenValidated reloads status + roles']),
        C('sec', 'SecuritySetup', 'static', [], ['+ AddAppSecurity — DataProtection keys, PayoutAccountProtection, rate limiter, forwarded headers, HSTS', '+ UseAppSecurity — HTTPS only outside Development']),
        C('tx', 'TransactionExtensions', 'static', [], ['+ InTransactionAsync(db, work, ct, isolation = ReadCommitted) — execution strategy + commit']),
        C('geh', 'GlobalExceptionHandler', 'adapter', [], ['AppException → ProblemDetails {status, code, detail}; SQL 2627/2601 → 409 db.unique; 547 → 422 db.constraint; ≥ 50000 → 422 db.rule']),
        C('exc', 'AppException ◁── NotFound(404) · Forbidden(403) · Conflict(409) · BusinessRule(422)', 'record', [], []),
      ] },
      { x: 900, items: [
        C('igw', 'IPaymentGateway · IBatchAccountProvisioner · IBankNameMatcher', 'port', [], ['CreateVietQrAsync / SendPayoutAsync / OpenBatchAccountAsync / MatchAsync']),
        C('fgw', 'FakePaymentGateway · FakeBankNameMatcher', 'adapter', [], ['sandbox behaviour, deterministic references']),
        C('ids', 'IDigitalSigningService ← FakeSigningService', 'port', [], ['SignAsync(document, signer)']),
        C('iek', 'IEkycProvider ← FakeEkycProvider', 'port', [], ['VerifyAsync(front, back, selfie)']),
        C('icd', 'ICrabDetector ← NoopCrabDetector', 'port', [], ['DetectAsync(image)']),
        C('ifs', 'IFileStorage ← LocalFileStorage | CloudinaryFileStorage', 'port', [], ['SaveAsync / OpenReadAsync / DeleteAsync (Storage:Provider)']),
        C('pap', 'PayoutAccountProtection · PayoutProtectionUpgrade', 'service', [], ['Protect / Unprotect / Digest; one-off upgrade of legacy rows at startup']),
        C('di', 'DependencyInjection · FeatureRegistry', 'static', [], ['AddInfrastructure(services, config) / AddFeatureServices(services) — the only registration points']),
      ] },
    ],
    edges: [['als', 'ial', 'realize'], ['als', 'ach', 'dep'], ['als', 'acv', 'dep'], ['acj', 'rj', 'general'], ['acj', 'ial', 'dep'], ['cu', 'icu', 'realize'], ['fgw', 'igw', 'realize'], ['geh', 'exc', 'dep', 'maps']],
    notes: 'Every external system sits behind an interface in Infrastructure; Development uses the Fake* adapters, production switches by configuration in DependencyInjection.cs. All audit writers (IAuditLog and the direct AuditChain writers in Accounts/Evidence/Alerts) share one TABLOCKX-serialised hash chain (TL-08).',
  },
];

function drawClass(f, dg) {
  const d = f.page(dg.page);
  d.caption(dg.fig, dg.title, META);
  const W = 320;
  for (const g of dg.groups) {
    let y = 70;
    for (const c of g.items) {
      const stereo = c.stereo === 'entity' ? '«entity»' : c.stereo === 'port' ? '«interface»' : c.stereo === 'controller' ? '«controller»' : c.stereo === 'job' ? '«background job»' : c.stereo === 'adapter' ? '«adapter»' : c.stereo === 'static' ? '«static»' : c.stereo === 'record' ? '«record»' : c.stereo === 'engine' ? '«pure library»' : '«service»';
      const title = `<font style="font-size:9px" color="#64748b">${stereo}</font><br><b>${c.name}</b>`;
      const rows = [];
      for (const a of c.attrs) rows.push({ text: a });
      if (c.attrs.length && c.ops.length) rows.push({ sep: true });
      for (const o of c.ops) rows.push({ text: o });
      const style = S.cls + `fillColor=${FILL[c.stereo] ?? '#ffffff'};` + (c.stereo === 'port' ? 'dashed=0;' : '');
      const r = stackBox(d, c.id, title, rows, g.x, y, W, style, 16, { headerH: 34 });
      y += r.h + 24;
    }
  }
  for (const [a, b, kind, label] of dg.edges) {
    const style = kind === 'assoc' ? S.assocNav : kind === 'dep' ? S.dep : kind === 'realize' ? S.realize : kind === 'compos' ? S.compos : kind === 'general' ? S.general + 'edgeStyle=orthogonalEdgeStyle;' : S.dep;
    d.edge(a, b, style + 'labelBackgroundColor=#ffffff;', { label: label ?? '', raw: true });
  }
  d.vertex(`<b>Notes</b><br>${dg.notes}`, S.note, 20, 20 + 0, 0, 0, { raw: true }); // placeholder replaced below
  d.cells.pop();
  const maxX = Math.max(...dg.groups.map(g => g.x)) + W;
  d.vertex(`<b>Notes</b><br>${dg.notes}`, S.note, maxX + 30, 70, 300, 160, { raw: true });
  d.vertex('<b>Legend</b><br>«controller» HTTP entry · «service» application logic · «interface» port to an external system or cross-cutting concern · «adapter» implementation · «entity» EF Core entity (table) · «background job» hosted service.<br>Open arrow = association (uses) · dashed = dependency · dashed triangle = realization · filled diamond = composition.', S.legend, maxX + 30, 250, 300, 150, { raw: true });
}

function run(out) {
  const f = new DrawioFile();
  for (const dg of DIAGRAMS) drawClass(f, dg);
  f.write(path.join(out, 'CrabShare_Class_Diagrams.drawio'));
  console.log('Class diagrams done:', DIAGRAMS.length);
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, DIAGRAMS };
