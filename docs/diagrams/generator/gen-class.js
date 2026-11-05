'use strict';
// Class Diagrams (Report 4 mục 3 Detailed Design) — một sơ đồ cho mỗi nhóm tính năng; lớp, thuộc tính (field hoặc dependency
// tiêm vào), phương thức thật trong code (public + private được gọi trong Sequence Diagram).
//
// v3.0 · 04/11/2026 · vẽ lại theo Phiếu đăng ký v1.4 (code đối chiếu: develop @ 420a379).
// Sửa đợt 1 · 05/11/2026 theo ba báo cáo duyệt (R1, R2, R3):
// - CL-01: kim cương composition đặt ở đầu "toàn thể" (source), không ở đầu "phần";
// - CL-02: tự dẫn đường nối qua khe giữa các cột (không cắt qua lớp), nhãn đặt trong khe hoặc trên hành lang và tránh
//   nhau, header lớp cao 44–58 px; chiều cao dòng tính theo bề rộng chữ đo thật (không dòng nào bị cắt);
//   chữ trong ô được escape nên kiểu generic hiện đủ (PagedResult<BoxResponse>, Set<TEntity>, IOptions<OrderOptions>);
// - CL-03: thuộc tính «entity» có visibility và kiểu C#, mỗi operation một dòng; bỏ các khung gộp nhiều lớp;
// - CL-04: association/composition có bản số ở hai đầu; quan hệ dịch vụ → dịch vụ (inject) vẽ thành dependency;
// - CL-05, G-02: phần đã bỏ ở v1.4 chỉ ghi trong Notes; «planned» = xám #64748b nét đứt kèm nhãn; giá trị CSDL cho phép
//   mà code không ghi = chữ cam kèm "(not written by code)";
// - G-01: chữ tối thiểu 11 px; G-03: «entity» ghi kèm tên thực thể trong ERD khi khác tên lớp code;
// - ND-12, ND-15, ND-21, ND-24, ND-25, ND-26, ND-36, ND-40: xem Notes từng trang.
// Đợt 2 · 05/11/2026 (D1–D8 đã được trưởng nhóm xác nhận): BoxRow / RowAllocation theo D2, FundingCloseService theo D1 và D3,
//   RevenueLine và ghi chú quyết toán theo D4, D6, D8; nhóm Orders thêm PreOrderQuota, PreOrderHold «planned» (brief §9.6),
//   InvoicedSale thay LowGradeSale (D8); ngưỡng chất lượng nước (ProductionThresholdVersion), số đo pH / nhiệt độ /
//   độ mặn và cảnh báo WaterQuality là "removed in v1.4 (still in code)": không vẽ, chỉ ghi trong Notes (khớp Logical ERD);
//   G-01: mỗi hình tự tách thành các phần (k/N), mỗi phần ≤ 3 cột lớp và cao ≤ 1000 px để in A4 ngang chữ ≥ 5 pt; lớp ở
//   phần khác hiện bằng hộp tham chiếu "full class: part k/N"; chú giải chung chuyển lên trang Index.
// - checkConsistency(): mọi lifeline và message của gen-sequence.js phải có lớp và operation cùng tên ở đây,
//   message tới AppDbContext phải là operation EF Core của nó (Set<T>()…, SaveChangesAsync(), Add(…)…).
const path = require('path');
const { DrawioFile, S } = require('./lib');
const { SEQS, SEQ_FIG_BASE } = require('./gen-sequence');

const VERSION = 'v3.2 · 05/11/2026 · Register v1.4';
const FIG_BASE = SEQ_FIG_BASE + SEQS.length; // nối tiếp bộ Sequence Diagram
const META = `${VERSION} · UML 2.5 · classes as on develop @ 420a379 · attributes = fields or injected dependencies · operations = public API and the private steps shown in the Sequence Diagrams`;

// stereo: controller | service | job | port | adapter | entity | static | record | engine | persistence
const C = (id, name, stereo, attrs = [], ops = [], opts = {}) => ({ id, name, stereo, attrs, ops, planned: !!opts.planned, abstract: !!opts.abstract });
const P = { planned: true };
const FILL = { controller: '#e0f2fe', service: '#ffffff', job: '#ede9fe', port: '#fef3c7', adapter: '#fff7ed', entity: '#f1f5f9', static: '#ffffff', record: '#ffffff', engine: '#ecfdf5', persistence: '#f1f5f9' };
const STEREO = { entity: '«entity»', port: '«interface»', controller: '«controller»', job: '«background job»', adapter: '«adapter»', static: '«static»', record: '«record»', engine: '«pure library»', persistence: '«persistence»', service: '«service»' };
// G-03: tên thực thể ở ERD (Conceptual/Logical) khi khác tên lớp code
const ERD_NAME = {
  PhysicalSlot: 'Box', SlotAllocation: 'BoxAllocation', SlotEvent: 'BoxEvent', SlotEventDetail: 'BoxEventDetail', SlotEventPolicyVersion: 'BoxEventPolicy',
  CrabItem: 'Crab', CrabItemEvent: 'CrabHistory', KycCheck: 'IdentityCheck', AuditLog: 'AuditRecord', CustomerAddress: 'DeliveryAddress',
  EvidenceDetection: 'CrabDetection', StandardCostTranchePlan: 'TranchePlan',
  AppUser: 'User', AppUserRole: 'UserRole', HarvestStartRequestLog: 'HarvestStartRequest',
};

// Lớp dùng lại ở nhiều trang (cùng tên, cùng ý nghĩa).
const IAUDIT = (id = 'ial') => C(id, 'IAuditLog', 'port', [], ['+ LockAsync()', '+ WriteAsync(entityType, entityId, action, old, new)']);
const IPPH = (id = 'iph') => C(id, 'IPaymentPurposeHandler', 'port', ['+ Purpose: string'], ['+ OnPaidAsync(request, paidAt)']);
const PRS = (id = 'prs') => C(id, 'PaymentRequestService', 'service', ['- gateway: IPaymentGateway'], ['+ CreateAsync(purpose, amount, batchAccountId, accountNo, expiresAt, target, referenceCode): CreatedPaymentRequest', '+ DescribeAsync(request, account, batchCode): PaymentRequestResponse']);
const REFUND = (id = 'ref') => C(id, 'RefundService', 'service', ['- db: AppDbContext', '- audit: IAuditLog'], ['+ CreateRefundAsync(batchAccountId, amount, contributionId?, orderId?, note, now): PaymentInstruction']);
const BOXROW = (id = 'e_row') => C(id, 'BoxRow', 'entity', ['+ BoxRowId: long', '+ BatchId: long', '+ RowCode: string (physical_slot.row_code)', '+ /BoxCount: int', '+ /CapitalVnd: long (boxes × Standard Cost per box)'], [], P);
const ROWALLOC = (id = 'e_ra') => C(id, 'RowAllocation', 'entity', ['+ RowAllocationId: long', '+ ContributionId: long', '+ BoxRowId: long', '+ Status: string {Held | Allocated | Released}'], [], P);
const TIER = (id = 'e_tier') => C(id, 'RemunerationTier', 'entity', ['+ RemunerationTierId: long', '+ BatchId: long', '+ TierNo: int', '+ MinSurvivalPct: decimal', '+ MaxSurvivalPct: decimal?', '+ RemunerationPct: decimal (approved by the admin)'], [], P);
const FILESTORE = (id = 'ifs') => C(id, 'IFileStorage', 'port', [], ['+ SaveAsync(stream, fileName, contentType, folder): StoredFile', '+ OpenReadAsync(uri): Stream', '+ DeleteAsync(uri)']);
const IMGREADER = (id = 'eir') => C(id, 'EvidenceImageReader', 'service', ['- storage: IFileStorage'], ['+ OpenAsync(fileUri, mediaType): EvidenceImageContent']);
const ALERTS = (id = 'al') => C(id, 'AlertService', 'service', [], ['+ RaiseAsync(batchId, type, severity, message, ackWithin): AlertResponse']);
const DEPS = (...names) => names.map(n => ({ db: '- db: AppDbContext', me: '- me: ICurrentUser', audit: '- audit: IAuditLog', clock: '- clock: TimeProvider', log: '- log: ILogger' }[n] ?? n));

const DIAGRAMS = [
  // ======================= TP1 Thiện =======================
  {
    page: 'Funding', status: 'modified', owner: 'Thiện', uc: 'UC09–UC12, funding close', was: '4.73',
    title: 'Class Diagram: Funding module — reservation by box rows, VietQR, funding close with the pre-order condition and refunds',
    groups: [
      [
        C('fc', 'FundingController', 'controller', ['- funding: FundingService'], ['+ ActiveDisclosure(): RiskDisclosureResponse', '+ Acknowledge(req): RiskAcknowledgementResponse', '+ OpenBatches(): FundingBatchSummary[]', '+ Batch(code): FundingBatchResponse', '+ Reserve(code, req): ContributionResponse', '+ RequestPayment(id): PaymentRequestResponse', '+ Cancel(id)', '+ Mine(): ContributionResponse[]']),
        C('fac', 'FundingAdminController', 'controller', ['- funding: FundingAdminService', '- close: FundingCloseService'], ['+ Batches(): AdminFundingBatch[]', '+ CloseDue(): FundingCloseResult']),
        C('fcj', 'FundingCloseJob', 'job', ['# Interval: TimeSpan = 1 min'], ['# RunAsync(services, ct)']),
        C('req', 'ReserveContributionRequest', 'record', ['+ Amount: long', '+ RowCodes: string[] «planned»']),
      ],
      [
        C('fs', 'FundingService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '- options: FundingOptions', '- documents: RiskDisclosureDocuments', '- payments: PaymentRequestService'], ['+ GetActiveDisclosureAsync(): RiskDisclosureResponse', '+ AcknowledgeAsync(req): RiskAcknowledgementResponse', '+ ListOpenAsync(): FundingBatchSummary[]', '+ GetBatchAsync(code): FundingBatchResponse', '+ ReserveAsync(code, req): ContributionResponse', '+ RequestPaymentAsync(contributionId): (PaymentRequestResponse, bool)', '+ CancelAsync(contributionId)', '+ MineAsync(): ContributionResponse[]', '- RequireInvestorAsync(): InvestorInfo', '- HasAcknowledgedActiveAsync(investorId): bool', '- IsOpen(batch, now): bool', '- AllocateRowsAsync(contribution, rowCodes) «planned»']),
        C('fcs', 'FundingCloseService', 'service', [...DEPS('db', 'audit', 'clock'), '- refunds: RefundService'], ['+ RunAsync(): FundingCloseResult', '+ ExpireReservationsAsync(): int', '+ DueBatchIdsAsync(): long[]', '+ CloseBatchAsync(batchId): BatchCloseOutcome?', '- CloseCapitalAsync(batch, confirmed, total, reason, now): BatchCloseOutcome', '- CancelUnderfundedAsync(batch, confirmed, total, now): BatchCloseOutcome', '- ExpireAsync(contribution, reason, now)', '- PreOrderRatioAsync(batch): decimal «planned»', '- ReleaseUnfundedRowsAsync(batch) «planned»', '- ConfirmPreOrdersAsync(batch) «planned»', '- ForfeitCancelledDepositsAsync(batch) «planned»', '- RefundPreOrderDepositsAsync(batch) «planned»', '- CancelPendingPreOrdersAsync(batch) «planned»']),
        C('fas', 'FundingAdminService', 'service', DEPS('db'), ['+ ListAsync(): AdminFundingBatch[]']),
        C('cph', 'ContributionPaymentHandler', 'service', [...DEPS('db', 'audit'), '+ Purpose: string = "Contribution"'], ['+ OnPaidAsync(request, paidAt)']),
        C('rdd', 'RiskDisclosureDocuments', 'service', [], ['+ Read(versionCode, contentHash): string']),
      ],
      [
        IPPH(), PRS(), REFUND(),
        C('cv', 'ContractVoiding', 'static', [], ['+ VoidUnsignedAsync(db, audit, contributionIds, reason, now): int']),
        IAUDIT(),
      ],
      [
        C('e_batch', 'Batch', 'entity', ['+ BatchId: long', '+ BatchCode: string', '+ Status: string', '+ MinViableCapital: decimal', '+ TargetCapital: decimal', '+ MaxCapital: decimal', '+ MinContribution: decimal', '+ FundingOpenAt: DateTimeOffset?', '+ FundingDeadline: DateTimeOffset?', '+ CapitalClosedAt: DateTimeOffset?', '+ TotalConfirmedCapital: decimal?', '+ MinPreOrderRatioPct: decimal «planned»', '…']),
        C('e_contr', 'Contribution', 'entity', ['+ ContributionId: long', '+ BatchId: long', '+ InvestorId: long', '+ Amount: decimal', '+ Status: string {Reserved | Confirmed | Expired | Refunded}', '+ ReservedAt: DateTimeOffset', '+ ExpiresAt: DateTimeOffset', '+ ConfirmedAt: DateTimeOffset?', '+ RefundedAt: DateTimeOffset?']),
        ROWALLOC(), BOXROW(),
        C('e_share', 'CapitalShare', 'entity', ['+ BatchId: long', '+ InvestorId: long', '+ ConfirmedAmount: decimal', '+ SnapshottedAt: DateTimeOffset']),
        C('e_rd', 'RiskDisclosure', 'entity', ['+ RiskDisclosureId: long', '+ VersionCode: string', '+ ContentHash: string', '+ Status: string {Draft | Active | Retired}']),
        C('e_ra2', 'RiskAcknowledgement', 'entity', ['+ InvestorId: long', '+ RiskDisclosureId: long', '+ AcknowledgedAt: DateTimeOffset', '+ ScrolledToEnd: bool']),
        C('e_pr', 'PaymentRequest', 'entity', ['+ PaymentRequestId: long', '+ ReferenceCode: string', '+ Purpose: string', '+ Amount: decimal', '+ Status: string {Pending | Paid | Expired | Cancelled}', '+ ExpiresAt: DateTimeOffset', '+ ContributionId: long?']),
      ],
    ],
    edges: [['fc', 'fs', 'dep'], ['fac', 'fas', 'dep'], ['fac', 'fcs', 'dep'], ['fcj', 'fcs', 'dep', 'every minute'], ['fc', 'req', 'dep'], ['fs', 'prs', 'dep'], ['fs', 'rdd', 'dep'], ['fs', 'ial', 'dep'], ['fcs', 'ref', 'dep'], ['fcs', 'cv', 'dep'], ['fcs', 'ial', 'dep'], ['cph', 'iph', 'realize'], ['fs', 'e_contr', 'dep', 'creates'], ['fs', 'e_ra', '~dep', 'allocates'], ['fcs', 'e_share', 'dep', 'snapshots'], ['fcs', 'e_batch', 'dep', 'closes'], ['prs', 'e_pr', 'dep', 'creates'], ['e_batch', 'e_contr', 'compos', '1 ⟶ *'], ['e_contr', 'e_ra', '~compos', '1 ⟶ 1..*'], ['e_ra', 'e_row', '~assoc', '* ⟶ 1'], ['e_batch', 'e_share', 'compos', '1 ⟶ *'], ['e_rd', 'e_ra2', 'compos', '1 ⟶ *'], ['e_contr', 'e_pr', 'assoc', '0..1 ⟶ *']],
    notes: 'Money never passes through CrabShare: the VietQR pays into the batch account at the intermediary and the webhook confirms it (Payments). Reservation lasts Funding:ReservationMinutes = 30 (appsettings.json), capped at the funding deadline. v1.4: investors reserve whole box rows; amount = Σ (boxes of the row × Standard Cost per box), the minimum contribution is one row; RowAllocation is Held during the reservation, Allocated when the contribution is Confirmed and Released when it expires or is refunded; at most one Held or Allocated allocation per BoxRow, and BoxRow has no status of its own (a row is taken when such an allocation exists). A Batch opens when the minimum viable capital and the minimum pre-order ratio are reached; only the boxes of funded rows are stocked. Otherwise investors and every depositing Customer are refunded and pending deposit QRs are cancelled (FundingCloseService «planned» steps).',
  },
  {
    page: 'Contracts', status: 'kept', owner: 'Thiện', uc: 'UC14, UC15', was: '4.74',
    title: 'Class Diagram: Contracts module — sequential e-signing (UC14), offline-signed upload (UC15)',
    groups: [
      [C('cc', 'ContractsController', 'controller', ['- contracts: ContractService'], ['+ Create(id): ContractResponse', '+ Get(id): ContractResponse', '+ Download(id): FileContentResult', '+ Sign(id): ContractResponse', '+ OfflineUpload(id, file, confirmedBothSigned): ContractResponse', '+ Mine(): ContractSummary[]', '+ BatchContracts(code): ContractSummary[]', '+ OperatorContracts(): ContractSummary[]'])],
      [
        C('cs', 'ContractService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '- templates: ContractTemplateDocuments', '- renderer: ContractPdfRenderer', '- files: ContractFileStore', '- signing: IDigitalSigningService'], ['+ CreateForContributionAsync(contributionId): (ContractResponse, bool)', '+ SignAsync(contractId): ContractResponse', '+ GetAsync(contractId): ContractResponse', '+ GetFileAsync(contractId): (byte[], string)', '+ UploadOfflineAsync(contractId, file, length, contentType, confirmed): ContractResponse', '+ ListMineAsync(): ContractSummary[]', '+ ListForBatchAsync(batchCode): ContractSummary[]', '+ ListForOperatorAsync(): ContractSummary[]', '~ DescribeAsync(contractId): ContractResponse', '~ RequireAccessAsync(contractId): InvestmentContract', '- SignerRoleAsync(contract): string?', '- IsActive(contribution, now): bool', '- PlaceholdersAsync(contribution)', '~ CurrentHash(contract): string']),
        C('cv', 'ContractVoiding', 'static', [], ['+ VoidUnsignedAsync(db, audit, contributionIds, reason, now): int']),
      ],
      [
        C('tpl', 'ContractTemplateDocuments', 'service', ['- logger: ILogger'], ['+ Read(versionCode, contentHash): string', '+ Fill(template, values): string']),
        C('pdf', 'ContractPdfRenderer', 'service', [], ['+ Render(doc): byte[]']),
        C('store', 'ContractFileStore', 'service', ['- root: string (Storage:RootPath)'], ['+ SaveAsync(contractNo, pdf): (uri, sha256)', '+ ReadAsync(contractNo, sha256): byte[]', '+ UriFor(contractNo, sha256): string']),
        C('ids', 'IDigitalSigningService', 'port', [], ['+ SignAsync(pdf, signerName, signerRole): SignedDocument']),
        C('fake', 'FakeSigningService', 'adapter', ['- clock: TimeProvider'], ['+ SignAsync(pdf, signerName, signerRole): SignedDocument']),
      ],
      [
        C('e_ic', 'InvestmentContract', 'entity', ['+ ContractId: long', '+ ContractNo: string', '+ ContributionId: long', '+ TemplateId: long', '+ Status: string {Draft | OperatorSigned | FullySigned | Void}', '+ SigningMethod: string {DigitalSignature | OfflineUpload}', '+ DraftHash: string', '+ FinalHash: string?', '+ FinalFileUri: string?', '+ FullySignedAt: DateTimeOffset?']),
        C('e_sig', 'ContractSignature', 'entity', ['+ SignatureId: long', '+ ContractId: long', '+ SignerRole: string {Operator | Investor}', '+ SigningOrder: byte {1 | 2}', '+ SignerUserId: long', '+ SignedHash: string', '+ SignedAt: DateTimeOffset']),
        C('e_tpl', 'ContractTemplate', 'entity', ['+ TemplateId: long', '+ VersionCode: string', '+ ContentHash: string', '+ Status: string {Draft | Active | Retired}', '+ EffectiveFrom: DateTimeOffset?']),
      ],
    ],
    edges: [['cc', 'cs', 'dep'], ['cs', 'tpl', 'dep'], ['cs', 'pdf', 'dep'], ['cs', 'store', 'dep'], ['cs', 'ids', 'dep'], ['fake', 'ids', 'realize'], ['cs', 'e_ic', 'dep', 'creates, signs'], ['cs', 'e_sig', 'dep', 'adds'], ['cv', 'e_ic', 'dep', 'voids'], ['e_ic', 'e_sig', 'compos', '1 ⟶ 0..2'], ['e_tpl', 'e_ic', 'assoc', '1 ⟶ *']],
    notes: 'A contract can be created while the contribution is Reserved (not expired) or Confirmed (IsActive); signing never blocks the VietQR payment, and stocking needs both a Confirmed contribution and a fully signed contract (ContributePage order: risk → amount → contract → VietQR → done). Each PDF version is content-addressed (contracts/{no}/{sha256}.pdf) and re-hashed on download (contract.file_tampered). Operator Owner signs first, then the Investor (contract.wrong_signing_order). v1.4: the loss rule, floor price and remuneration tiers go into the template before funding opens.',
  },
  {
    page: 'Payments', status: 'modified', owner: 'Thiện', uc: 'UC12, UC18, UC40', was: '4.75',
    title: 'Class Diagram: Payments module — webhook reconciliation, disbursement tranches, payouts, refunds',
    groups: [
      [
        C('wc', 'PaymentWebhookController', 'controller', ['- webhook: PaymentWebhookService', '- options: IOptions<PaymentOptions>'], ['+ Receive(): WebhookResult']),
        C('dvc', 'DevPaymentsController', 'controller', ['- webhook: PaymentWebhookService', '- db: AppDbContext', '- env: IHostEnvironment'], ['+ Simulate(req): WebhookResult']),
        C('pc', 'PaymentsController', 'controller', ['- payments: PaymentRequestService'], ['+ Get(id): PaymentRequestResponse']),
        C('dc', 'DisbursementsController', 'controller', ['- disbursements: DisbursementService'], ['+ OperatorTranches(): TrancheResponse[]', '+ RequestTranche(code, no): TrancheResponse', '+ AdminTranches(status): TrancheResponse[]', '+ Release(id): TrancheResponse', '+ NeedExplanation(id, req): TrancheResponse', '+ Block(id, req): TrancheResponse']),
        C('apc', 'AdminPaymentsController', 'controller', ['- instructions: PaymentInstructionQueryService', '- payouts: PayoutSendService'], ['+ Instructions(query): PaymentInstructionResponse[]', '+ Send(id): PaymentInstructionResponse', '+ Unmatched(): UnmatchedTransactionResponse[]']),
      ],
      [
        C('ws', 'PaymentWebhookService', 'service', [...DEPS('db', 'audit', 'clock'), '- refunds: RefundService', '- handlers: IEnumerable<IPaymentPurposeHandler>'], ['+ ProcessAsync(txn): WebhookResult', '- FindRequestAsync(content): PaymentRequest?', '- IsDuplicateProviderTxn(ex): bool']),
        C('sig', 'WebhookSignature', 'static', ['+ Header: string = "X-Signature"'], ['+ Compute(secret, body): string', '+ Verify(secret, body, signature): bool']),
        C('prs', 'PaymentRequestService', 'service', [...DEPS('db'), '- gateway: IPaymentGateway', ...DEPS('me', 'clock')], ['+ CreateAsync(purpose, amount, batchAccountId, accountNo, expiresAt, target, referenceCode): CreatedPaymentRequest', '+ Describe(created, account, batchCode): PaymentRequestResponse', '+ DescribeAsync(request, account, batchCode): PaymentRequestResponse', '+ GetMineAsync(paymentRequestId): PaymentRequestResponse', '+ EffectiveStatus(request, now): string']),
        C('ds', 'DisbursementService', 'service', DEPS('db', 'me', 'audit', 'clock'), ['+ ListForOperatorAsync(): TrancheResponse[]', '+ RequestAsync(batchCode, trancheNo): TrancheResponse', '+ ListForAdminAsync(status): TrancheResponse[]', '+ ReleaseAsync(trancheId): TrancheResponse', '+ RequestExplanationAsync(trancheId, reason): TrancheResponse', '+ BlockAsync(trancheId, reason): TrancheResponse', '- GateAsync(batch, tranche, now): string?']),
        C('pss', 'PayoutSendService', 'service', [...DEPS('db', 'audit', 'clock'), '- gateway: IPaymentGateway'], ['+ SendAsync(instructionId): PaymentInstructionResponse', '+ ListUnmatchedAsync(): UnmatchedTransactionResponse[]']),
        REFUND(),
        C('piq', 'PaymentInstructionQueryService', 'service', DEPS('db'), ['+ ListAsync(query): PaymentInstructionResponse[]']),
      ],
      [
        IPPH(),
        C('h0', 'ContributionPaymentHandler', 'service', ['+ Purpose: string = "Contribution"'], ['+ OnPaidAsync(request, paidAt)']),
        C('h1', 'PreOrderDepositHandler', 'service', ['+ Purpose: string = "PreOrderDeposit"'], ['+ OnPaidAsync(request, paidAt)']),
        C('h2', 'PreOrderBalanceHandler', 'service', ['+ Purpose: string = "PreOrderBalance"'], ['+ OnPaidAsync(request, paidAt)']),
        C('h3', 'InvoicedSalePaymentHandler', 'service', ['+ Purpose: string = "OrderPayment"'], ['+ OnPaidAsync(request, paidAt)'], P),
        C('igw', 'IPaymentGateway', 'port', [], ['+ CreateVietQrAsync(request): VietQrPayment', '+ SendPayoutAsync(request): PayoutResult']),
        C('ibp', 'IBatchAccountProvisioner', 'port', [], ['+ OpenBatchAccountAsync(batchCode): (string, string)']),
        C('fgw', 'FakePaymentGateway', 'adapter', [], ['+ CreateVietQrAsync(request): VietQrPayment', '+ SendPayoutAsync(request): PayoutResult', '+ OpenBatchAccountAsync(batchCode): (string, string)']),
      ],
      [
        C('e_pr', 'PaymentRequest', 'entity', ['+ PaymentRequestId: long', '+ ReferenceCode: string', '+ BatchAccountId: long', '+ Purpose: string {Contribution | PreOrderDeposit | PreOrderBalance}', '+ Purpose: string {OrderPayment, also for invoiced orders} «planned»', '+ Amount: decimal', '+ Status: string {Pending | Paid | Expired | Cancelled}', '+ ExpiresAt: DateTimeOffset', '+ ContributionId: long?', '+ OrderId: long?']),
        C('e_pt', 'ProviderTransaction', 'entity', ['+ TransactionId: long', '+ ProviderTxnId: string (UNIQUE)', '+ Direction: string {In | Out}', '+ Amount: decimal', '+ MatchStatus: string {Matched | Unmatched | LatePayment}', '+ PaymentRequestId: long?', '+ InstructionId: long?']),
        C('e_pi', 'PaymentInstruction', 'entity', ['+ InstructionId: long', '+ BatchAccountId: long', '+ InstructionType: string {Disbursement | Payout | Refund | TaxPayment}', '+ Amount: decimal', '+ Status: string {Created | Succeeded | Failed}', '+ Status: string {Sent | Disputed} (not written by code)', '+ PayoutAccountId: long?', '+ TrancheId: long?', '+ SettlementLineId: long?', '+ ContributionId: long?', '+ OrderId: long?']),
        C('e_tr', 'DisbursementTranche', 'entity', ['+ TrancheId: long', '+ BatchId: long', '+ TrancheNo: byte', '+ PlannedAmount: decimal', '+ PlannedDate: DateOnly?', '+ Status: string {Planned | Requested | NeedsExplanation | Released | Blocked}', '+ ReleasedAt: DateTimeOffset?']),
        C('e_ba', 'BatchAccount', 'entity', ['+ BatchAccountId: long', '+ BatchId: long', '+ ProviderAccountNo: string', '+ Status: string {Open}', '+ Status: string {Requested | Frozen | Closed} (not written by code)']),
      ],
    ],
    edges: [['wc', 'ws', 'dep'], ['wc', 'sig', 'dep'], ['dvc', 'ws', 'dep'], ['pc', 'prs', 'dep'], ['dc', 'ds', 'dep'], ['apc', 'piq', 'dep'], ['apc', 'pss', 'dep'], ['ws', 'iph', 'dep', 'by Purpose'], ['h0', 'iph', 'realize'], ['h1', 'iph', 'realize'], ['h2', 'iph', 'realize'], ['h3', 'iph', '~realize'], ['ws', 'ref', 'dep', 'late payment'], ['prs', 'igw', 'dep'], ['pss', 'igw', 'dep'], ['fgw', 'igw', 'realize'], ['fgw', 'ibp', 'realize'], ['ws', 'e_pt', 'dep', 'books once'], ['ds', 'e_tr', 'dep'], ['pss', 'e_pi', 'dep', 'sends'], ['ref', 'e_pi', 'dep', 'creates'], ['e_ba', 'e_pr', 'assoc', '1 ⟶ *'], ['e_pr', 'e_pt', 'assoc', '0..1 ⟶ *'], ['e_ba', 'e_pi', 'assoc', '1 ⟶ *'], ['e_tr', 'e_pi', 'assoc', '0..1 ⟶ 0..1']],
    notes: 'Idempotency (TL-10): ProviderTxnId is UNIQUE; a repeated webhook is answered 200 without a second booking; payouts carry the reference CHI{id}. Invoiced orders reuse the existing purpose OrderPayment (as in the Logical ERD), handled by InvoicedSalePaymentHandler «planned». Removed in v1.4 (still in code): the retail OrderPaymentHandler and OfftakeDepositHandler, purposes OfftakeDeposit / OfftakePayment, PaymentTarget.ForOfftake and PaymentRequest.OfftakeId; PaymentRequestService.CreateForOrderAsync has no caller.',
  },
  {
    page: 'Settlement', status: 'modified', owner: 'Thiện', uc: 'UC35–UC39', was: '4.76',
    title: 'Class Diagram: Settlement module and SettlementEngine — four revenue sources, remuneration tiers, loss cap',
    groups: [
      [
        C('asc', 'AdminSettlementsController', 'controller', ['- settlements: SettlementService', '- payouts: SettlementPayoutService'], ['+ List(): AdminSettlementSummary[]', '+ Calculate(code, req): SettlementResponse', '+ Get(id): SettlementResponse', '+ Approve(id): SettlementResponse', '+ SendPayouts(id): SettlementResponse']),
        C('sc', 'SettlementsController', 'controller', ['- review: SettlementReviewService'], ['+ Propose(id, req): SettlementResponse', '+ Answer(id, req): SettlementResponse', '+ Get(id): SettlementResponse', '+ Feedback(id, req): SettlementResponse', '+ Mine(): SettlementSummary[]', '+ OperatorSettlements(): SettlementSummary[]']),
        C('dsc', 'DevSettlementsController', 'controller', ['- payouts: SettlementPayoutService'], ['+ EndFeedbackWindow(id): SettlementResponse']),
      ],
      [
        C('ss', 'SettlementService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '+ LockedStatuses: string[] = Approved, PaidOut, Closed'], ['+ CalculateAsync(batchCode, req): (SettlementResponse, bool)', '+ ListForAdminAsync(): AdminSettlementSummary[]', '+ GetForAdminAsync(settlementId): SettlementResponse', '~ DescribeAsync(settlementId, viewer): SettlementResponse', '- LockedCostAsync(batchId): (long, long)?', '- RevenueLinesAsync(batchId): RevenueLine[] «planned»', '- SurvivalRateAsync(batchId): decimal «planned»']),
        C('srs', 'SettlementReviewService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '- settlements: SettlementService'], ['+ ProposeAsync(settlementId, req): SettlementResponse', '+ AnswerAsync(feedbackId, req): SettlementResponse', '+ GetForPartyAsync(settlementId): SettlementResponse', '+ FeedbackAsync(settlementId, req): SettlementResponse', '+ ListMineAsync(): SettlementSummary[]', '+ ListForOperatorAsync(): SettlementSummary[]', '- RequireViewerAsync(settlementId): Viewer']),
        C('sps', 'SettlementPayoutService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '- settlements: SettlementService', '- payouts: PayoutSendService'], ['+ ApproveAsync(settlementId): SettlementResponse', '+ SendPayoutsAsync(settlementId): SettlementResponse', '+ EndFeedbackWindowForDemoAsync(settlementId): SettlementResponse']),
        C('cl', 'SettlementClosing', 'static', [], ['+ CloseIfPaidAsync(db, audit, batchId, now): bool']),
      ],
      [
        C('calc', 'SettlementCalculator', 'engine', ['(pure: no database, no clock)'], ['+ Calculate(input: SettlementInput): SettlementResult', '~ AllocateLoss(loss, capital): Dictionary<long, long>', '+ RemunerationPct(survivalRatePct, tiers): decimal «planned»']),
        C('alloc', 'LargestRemainderAllocator', 'engine', [], ['+ Allocate(total: long, weights): Share[]']),
        C('rin', 'SettlementInput', 'record', ['+ ActualRevenue: long', '+ LockedStandardCost: long', '+ OperatorSharePct: decimal', '+ TaxWithholdingPct: decimal', '+ Shares: (InvestorId, Capital)[]', '+ SurvivalRatePct: decimal «planned»', '+ RemunerationTiers: RemunerationTier[] «planned»']),
        C('rout', 'SettlementResult', 'record', ['+ RevenuePool: long', '+ OperatorRemuneration: long', '+ Distributable: long', '+ UncoveredLoss: long', '+ TaxTotal: long', '+ Lines: SettlementLineResult[]']),
        C('rline', 'SettlementLineResult', 'record', ['+ InvestorId: long', '+ Capital: long', '+ ProfitShare: long', '+ TaxWithheld: long', '+ NetPayout: long']),
      ],
      [
        C('e_s', 'Settlement', 'entity', ['+ SettlementId: long', '+ BatchId: long (UNIQUE)', '+ RevisionNo: short', '+ ActualRevenue: decimal', '+ LockedStandardCost: decimal', '+ RevenuePool: decimal', '+ OperatorSharePct: decimal', '+ OperatorRemuneration: decimal', '+ TaxTotal: decimal', '+ Status: string {Draft | Proposed | Disputed | Approved | PaidOut | Closed}', '+ FeedbackDeadline: DateTimeOffset?', '…']),
        C('e_sl', 'SettlementLine', 'entity', ['+ SettlementLineId: long', '+ SettlementId: long', '+ InvestorId: long', '+ CapitalReturn: decimal', '+ ProfitShare: decimal', '+ TaxWithheld: decimal', '+ NetPayout: decimal']),
        C('e_sf', 'SettlementFeedback', 'entity', ['+ FeedbackId: long', '+ SettlementId: long', '+ UserId: long', '+ Content: string', '+ Status: string {Open | Answered | Unresolved}', '+ Status: string {Withdrawn} (not written by code)']),
        C('e_rl', 'RevenueLine', 'entity', ['+ RevenueLineId: long', '+ SettlementId: long', '+ OrderId: long', '+ LineType: string {DeliveredOrder | InvoicedSale | ForfeitedDeposit | FinalOrder}', '+ AmountVnd: decimal', '+ RecognisedAt: DateTimeOffset'], [], P),
        TIER(),
        C('e_v', 'VBatchActualRevenue', 'entity', ['«view» v_batch_actual_revenue', '+ OrderRevenue: decimal', '+ ForfeitedDeposits: decimal', '+ ComplaintRefunds: decimal', '+ ActualRevenue: decimal?']),
      ],
    ],
    edges: [['asc', 'ss', 'dep'], ['asc', 'sps', 'dep'], ['sc', 'srs', 'dep'], ['dsc', 'sps', 'dep'], ['srs', 'ss', 'dep'], ['sps', 'ss', 'dep'], ['ss', 'calc', 'dep', 'uses'], ['calc', 'alloc', 'dep'], ['calc', 'rin', 'dep', 'in'], ['calc', 'rout', 'dep', 'out'], ['rout', 'rline', 'compos', '1 ⟶ *'], ['sps', 'cl', 'dep'], ['ss', 'e_s', 'dep', 'creates'], ['ss', 'e_v', 'dep', 'reads'], ['ss', 'e_rl', '~dep', 'writes'], ['ss', 'e_tier', '~dep', 'reads'], ['srs', 'e_sf', 'dep'], ['e_s', 'e_sl', 'compos', '1 ⟶ *'], ['e_s', 'e_sf', 'compos', '1 ⟶ *'], ['e_s', 'e_rl', '~compos', '1 ⟶ 1..*']],
    notes: 'Revenue Pool = actual Batch revenue − locked Standard Cost. Remuneration = floor(Pool × 5–10 %) only when Pool > 0, cut by tier when survival falls below the threshold set at Batch creation (RemunerationTier «planned»). Payouts by confirmed capital with largest-remainder rounding; losses capped at capital, the overrun stays with the Operator. LineType InvoicedSale covers both the low-grade sale and the resale after a forfeit (saleReason LowGrade | ForfeitResale). Survival rate = 1 − deaths in the cycle ÷ crabs first stocked in funded boxes, used to pick the tier. The full locked Standard Cost of the funded boxes is always subtracted; savings, including the unused mortality reserve, stay with the Operator. Attribute names follow the Logical ERD. The engine is a pure library for the research suites. Money is long / decimal(18,0) — integer VND.',
  },

  // ======================= TP2 Viên =======================
  {
    page: 'Operators & Boxes', status: 'modified', owner: 'Viên', uc: 'UC04, UC05, UC44', was: '4.77',
    title: 'Class Diagram: Operators and Boxes modules — operator application, numbered boxes and box rows',
    groups: [
      [
        C('oc', 'OperatorsController', 'controller', ['- operators: OperatorService'], ['+ Create(req): OperatorResponse', '+ Me(): OperatorResponse', '+ Update(req): OperatorResponse', '+ Submit(): OperatorResponse', '+ Members(): OperatorMemberResponse[]', '+ AddMember(req): OperatorMemberResponse', '+ RemoveMember(userId)']),
        C('aoc', 'AdminOperatorsController', 'controller', ['- operators: OperatorReviewService'], ['+ List(filter, paging): PagedResult<AdminOperatorResponse>', '+ Approve(id, req): AdminOperatorResponse', '+ Reject(id, req): AdminOperatorResponse', '+ Suspend(id, req): AdminOperatorResponse']),
        C('bc', 'BoxesController', 'controller', ['- boxes: BoxService'], ['+ List(query, paging): PagedResult<BoxResponse>', '+ Range(request): BoxRangeResponse', '+ Create(request): BoxResponse', '+ Update(slotCode, request): BoxResponse']),
        C('brr', 'BoxRangeRequest', 'record', ['+ From: int', '+ To: int', '+ Width: int = 4', '+ RowCode: string? «planned»']),
      ],
      [
        C('os', 'OperatorService', 'service', DEPS('db', 'me', 'clock'), ['+ CreateAsync(req): OperatorResponse', '+ GetMeAsync(): OperatorResponse', '+ UpdateAsync(req): OperatorResponse', '+ SubmitAsync(): OperatorResponse', '+ ListMembersAsync(): OperatorMemberResponse[]', '+ AddMemberAsync(req): OperatorMemberResponse', '+ RemoveMemberAsync(userId)', '- RequireMembershipAsync(forWrite): OperatorMember', '- RequireActiveUserAsync(userId)', '- RequireOwnerAsync(): OperatorMember']),
        C('ors', 'OperatorReviewService', 'service', DEPS('db', 'me', 'clock', 'audit'), ['+ ListAsync(filter, paging): PagedResult<AdminOperatorResponse>', '+ DecideAsync(id, action, capacity?, reason?): AdminOperatorResponse', '- RequireAdminAsync()']),
        C('bs', 'BoxService', 'service', DEPS('db', 'me', 'clock'), ['+ ListAsync(query, paging): PagedResult<BoxResponse>', '+ CreateRangeAsync(request): BoxRangeResponse', '+ CreateAsync(request): BoxResponse', '+ UpdateAsync(slotCode, request): BoxResponse', '- WriteAsync(action): T', '- MemberAsync(write): OperatorMember', '- EnsureCapacityAsync(farm, added)']),
      ],
      [
        C('e_op', 'Operator', 'entity', ['+ OperatorId: long', '+ LegalName: string', '+ TaxCode: string (UNIQUE)', '+ FarmAddress: string', '+ ApprovedSlotCapacity: int', '+ Status: string {Draft | Submitted | Approved | Rejected | Suspended}', '+ FarmLatitude: decimal «planned»', '+ FarmLongitude: decimal «planned»', '…']),
        C('e_om', 'OperatorMember', 'entity', ['+ UserId: long', '+ OperatorId: long', '+ MemberRole: string {Owner | Staff}']),
        C('e_u', 'AppUser', 'entity', ['+ UserId: long', '+ Email: string (UNIQUE)', '+ FullName: string', '+ Status: string {PendingVerification | Active | Locked}']),
        C('e_ur', 'AppUserRole', 'entity', ['+ UserId: long', '+ RoleCode: string {Investor | Customer | OperatorMember | PlatformAdmin | EvidenceReviewer}']),
      ],
      [
        C('e_slot', 'PhysicalSlot', 'entity', ['+ SlotId: long', '+ OperatorId: long', '+ SlotCode: string (UNIQUE per farm)', '+ RowCode: string?', '+ RackNo: short?', '+ TierNo: short?', '+ ColumnNo: short?', '+ Status: string {Available | Occupied | Maintenance}']),
        C('e_alloc', 'SlotAllocation', 'entity', ['+ SlotAllocationId: long', '+ BatchId: long', '+ SlotId: long', '+ AllocatedAt: DateTimeOffset', '+ ReleasedAt: DateTimeOffset?']),
        BOXROW(),
      ],
    ],
    edges: [['oc', 'os', 'dep'], ['aoc', 'ors', 'dep'], ['bc', 'bs', 'dep'], ['bc', 'brr', 'dep'], ['os', 'e_op', 'dep'], ['os', 'e_om', 'dep'], ['os', 'e_ur', 'dep', 'grants role'], ['ors', 'e_op', 'dep', 'decides'], ['bs', 'e_slot', 'dep'], ['e_op', 'e_om', 'compos', '1 ⟶ 1..*'], ['e_u', 'e_om', 'assoc', '1 ⟶ 0..1'], ['e_u', 'e_ur', 'compos', '1 ⟶ 1..*'], ['e_op', 'e_slot', 'compos', '1 ⟶ *'], ['e_slot', 'e_alloc', 'assoc', '1 ⟶ *'], ['e_slot', 'e_row', '~assoc', '* ⟶ 0..1']],
    notes: 'Operator.Status = Approved is the precondition for every write in Boxes, Batches, Production, Harvest and Evidence; the box count is capped at ApprovedSlotCapacity. v1.4: boxes carry their farm row (PhysicalSlot.RowCode, V001); the rows chosen for a Batch become BoxRow «planned» (UC07). Farm coordinates for the map and the delivery radius are «planned». ERD names: PhysicalSlot = Box, SlotAllocation = BoxAllocation, AppUser = User.',
  },
  {
    page: 'Batches', status: 'modified', owner: 'Viên', uc: 'UC07, UC08, UC09, UC25', was: '4.78',
    title: 'Class Diagram: Batches module — Batch by box rows, Standard Cost lock with price per kg and floor price, remuneration tiers, farm map',
    groups: [
      [
        C('bc', 'BatchesController', 'controller', ['- batches: BatchService', '- explore: BatchExploreService', '- me: ICurrentUser'], ['+ Create(req): BatchResponse', '+ Update(code, req): BatchResponse', '+ SaveCost(code, req): BatchResponse', '+ Submit(code): BatchResponse', '+ Get(code): BatchResponse', '+ List(query, paging): PagedResult<ExploreBatchResponse>', '+ Mine(query, paging): PagedResult<BatchResponse>', '+ MineByCode(code): BatchResponse']),
        C('abc', 'AdminBatchesController', 'controller', ['- batches: BatchReviewService'], ['+ List(query, paging): PagedResult<AdminBatchResponse>', '+ Get(code): AdminBatchResponse', '+ Approve(code, req): AdminBatchResponse', '+ Reject(code, req): AdminBatchResponse', '+ RequestRevision(code, req): AdminBatchResponse']),
        C('ftc', 'FeeTiersController', 'controller', ['- fees: FeeTierService'], ['+ List(): FeeTierResponse[]', '+ Create(req): FeeTierResponse', '+ Update(id, req): FeeTierResponse']),
        C('tsj', 'TrancheScheduleJob', 'job', ['# Interval: TimeSpan = 60 s'], ['# RunAsync(services, ct)']),
        C('fmc', 'FarmMapController', 'controller', ['- map: FarmMapService'], ['+ Search(query): MapFarmResponse[]'], P),
        C('breq', 'BatchRequest', 'record', ['+ Title: string', '+ CrabType: string', '+ SeedQuantity: int', '+ CycleDays: short', '+ MinViableCapital / TargetCapital / MaxCapital: long', '+ OperatorSharePct: decimal', '+ RowCodes: string[] «planned»', '+ PricePerKgVnd: long «planned»', '+ FloorPriceVnd: long «planned»', '+ SurvivalThresholdPct: decimal «planned»', '+ RemunerationTiers: TierRequest[] «planned»', '+ DeliveryRadiusKm: decimal «planned»', '+ SalesWindowDays: int «planned»']),
      ],
      [
        C('bs', 'BatchService', 'service', DEPS('db', 'me', 'clock', 'audit'), ['+ CreateAsync(req): BatchResponse', '+ UpdateAsync(code, req): BatchResponse', '+ SaveCostAsync(code, req): BatchResponse', '+ SubmitAsync(code): BatchResponse', '+ GetAsync(code): BatchResponse', '+ ListMineAsync(filter, paging): PagedResult<BatchResponse>', '~ CostAsync(batchId): StandardCostVersion?', '~ Validate(request)', '~ ValidateBatchTerms(batch)', '~ ValidateCosts(items)', '~ ValidateSchedule(items, plans, complete)', '- WriteAsync(work): T', '- MemberAsync(write): OperatorMember', '- RequireUnlockedAsync(batchId)', '- AddCostItems(cost, items, now)', '- UpdateTranchePlans(cost, tranches)', '- SyncBoxRowsAsync(batch, rowCodes) «planned»', '- SyncRemunerationTiersAsync(batch, tiers) «planned»', '- ValidateSalesTerms(batch) «planned»']),
        C('brs', 'BatchReviewService', 'service', [...DEPS('db'), '- batches: BatchService', ...DEPS('me', 'clock', 'audit'), '- gateway: IPaymentGateway'], ['+ ListAsync(filter, paging): PagedResult<AdminBatchResponse>', '+ GetAsync(code): AdminBatchResponse', '+ ApproveAsync(code, req): AdminBatchResponse', '+ RejectAsync(code, req): AdminBatchResponse', '+ RequestRevisionAsync(code, req): AdminBatchResponse', '- RequireAdminAsync()', '- ApproveSalesTerms(batch) «planned»']),
        C('bes', 'BatchExploreService', 'service', DEPS('db', 'me', 'clock'), ['+ ListAsync(query, paging): PagedResult<ExploreBatchResponse>', '+ GetAsync(code): ExploreBatchResponse', '- ReadAsync(read): T', '- Published(): IQueryable<Batch>', '~ Funding(view, target): ExploreFundingProgress']),
        C('fts', 'FeeTierService', 'service', DEPS('db', 'me', 'clock', 'audit'), ['+ ListAsync(): FeeTierResponse[]', '+ SaveAsync(id?, req): FeeTierResponse']),
        C('fr', 'FundingReadiness', 'static', [], ['~ ReadyAt(batch): DateTimeOffset?', '~ StockingBlockedReason(batch, now, hasRegistry): string?']),
        C('tsr', 'TrancheScheduleResolver', 'service', DEPS('db', 'audit', 'clock'), ['+ ResolveAsync(): int']),
        C('fms', 'FarmMapService', 'service', DEPS('db', 'clock'), ['+ FindAsync(query): MapFarmResponse[]', '- DistanceKm(from, to): decimal'], P),
      ],
      [
        C('ibp', 'IBatchAccountProvisioner', 'port', [], ['+ OpenBatchAccountAsync(batchCode): (string, string)']),
        C('e_b', 'Batch', 'entity', ['+ BatchId: long', '+ BatchCode: string (UNIQUE)', '+ OperatorId: long', '+ CrabType: string', '+ SeedQuantity: int', '+ MinViableCapital / TargetCapital / MaxCapital: decimal', '+ OperatorSharePct: decimal (5–10)', '+ Status: string', '+ FundingOpenAt / FundingDeadline: DateTimeOffset?', '+ PricePerKgVnd: decimal «planned»', '+ FloorPriceVnd: decimal «planned»', '+ SurvivalThresholdPct: decimal «planned»', '+ DeliveryRadiusKm: decimal «planned»', '+ MinPreOrderRatioPct: decimal «planned»', '+ SalesWindowDays: int «planned»', '…']),
        BOXROW(), TIER(),
        C('e_fee', 'FeeTier', 'entity', ['+ FeeTierId: long', '+ TierCode: string', '+ MinCapital: decimal', '+ MaxCapital: decimal?', '+ FeeAmount: decimal', '+ EffectiveFrom: DateOnly']),
      ],
      [
        C('e_scv', 'StandardCostVersion', 'entity', ['+ CostVersionId: long', '+ BatchId: long', '+ VersionNo: short', '+ Status: string {Draft | Submitted | Locked | Superseded}', '+ Status: string {Approved} (not written by code)', '+ SubmittedAt: DateTimeOffset?', '+ LockedAt: DateTimeOffset?']),
        C('e_sci', 'StandardCostItem', 'entity', ['+ CostItemId: long', '+ CostVersionId: long', '+ Category: string {Seed | Feed | Utilities | Labour | MortalityReserve | Depreciation | Other}', '+ Quantity: decimal', '+ UnitPrice: decimal', '+ TrancheNo: byte?']),
        C('e_plan', 'StandardCostTranchePlan', 'entity', ['+ CostVersionId: long', '+ TrancheNo: byte', '+ PlannedDate: DateOnly?', '+ AnchorCode: string?', '+ OffsetDays: short?']),
        C('e_tr', 'DisbursementTranche', 'entity', ['+ TrancheId: long', '+ BatchId: long', '+ TrancheNo: byte', '+ PlannedAmount: decimal', '+ Status: string']),
      ],
    ],
    edges: [['bc', 'bs', 'dep'], ['bc', 'bes', 'dep'], ['bc', 'breq', 'dep'], ['abc', 'brs', 'dep'], ['ftc', 'fts', 'dep'], ['tsj', 'tsr', 'dep'], ['fmc', 'fms', '~dep'], ['brs', 'bs', 'dep'], ['brs', 'ibp', 'dep'], ['bs', 'fr', 'dep'], ['tsr', 'fr', 'dep'], ['bs', 'e_b', 'dep'], ['bs', 'e_row', '~dep', 'creates'], ['bs', 'e_tier', '~dep', 'creates'], ['brs', 'e_fee', 'dep', 'applies'], ['fts', 'e_fee', 'dep'], ['fms', 'e_b', '~dep', 'in radius'], ['e_b', 'e_scv', 'compos', '1 ⟶ 1..*'], ['e_scv', 'e_sci', 'compos', '1 ⟶ 1..*'], ['e_scv', 'e_plan', 'compos', '1 ⟶ *'], ['e_b', 'e_tr', 'compos', '1 ⟶ *'], ['e_b', 'e_row', '~compos', '1 ⟶ 1..*'], ['e_b', 'e_tier', '~compos', '1 ⟶ 1..*'], ['e_fee', 'e_b', 'assoc', '0..1 ⟶ *']],
    notes: 'The Standard Cost is locked when the Batch is approved (TL-11; triggers make the Locked version immutable) — in v1.4 together with the price per kg and the floor price «planned». The Operator types the price per kg with the UC49 range in view. Removed in v1.4 (still in code): BatchOfftakePrice and the per-grade offtake prices (SyncOfftakePricesAsync, OfftakePricesAsync, LoadOfftakePricesAsync), Batch.OfftakePreorderCapPct and FrozenStockCapMonths. ERD name: StandardCostTranchePlan = TranchePlan.',
  },
  {
    page: 'Production', status: 'modified', owner: 'Viên', uc: 'UC17, UC21, UC53', was: '4.79',
    title: 'Class Diagram: Production module — stocking, daily logs, box events, timeline, box details of own rows',
    groups: [
      [
        C('stc', 'StockingController', 'controller', ['- stocking: StockingService'], ['+ Stock(code, request): StockingResponse']),
        C('plc', 'ProductionLogsController', 'controller', ['- production: ProductionLogService'], ['+ Record(code, request): ProductionLogResponse', '+ List(code, filter, paging): PagedResult<ProductionLogResponse>', '+ Mine(filter, paging): PagedResult<ProductionLogResponse>', '+ Batches(paging): PagedResult<ProductionBatchResponse>']),
        C('sec', 'SlotEventsController', 'controller', ['- events: SlotEventService'], ['+ Record(code, request): SlotEventResponse', '+ List(code, paging): PagedResult<SlotEventResponse>', '+ Context(code, slotCode): SlotEventContext', '+ Policy(code): SlotEventPolicyState', '+ Configure(code, request): SlotEventPolicyResponse']),
        C('tlc', 'TimelineController', 'controller', ['- timeline: TimelineService'], ['+ Get(code, query): TimelinePage', '+ FileContent(code, id): FileStreamResult']),
        C('bdc', 'BoxDetailsController', 'controller', ['- boxes: BoxDetailService'], ['+ Get(code, slotCode): BoxDetailResponse', '+ Photo(code, slotCode, id): FileStreamResult'], P),
      ],
      [
        C('sts', 'StockingService', 'service', DEPS('db', 'me', 'clock', 'audit'), ['+ StockAsync(code, request): StockingResponse', '- RequireOwnerAsync(): OperatorMember', '- LoadAvailableSlotsAsync(batch, request, operatorId): PhysicalSlot[]', '- AddStockingRecords(batch, slots, now)']),
        C('pls', 'ProductionLogService', 'service', [...DEPS('db', 'me', 'clock', 'audit'), '- alerts: AlertService'], ['+ RecordAsync(code, request): ProductionLogResponse', '+ ListAsync(code, filter, paging): PagedResult<ProductionLogResponse>', '+ ListMineAsync(filter, paging): PagedResult<ProductionLogResponse>', '+ BatchesAsync(paging): PagedResult<ProductionBatchResponse>', '+ RecordFromApiAsync(operatorId, code, request) «planned»']),
        C('ses', 'SlotEventService', 'service', [...DEPS('db', 'me', 'clock', 'audit'), '- alerts: AlertService'], ['+ PolicyAsync(code): SlotEventPolicyState', '+ ConfigureAsync(code, request): SlotEventPolicyResponse', '+ RecordAsync(code, request): SlotEventResponse', '+ ContextAsync(code, slotCode): SlotEventContext', '+ ListAsync(code, paging): PagedResult<SlotEventResponse>', '- EvidenceAsync(id, batchId, slotId, earliest, now): Evidence', '- EnsureCountsAsync(batchId, alive)', '- RaiseMortalityAlertIfNeededAsync(batch, policy, now)', '- ClaimAvailableAsync(slot, now)', '- ReleaseSlotAsync(slot, now)', '+ RecordFromApiAsync(operatorId, code, request) «planned»']),
        C('tls', 'TimelineService', 'service', [...DEPS('db', 'me'), '- images: EvidenceImageReader', '- storage: IFileStorage'], ['+ ReadAsync(code, query): TimelinePage', '+ OpenFileAsync(code, id): TimelineFile', '- RequireBatchAsync(code): long', '- ReadItemsAsync(batchId, code, first, last): TimelineItem[]']),
        C('bds', 'BoxDetailService', 'service', [...DEPS('db', 'me'), '- images: EvidenceImageReader'], ['+ GetAsync(code, slotCode): BoxDetailResponse', '+ OpenPhotoAsync(code, slotCode, id): EvidenceImageContent', '- RequireRowAccessAsync(batchId, slotId)'], P),
        ALERTS(),
      ],
      [
        IMGREADER(),
        C('e_log', 'ProductionLog', 'entity', ['+ ProductionLogId: long', '+ BatchId: long', '+ LogDate: DateOnly', '+ FeedKg: decimal?', '+ Note: string?', '+ Source: string {Manual}', '+ Source: string {FarmApi} (not written by code; UC52 «planned»)', '+ PlausibilityFlag: string {Ok | OutOfRange}', '+ PlausibilityFlag: string {Inconsistent} (not written by code)', '+ IngestionMessageId: long? «planned»']),
        C('e_pol', 'SlotEventPolicyVersion', 'entity', ['+ PolicyVersionId: long', '+ BatchId: long', '+ VersionNo: int', '+ RestockCutoffDays: short', '+ MortalityThresholdPercent: decimal?']),
        ROWALLOC(),
      ],
      [
        C('e_se', 'SlotEvent', 'entity', ['+ SlotEventId: long', '+ SlotAllocationId: long', '+ BatchId: long', '+ EventType: string {Stocked | Molted | Mortality | Restocked | Harvested | Relocated}', '+ OccurredAt: DateTimeOffset', '+ Source: string {Manual}', '+ Source: string {FarmApi} (not written by code; UC52 «planned»)']),
        C('e_sed', 'SlotEventDetail', 'entity', ['+ SlotEventId: long', '+ CrabItemId: long', '+ RequestId: Guid', '+ RequestHash: string', '+ AliveCount: int']),
        C('e_ci', 'CrabItem', 'entity', ['+ CrabItemId: long', '+ BatchId: long', '+ SlotAllocationId: long', '+ Status: string {Growing | Dead | InStock | Packed | Sold}', '+ Status: string {DeliveredInKind | Lost} (not written by code)', '+ ReplacesCrabItemId: long?', '…']),
        C('e_rec', 'VCrabCountReconciliation', 'entity', ['«view» v_crab_count_reconciliation', '+ StockedTotal: int?', '+ Dead: int?', '+ Growing: int?', '+ Harvested: int?']),
      ],
    ],
    edges: [['stc', 'sts', 'dep'], ['plc', 'pls', 'dep'], ['sec', 'ses', 'dep'], ['tlc', 'tls', 'dep'], ['bdc', 'bds', '~dep'], ['pls', 'al', 'dep'], ['ses', 'al', 'dep'], ['tls', 'eir', 'dep'], ['bds', 'eir', '~dep'], ['bds', 'e_ra', '~dep', 'row access'], ['pls', 'e_log', 'dep'], ['ses', 'e_pol', 'dep'], ['sts', 'e_ci', 'dep', 'Growing'], ['ses', 'e_se', 'dep'], ['ses', 'e_rec', 'dep', 'reconciles'], ['e_se', 'e_sed', 'compos', '1 ⟶ 0..1'], ['e_ci', 'e_sed', 'assoc', '1 ⟶ *']],
    notes: 'Box events are idempotent by (batch, request_id, request_hash); mortality and restock need an InAppCapture photo of the box; alive counts are reconciled after every event. v1.4: the device simulator posts logs and events through the Ingestion API (RecordFromApiAsync «planned», Source FarmApi); investors see box details only for their own rows (BoxDetailService «planned»), others see the Batch-level timeline. ERD names: SlotEvent = BoxEvent, SlotEventDetail = BoxEventDetail, SlotEventPolicyVersion = BoxEventPolicy, CrabItem = Crab. Removed in v1.4 (still in code): water-quality thresholds (ProductionThresholdVersion; ProductionLogsController.Thresholds / Configure → ProductionLogService.ThresholdsAsync / ConfigureAsync), the Ph / WaterTempC / SalinityPpt measurements and ThresholdVersionId of ProductionLog, the plausibility check Violations(request, thresholds) → OutOfRange and the WaterQuality alert; the v1.4 simulator sends only meaningful data (feeding, photos, box events) and TL-22 dropped alerts on environmental measurements.',
  },
  {
    page: 'Ingestion API', status: 'new', owner: 'Viên', uc: 'UC52', was: '—',
    title: 'Class Diagram: Ingestion API «planned» — device and camera simulator data through one common API',
    groups: [
      [
        C('ic', 'IngestionController', 'controller', ['- ingestion: IngestionService'], ['+ Ingest(envelope): IngestionResult'], P),
        C('env', 'IngestionEnvelope', 'record', ['+ Messages: IngestionMessageDto[]', '+ MessageType: string {DailyLog | Feeding | Health | BoxEvent | Photo}'], [], P),
        C('res', 'IngestionResult', 'record', ['+ Accepted: int', '+ Duplicates: int', '+ Rejected: (ClientMessageId, RejectReason)[]'], [], P),
      ],
      [
        C('is', 'IngestionService', 'service', [...DEPS('db', 'audit', 'clock'), '- logs: ProductionLogService', '- events: SlotEventService', '- storage: IFileStorage', '- options: IngestionOptions'], ['+ IngestAsync(apiKey, envelope): IngestionResult', '- AuthenticateAsync(apiKey): long', '- DispatchAsync(message)'], P),
        C('pls', 'ProductionLogService', 'service', [], ['+ RecordFromApiAsync(operatorId, code, request) «planned»']),
        C('ses', 'SlotEventService', 'service', [], ['+ RecordFromApiAsync(operatorId, code, request) «planned»']),
      ],
      [
        FILESTORE(), IAUDIT(),
      ],
      [
        C('e_im', 'IngestionMessage', 'entity', ['+ IngestionMessageId: long', '+ OperatorId: long', '+ ClientMessageId: string', '+ MessageType: string', '+ BatchCode: string', '+ BoxCode: string?', '+ OccurredAt: DateTimeOffset', '+ PayloadJson: string', '+ ReceivedAt: DateTimeOffset (server time)', '+ Status: string {Received | Accepted | Rejected | Duplicate}', '+ RejectReason: string?'], [], P),
        C('e_log', 'ProductionLog', 'entity', ['+ Source: string — FarmApi for UC52 «planned»', '+ IngestionMessageId: long? «planned»']),
        C('e_se', 'SlotEvent', 'entity', ['+ Source: string — FarmApi for UC52 «planned»', '+ IngestionMessageId: long? «planned»']),
        C('e_ev', 'Evidence', 'entity', ['+ Source: string — FarmApi for device photos «planned»', '+ IngestionMessageId: long? «planned»']),
      ],
    ],
    edges: [['ic', 'is', '~dep'], ['ic', 'env', '~dep'], ['ic', 'res', '~dep'], ['is', 'pls', '~dep', 'logs'], ['is', 'ses', '~dep', 'box events'], ['is', 'ifs', '~dep', 'photos'], ['is', 'ial', '~dep'], ['is', 'e_im', '~dep', 'stores'], ['e_im', 'e_log', '~assoc', '1 ⟶ 0..1'], ['e_im', 'e_se', '~assoc', '1 ⟶ 0..1'], ['e_im', 'e_ev', '~assoc', '1 ⟶ 0..1']],
    notes: 'UC52 «planned» (TP2): one common API replaces per-farm software and IoT / camera hardware (out of scope). The simulator sends only meaningful farm data — feeding, health, box events, daily logs, photos — not temperature or salinity; ProductionLogRequest must stop requiring Ph / WaterTempC / SalinityPpt for this path. Each message is idempotent by (OperatorId, ClientMessageId) and stamped with server time; device photos never count as live evidence (tranche gates must keep only InAppCapture). Attribute names follow the Logical ERD.',
  },
  {
    page: 'Harvest & Traceability', status: 'modified', owner: 'Viên', uc: 'UC22, UC33', was: '4.80',
    title: 'Class Diagram: Harvest module — harvest per box (UC22), order QR trace (UC33)',
    groups: [
      [
        C('hc', 'HarvestController', 'controller', ['- harvests: HarvestService'], ['+ Start(code, request): HarvestResponse', '+ List(code, paging): PagedResult<HarvestResponse>', '+ Context(code, slotCode): HarvestContextResponse', '+ Get(id): HarvestResponse', '+ Crabs(id, paging): PagedResult<HarvestCrabResponse>', '+ Record(id, request): HarvestCrabResponse', '+ Update(id, request): HarvestResponse', '+ Complete(id, request): HarvestResponse']),
        C('trc', 'TraceController', 'controller', ['- trace: TraceService'], ['+ GetOrder(token): OrderTraceResponse «planned»']),
      ],
      [
        C('hs', 'HarvestService', 'service', DEPS('db', 'me', 'clock', 'audit'), ['+ StartAsync(code, request): HarvestWriteResult', '+ RecordAsync(id, request): HarvestWriteResult', '+ UpdateAsync(id, request): HarvestResponse', '+ CompleteAsync(id, request): HarvestResponse', '+ GetAsync(id): HarvestResponse', '+ ListAsync(code, paging): PagedResult<HarvestResponse>', '+ ContextAsync(code, slotCode): HarvestContextResponse', '+ CrabsAsync(id, paging): PagedResult<HarvestCrabResponse>', '- WriteAsync(action): T', '- MemberAsync(owner): OperatorMember', '- BatchAsync(code, operatorId, write): Batch', '- EnsureOpen(session, batch)', '- EnsureCountsAsync(batchId, alive)']),
        C('hg', 'HarvestGrading', 'static', [], ['+ Select(grades, weightG, shellCondition): ProductGrade']),
        C('trs', 'TraceService', 'service', [...DEPS('db'), '- logger: ILogger'], ['+ GetOrderAsync(token): OrderTraceResponse «planned»', '- ValidateToken(token) «planned»']),
      ],
      [
        C('e_h', 'Harvest', 'entity', ['+ HarvestId: long', '+ BatchId: long', '+ LifecycleStatus: string? {Open | Completed}', '+ HarvestedCount: int', '+ TotalWeightKg: decimal', '+ RevisionNo: int', '+ CompletedAt: DateTimeOffset?']),
        C('e_hr', 'HarvestRecord', 'entity', ['+ SlotEventId: long', '+ HarvestId: long', '+ CrabItemId: long', '+ SlotCode: string', '+ WeightG: short', '+ ShellCondition: string {HardShell | SoftShell}', '+ GradeCode: string', '+ RecordedAt: DateTimeOffset']),
        C('e_hsr', 'HarvestStartRequestLog', 'entity', ['+ RequestId: Guid', '+ HarvestId: long', '+ BatchId: long', '+ RequestHash: string']),
        C('e_grade', 'ProductGrade', 'entity', ['+ GradeId: long', '+ GradeCode: string', '+ MinWeightG: short?', '+ MaxWeightG: short?']),
      ],
      [
        C('e_ci', 'CrabItem', 'entity', ['+ CrabItemId: long', '+ BatchId: long', '+ WeightG: short?', '+ GradeId: long?', '+ HarvestId: long?', '+ Status: string {Growing | InStock | Packed | Sold | …}', '+ OrderId: long? «planned»']),
        C('e_so', 'SalesOrder', 'entity', ['+ OrderId: long', '+ OrderNo: string', '+ BatchId: long', '+ Status: string']),
        C('e_qr', 'OrderQrCode', 'entity', ['+ OrderQrCodeId: long', '+ OrderId: long (UNIQUE)', '+ QrToken: string (UNIQUE)', '+ IssuedAt: DateTimeOffset', '+ RevokedAt: DateTimeOffset?'], [], P),
      ],
    ],
    edges: [['hc', 'hs', 'dep'], ['trc', 'trs', '~dep'], ['hs', 'hg', 'dep'], ['hs', 'e_h', 'dep'], ['hs', 'e_hr', 'dep', 'per box'], ['hs', 'e_hsr', 'dep'], ['trs', 'e_qr', '~dep', 'reads'], ['e_h', 'e_hr', 'compos', '1 ⟶ *'], ['e_grade', 'e_ci', 'assoc', '0..1 ⟶ *'], ['e_h', 'e_ci', 'assoc', '0..1 ⟶ *'], ['e_so', 'e_ci', '~assoc', '0..1 ⟶ *'], ['e_so', 'e_qr', '~compos', '1 ⟶ 0..1']],
    notes: 'v1.4 removes per-crab tags: harvest is recorded per box (one crab per box) and each delivery order gets one QR when the Operator prepares the delivery note (OrderQrCode «planned»); the trace follows CrabItem.OrderId «planned» (as in the Logical ERD). Traceability is still pending confirmation by Viên and Nhân. Removed in v1.4 (still in code): TagsController, TagsService, IHarvestTagCodeGenerator, CrabTag, TagScan, v_traceability, TraceService.GetAsync(tag), HarvestRecord tag columns and the CatalogService.SyncHarvestStockAsync call. ERD names: HarvestStartRequestLog = HarvestStartRequest, CrabItem = Crab.',
  },

  // ======================= TP3 Nhân =======================
  {
    page: 'Pricing module', status: 'new', owner: 'Nhân', uc: 'UC49', was: '—',
    title: 'Class Diagram: Price suggestion module «planned» — seasonal and holiday range, MAPE backtest',
    groups: [
      [
        C('psc', 'PriceSuggestionsController', 'controller', ['- prices: PriceSuggestionService'], ['+ Suggest(query): PriceSuggestion'], P),
        C('q', 'PriceSuggestionQuery', 'record', ['+ CrabType: string', '+ TargetFrom: DateOnly', '+ TargetTo: DateOnly', '+ BatchCode: string?'], [], P),
      ],
      [
        C('pss', 'PriceSuggestionService', 'service', [...DEPS('db', 'clock'), '- model: SeasonalPriceModel', '- backtester: PriceBacktester'], ['+ SuggestAsync(query): PriceSuggestion', '- LoadObservationsAsync(crabType, years): PriceObservation[]'], P),
        C('model', 'SeasonalPriceModel', 'engine', ['(pure: no database)'], ['+ Fit(observations): SeasonalModel', '+ PredictRange(model, targetFrom, targetTo): (long, long, long)'], P),
        C('bt', 'PriceBacktester', 'engine', ['(most recent year held out)'], ['+ Mape(model, heldOutYear): decimal'], P),
      ],
      [
        C('e_obs', 'PriceObservation', 'entity', ['+ PriceObservationId: long', '+ ObservedOn: DateOnly', '+ Source: string {FarmInterview | Press | Simulated}', '+ SourceRef: string?', '+ CrabType: string', '+ GradeId: long?', '+ PriceVndPerKg: decimal'], [], P),
        C('e_sug', 'PriceSuggestion', 'entity', ['+ PriceSuggestionId: long', '+ BatchId: long? (set when the Batch is saved)', '+ CrabType: string', '+ TargetFrom: DateOnly', '+ TargetTo: DateOnly', '+ LowVndPerKg / MidVndPerKg / HighVndPerKg: decimal', '+ MapePct: decimal', '+ DataFrom / DataTo: DateOnly', '+ GeneratedAt: DateTimeOffset'], [], P),
        C('e_grade', 'ProductGrade', 'entity', ['+ GradeId: long', '+ GradeCode: string']),
      ],
    ],
    edges: [['psc', 'pss', '~dep'], ['psc', 'q', '~dep'], ['pss', 'model', '~dep', 'fits'], ['pss', 'bt', '~dep', 'MAPE'], ['bt', 'model', '~dep'], ['pss', 'e_obs', '~dep', 'reads'], ['pss', 'e_sug', '~dep', 'stores'], ['e_grade', 'e_obs', '~assoc', '0..1 ⟶ *']],
    notes: 'UC49 «planned» (TP3). Data: prices of the interviewed farm, dated press reports and simulated data for the last 2–3 years (no public weekly price series exists). Backtested on the most recent year and reported as MAPE. Shown as a range with a warning — never an expected profit, return or yield (BR-49). The suggestion is asked before the Batch exists, so PriceSuggestion.BatchId is optional [0..1] and set when the Batch is saved; names follow the Logical ERD (TargetFrom/To, DataFrom/To, Source FarmInterview). Replaces the v2.0 Catalog page (removed in v1.4).',
  },
  {
    page: 'Orders – pre-order & deposit', status: 'modified', owner: 'Nhân', uc: 'UC27, UC28, UC55', was: '4.82',
    title: 'Class Diagram: Orders module, part 1 — bulk pre-order with deposit, tracking, deposit timeout',
    groups: [
      [
        C('prc', 'PreordersController', 'controller', ['- preorders: PreorderService'], ['+ Place(req): PreorderResponse']),
        C('otc', 'OrderTrackingController', 'controller', ['- queries: OrderQueryService', '- cancellations: OrderCancellationService', '- fulfilment: OrderFulfilmentService', '- ratings: OrderRatingService', '- returns: OrderReturnService'], ['+ List(filter, paging): PagedResult<OrderSummaryResponse>', '+ Get(orderNo): OrderTrackingResponse', '+ Cancel(orderNo, req): CancelOrderResponse', '+ Receive(orderNo): OrderTrackingResponse', '+ GetRating(orderNo): OrderRatingView', '+ Rate(orderNo, req): RatingResponse', '+ Return(orderNo, req): ReturnOrderResponse']),
        C('rej', 'ReservationExpiryJob', 'job', ['# Interval: TimeSpan = 1 min'], ['# RunAsync(services, ct)']),
        C('preq', 'PlacePreorderRequest', 'record', ['+ BatchCode: string «planned»', '+ CrabCount: int «planned»', '+ QuantityKg: decimal', '+ AddressId: long']),
      ],
      [
        C('ps', 'PreorderService', 'service', [...DEPS('db', 'me'), '- payments: PaymentRequestService', '- audit: IAuditLog', '- options: IOptions<OrderOptions>', '- clock: TimeProvider'], ['+ PlaceAsync(req): PreorderResponse', '+ ComputeDeposit(totalAmount, depositPct): long', '- ValidateQuantity(req, batch) «planned»']),
        C('oqs', 'OrderQueryService', 'service', DEPS('db', 'me', 'clock'), ['+ ListMineAsync(filter, paging): PagedResult<OrderSummaryResponse>', '+ GetMineAsync(orderNo): OrderTrackingResponse', '+ IsCancellable(status): bool', '+ Timeline(order): OrderTimelineEntry[]']),
        C('ocs', 'OrderCancellationService', 'service', [...DEPS('db', 'me', 'audit'), '- refunds: RefundService', '- clock: TimeProvider'], ['+ CancelAsync(orderNo, req): CancelOrderResponse']),
        C('rex', 'ReservationExpiryService', 'service', [...DEPS('db', 'audit', 'clock'), '+ TimeoutReason: string = "payment_timeout"'], ['+ ReleaseExpiredAsync(): int']),
        C('on', 'OrderNumber', 'static', ['+ Prefix: string = "OD"'], ['+ New(): string']),
      ],
      [
        C('h2', 'PreOrderDepositHandler', 'service', [...DEPS('db', 'audit'), '+ Purpose: string = "PreOrderDeposit"'], ['+ OnPaidAsync(request, paidAt)']),
        IPPH(), PRS(),
      ],
      [
        C('e_so', 'SalesOrder', 'entity', ['+ OrderId: long', '+ OrderNo: string (UNIQUE)', '+ CustomerId: long', '+ BatchId: long', '+ OrderType: string {PreOrder}', '+ OrderType: string {BulkPreOrder | InvoicedSale | FinalOrder} «planned»', '+ Status: string {PendingPayment | DepositPaid | …}', '+ TotalAmount: decimal', '+ DepositAmount: decimal?', '+ CrabCount: int? «planned»', '+ EstimatedKg: decimal? «planned»', '…']),
        C('e_addr', 'CustomerAddress', 'entity', ['+ AddressId: long', '+ CustomerId: long', '+ AddressLine: string', '+ Province: string', '+ Latitude: decimal «planned»', '+ Longitude: decimal «planned»']),
        C('e_pr', 'PaymentRequest', 'entity', ['+ PaymentRequestId: long', '+ Purpose: string {PreOrderDeposit | PreOrderBalance | …}', '+ OrderId: long?', '+ Status: string']),
        C('e_cap', 'VBatchCommitmentCap', 'entity', ['«view» v_batch_commitment_cap', '+ BatchId: long', '+ CapKg: decimal?', '+ PreorderKg: decimal', '+ RemainingKg: decimal?']),
        C('e_quota', 'PreOrderQuota', 'entity', ['+ BatchId: long (PK, batch_preorder_quota)', '+ MaxCrabCount: int', '+ /HeldCrabCount: int', '+ /DepositedCrabCount: int'], [], P),
        C('e_hold', 'PreOrderHold', 'entity', ['+ PreOrderHoldId: long', '+ BatchId: long', '+ OrderId: long (UNIQUE)', '+ CrabCount: int', '+ Status: string {Active | Deposited | Released}', '+ ExpiresAt: DateTimeOffset (15 min)'], [], P),
      ],
    ],
    edges: [['prc', 'ps', 'dep'], ['prc', 'preq', 'dep'], ['otc', 'oqs', 'dep'], ['otc', 'ocs', 'dep'], ['rej', 'rex', 'dep'], ['ps', 'prs', 'dep'], ['ps', 'on', 'dep'], ['h2', 'iph', 'realize'], ['ps', 'e_so', 'dep', 'PreOrder'], ['ps', 'e_addr', 'dep', 'delivery point'], ['ps', 'e_cap', 'dep', 'cap check'], ['ps', 'e_quota', '~dep', 'quota'], ['ps', 'e_hold', '~dep', 'holds'], ['h2', 'e_so', 'dep', 'DepositPaid'], ['h2', 'e_hold', '~dep', 'converts'], ['rex', 'e_so', 'dep', 'timeout'], ['rex', 'e_hold', '~dep', 'releases'], ['e_so', 'e_pr', 'assoc', '0..1 ⟶ *'], ['e_quota', 'e_hold', '~assoc', '1 ⟶ *'], ['e_so', 'e_hold', '~assoc', '1 ⟶ 0..1']],
    notes: 'v1.4: Customers (restaurants, small traders) — and Investors, except the Operator of the Batch and related parties — pre-order only while the Batch is funding, by number of crabs (or kg) from a minimum quantity, and pay a VietQR deposit; no overselling (Batch row locked, cap re-checked after the insert). UC28 Track Order Status = OrderTrackingController.List / Get → OrderQueryService (read only). Removed in v1.4 (still in code): OrderLine (listing line; the Logical ERD drops it), PlacePreorderRequest.ListingId, OrdersController.Checkout, OrderService, OrderPaymentHandler, StockReservation / StockRelease, PreorderBalanceJob / PreorderBalanceService. VBatchCommitmentCap is kept for the pre-order cap in kg (code); its offtake part is removed in v1.4. The crab quota and the 15-minute holds (Orders:ReservationMinutes) are PreOrderQuota (batch_preorder_quota) and PreOrderHold (preorder_hold), «planned»; HeldCrabCount + DepositedCrabCount ≤ MaxCrabCount (no overselling); a hold is Active until ExpiresAt, Deposited when the deposit is paid and Released when the QR expires (cancelling then costs nothing, UC55). ERD name: CustomerAddress = DeliveryAddress.',
  },
  {
    page: 'Orders – delivery & disputes', status: 'modified', owner: 'Nhân', uc: 'UC29–UC32, UC34', was: '4.83',
    title: 'Class Diagram: Orders module, part 2 — delivery with weighing, balance, order QR, returns, complaints, ratings',
    groups: [
      [
        C('ooc', 'OperatorOrdersController', 'controller', ['- packing: OrderPackingService', '- fulfilment: OrderFulfilmentService', '- returns: OrderReturnService'], ['+ List(status): OperatorOrderSummary[]', '+ GetCounts(): OrderCounts', '+ Get(orderNo): OperatorOrderDetailResponse', '+ AssignBoxes(orderNo, req) «planned»', '+ Ship(orderNo, req): OperatorOrderDetailResponse', '+ Deliver(orderNo, req): OperatorOrderDetailResponse', '+ RefuseDelivery(orderNo, req) «planned»', '+ ApproveReturn(orderNo, req): ReturnOrderResponse', '+ RejectReturn(orderNo, req): ReturnRequestInfo']),
        C('cc', 'ComplaintsController', 'controller', ['- complaints: ComplaintService'], ['+ Create(orderNo, req): ComplaintDetailResponse', '+ GetByOrderNo(orderNo): ComplaintDetailResponse?', '+ Respond(id, req): ComplaintDetailResponse', '+ Get(id): ComplaintDetailResponse', '+ ListForOperator(): ComplaintSummaryResponse[]', '+ ListForCustomer(): ComplaintSummaryResponse[]']),
        C('acc', 'AdminComplaintsController', 'controller', ['- complaints: ComplaintService'], ['+ List(status, page): PagedList<ComplaintSummaryResponse>', '+ Get(id): ComplaintDetailResponse', '+ Resolve(id, req): ComplaintDetailResponse']),
        C('ocj', 'OrderCompletionJob', 'job', ['# Interval: TimeSpan = 1 min'], ['# RunAsync(services, ct)']),
        C('cej', 'ComplaintEscalationJob', 'job', ['# Interval: TimeSpan = 1 min'], ['# RunAsync(services, ct)']),
      ],
      [
        C('pk', 'OrderPackingService', 'service', [...DEPS('db', 'me', 'audit'), '- returns: OrderReturnService', '- clock: TimeProvider'], ['+ ListMineAsync(status): OperatorOrderSummary[]', '+ GetMineAsync(orderNo): OperatorOrderDetailResponse', '+ GetCountsAsync(): OrderCounts', '+ AssignBoxesAsync(orderNo, req) «planned»', '- IssueOrderQrAsync(order) «planned»']),
        C('ful', 'OrderFulfilmentService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '- options: IOptions<OrderOptions>'], ['+ ShipAsync(orderNo, req): OperatorOrderDetailResponse', '+ DeliverAsync(orderNo, req): OperatorOrderDetailResponse', '+ ReceiveAsync(orderNo): OrderTrackingResponse', '+ CanConfirmReceipt(status, receivedAt): bool', '- IssueBalanceAsync(order, weighedKg) «planned»', '- MarkCrabsSoldAsync(orderId, orderNo, actorId, now): int']),
        C('bh', 'PreOrderBalanceHandler', 'service', [...DEPS('db', 'audit'), '+ Purpose: string = "PreOrderBalance"'], ['+ OnPaidAsync(request, paidAt)']),
        C('ret', 'OrderReturnService', 'service', [...DEPS('db', 'me', 'audit'), '- refunds: RefundService', '- clock: TimeProvider'], ['+ CanReturnAsync(orderNo): bool', '+ GetStateAsync(orderNo): (bool, ReturnRequestInfo?)', '+ ReturnAsync(orderNo, req): ReturnOrderResponse', '+ ApproveByOperatorAsync(orderNo, req): ReturnOrderResponse', '+ RejectByOperatorAsync(orderNo, req): ReturnRequestInfo']),
        C('rat', 'OrderRatingService', 'service', DEPS('db', 'me', 'audit', 'clock'), ['+ GetAsync(orderNo): OrderRatingView', '+ RateAsync(orderNo, req): RatingResponse', '- LoadOwnedWithLinesAsync(orderNo): SalesOrder']),
        C('cmp', 'OrderCompletionService', 'service', DEPS('db', 'audit', 'clock'), ['+ CompleteDueAsync(): int']),
        C('cps', 'ComplaintService', 'service', [...DEPS('db', 'me', 'audit'), '- refunds: RefundService', '- clock: TimeProvider'], ['+ SubmitAsync(orderNo, req): ComplaintDetailResponse', '+ RespondAsync(complaintId, req): ComplaintDetailResponse', '+ ResolveAsync(complaintId, req): ComplaintDetailResponse', '+ EscalateOverdueAsync(): int', '+ GetByIdAsync(complaintId): ComplaintDetailResponse', '+ GetByOrderNoAsync(orderNo): ComplaintDetailResponse?', '+ ListForAdminAsync(status, page, pageSize): PagedList<ComplaintSummaryResponse>', '+ ListForOperatorAsync(): ComplaintSummaryResponse[]', '+ ListForCustomerAsync(): ComplaintSummaryResponse[]']),
      ],
      [
        REFUND(), PRS(),
      ],
      [
        C('e_so', 'SalesOrder', 'entity', ['+ OrderId: long', '+ Status: string {Packed | Shipping | Delivered | Completed | Returned | …}', '+ ShippedAt: DateTimeOffset?', '+ DeliveredAt: DateTimeOffset?', '+ ReceivedAt: DateTimeOffset?', '+ ReturnWindowEndsAt: DateTimeOffset?', '+ WeighedKg: decimal? «planned»', '+ TransitLossKg: decimal? «planned»', '+ /BalanceVnd: decimal? «planned»', '…']),
        C('e_ci', 'CrabItem', 'entity', ['+ CrabItemId: long', '+ Status: string {InStock | Packed | Sold}', '+ OrderId: long? «planned»']),
        C('e_qr', 'OrderQrCode', 'entity', ['+ OrderQrCodeId: long', '+ OrderId: long', '+ QrToken: string', '+ IssuedAt: DateTimeOffset'], [], P),
        C('e_cm', 'Complaint', 'entity', ['+ ComplaintId: long', '+ OrderId: long', '+ ComplaintType: string', '+ Status: string {Open | OperatorResponded | Escalated | Resolved | Rejected}', '+ Resolution: string? {Refund | Compensation | Replacement | NoAction}', '+ RefundAmount: decimal?']),
        C('e_rt', 'ProductRating', 'entity', ['+ RatingId: long', '+ OrderId: long (UNIQUE)', '+ Stars: byte', '+ Comment: string?']),
        C('e_pi', 'PaymentInstruction', 'entity', ['+ InstructionId: long', '+ InstructionType: string {Refund}', '+ OrderId: long?']),
      ],
    ],
    edges: [['ooc', 'pk', 'dep'], ['ooc', 'ful', 'dep'], ['ooc', 'ret', 'dep'], ['cc', 'cps', 'dep'], ['acc', 'cps', 'dep'], ['ocj', 'cmp', 'dep'], ['cej', 'cps', 'dep'], ['ful', 'prs', '~dep', 'balance QR'], ['ret', 'ref', 'dep'], ['cps', 'ref', 'dep'], ['pk', 'e_ci', '~dep', 'Packed'], ['pk', 'e_qr', '~dep', 'issues'], ['ful', 'e_so', 'dep', 'Shipping'], ['cmp', 'e_so', 'dep', 'Completed'], ['cps', 'e_cm', 'dep'], ['rat', 'e_rt', 'dep'], ['ref', 'e_pi', 'dep', 'creates'], ['e_so', 'e_ci', '~assoc', '0..1 ⟶ *'], ['e_so', 'e_qr', '~compos', '1 ⟶ 0..1'], ['e_so', 'e_cm', 'assoc', '1 ⟶ *'], ['e_so', 'e_rt', 'assoc', '1 ⟶ 0..1'], ['e_so', 'e_pi', 'assoc', '0..1 ⟶ *']],
    notes: 'v1.4: the money is the weighed kg at delivery × the price per kg fixed in advance (delivery included); dead or spoiled crabs in transit are not charged; the Customer pays the balance by VietQR on delivery. The order QR is issued when the Operator prepares the delivery note (AssignBoxesAsync) and the boxes are linked by CrabItem.OrderId «planned». UC34 Rate Order works on Completed orders only (OrderRatingService). Vehicle dispatch is out of scope. Removed in v1.4 (still in code): OrderPackingService.PackAsync(orderNo, tagCodes) and ExtractTagCode; per-listing "#ITEMS:" ratings; CrabItem.OrderLineId.',
  },
  {
    page: 'Orders – invoiced & final', status: 'new', owner: 'Nhân', uc: 'UC50, UC51, UC54, UC55', was: '—',
    title: 'Class Diagram: Orders module, part 3 «planned» — invoiced sales (low-grade, forfeit resale), final order at floor price, forfeited deposits (UC54)',
    groups: [
      [
        C('isc', 'InvoicedSalesController', 'controller', ['- sales: InvoicedSaleService'], ['+ CreateInvoicedSale(code, req): InvoicedSaleResponse', '+ CreateFinal(code, req): InvoicedSaleResponse', '+ List(code): InvoicedSaleResponse[]'], P),
        C('ooc', 'OperatorOrdersController', 'controller', [], ['+ RefuseDelivery(orderNo, req) «planned»']),
        C('ocs', 'OrderCancellationService', 'service', [], ['+ CancelAsync(orderNo, req): CancelOrderResponse']),
        C('frj', 'FinalOrderReminderJob', 'job', ['# Interval: TimeSpan = 1 h'], ['# RunAsync(services, ct)'], P),
      ],
      [
        C('iss', 'InvoicedSaleService', 'service', [...DEPS('db', 'me', 'audit', 'clock'), '- payments: PaymentRequestService', '- storage: IFileStorage'], ['+ RecordInvoicedSaleAsync(code, req): InvoicedSaleResponse', '+ RecordFinalOrderAsync(code, req): InvoicedSaleResponse', '- LeftoverAsync(batchId): (int, decimal)', '- IssueInvoiceAsync(order, req): Invoice'], P),
        C('dfs', 'DepositForfeitService', 'service', DEPS('db', 'audit', 'clock'), ['+ ForfeitAsync(orderNo, reason): ForfeitResponse', '- ReleaseBoxesForResaleAsync(order)'], P),
        C('iph2', 'InvoicedSalePaymentHandler', 'service', ['+ Purpose: string = "OrderPayment"'], ['+ OnPaidAsync(request, paidAt)'], P),
        ALERTS(),
      ],
      [
        IPPH(), FILESTORE(), PRS(),
      ],
      [
        C('e_inv', 'Invoice', 'entity', ['+ InvoiceId: long', '+ OrderId: long (UNIQUE)', '+ InvoiceNo: string (UNIQUE)', '+ BuyerName: string', '+ BuyerTaxCode: string?', '+ AmountVnd: decimal', '+ IssuedAt: DateTimeOffset'], [], P),
        C('e_so', 'SalesOrder', 'entity', ['+ OrderId: long', '+ OrderType: string {InvoicedSale | FinalOrder} «planned»', '+ SaleReason: string? {LowGrade | ForfeitResale} «planned»', '+ CustomerId: long? (outside buyer) «planned»', '+ Status: string {Forfeited | Refunded} «planned»', '+ ForfeitedAt: DateTimeOffset? «planned»', '+ DepositAmount: decimal? (kept on forfeit)']),
        C('e_b', 'Batch', 'entity', ['+ BatchId: long', '+ FloorPriceVnd: decimal «planned»']),
        C('e_ev', 'Evidence', 'entity', ['+ MediaType: string — Invoice (not written by code)', '+ Source: string — DocumentUpload (not written by code)']),
      ],
    ],
    edges: [['isc', 'iss', '~dep'], ['ooc', 'dfs', '~dep', 'refused'], ['ocs', 'dfs', '~dep', 'walk-away'], ['frj', 'al', '~dep', 'FinalOrderDue'], ['iss', 'prs', '~dep', 'buyer QR'], ['iss', 'ifs', '~dep', 'invoice file'], ['iph2', 'iph', '~realize'], ['iss', 'e_inv', '~dep', 'issues'], ['iss', 'e_b', '~dep', '≥ floor price'], ['dfs', 'e_so', '~dep', 'Forfeited'], ['e_so', 'e_inv', '~compos', '1 ⟶ 0..1'], ['e_b', 'e_so', 'assoc', '1 ⟶ *'], ['e_inv', 'e_ev', '~assoc', '0..1 ⟶ 0..1']],
    notes: 'UC50 Record Invoiced Sale / UC51 / UC54 / UC55 (TP3). One InvoicedSale order type with saleReason LowGrade (weak, watery, frozen crabs sold cheaper) or ForfeitResale (crabs released by a forfeited order, UC54 case c); every delivered order has one Invoice. A deposit is forfeited when the Customer cancels after paying and the Batch opens (a) or refuses the delivery / does not pay the balance (c); it is refunded when the Batch does not open (b); cancelling before paying costs nothing (d); leftover stock goes to the committed buyer through one invoiced final order, never below the floor price published before funding (the platform does not guarantee it). Invoiced orders reuse the payment purpose OrderPayment. All four sources feed settlement (RevenueLine type DeliveredOrder | InvoicedSale | ForfeitedDeposit | FinalOrder). Attribute names follow the Logical ERD. Replaces the v2.0 Offtake page (removed in v1.4, still in code).',
  },

  // ======================= TP4 Khôi =======================
  {
    page: 'Auth & Accounts', status: 'kept', owner: 'Khôi', uc: 'UC01–UC03, UC06', was: '4.85',
    title: 'Class Diagram: Auth and Accounts modules — registration, login, eKYC, payout account protection',
    groups: [
      [
        C('ac', 'AuthController', 'controller', ['- auth: AuthService', '- me: ICurrentUser'], ['+ Register(req): AuthResponse', '+ Login(req): AuthResponse', '+ Me(): MeResponse']),
        C('acc', 'AccountsController', 'controller', ['- accounts: AccountService'], ['+ Verify(req): KycStatusResponse', '+ Kyc(): KycStatusResponse']),
        C('aac', 'AdminAccountsController', 'controller', ['- accounts: AdminAccountService'], ['+ Users(filter, paging): PagedResult<AdminUserResponse>', '+ GetUser(id): AdminUserResponse', '+ Lock(id, req): AdminUserResponse', '+ Unlock(id, req): AdminUserResponse', '+ Checks(filter, paging): PagedResult<KycCheckResponse>', '+ ApproveException(id, req): KycCheckResponse']),
        C('ppc', 'PaymentProfilesController', 'controller', ['- profiles: PaymentProfileService'], ['+ Payout(ownerType): PayoutProfileResponse', '+ SavePayout(ownerType, req): PayoutProfileResponse', '+ Addresses(): AddressResponse[]', '+ Address(id): AddressResponse', '+ CreateAddress(req): AddressResponse', '+ UpdateAddress(id, req): AddressResponse', '+ DeleteAddress(id)']),
      ],
      [
        C('as', 'AuthService', 'service', [...DEPS('db'), '- tokens: TokenService', '- clock: TimeProvider', '- limiter: LoginAttemptLimiter'], ['+ RegisterAsync(req): AuthResponse', '+ LoginAsync(req): AuthResponse', '+ GetMeAsync(userId): MeResponse', '- IssueTokenAsync(user): AuthResponse']),
        C('acs', 'AccountService', 'service', [...DEPS('db', 'me'), '- ekyc: IEkycProvider', '- clock: TimeProvider'], ['+ GetKycAsync(): KycStatusResponse', '+ VerifyIdentityAsync(req): KycStatusResponse', '- ValidateImage(image)', '- ValidateImageHeaderAsync(image, contentType)', '- RequireUnverified(investor)', '- AppendAudit(userId, old, new, now, previousHash)']),
        C('aas', 'AdminAccountService', 'service', DEPS('db', 'me', 'clock'), ['+ ListUsersAsync(filter, paging): PagedResult<AdminUserResponse>', '+ GetUserAsync(id): AdminUserResponse', '+ ListChecksAsync(filter, paging): PagedResult<KycCheckResponse>', '+ SetLockedAsync(id, locked, reason): AdminUserResponse', '+ ApproveExceptionAsync(id, reason): KycCheckResponse']),
        C('pps', 'PaymentProfileService', 'service', [...DEPS('db', 'me'), '- matcher: IBankNameMatcher', '- clock: TimeProvider'], ['+ GetPayoutAsync(ownerType): PayoutProfileResponse', '+ SavePayoutAsync(ownerType, req): PayoutProfileResponse', '+ ListAddressesAsync(): AddressResponse[]', '+ GetAddressAsync(addressId): AddressResponse', '+ SaveAddressAsync(addressId?, req): AddressResponse', '+ DeleteAddressAsync(addressId)', '- RequireOwnerAsync(type, forWrite): Owner']),
        C('aaw', 'AccountAuditWriter', 'static', [], ['~ Append(db, actorId, entityType, entityId, action, old, new, now, previousHash)']),
      ],
      [
        C('tok', 'TokenService', 'service', ['- options: JwtOptions (HS256, 480 min)'], ['+ Create(userId, email, name, roles, operatorId): (string, DateTimeOffset)']),
        C('lim', 'LoginAttemptLimiter', 'service', ['- windows: Dictionary (5 attempts / 15 min)'], ['+ Begin(email)', '+ Success(email)']),
        C('cu', 'CurrentUser', 'adapter', ['- http: IHttpContextAccessor'], ['+ IsInRole(role): bool', '+ RequireOperatorId(): long']),
        C('icu', 'ICurrentUser', 'port', ['+ UserId: long', '+ OperatorId: long?'], ['+ IsInRole(role): bool', '+ RequireOperatorId(): long']),
        C('iek', 'IEkycProvider', 'port', [], ['+ VerifyAsync(idCardFront, idCardBack, selfie): EkycResult']),
        C('ibn', 'IBankNameMatcher', 'port', [], ['+ MatchAsync(expectedName, holderName): BankNameMatchResult']),
        C('pap', 'PayoutAccountProtection', 'service', ['(DataProtection purpose PayoutAccount.AccountNo.v1)'], ['+ Protect(number): string', '+ Unprotect(stored): string', '+ Digest(bankCode, number): string']),
      ],
      [
        C('e_u', 'AppUser', 'entity', ['+ UserId: long', '+ Email: string (UNIQUE)', '+ PasswordHash: string', '+ Status: string {Active | Locked}', '+ Status: string {PendingVerification} (not written by code)', '+ LastLoginAt: DateTimeOffset?']),
        C('e_ur', 'AppUserRole', 'entity', ['+ UserId: long', '+ RoleCode: string {Investor | Customer | OperatorMember | PlatformAdmin | EvidenceReviewer}']),
        C('e_inv', 'Investor', 'entity', ['+ UserId: long', '+ InvestorKind: string {Individual | Organization}', '+ VerificationStatus: string {Unverified | Verified | Rejected}', '+ VerifiedAt: DateTimeOffset?']),
        C('e_kyc', 'KycCheck', 'entity', ['+ KycCheckId: long', '+ UserId: long', '+ CheckType: string {EkycIdFace | BankNameMatch | OtpDeclaration}', '+ Result: string {Passed | Failed | ExceptionApproved}', '+ ProviderRef: string?', '+ ConsentAt: DateTimeOffset?']),
        C('e_pa', 'PayoutAccount', 'entity', ['+ PayoutAccountId: long', '+ OwnerUserId: long?', '+ OwnerOperatorId: long?', '+ BankCode: string', '+ AccountNo: string (encrypted)', '+ AccountNoDigest: string?', '+ NameMatchStatus: string {Pending | Matched | Mismatched}', '+ Status: string {Active | Locked | Closed}']),
        C('e_addr', 'CustomerAddress', 'entity', ['+ AddressId: long', '+ CustomerId: long', '+ RecipientName: string', '+ AddressLine: string', '+ IsDefault: bool']),
      ],
    ],
    edges: [['ac', 'as', 'dep'], ['acc', 'acs', 'dep'], ['aac', 'aas', 'dep'], ['ppc', 'pps', 'dep'], ['as', 'tok', 'dep'], ['as', 'lim', 'dep'], ['acs', 'iek', 'dep'], ['pps', 'ibn', 'dep'], ['pps', 'aaw', 'dep'], ['pps', 'pap', 'dep', 'digest'], ['cu', 'icu', 'realize'], ['as', 'e_u', 'dep'], ['acs', 'e_inv', 'dep'], ['aas', 'e_u', 'dep', 'lock'], ['pps', 'e_pa', 'dep'], ['e_u', 'e_ur', 'compos', '1 ⟶ 1..*'], ['e_u', 'e_inv', 'assoc', '1 ⟶ 0..1'], ['e_u', 'e_kyc', 'assoc', '1 ⟶ *'], ['e_u', 'e_pa', 'assoc', '0..1 ⟶ *'], ['e_u', 'e_addr', 'assoc', '1 ⟶ *']],
    notes: 'JwtBearer OnTokenValidated reloads AppUser.Status and roles on every request, so a lock takes effect at once. eKYC stores only the result (TL-06). Accounts write audit rows on the same hash chain as IAuditLog. v1.4: the Customer role is a bulk buyer (restaurant, small trader); the Evidence Reviewer is a separate permission of a Platform Administrator. ERD names: AppUser = User, AppUserRole = UserRole, KycCheck = IdentityCheck, CustomerAddress = DeliveryAddress.',
  },
  {
    page: 'Evidence', status: 'modified', owner: 'Khôi', uc: 'UC45, UC47, UC48', was: '4.86',
    title: 'Class Diagram: Evidence module — live capture, crab detection module port, risk score, review, explanation, capture requests',
    groups: [
      [
        C('ec', 'EvidenceController', 'controller', ['- evidence: EvidenceService'], ['+ Upload(request): EvidenceResponse']),
        C('erc', 'EvidenceReviewController', 'controller', ['- reviews: EvidenceReviewService'], ['+ List(query, paging): PagedResult<ReviewEvidenceSummary>', '+ Get(id): ReviewEvidenceDetail', '+ Image(id): FileStreamResult', '+ Verdict(id, request): ReviewEvidenceDetail']),
        C('eec', 'EvidenceExplanationsController', 'controller', ['- evidence: EvidenceExplanationService'], ['+ List(filter, paging): PagedResult<OperatorEvidenceItem>', '+ Get(id): OperatorEvidenceItem', '+ Image(id): FileStreamResult', '+ Explain(id, request): OperatorEvidenceItem']),
        C('crc', 'CaptureRequestsController', 'controller', ['- requests: CaptureRequestService'], ['+ List(query, paging): PagedResult<CaptureRequestResponse>']),
        C('crw', 'CaptureRequestWorker', 'job', ['- timer: PeriodicTimer (5 min)'], ['# ExecuteAsync(ct)']),
      ],
      [
        C('es', 'EvidenceService', 'service', [...DEPS('db', 'me', 'clock', 'log'), '- access: EvidenceAccess', '- images: EvidenceImageProcessor', '- storage: IFileStorage', '- detector: ICrabDetector', '- options: IOptions<EvidenceOptions>'], ['+ UploadAsync(request): EvidenceResponse', '- Validate(request)', '- RequireContextAsync(request, receivedAt): CaptureContext', '- DuplicateAsync(image): string', '- DetectAsync(bytes): CrabDetectionResult']),
        C('ers', 'EvidenceReviewService', 'service', [...DEPS('db', 'me'), '- images: EvidenceImageReader', '- clock: TimeProvider'], ['+ ListAsync(filter, paging): PagedResult<ReviewEvidenceSummary>', '+ GetAsync(id): ReviewEvidenceDetail', '+ OpenImageAsync(id): EvidenceImageContent', '+ DecideAsync(id, request): ReviewEvidenceDetail', '- RequireReviewerAsync()', '- RequireAccessAsync(id)', '- CanReview(evidence, mine): bool']),
        C('ees', 'EvidenceExplanationService', 'service', [...DEPS('db'), '- access: EvidenceAccess', '- me: ICurrentUser', '- images: EvidenceImageReader', '- clock: TimeProvider'], ['+ ListAsync(filter, paging): PagedResult<OperatorEvidenceItem>', '+ GetAsync(id): OperatorEvidenceItem', '+ OpenImageAsync(id): EvidenceImageContent', '+ ExplainAsync(id, request): OperatorEvidenceItem']),
        C('crs', 'CaptureRequestService', 'service', [...DEPS('db'), '- access: EvidenceAccess'], ['+ ListAsync(filter, paging): PagedResult<CaptureRequestResponse>']),
        C('crj', 'CaptureRequestJob', 'job', [...DEPS('db'), '- alerts: AlertService', '- options: IOptions<CaptureRequestOptions>', '- clock: TimeProvider'], ['+ RunAsync(): CaptureRequestJobResult']),
        C('ea', 'EvidenceAccess', 'service', DEPS('db', 'me'), ['+ RequireOperatorAsync(): long']),
      ],
      [
        C('eip', 'EvidenceImageProcessor', 'service', ['+ MaxImageBytes: int = 5 MB', '+ MaxPixels: long = 20 M'], ['+ ReadAsync(file): EvidenceImage', '+ Distance(a, b): int']),
        IMGREADER(),
        C('icd', 'ICrabDetector', 'port', [], ['+ DetectAsync(image): CrabDetectionResult']),
        C('noop', 'NoopCrabDetector', 'adapter', [], ['+ DetectAsync(image): CrabDetectionResult']),
        C('cdm', 'CrabDetectionModule', 'adapter', ['(crab-presence check on the box photo)'], ['+ DetectAsync(image): CrabDetectionResult'], P),
        FILESTORE(),
      ],
      [
        C('e_ev', 'Evidence', 'entity', ['+ EvidenceId: long', '+ BatchId: long', '+ SlotId: long?', '+ CaptureRequestId: long?', '+ MediaType: string {Photo}', '+ MediaType: string {Video | Invoice} (not written by code)', '+ Source: string {InAppCapture}', '+ Source: string {FarmApi | DocumentUpload} (not written by code)', '+ Sha256: string', '+ PerceptualHash: string?', '+ CapturedAt / ReceivedAt: DateTimeOffset', '+ Latitude / Longitude: decimal?', '+ RiskScore: decimal?', '+ ReviewStatus: string {Accepted | Watch | Flagged | Rejected}']),
        C('e_det', 'EvidenceDetection', 'entity', ['+ DetectionId: long', '+ EvidenceId: long', '+ ModelVersion: string', '+ CrabDetected: bool?', '+ Confidence: decimal?']),
        C('e_rev', 'EvidenceReview', 'entity', ['+ EvidenceReviewId: long', '+ EvidenceId: long', '+ ReviewerId: long', '+ Verdict: string {Pass | Fail | NeedMoreEvidence}']),
        C('e_cr', 'CaptureRequest', 'entity', ['+ CaptureRequestId: long', '+ BatchId: long', '+ SlotId: long', '+ DueAt: DateTimeOffset', '+ Status: string {Open | Fulfilled | Expired}']),
      ],
    ],
    edges: [['ec', 'es', 'dep'], ['erc', 'ers', 'dep'], ['eec', 'ees', 'dep'], ['crc', 'crs', 'dep'], ['crw', 'crj', 'dep'], ['es', 'ea', 'dep'], ['es', 'eip', 'dep'], ['es', 'icd', 'dep'], ['es', 'ifs', 'dep'], ['ers', 'eir', 'dep'], ['ees', 'eir', 'dep'], ['eir', 'ifs', 'dep'], ['noop', 'icd', 'realize'], ['cdm', 'icd', '~realize'], ['es', 'e_ev', 'dep', 'creates'], ['ers', 'e_rev', 'dep', 'upserts'], ['crj', 'e_cr', 'dep', 'creates'], ['e_ev', 'e_det', 'compos', '1 ⟶ 0..1'], ['e_ev', 'e_rev', 'compos', '1 ⟶ *'], ['e_cr', 'e_ev', 'assoc', '0..1 ⟶ *']],
    notes: 'The crab detection module only checks whether a crab is present in the box photo. It sits behind the replaceable ICrabDetector port and its weight in the risk score is capped (≤ 15), so detection never rejects evidence alone; a risk score routes doubtful evidence to the human Evidence Reviewer. develop @ 420a379 wires NoopCrabDetector (no conclusion); the trained module is «planned». Removed in v1.4 (still in code): the tagCode path of UploadAsync and Evidence.CrabItemId (V017) used for tag activation. ERD name: EvidenceDetection = CrabDetection.',
  },
  {
    page: 'Alerts, Portfolio & Admin', status: 'modified', owner: 'Khôi', uc: 'UC16, UC19, UC20, UC42, UC43', was: '4.87',
    title: 'Class Diagram: Alerts, Portfolio / Notifications and Admin (dashboards, audit log) modules',
    groups: [
      [
        C('alc', 'AlertsController', 'controller', ['- alerts: AlertService'], ['+ Mine(filter): AlertResponse[]', '+ Batch(code, filter): AlertResponse[]', '+ Acknowledge(id, request): AlertResponse']),
        C('aac', 'AdminAlertsController', 'controller', ['- alerts: AlertService'], ['+ List(filter, paging): PagedResult<AlertResponse>', '+ Resolve(id, request): AlertResponse']),
        C('ajw', 'AlertJobWorker', 'job', ['- timer: PeriodicTimer (15 min)'], ['# ExecuteAsync(ct)']),
        C('pc', 'PortfolioController', 'controller', ['- portfolio: PortfolioService'], ['+ List(filter, paging): PortfolioPage', '+ Get(batchCode): PortfolioDetail']),
        C('nc', 'NotificationsController', 'controller', ['- notifications: NotificationService'], ['+ List(query, paging): NotificationPage']),
        C('adc', 'AdminDashboardController', 'controller', ['- dashboard: DashboardService'], ['+ Get(query): AdminDashboardResponse', '+ Report(name, query): FileContentResult']),
        C('odc', 'OperatorDashboardController', 'controller', ['- dashboard: DashboardService'], ['+ Get(query): OperatorDashboardResponse']),
        C('auc', 'AuditLogController', 'controller', ['- audit: AuditLogQueryService'], ['+ List(query, paging): AuditLogPage', '+ Export(query): FileContentResult']),
      ],
      [
        C('al', 'AlertService', 'service', DEPS('db', 'me', 'clock'), ['+ RaiseAsync(batchId, type, severity, message, ackWithin): AlertResponse', '+ ListMineAsync(status): AlertResponse[]', '+ ListInvestorAsync(code, status): AlertResponse[]', '+ ListAdminAsync(filter, paging): PagedResult<AlertResponse>', '+ AcknowledgeAsync(id, note): AlertResponse', '+ ResolveAsync(id, note): AlertResponse', '~ TransactionAsync(action): T', '~ Escalate(alert, previous, now)']),
        C('aj', 'AlertJob', 'job', [...DEPS('db', 'clock'), '- alerts: AlertService', '- options: IOptions<AlertJobOptions>'], ['+ RunAsync(): int']),
        C('ps', 'PortfolioService', 'service', DEPS('db', 'me', 'clock'), ['+ ListAsync(filter, paging): PortfolioPage', '+ GetAsync(code): PortfolioDetail', '- RequireInvestorAsync()', '- PositionsAsync(code): Dictionary<long, Position>']),
        C('ns', 'NotificationService', 'service', DEPS('db', 'me', 'clock'), ['+ ListAsync(filter, paging): NotificationPage']),
        C('ds', 'DashboardService', 'service', DEPS('db', 'me', 'clock'), ['+ AdminAsync(query): AdminDashboardResponse', '+ OperatorAsync(query): OperatorDashboardResponse', '+ ReportAsync(name, query): byte[]', '- RequireAdminAsync()']),
        C('aqs', 'AuditLogQueryService', 'service', [...DEPS('db', 'me'), '- audit: IAuditLog', '+ ExportLimit: int = 5000'], ['+ ListAsync(query, paging): AuditLogPage', '+ ExportAsync(query): AuditLogExport', '- BoundaryAsync(requested): long', '- Filtered(query, boundary): IQueryable<AuditLog>', '- VerifyAsync(boundary): AuditChainResult']),
        C('csv', 'CsvExport', 'static', [], ['+ Encode(rows): byte[]']),
      ],
      [
        C('ial', 'IAuditLog', 'port', [], ['+ VerifyChainAsync(fromAuditId, toAuditId): AuditChainResult']),
      ],
      [
        C('e_al', 'Alert', 'entity', ['+ AlertId: long', '+ BatchId: long', '+ AlertType: string {Mortality | MilestoneDelay | DataSilence | EvidenceFlag}', '+ AlertType: string {FinalOrderDue} «planned»', '+ Severity: string {Low | Medium | High | Critical}', '+ AckDeadline: DateTimeOffset', '+ Status: string {Open | Acknowledged | Escalated | Resolved}']),
        C('e_vp', 'VInvestorPortfolio', 'entity', ['«view» v_investor_portfolio', '+ InvestorId: long', '+ BatchId: long', '+ ConfirmedAmount: decimal', '+ CapitalRatio: decimal?', '+ NetPayout: decimal?']),
        C('e_audit', 'AuditLog', 'entity', ['+ AuditId: long', '+ EntityType: string', '+ EntityId: long', '+ ActionType: string', '+ OccurredAt: DateTimeOffset', '+ PrevHash: string?', '+ RowHash: string']),
      ],
    ],
    edges: [['alc', 'al', 'dep'], ['aac', 'al', 'dep'], ['ajw', 'aj', 'dep'], ['aj', 'al', 'dep'], ['pc', 'ps', 'dep'], ['nc', 'ns', 'dep'], ['adc', 'ds', 'dep'], ['odc', 'ds', 'dep'], ['auc', 'aqs', 'dep'], ['ds', 'csv', 'dep'], ['aqs', 'csv', 'dep'], ['aqs', 'ial', 'dep', 'verifies'], ['al', 'e_al', 'dep'], ['ps', 'e_vp', 'dep', 'reads'], ['aqs', 'e_audit', 'dep', 'reads']],
    notes: 'Portfolio, Notifications, Dashboard and AuditLogQuery are read-only (Serializable reads, no audit writes); no expected return or yield is ever shown (BR-49). Alerts write audit rows on the shared hash chain. Removed in v1.4 (still in code): IAlertRaiser / AlertServiceRaiser and the LowStock alert type (Catalog only); the WaterQuality alert type raised by ProductionLogService (TL-22 dropped alerts on environmental measurements). ERD name: AuditLog = AuditRecord.',
  },
  {
    page: 'Cross-cutting infrastructure', status: 'modified', owner: 'Khôi / Thiện', uc: 'all', was: '4.88',
    title: 'Class Diagram: Common and Infrastructure — audit hash chain, persistence, jobs, security, ports and adapters',
    groups: [
      [
        C('ial', 'IAuditLog', 'port', [], ['+ LockAsync()', '+ WriteAsync(entityType, entityId, action, old, new, occurredAt?)', '+ VerifyChainAsync(fromAuditId, toAuditId): AuditChainResult']),
        C('als', 'AuditLogService', 'adapter', DEPS('db', 'me', 'clock'), ['+ LockAsync()', '+ WriteAsync(entityType, entityId, action, old, new, occurredAt?)', '+ VerifyChainAsync(fromAuditId, toAuditId): AuditChainResult']),
        C('ach', 'AuditChain', 'static', [], ['+ Snapshot(value): string', '+ Timestamp(value): DateTimeOffset', '+ LockAndReadTailAsync(db): string?', '+ Hash(row): string', '+ VerifyHash(row): bool']),
        C('acv', 'AuditChainVerifier', 'static', [], ['+ Verify(rows, previousRowHash?): AuditChainResult']),
        C('acj', 'AuditChainCheckJob', 'job', ['# Interval: TimeSpan = 6 h'], ['# RunAsync(services, ct)']),
        C('rj', 'RecurringJob', 'job', ['# Interval: TimeSpan {abstract}', '- enabled: bool (Jobs:Enabled)'], ['# RunAsync(services, ct) {abstract}', '+ RunOnceAsync(ct)', '# ExecuteAsync(ct)'], { abstract: true }),
      ],
      [
        C('dbc', 'AppDbContext', 'persistence', ['+ Batches, Contributions, SalesOrders, …: DbSet<T> (69 sets: 60 tables, 9 views)', '+ PayoutProtection: PayoutAccountProtection'], ['+ Set<TEntity>(): DbSet<TEntity>', '+ Add(entity): EntityEntry', '+ AddRange(entities)', '+ Remove(entity): EntityEntry', '+ RemoveRange(entities)', '+ SaveChangesAsync(): int', '+ Entry(entity): EntityEntry', '+ Database.BeginTransactionAsync(isolation): IDbContextTransaction', '+ Database.ExecuteSqlInterpolatedAsync(sql): int', '+ Database.GetDbConnection(): DbConnection', '~ InTransactionAsync(work, isolation): T', '+ DbSet.FromSqlInterpolated(sql): IQueryable<T>', '+ IQueryable.Where(predicate): IQueryable<T>', '+ IQueryable.Include(path): IQueryable<T>', '+ IQueryable.AnyAsync(predicate): bool', '+ IQueryable.CountAsync(predicate): int', '+ IQueryable.SumAsync(selector): decimal', '+ IQueryable.SingleAsync(predicate): T', '+ IQueryable.SingleOrDefaultAsync(predicate): T?', '+ IQueryable.FirstOrDefaultAsync(predicate): T?', '+ IQueryable.ToListAsync(): List<T>', '+ IQueryable.ToPagedAsync(paging): PagedResult<T>', '+ IQueryable.ExecuteUpdateAsync(setters): int']),
        C('icu', 'ICurrentUser', 'port', ['+ IsAuthenticated: bool', '+ UserId: long', '+ OperatorId: long?'], ['+ IsInRole(role): bool', '+ RequireOperatorId(): long']),
        C('cu', 'CurrentUser', 'adapter', ['- http: IHttpContextAccessor'], ['+ IsInRole(role): bool', '+ RequireOperatorId(): long']),
      ],
      [
        C('aus', 'AuthSetup', 'static', ['+ Policies: Admin, Operator, Investor, Customer, Reviewer'], ['+ AddAppAuth(services, config)']),
        C('sec', 'SecuritySetup', 'static', [], ['+ AddAppSecurity(services, config)', '+ UseAppSecurity(app)']),
        C('tx', 'TransactionExtensions', 'static', [], ['+ InTransactionAsync(db, work, ct, isolation)']),
        C('geh', 'GlobalExceptionHandler', 'adapter', [], ['+ TryHandleAsync(context, exception): bool']),
        C('exc', 'AppException', 'record', ['+ Status: int', '+ Code: string', '+ Details: object?'], []),
        C('di', 'FeatureRegistry', 'static', [], ['+ AddFeatureServices(services)']),
      ],
      [
        C('igw', 'IPaymentGateway', 'port', [], ['+ CreateVietQrAsync(request): VietQrPayment', '+ SendPayoutAsync(request): PayoutResult']),
        C('fgw', 'FakePaymentGateway', 'adapter', [], ['+ CreateVietQrAsync(request): VietQrPayment', '+ SendPayoutAsync(request): PayoutResult']),
        C('ids', 'IDigitalSigningService', 'port', [], ['+ SignAsync(pdf, signerName, signerRole): SignedDocument']),
        C('iek', 'IEkycProvider', 'port', [], ['+ VerifyAsync(idCardFront, idCardBack, selfie): EkycResult']),
        C('icd', 'ICrabDetector', 'port', [], ['+ DetectAsync(image): CrabDetectionResult']),
        C('ifs', 'IFileStorage', 'port', [], ['+ SaveAsync(stream, fileName, contentType, folder): StoredFile', '+ OpenReadAsync(uri): Stream', '+ DeleteAsync(uri)']),
        C('lfs', 'LocalFileStorage', 'adapter', [], ['+ SaveAsync(stream, fileName, contentType, folder): StoredFile']),
        C('cfs', 'CloudinaryFileStorage', 'adapter', [], ['+ SaveAsync(stream, fileName, contentType, folder): StoredFile']),
      ],
    ],
    edges: [['als', 'ial', 'realize'], ['als', 'ach', 'dep'], ['als', 'acv', 'dep'], ['als', 'dbc', 'dep'], ['acj', 'rj', 'general'], ['acj', 'ial', 'dep'], ['cu', 'icu', 'realize'], ['tx', 'dbc', 'dep', 'extends'], ['geh', 'exc', 'dep', 'maps'], ['fgw', 'igw', 'realize'], ['lfs', 'ifs', 'realize'], ['cfs', 'ifs', 'realize']],
    notes: 'Every external system sits behind an interface; Development and the demo use sandbox or fake adapters (no real money, signing or eKYC). In the Sequence Diagrams the «persistence» lifeline is AppDbContext and every message to it is one of the EF Core operations listed here (Set<T>() queries, Add, SaveChangesAsync, ExecuteUpdateAsync…), with the effect in a short comment. All audit writers share one TABLOCKX-serialised hash chain (TL-08). GlobalExceptionHandler maps AppException to ProblemDetails (404, 403, 409, 422). Removed in v1.4 (still in code): IAlertRaiser / AlertServiceRaiser (Catalog only).',
  },
];

// CL-03 / UML: mỗi thuộc tính một dòng — tách dòng gộp "+ A / B / C: Type" thành ba dòng cùng kiểu.
for (const dg of DIAGRAMS) for (const g of dg.groups) for (const c of g) c.attrs = c.attrs.flatMap(a => { const m = a.match(/^([+\-#~]) (\w+(?: \/ \w+)+): (.+)$/); return m ? m[2].split(' / ').map(n => `${m[1]} ${n}: ${m[3]}`) : [a]; });

// Mục bị bỏ theo phiếu v1.4 nhưng code vẫn còn — ghi ở trang Index.
const REMOVED = [
  ['4.81', 'Catalog module (UC24 listings, UC25 store)', 'ListingsController, OperatorListingsController, AdminListingsController, CatalogService, PriceAnomaly, ListingModerationService, LowStockMonitor, LowStockOptions; ProductListing, PriceHistory, PriceCheck'],
  ['4.84', 'Offtake module (UC13 commitment, UC23 claim window of PR #72)', 'OfftakeController, OfftakeService, OfftakeDepositHandler (and the unmerged OfftakeClaimService, OfftakeWindowService, OfftakeWindowJob, OfftakePaymentHandler); OfftakeCommitment, BatchOfftakePrice (VBatchCommitmentCap stays: the pre-order cap reads it, page Orders – pre-order & deposit)'],
  ['part of 4.80', 'Crab tags and tag trace (UC46, UC33 by tag)', 'TagsController, TagsService, IHarvestTagCodeGenerator / HarvestTagCodeGenerator, TraceService.GetAsync(tag); CrabTag, TagScan, v_traceability; HarvestRecord.TagId / TagCode / TagStatus'],
  ['part of 4.82', 'Cart and retail checkout (UC26)', 'OrdersController, OrderService, OrderPaymentHandler, OrderLine, StockReservation, StockRelease; PreorderBalanceJob / PreorderBalanceService (balance at harvest); PlacePreorderRequest.ListingId'],
  ['part of 4.83', 'Packing by tag scan', 'OrderPackingService.PackAsync(orderNo, tagCodes), ExtractTagCode; CrabItem.OrderLineId'],
  ['part of 4.87 / 4.88', 'Low-stock alerts', 'IAlertRaiser, AlertServiceRaiser, AlertType.LowStock'],
  ['part of 4.79', 'Water-quality thresholds (UC17)', 'ProductionThresholdVersion; ProductionLogsController.Thresholds / Configure; ProductionLogService.ThresholdsAsync / ConfigureAsync / Violations; ProductionLog.Ph / WaterTempC / SalinityPpt / ThresholdVersionId; AlertType.WaterQuality'],
];

// ---------- Vẽ ----------
const W = 340, GAP = 130, TOP = 84, VGAP = 34, X0 = 40;
const CHAR = 6.15; // bề rộng trung bình một ký tự 11px Segoe UI (chỉ dùng cho ô Notes / Legend)
const GREY = '#64748b', ORANGE = '#c2410c';
const PLANNED_COL = `strokeColor=${GREY};fontColor=${GREY};`;
const MEMBER = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=6;spacingRight=4;spacingTop=1;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=11;html=1;whiteSpace=wrap;fontFamily=Segoe UI;';
const STATUS = { kept: 'kept — refreshed against code', modified: 'modified for v1.4', new: 'new «planned»' };
const plain = (t) => t.replace(/<[^>]+>/g, '');
// Chữ trong ô là HTML: phải escape < > & để kiểu generic (PagedResult<BoxResponse>, Set<TEntity>) không bị trình duyệt nuốt mất.
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Bề rộng từng ký tự Segoe UI 11px (đo bằng canvas.measureText trong Chrome, 05/11/2026) trên chữ thô (chưa phải HTML), dùng để tính số dòng
// khi chữ tự xuống dòng trong ô và bề rộng nhãn cạnh; cộng 1,5 % dự phòng để dòng không bị cắt (ô có overflow=hidden; vùng chữ thực tế 328 px, tính 326 px).
const CW = { ' ': 3.01, a: 5.6, b: 6.47, c: 5.08, d: 6.48, e: 5.75, f: 3.44, g: 6.48, h: 6.23, i: 2.66, j: 2.66, k: 5.47, l: 2.66, m: 9.47, n: 6.23, o: 6.45, p: 6.47, q: 6.48, r: 3.82, s: 4.67, t: 3.73, u: 6.23, v: 5.27, w: 7.95, x: 5.05, y: 5.32, z: 4.97, A: 7.1, B: 6.31, C: 6.81, D: 7.71, E: 5.56, F: 5.37, G: 7.55, H: 7.81, I: 2.93, J: 3.93, K: 6.38, L: 5.18, M: 9.88, N: 8.23, O: 8.29, P: 6.16, Q: 8.29, R: 6.58, S: 5.84, T: 5.76, U: 7.56, V: 6.83, W: 10.27, X: 6.49, Y: 6.08, Z: 6.27, '.': 2.38, ',': 2.38, ':': 2.38, ';': 2.38, '|': 2.63, '!': 3.13, "'": 2.53, '(': 3.32, ')': 3.32, '[': 3.32, ']': 3.32, '{': 3.32, '}': 3.32, '-': 4.4, '/': 4.29, '"': 4.31, '?': 4.93, '«': 5.56, '»': 5.56, '*': 4.59, '+': 7.52, '=': 7.52, '<': 7.52, '>': 7.52, '~': 7.52, '_': 4.57, '#': 6.5, '@': 10.51, '%': 9, '&': 8.8, '…': 8.06, '⟶': 12.97, '—': 11, '–': 5.5, '·': 2.38, '×': 7.52, '≥': 7.54, '≤': 7.54, '→': 9.49 };
const cw = (ch) => CW[ch] ?? (/[0-9]/.test(ch) ? 5.93 : 6.6);
const tw = (s) => [...String(s)].reduce((w, ch) => w + cw(ch), 0) * 1.015;
// số dòng khi trình duyệt ngắt theo từ (greedy) trong bề rộng width
const lines = (t, width, scale = 1) => {
  let n = 1, cur = 0;
  for (const word of String(t).split(/(?<= )/)) {
    const w = tw(word) * scale;
    if (cur + tw(word.trimEnd()) * scale <= width) { cur += w; continue; }
    n += cur > 0 ? 1 : 0; cur = w;
    while (cur > width) { n++; cur -= width; }
  }
  return n;
};
const fmtRow = (t) => /«planned»/.test(t) ? `<font color="${GREY}"><i>${escH(t)}</i></font>` : /\(not written by code\)/.test(t) ? `<font color="${ORANGE}"><i>${escH(t)}</i></font>` : /\{abstract\}/.test(t) ? `<i>${escH(t)}</i>` : escH(t);
// thành phần của lớp «static» (lớp static của C#: mọi thành phần đều static) được gạch chân theo UML
const fmtMember = (c, t) => c.stereo === 'static' ? `<u>${fmtRow(t)}</u>` : fmtRow(t);
const colX = (i) => X0 + i * (W + GAP);

function caption(d, fig, title, meta, w = 1800) {
  d.text(`<b>${fig} – ${title}</b><br><font style="font-size:11px" color="${GREY}">${meta}</font>`, 20, 10, w, 56, 'fontSize=15;');
}

/** Hộp lớp: header (stereotype + tên + tên ERD), các dòng thuộc tính và operation, chiều cao dòng theo độ dài chữ. */
function classBox(d, c, x, y) {
  const erd = c.stereo === 'entity' && ERD_NAME[c.name] ? `<br><font style="font-size:11px" color="${GREY}">ERD: ${ERD_NAME[c.name]}</font>` : '';
  const stereo = (STEREO[c.stereo] ?? '«service»') + (c.planned ? ' «planned»' : '');
  const name0 = c.abstract ? `<i>${c.name}</i>` : c.name; // lớp trừu tượng: tên in nghiêng
  const name = c.planned ? `<font color="${GREY}">${name0}</font>` : name0;
  const title = `<font style="font-size:11px" color="${GREY}">${stereo}</font><br><b style="font-size:13px">${name}</b>${erd}`;
  const header = 44 + (erd ? 14 : 0) + (lines(c.name, W - 20, 13 / 11 * 1.08) - 1) * 16;
  const rows = [...c.attrs.map(t => ({ t })), ...(c.attrs.length && c.ops.length ? [{ sep: true }] : []), ...c.ops.map(t => ({ t }))];
  const hs = rows.map(r => r.sep ? 8 : 5 + 15 * lines(r.t, W - 14));
  const total = header + hs.reduce((a, b) => a + b, 0) + 6;
  const style = S.cls.replace('startSize=26', `startSize=${header}`).replace('fontSize=12', 'fontSize=13') + `fillColor=${c.planned ? '#f8fafc' : (FILL[c.stereo] ?? '#ffffff')};` + (c.planned ? `dashed=1;${PLANNED_COL}` : '');
  d.vertex(title, style, x, y, W, total, { key: c.id, raw: true });
  let yy = header;
  rows.forEach((r, k) => {
    if (r.sep) d.vertex('', S.attrSep, 0, yy, W, 8, { parent: c.id });
    else d.vertex(fmtMember(c, r.t), MEMBER, 0, yy, W, hs[k], { parent: c.id, raw: true });
    yy += hs[k];
  });
  return total;
}

// Đường nối tự dẫn: ra ở cạnh trái/phải của hộp, đi dọc trong khe giữa hai cột, đi ngang ở hành lang trống giữa các hộp.
const LANES = [0, -14, 14, -28, 28, -42, 42];
function routeEdges(d, dg, boxes, colBoxes) {
  const ncol = dg.groups.length;
  const laneUse = {}; const corridorUse = {};
  const gapCenter = (c) => colX(c) + W + GAP / 2; // khe bên phải cột c
  const gaps = Array.from({ length: ncol }, (_, c) => gapCenter(c));
  const placed = []; // nhãn đã đặt trên trang
  const rects = Object.values(boxes).map(r => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }));
  const lane = (c) => { const n = laneUse[c] = (laneUse[c] ?? -1) + 1; return gapCenter(c) + LANES[n % LANES.length]; };
  const plans = dg.edges.map(([a, b, kindRaw, label]) => {
    const A = boxes[a], B = boxes[b];
    if (!A || !B) throw new Error(`${dg.page}: edge ${a} → ${b} has no box`);
    const sa = A.col <= B.col ? 'R' : 'L', sb = A.col < B.col ? 'L' : 'R';
    return { a, b, A, B, sa, sb, kindRaw, label };
  });
  // chia điểm nối dọc cạnh hộp cho các đường cùng một cạnh
  const side = {};
  for (const p of plans) { (side[p.a + p.sa] ??= []).push([p, 0]); (side[p.b + p.sb] ??= []).push([p, 1]); }
  for (const list of Object.values(side)) {
    const box = list[0][1] ? list[0][0].B : list[0][0].A;
    list.sort((u, v) => (u[1] ? u[0].A : u[0].B).y - (v[1] ? v[0].A : v[0].B).y);
    const top = box.y + Math.min(box.h * 0.5, 30), bottom = box.y + box.h - 14;
    list.forEach(([p, end], k) => { const yy = list.length === 1 ? box.y + Math.min(box.h / 2, 46) : top + (bottom - top) * (k + 0.5) / list.length; if (end) p.yb = yy; else p.ya = yy; });
  }
  const free = (c, y) => colBoxes[c].every(r => y < r.y - 8 || y > r.y + r.h + 8);
  for (const p of plans) {
    const { A, B } = p;
    const x0 = p.sa === 'R' ? A.x + W : A.x, x1 = p.sb === 'R' ? B.x + W : B.x;
    let pts, labelSeg;
    if (A.col === B.col) { const lx = lane(A.col); pts = [[lx, p.ya], [lx, p.yb]]; labelSeg = 1; }
    else if (Math.abs(A.col - B.col) === 1) { const lx = lane(Math.min(A.col, B.col)); pts = [[lx, p.ya], [lx, p.yb]]; labelSeg = 1; }
    else {
      const lo = Math.min(A.col, B.col), hi = Math.max(A.col, B.col);
      const mids = []; for (let c = lo + 1; c < hi; c++) mids.push(c);
      const cands = [];
      for (const c of mids) {
        const bs = [...colBoxes[c]].sort((u, v) => u.y - v.y);
        cands.push(TOP - 14);
        for (let k = 0; k + 1 < bs.length; k++) cands.push((bs[k].y + bs[k].h + bs[k + 1].y) / 2);
        if (bs.length) cands.push(bs[bs.length - 1].y + bs[bs.length - 1].h + 20);
      }
      const want = (p.ya + p.yb) / 2;
      let best = null;
      for (const y0 of cands) {
        for (const off of [0, 5, -5, 10, -10]) {
          const y = y0 + off; const key = Math.round(y);
          if (corridorUse[key] || !mids.every(c => free(c, y))) continue;
          if (best === null || Math.abs(y - want) < Math.abs(best - want)) best = y;
          break;
        }
      }
      if (best === null) best = Math.max(...mids.map(c => colBoxes[c].reduce((m, r) => Math.max(m, r.y + r.h), 0))) + 24 + 8 * Object.keys(corridorUse).length;
      corridorUse[Math.round(best)] = true;
      const l1 = A.col < B.col ? lane(A.col) : lane(A.col - 1);
      const l2 = A.col < B.col ? lane(B.col - 1) : lane(B.col);
      pts = [[l1, p.ya], [l1, best], [l2, best], [l2, p.yb]]; labelSeg = 2;
    }
    const all = [[x0, p.ya], ...pts, [x1, p.yb]];
    const seg = all.slice(1).map((q, k) => Math.abs(q[0] - all[k][0]) + Math.abs(q[1] - all[k][1]));
    const L = seg.reduce((s, v) => s + v, 0) || 1;
    // bản số ở hai đầu: ghi chỗ chiếm để nhãn giữa tránh ra
    const at = (dist) => { let r = dist; for (let k = 0; k < seg.length; k++) { if (r <= seg[k] || k === seg.length - 1) { const t = seg[k] ? Math.min(1, r / seg[k]) : 0; return [all[k][0] + (all[k + 1][0] - all[k][0]) * t, all[k][1] + (all[k + 1][1] - all[k][1]) * t]; } r -= seg[k]; } return all[0]; };
    if (/⟶/.test(p.label ?? '')) for (const dist of [30, L - 30]) { const [mx, my] = at(Math.max(0, Math.min(L, dist))); placed.push({ x: mx - 14, y: my - 18, w: 28, h: 15 }); }
    const label = edgeText(p);
    const pos = label.text ? placeLabel(all, seg, L, labelSeg, label.parts) : { relX: 0, dx: 0, dy: 0 };
    writeEdge(d, p, all, L, pos, label);
  }

  // Nhãn giữa: trên đoạn dọc thì nằm trong khe giữa hai cột và vẫn đè lên đường của mình; trên hành lang ngang thì
  // trượt dọc theo hành lang; tránh nhãn khác và tránh hộp lớp. Trả về vị trí tương đối trên đường + offset của draw.io.
  function placeLabel(all, seg, L, k, parts) {
    const w = Math.max(...parts.map(tw)) + 10, h = 15 * parts.length + 2;
    const [p, q] = [all[k], all[k + 1]];
    const before = seg.slice(0, k).reduce((s, v) => s + v, 0);
    const vertical = Math.abs(p[0] - q[0]) < 0.5;
    const cands = [];
    if (vertical) {
      const gc = gaps.reduce((a, g) => Math.abs(g - p[0]) < Math.abs(a - p[0]) ? g : a, gaps[0]);
      const cx = Math.max(gc - GAP / 2 + w / 2 + 3, Math.min(gc + GAP / 2 - w / 2 - 3, p[0]));
      const y1 = Math.min(p[1], q[1]), y2 = Math.max(p[1], q[1]), mid = (y1 + y2) / 2;
      for (let n = 0; n < 60; n++) { const y = mid + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 9; if (y >= y1 - 8 && y <= y2 + 8) cands.push([cx, y]); }
      if (!cands.length) cands.push([cx, mid]);
    } else {
      const x1 = Math.min(p[0], q[0]), x2 = Math.max(p[0], q[0]), mid = (x1 + x2) / 2;
      for (let n = 0; n < 80; n++) { const x = mid + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 20; if (x - w / 2 >= x1 - 4 && x + w / 2 <= x2 + 4) cands.push([x, p[1]]); }
      if (!cands.length) cands.push([mid, p[1]]);
    }
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    let best = null;
    for (const [cx, cy] of cands) {
      const r = { x: cx - w / 2, y: cy - h / 2, w, h };
      const score = placed.filter(o => hit(r, o)).length * 10 + rects.filter(o => hit(r, o)).length;
      if (!best || score < best.score) best = { score, cx, cy, r };
      if (score === 0) break;
    }
    placed.push(best.r);
    let ax, ay, s;
    if (vertical) { ax = p[0]; ay = Math.max(Math.min(p[1], q[1]), Math.min(Math.max(p[1], q[1]), best.cy)); s = before + Math.abs(ay - p[1]); }
    else { ay = p[1]; ax = Math.max(Math.min(p[0], q[0]), Math.min(Math.max(p[0], q[0]), best.cx)); s = before + Math.abs(ax - p[0]); }
    return { relX: Math.max(-1, Math.min(1, 2 * s / L - 1)), dx: best.cx - ax, dy: best.cy - ay };
  }
}

// Nhãn cạnh: "A ⟶ B rest" → bản số ở hai đầu, phần còn lại là nhãn giữa; nhãn dài hơn khe thì xuống hai dòng.
function edgeText(p) {
  const planned = p.kindRaw.startsWith('~');
  let mult = null, text = p.label ?? '';
  const m = text.match(/^(\S+)\s*⟶\s*(\S+)\s*(.*)$/);
  if (m) { mult = [m[1], m[2]]; text = m[3]; }
  if (planned) text = text ? `${text} «planned»` : '«planned»';
  let parts = [text];
  if (text && tw(text) > GAP - 16) {
    const words = text.split(' ');
    let bestSplit = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const wmax = Math.max(tw(a), tw(b));
      if (!bestSplit || wmax < bestSplit.wmax) bestSplit = { wmax, parts: [a, b] };
    }
    if (bestSplit) parts = bestSplit.parts;
  }
  return { mult, text, parts };
}

function writeEdge(d, p, all, L, pos, label) {
  const planned = p.kindRaw.startsWith('~'); const kind = planned ? p.kindRaw.slice(1) : p.kindRaw;
  const entityEnds = p.A.c.stereo === 'entity' && p.B.c.stereo === 'entity';
  const k = (kind === 'assoc' && !entityEnds) ? 'dep' : kind; // CL-04: inject giữa dịch vụ = dependency
  const arrow = { dep: 'endArrow=open;endFill=0;dashed=1;', assoc: 'endArrow=none;', compos: 'startArrow=diamondThin;startFill=1;startSize=16;endArrow=none;', realize: 'endArrow=block;endFill=0;endSize=12;dashed=1;', general: 'endArrow=block;endFill=0;endSize=12;' }[k] ?? 'endArrow=open;endFill=0;dashed=1;';
  const ex = p.sa === 'R' ? 1 : 0, en = p.sb === 'R' ? 1 : 0;
  const ey = ((p.ya - p.A.y) / p.A.h).toFixed(4), ny = ((p.yb - p.B.y) / p.B.h).toFixed(4);
  const style = `html=1;edgeStyle=none;rounded=0;strokeColor=#334155;fontSize=11;fontFamily=Segoe UI;labelBackgroundColor=#ffffff;${arrow}exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${en};entryY=${ny};entryDx=0;entryDy=0;entryPerimeter=0;` + (planned ? `dashed=1;${PLANNED_COL}` : '');
  const { mult, text, parts } = label;
  const id = d.id();
  const pts = all.slice(1, -1).map(([x, y]) => `<mxPoint x="${Math.round(x)}" y="${Math.round(y)}"/>`).join('');
  const val = text ? escAttr(`<font style="font-size:11px">${parts.map(escH).join('<br>')}</font>`) : '';
  const offset = text && (Math.abs(pos.dx) > 0.5 || Math.abs(pos.dy) > 0.5) ? `<mxPoint x="${Math.round(pos.dx)}" y="${Math.round(pos.dy)}" as="offset"/>` : '';
  d.cells.push(`<mxCell id="${id}" value="${val}" style="${style}" edge="1" parent="1" source="${d.id(p.a)}" target="${d.id(p.b)}"><mxGeometry x="${pos.relX.toFixed(4)}" relative="1" as="geometry"><Array as="points">${pts}</Array>${offset}</mxGeometry></mxCell>`);
  if (mult) {
    const near = Math.min(0.9, 30 / L * 2);
    [[mult[0], -1 + near], [mult[1], 1 - near]].forEach(([t, x]) => {
      d.cells.push(`<mxCell id="${d.id()}" value="${escAttr(t)}" style="edgeLabel;html=1;align=center;verticalAlign=bottom;resizable=0;points=[];fontSize=11;fontFamily=Segoe UI;labelBackgroundColor=none;${planned ? `fontColor=${GREY};` : ''}" vertex="1" connectable="0" parent="${id}"><mxGeometry x="${x.toFixed(4)}" relative="1" as="geometry"><mxPoint as="offset" x="0" y="-3"/></mxGeometry></mxCell>`);
    });
  }
}
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Phân trang (G-01, brief §9.5 và quyết định đợt 2) ----------
// Mỗi phần phải đọc được khi in: thu vừa vùng in A4 ngang (931 × 605 px) mà chữ 11 px vẫn ≥ 5 pt, tức trang rộng
// ≤ 1536 px và cao ≤ 998 px. Một phần có tối đa 3 cột lớp (rộng 1320 px), mỗi cột cao ≤ HCAP. Cột gốc cao quá thì
// được chia khúc; lớp nằm ở phần khác mà có quan hệ với lớp trong phần này được vẽ thành hộp tham chiếu (chỉ tên).
const PART_COLS = 3, PART_TOP = 96, PAGE_BOTTOM = 1000, HCAP = PAGE_BOTTOM - 10 - PART_TOP, GHOST_H = 40;
function boxHeight(c) {
  const header = 44 + (c.stereo === 'entity' && ERD_NAME[c.name] ? 14 : 0) + (lines(c.name, W - 20, 13 / 11 * 1.08) - 1) * 16;
  const rows = [...c.attrs.map(t => ({ t })), ...(c.attrs.length && c.ops.length ? [{ sep: true }] : []), ...c.ops.map(t => ({ t }))];
  return header + rows.reduce((a, r) => a + (r.sep ? 8 : 5 + 15 * lines(r.t, W - 14)), 0) + 6;
}
// Nhóm áp dụng các quyết định thiết kế ngày 05/11/2026 thì Notes có thêm một dòng chuẩn "confirmed by the lead".
const DECISION = /RowAllocation|BoxRow|InvoicedSale|ForfeitResale|Forfeit|PreOrderRatio|MinPreOrderRatio|SurvivalRate|WeighedKg|funded boxes|ReleaseUnfundedRows|PreOrderQuota|PreOrderHold/;
const appliesDecisions = (dg) => DECISION.test([dg.notes, ...dg.groups.flat().flatMap(c => [c.name, ...c.attrs, ...c.ops])].join(' '));
const partNotes = (dg) => `<b>Notes</b> · use cases: ${dg.uc} · owner: ${dg.owner} · ${STATUS[dg.status]}<br>${escH(dg.notes)}` + (appliesDecisions(dg) ? '<br>Design decisions of 05/11/2026 applied here were confirmed by the lead.' : '');
const notesH = (html, w) => 24 + Math.ceil(tw(plain(html)) / (w - 16)) * 15;

// Xếp lớp theo thứ tự đọc (cột gốc từ trái sang phải, trên xuống dưới) vào các cột của từng phần, mỗi phần tối đa
// PART_COLS cột cao ≤ HCAP. Khi sang nhóm cột gốc mới mà cột đang xếp đã đầy quá nửa thì mở cột mới, để controller,
// service và entity vẫn tách lớp. Quan hệ sang phần khác chỉ vẽ một lần, ở phần chứa đầu nguồn, tới hộp tham chiếu.
function paginateClass(dg) {
  const h = new Map(); for (const g of dg.groups) for (const c of g) h.set(c.id, boxHeight(c));
  const byId = new Map(); for (const g of dg.groups) for (const c of g) byId.set(c.id, c);
  const nH = notesH(partNotes(dg), 900);
  for (let reserve = 0; ; reserve += 40) {
    const capC = HCAP - reserve;
    const parts = []; let part = null, col = null;
    const newCol = (oc) => { if (!part || part.length === PART_COLS) { part = []; parts.push(part); } col = { oc, cls: [], ghosts: [], used: 0 }; part.push(col); };
    dg.groups.forEach((g, oc) => {
      if (!col || col.used > capC * 0.5) newCol(oc);
      for (const c of g) {
        const add = h.get(c.id) + (col.cls.length ? VGAP : 0);
        if (col.cls.length && col.used + add > capC) newCol(oc);
        col.used += h.get(c.id) + (col.cls.length ? VGAP : 0); col.cls.push(c);
      }
    });
    const partOf = new Map(); parts.forEach((p, k) => p.forEach(cl => cl.cls.forEach(c => partOf.set(c.id, k))));
    for (const [a, b] of dg.edges) {
      const pa = partOf.get(a), pb = partOf.get(b);
      if (pa === undefined || pb === undefined) throw new Error(`${dg.page}: edge ${a} → ${b} has no class`);
      if (pa === pb) continue;
      const cols = parts[pa], c = byId.get(b);
      if (cols.some(cl => cl.ghosts.includes(c))) continue;
      const home = cols.find(cl => cl.cls.some(x => x.id === a));
      const free = (cl) => capC + reserve - (cl.used + (cl.ghosts.length + 1) * (GHOST_H + VGAP));
      const target = [...cols].sort((u, v) => free(v) - free(u))[0];
      (free(home) >= 0 ? home : target).ghosts.push(c);
    }
    const colH = (cl) => cl.used + cl.ghosts.length * (GHOST_H + VGAP);
    const ok = parts.every((p, k) => p.every(cl => colH(cl) <= (k === parts.length - 1 && p.length === PART_COLS ? HCAP - 20 - nH : HCAP)));
    if (ok || reserve > 500) return { parts, partOf };
  }
}

/** Hộp tham chiếu: lớp vẽ đầy đủ ở phần khác của cùng hình; chỉ có stereotype, tên và số phần. */
function ghostBox(d, c, key, x, y, where) {
  const stereo = (STEREO[c.stereo] ?? '«service»') + (c.planned ? ' «planned»' : '');
  const title = `<font style="font-size:11px" color="${GREY}">${stereo}</font> <b style="font-size:13px">${c.abstract ? `<i>${c.name}</i>` : c.name}</b><br><font style="font-size:11px" color="${GREY}">full class: ${where}</font>`;
  const style = `rounded=0;whiteSpace=wrap;html=1;fontFamily=Segoe UI;fontSize=13;verticalAlign=middle;fillColor=${FILL[c.stereo] ?? '#ffffff'};strokeColor=#94a3b8;` + (c.planned ? `dashed=1;fontColor=${GREY};` : '');
  d.vertex(title, style, x, y, W, GHOST_H, { key, raw: true });
}

function captionFit(d, fig, title, meta, w) {
  const tl = Math.ceil(tw(fig + ' – ' + title) * 15 / 11 * 1.1 / (w - 8)), ml = Math.ceil(tw(meta) / (w - 8));
  d.text(`<b>${fig} – ${title}</b><br><font style="font-size:11px" color="${GREY}">${meta}</font>`, 20, 10, w, Math.min(84, 8 + 19 * tl + 15 * ml), 'fontSize=15;');
}

function drawClass(f, dg, i, pag) {
  const { parts, partOf } = pag;
  const N = parts.length;
  const fig = `Figure 4.${FIG_BASE + i}`;
  parts.forEach((cols, k) => {
    // tên trang dùng "(k of N)" vì dấu "/" làm hỏng tên file khi xuất ảnh; caption ghi "(k/N)"
    const tag = N > 1 ? ` (${k + 1}/${N})` : '', pageTag = N > 1 ? ` (${k + 1} of ${N})` : '';
    const d = f.page(dg.page + pageTag);
    const boxes = {}, colBoxes = [];
    cols.forEach((col, ci) => {
      let y = PART_TOP; colBoxes[ci] = [];
      for (const c of col.cls) {
        const hh = classBox(d, c, colX(ci), y);
        const r = { x: colX(ci), y, w: W, h: hh, col: ci, c };
        boxes[c.id] = r; colBoxes[ci].push(r); y += hh + VGAP;
      }
      for (const c of col.ghosts) {
        const key = 'g_' + c.id;
        ghostBox(d, c, key, colX(ci), y, `part ${partOf.get(c.id) + 1}/${N}`);
        const r = { x: colX(ci), y, w: W, h: GHOST_H, col: ci, c };
        boxes[key] = r; colBoxes[ci].push(r); y += GHOST_H + VGAP;
      }
    });
    const idIn = (id) => partOf.get(id) === k ? id : 'g_' + id;
    const edges = dg.edges.filter(([a]) => partOf.get(a) === k).map(([a, b, kind, label]) => [a, idIn(b), kind, label]);
    routeEdges(d, { page: dg.page + pageTag, groups: cols.map(col => [...col.cls, ...col.ghosts]), edges }, boxes, colBoxes);
    const right = colX(Math.min(PART_COLS, cols.length + (k === N - 1 ? 1 : 0)) - 1) + W;
    const was = /^\d/.test(dg.was) ? 'was v2.0 Figure ' + dg.was : 'new for Register v1.4';
    captionFit(d, fig + tag, dg.title, `${VERSION} · UML 2.5 · classes as on develop @ 420a379 · ${STATUS[dg.status]} · ${was} · legend: Index page`, Math.max(900, right) - 20);
    if (k === N - 1) {
      const html = partNotes(dg);
      if (cols.length < PART_COLS) d.vertex(html, S.note + 'fontSize=11;', colX(cols.length), PART_TOP, W, notesH(html, W), { raw: true });
      else {
        const bottom = Math.max(...colBoxes.map(cb => cb.length ? cb[cb.length - 1].y + cb[cb.length - 1].h : PART_TOP));
        const w = right - X0;
        d.vertex(html, S.note + 'fontSize=11;', X0, bottom + 20, w, notesH(html, w), { raw: true });
      }
    }
  });
  return N;
}

const LEGEND = '<b>Legend</b> (every Class Diagram, Figure 4.' + FIG_BASE + '–4.' + (FIG_BASE + DIAGRAMS.length - 1) + ') — «controller» HTTP entry (boundary) · «service» application logic (control) · «interface» port · «adapter» implementation · «entity» EF Core entity (table or view), with the ERD entity name when it differs · «background job» hosted service · «record» request / result type. Attributes are fields or injected dependencies; operations are the public API and the private steps shown in the Sequence Diagrams.<br>Dashed open arrow = dependency (injected or used) · solid line with multiplicities = association · filled diamond on the whole = composition · dashed hollow triangle = realization · solid hollow triangle = generalization.<br>Grey dashed class, grey italic member or grey dashed line = «planned» (Register v1.4, not on develop @ 420a379) · orange italic = value allowed by the database but not written by code. Parts removed in v1.4 are listed only in the Notes.<br>Large groups are split into parts "(k/N)" with the same figure number so that each part stays readable when printed on A4; a box with a light grey border that shows only the name ("full class: part k/N") is a class drawn in full on that part of the same figure.';

function indexPages(f, nParts) {
  const last = FIG_BASE + DIAGRAMS.length - 1;
  const fig = `Figure 4.${FIG_BASE}–4.${last}`, Wd = 1480;
  const counts = { kept: 0, modified: 0, new: 0 };
  for (const dg of DIAGRAMS) counts[dg.status]++;
  const d1 = f.page('Index of figures (1 of 2)');
  captionFit(d1, 'Class Diagrams', `index of Figures 4.${FIG_BASE}–4.${last} (page 1 of 2) — ${DIAGRAMS.length} feature groups`, `${VERSION} · UML 2.5 · classes as on develop @ 420a379 (19 modules)`, Wd);
  const th = (t) => `<th align="left" style="padding:2px 8px;border-bottom:1px solid #94a3b8">${t}</th>`;
  const td = (t, extra = '') => `<td style="padding:2px 8px${extra}">${t}</td>`;
  const rows = DIAGRAMS.map((dg, i) => `<tr>${td('<b>4.' + (FIG_BASE + i) + '</b>')}${td(dg.page)}${td(dg.uc)}${td(String(nParts[i]))}${td(STATUS[dg.status], dg.status === 'new' ? ';color:' + GREY : '')}${td(dg.owner)}${td(dg.was)}</tr>`).join('');
  d1.text(`<table style="font-size:12px;border-collapse:collapse"><tr>${th('Figure')}${th('Feature group')}${th('Use cases')}${th('Parts')}${th('v1.4 status')}${th('Owner')}${th('Was (v2.0)')}</tr>${rows}</table>`, 20, 70, Wd, 34 + DIAGRAMS.length * 19);
  d1.vertex(LEGEND, S.legend + 'fontSize=11;', 20, 80 + DIAGRAMS.length * 19 + 30, Wd, notesH(LEGEND, Wd) + 20, { raw: true });
  const d2 = f.page('Index of figures (2 of 2)');
  captionFit(d2, 'Class Diagrams', `notes on Figures 4.${FIG_BASE}–4.${last} (page 2 of 2) — removed classes, conventions`, `${VERSION} · UML 2.5 · classes as on develop @ 420a379`, Wd);
  const total = nParts.reduce((a, b) => a + b, 0);
  const removed = REMOVED.map(r => `&nbsp;&nbsp;– ${r[1]} (${r[0].startsWith('part of ') ? 'part of v2.0 Figure ' + r[0].slice(8) : 'v2.0 Figure ' + r[0]}): ${r[2]}.`).join('<br>');
  const indexNote = `<b>Notes</b><br>• ${DIAGRAMS.length} feature groups on ${total} pages: ${counts.kept} kept (refreshed against code), ${counts.modified} modified for Register v1.4, ${counts.new} new «planned»; 2 groups of the v2.0 set removed (Catalog, Offtake).<br>• <b>Removed in v1.4 (still in code)</b> — classes not drawn any more; the code on develop @ 420a379 still has them:<br>${removed}<br>• Design decisions of 05/11/2026, confirmed by the lead: Batch opening condition (FundingCloseService), box rows (BoxRow, RowAllocation Held · Allocated · Released), deposit cases with UC55 Cancel Bulk Pre-order (DepositForfeitService, OrderCancellationService), survival rate and the Standard Cost of funded boxes (SettlementService), InvoicedSale (SalesOrder.OrderType, SaleReason, RevenueLine type); PreOrderQuota, PreOrderHold and Batch.SalesWindowDays «planned». Every page that applies them carries the line "Design decisions of 05/11/2026 applied here were confirmed by the lead."<br>• «planned» = required by Register v1.4 but not in the code yet: grey dashed class, grey italic attribute or operation, grey dashed line. Orange italic = value allowed by the database but not written by code. The physical ERD and the database script stay on the code (V001–V017).<br>• Every lifeline class and every message of the Sequence Diagrams (Figure 4.${SEQ_FIG_BASE}–4.${FIG_BASE - 1}) is a class and an operation here, including the EF Core operations of AppDbContext (checked when the generator runs). The Was column and every "v2.0 Figure" reference keep the old v2.0 numbers.`;
  const indexH = 24 + indexNote.split('<br>').reduce((a, l) => a + Math.ceil(tw(plain(l).replace(/&nbsp;/g, ' ')) * 12 / 11 / (Wd - 16)) * 16, 0);
  d2.vertex(indexNote, S.note + 'fontSize=12;', 20, 80, Wd, indexH, { raw: true });
}

// ---------- Kiểm tra nhất quán Sequence ↔ Class (Capstone v1.3 mục 08, 10) ----------
const DB_DIRECT = new Set(['Add', 'AddRange', 'Remove', 'RemoveRange', 'SaveChangesAsync', 'Entry', 'InTransactionAsync']);
const DB_FACADE = new Set(['BeginTransactionAsync', 'ExecuteSqlInterpolatedAsync', 'GetDbConnection']);
const DB_QUERY = new Set(['Where', 'Include', 'FromSqlInterpolated', 'AnyAsync', 'CountAsync', 'SumAsync', 'SingleAsync', 'SingleOrDefaultAsync', 'FirstOrDefaultAsync', 'ToListAsync', 'ToPagedAsync', 'ExecuteUpdateAsync', 'ReloadAsync']);
function checkConsistency() {
  const classes = new Map(); // tên lớp → {ops:Set, plannedOps:Set, planned}
  const entityNames = new Set();
  const add = (name, c) => {
    if (!classes.has(name)) classes.set(name, { ops: new Set(), plannedOps: new Set(), planned: c.planned });
    const e = classes.get(name);
    e.planned = e.planned && c.planned;
    for (const o of c.ops) for (const m of o.matchAll(/([A-Za-z_]\w*)\s*[(<]/g)) (/«planned»/.test(o) || c.planned ? e.plannedOps : e.ops).add(m[1]);
  };
  for (const dg of DIAGRAMS) for (const g of dg.groups) for (const c of g) { add(c.name, c); if (c.stereo === 'entity') entityNames.add(c.name); }
  // thực thể EF Core có trong code (Persistence/Entities, *.Custom.cs) cũng dùng được trong Set<T>()
  for (const n of 'Alert AppUser AppUserRole AuditLog Batch BatchAccount CapitalShare CaptureRequest Complaint ContractSignature ContractTemplate Contribution CrabItem CrabItemEvent Customer CustomerAddress DisbursementTranche Evidence EvidenceDetection EvidenceReview FeeTier Harvest HarvestRecord HarvestStartRequestLog InvestmentContract Investor KycCheck Operator OperatorMember PaymentInstruction PaymentRequest PayoutAccount PhysicalSlot ProductGrade ProductRating ProductionLog ProviderTransaction RiskAcknowledgement RiskDisclosure SalesOrder Settlement SettlementFeedback SettlementLine SlotAllocation SlotEvent SlotEventDetail SlotEventPolicyVersion StandardCostItem StandardCostTranchePlan StandardCostVersion VBatchActualRevenue VBatchFundingProgress VCrabCountReconciliation VInvestorPortfolio'.split(' ')) entityNames.add(n);
  const problems = [];
  for (const q of SEQS) {
    const ll = Object.fromEntries(q.lifelines.map(l => [l[0], l]));
    for (const [, name, kind, planned] of q.lifelines) {
      if (['actor', 'ext'].includes(kind)) continue;
      const c = classes.get(name);
      if (!c) problems.push(`${q.key}: lifeline ${name} has no class`);
      else if (!planned && c.planned) problems.push(`${q.key}: lifeline ${name} is planned in the class diagram`);
    }
    for (const raw of q.steps) {
      const pl = raw.startsWith('~'); const s = pl ? raw.slice(1) : raw;
      const m = s.match(/^(\w+)(->>|-->|->)(\w+):\s*(.*)$/);
      if (!m || m[2] === '-->') continue;
      const [, name, kind] = ll[m[3]];
      if (['actor', 'ext'].includes(kind)) continue;
      const text = m[4];
      if (kind === 'db') {
        const head = text.split(' — ')[0];
        let mm;
        if ((mm = head.match(/^Set<(\w+)>\(\)((?:\.\w+\(.*?\))+)/))) {
          if (!entityNames.has(mm[1])) problems.push(`${q.key}: Set<${mm[1]}> is not an entity class`);
          for (const o of mm[2].matchAll(/\.(\w+)\(/g)) if (!DB_QUERY.has(o[1])) problems.push(`${q.key}: AppDbContext query operator ${o[1]} not listed`);
        } else if ((mm = head.match(/^Database\.(\w+)\(/))) {
          if (!DB_FACADE.has(mm[1])) problems.push(`${q.key}: Database.${mm[1]} not listed`);
        } else if ((mm = head.match(/^(\w+)\(/))) {
          if (!DB_DIRECT.has(mm[1])) problems.push(`${q.key}: AppDbContext.${mm[1]} not listed`);
        } else problems.push(`${q.key}: message to AppDbContext is not an operation: ${text.slice(0, 60)}`);
        continue;
      }
      const op = (text.match(/^([A-Za-z_]\w*)\s*\(/) || [])[1];
      const c = classes.get(name);
      if (!op) { problems.push(`${q.key}: message to ${name} is not an operation: ${text.slice(0, 50)}`); continue; }
      if (!c) continue;
      if (!c.ops.has(op) && !c.plannedOps.has(op)) problems.push(`${q.key}: ${name}.${op} not in the class diagrams`);
      else if (!pl && !c.ops.has(op)) problems.push(`${q.key}: ${name}.${op} is «planned» in the class diagram but drawn as existing`);
    }
  }
  return problems;
}

function run(out) {
  const problems = checkConsistency();
  if (problems.length) console.log('SEQUENCE ↔ CLASS MISMATCHES:\n  ' + problems.join('\n  '));
  const f = new DrawioFile();
  const pags = DIAGRAMS.map(dg => paginateClass(dg));
  indexPages(f, pags.map(p => p.parts.length));
  DIAGRAMS.forEach((dg, i) => drawClass(f, dg, i, pags[i]));
  f.write(path.join(out, 'CrabShare_Class_Diagrams.drawio'));
  const split = DIAGRAMS.map((dg, i) => [dg.page, pags[i].parts.length]).filter(([, n]) => n > 1);
  console.log('Class diagrams done:', DIAGRAMS.length, 'figures on', pags.reduce((t, p) => t + p.parts.length, 0), 'pages + 2 index pages;', problems.length ? `${problems.length} sequence/class mismatches` : 'sequence/class names consistent', '; split:', split.map(([p, n]) => `${p} ×${n}`).join(', '));
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, DIAGRAMS, checkConsistency };
