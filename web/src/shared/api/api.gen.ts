/* TỆP TỰ SINH từ OpenAPI của backend (node scripts/gen-api-types.mjs). Không sửa tay.
   Tiền là số nguyên đồng; ngày giờ là chuỗi ISO 8601. */
/* eslint-disable */

export interface AcceptanceResponse {
  status: string
  acceptedCrabs: number
  acceptedKg: number
  rejectedCrabs: number
  discrepancyReason: string | null
  operatorRecordedAt: string
  customerConfirmedAt: string | null
  goodsValue: number | null
  depositApplied: number | null
  balanceDue: number | null
  balanceDueAt: string | null
  balancePaidAt: string | null
}

export interface AcknowledgeAlertRequest {
  responseNote: string
}

export interface AcknowledgeRiskRequest {
  riskDisclosureId?: number
  scrolledToEnd?: boolean
}

export interface AddressRequest {
  recipientName: string
  recipientPhone: string
  addressLine: string
  province: string
  isDefault?: boolean
}

export interface AddressResponse {
  addressId: number
  recipientName: string
  recipientPhone: string
  addressLine: string
  province: string
  isDefault: boolean
  createdAt: string
}

export interface AdminAccountDecisionRequest {
  reason: string
}

export interface AdminBatchRequest {
  batchMode: string
  operatorId?: number
  supplierPartyId?: number | null
  commissionPct?: number | null
  terms: BatchRequest
}

export interface AdminBatchResponse {
  batch: BatchResponse
  operatorName: string
  operatorStatus: string
  approvedAt: string | null
  approvedBy: number | null
  tranches: TrancheResponse[]
}

export interface AdminClaimDecisionRequest {
  accept?: boolean
  decision: string
  refundKg?: number | null
}

export interface AdminDashboardResponse {
  from: string
  to: string
  asOf: string
  confirmedCapital: number
  confirmedContributions: number
  totalUsers: number
  capitalByDay: CapitalDay[]
  batchesByStatus: StatusCount[]
  escalatedAlerts: number
  latestEscalatedAlerts: DashboardAlert[]
  ordersByStatus: StatusCount[]
  completedOrderRevenue: number
  payoutsByStatus: PayoutStatus[]
  succeededPayoutAmount: number
}

export interface AdminFundingBatch {
  batchCode: string
  title: string
  operatorName: string
  status: string
  stage: string
  minViableCapital: number
  targetCapital: number
  maxCapital: number
  confirmedCapital: number
  reservedCapital: number
  investorCount: number
  fundingOpenAt: string | null
  fundingDeadline: string | null
  capitalClosedAt: string | null
  totalConfirmedCapital: number | null
  refundCount: number
  refundOpenCount: number
}

export interface AdminKycResponse {
  id: number
  userId: number
  fullName: string
  email: string
  checkType: string
  result: string
  providerReference: string | null
  consentAt: string | null
  checkedAt: string
  failureReason: string | null
  reviewedBy: number | null
  canApproveException: boolean
}

export interface AdminOperatorResponse {
  operatorId: number
  legalName: string
  taxCode: string
  businessRegNo: string
  farmAddress: string
  status: string
  approvedSlotCapacity: number
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: number | null
}

export interface AdminSettlementSummary {
  batchCode: string
  batchTitle: string
  operatorName: string
  batchStatus: string
  settlementId: number | null
  status: string | null
  revisionNo: number | null
  actualRevenue: number | null
  revenuePool: number | null
  feedbackDeadline: string | null
  openFeedback: number
  updatedAt: string | null
}

export interface AdminUserDetailResponse {
  user: AdminUserResponse
  verifiedAt: string | null
  kycChecks: AdminKycResponse[]
}

export interface AdminUserResponse {
  userId: number
  fullName: string
  email: string
  phone: string | null
  status: string
  roles: string[]
  verificationStatus: string | null
  createdAt: string
  lastLoginAt: string | null
}

export interface AiInferenceResponse {
  imageKind: string
  modelName: string
  modelVersion: string
  isSimulated: boolean
  status: string
  imageQuality: string | null
  carapaceLengthCm: number | null
  carapaceWidthCm: number | null
  carapaceAreaCm2: number | null
  edgeBandMm: number | null
  confidence: number | null
  errorReason: string | null
  createdAt: string
}

export interface AlertResponse {
  id: number
  batchCode: string
  farmName: string
  type: string
  severity: string
  message: string
  raisedAt: string
  ackDeadline: string
  status: string
  acknowledgedAt: string | null
  acknowledgedBy: number | null
  responseNote: string | null
  escalatedAt: string | null
  resolutionNote?: string | null
}

export interface AllocationResponse {
  crabCode: string
  orderNo: string
  orderType: string
  trancheSeq: number | null
  lineSpecCode: string | null
  crabSpecCode: string | null
  isSubstitution: boolean
  status: string
  allocatedAt: string
  releasedAt: string | null
  releaseReason: string | null
}

export interface AnswerFeedbackRequest {
  response: string
  unresolved?: boolean
}

export interface ApproveBatchRequest {
  fundingOpenAt?: string | null
  fundingDeadline?: string | null
  preorderDeadline?: string | null
}

export interface ApproveDecisionRequest {
  finalGrade?: string | null
  sensoryNote?: string | null
  reason?: string | null
}

export interface ApproveOperatorRequest {
  approvedSlotCapacity: number | null
}

export interface AuditAnchorResponse {
  milestone: string
  occurredAt: string
  auditId: number
  rowHash: string
}

export interface AuditChainResult {
  isValid: boolean
  checkedRows: number
  brokenAuditId: number | null
  problem: string | null
}

export interface AuditLogPage {
  items: AuditLogRow[]
  page: number
  pageSize: number
  total: number
  throughAuditId: number
  chain: AuditChainResult
}

export interface AuditLogRow {
  auditId: number
  entityType: string
  entityId: number
  actionType: string
  oldValue: string | null
  newValue: string | null
  actorUserId: number | null
  occurredAt: string
  prevHash: string | null
  rowHash: string
}

export interface AuthResponse {
  accessToken: string
  expiresAt: string
  user: MeResponse
}

export interface AvailabilityResponse {
  batchCode: string
  acceptingPreorders: boolean
  sellableCrabs: number
  committedCrabs: number
  remainingCrabs: number
  specs: SpecAvailability[]
  minOrderCrabs: number
  depositRatePct: number
  holdMinutes: number
}

export interface BalancePaymentResponse {
  paymentRequestId: number
  referenceCode: string
  amount: number
  qrContent: string
  expiresAt: string
  accountNo: string
  status: string
}

export interface BatchCloseOutcome {
  batchCode: string
  outcome: string
  confirmedCapital: number
  investorCount: number
  refundCount: number
}

export interface BatchGradingSummary {
  batchCode: string
  batchStatus: string
  crabType: string
  ruleSetVersion: number | null
  received: number
  notMeasured: number
  draft: number
  hold: number
  approved: number
  rejected: number
  substandard: number
  bySpec: SpecCount[]
  assignedQcUserId: number | null
}

export interface BatchProgressResponse {
  batchCode: string
  status: string
  crabsAlive: number
  daysRaised: number | null
  isParticipant: boolean
  deadCrabs: number | null
  restockedCrabs: number | null
  gradedCrabs: number | null
  deliveredOrSoldCrabs: number | null
}

export interface BatchRequest {
  title: string
  crabType: string
  plannedQuantity?: number
  hasHolding?: boolean
  holdingDays?: number | null
  restockCutoffDays?: number | null
  expectedAvgWeightG?: number
  expectedGrade?: string | null
  saleDays?: number
  deliveryRadiusKm?: number
  dispatchSiteId?: number | null
  expectedReceiptDate?: string
  minViableCapital?: number | null
  minViableBasis?: string | null
  survivalThresholdPct?: number | null
  baseRemunerationPct?: number | null
  remunerationTiers?: RemunerationTierRequest[]
  floorPricePerKg?: number
  offtakeBuyerPartyId?: number
  settlementBasis?: string
  offers?: OfferRequest[]
}

export interface BatchResponse {
  batchCode: string
  batchMode: string
  status: string
  title: string
  crabType: string
  operatorId: number
  executor: PartyRefResponse | null
  plannedQuantity: number
  fundedQuantity: number | null
  hasHolding: boolean
  holdingDays: number | null
  restockCutoffDays: number
  expectedAvgWeightG: number | null
  expectedGrade: string | null
  saleDays: number | null
  deliveryRadiusKm: number | null
  dispatchSite: SiteRefResponse | null
  expectedReceiptDate: string | null
  targetCapital: number
  minViableCapital: number
  minViableBasis: string | null
  minContribution: number
  survivalThresholdPct: number | null
  baseRemunerationPct: number | null
  remunerationTiers: RemunerationTierResponse[]
  floorPricePerKg: number | null
  offtakeBuyer: PartyRefResponse | null
  settlementBasis: string
  platformFeeRatePct: number | null
  offers: OfferResponse[]
  costPlan: CostPlanResponse | null
  fundingOpenAt: string | null
  fundingDeadline: string | null
  preorderDeadline: string | null
  rejectionReason: string | null
  cancelReason: string | null
  canEdit: boolean
  canSubmit: boolean
  canCancel: boolean
}

export interface BoxHistoryResponse {
  slotCode: string
  assignedAt: string
  leftAt: string | null
  reason: string
  leaveReason: string | null
  evidenceId: number | null
}

export interface BoxRangeRequest {
  from?: number
  to?: number
  width?: number
}

export interface BoxRequest {
  crabCode: string
  slotCode: string
  evidenceId?: number
  replacesCrabCode?: string | null
}

export interface BoxStateResponse {
  slotCode: string
  slotStatus: string
  rackNo: number | null
  tierNo: number | null
  columnNo: number | null
  crabCode: string | null
  crabCondition: string | null
  assignedAt: string | null
}

export interface CalculateSettlementRequest {
  taxWithholdingPct?: number
}

export interface CalibrationMessage {
  messageId?: string
  deviceCode: string
  kind: string
  performedAt?: string | null
  details?: JsonElement | null
}

export interface CancelBatchRequest {
  reason: string
}

export interface CancelDirectSaleRequest {
  reason: string
}

export interface CancelPreorderRequest {
  reason?: string | null
}

export interface CancelTrancheRequest {
  reason: string
}

export interface CapitalDay {
  date: string
  amount: number
  count: number
}

export interface CaptureRequestResponse {
  id: number
  batchCode: string
  slotCode: string
  requestedAt: string
  dueAt: string
  status: string
  fulfilledAt: string | null
}

export interface CastVoteRequest {
  choice: string
}

export interface ClaimResponse {
  claimNo: string
  orderNo: string
  shipmentNo: string
  specCode: string
  claimType: string
  issueType: string
  affectedCrabs: number | null
  affectedKg: number | null
  description: string
  status: string
  responseDueAt: string
  operatorResponse: string | null
  operatorRespondedAt: string | null
  customerAgreed: boolean | null
  adminDecision: string | null
  decidedAt: string | null
  refundKg: number | null
  refundAmount: number | null
  createdAt: string
}

export interface ContractResponse {
  contractId: number
  contractNo: string
  status: string
  signingMethod: string
  batchCode: string
  batchTitle: string
  operatorName: string
  investorName: string
  contributionId: number
  amount: number
  contributionStatus: string
  templateVersion: string
  draftHash: string
  currentHash: string
  finalHash: string | null
  fullySignedAt: string | null
  createdAt: string
  signatures: ContractSignatureResponse[]
  nextSigner: string | null
  canSign: boolean
  legalNotice: string
}

export interface ContractSignatureResponse {
  role: string
  order: number
  signerName: string
  signedAt: string
  signedHash: string
  providerReference: string | null
}

export interface ContractSummary {
  contractId: number
  contractNo: string
  status: string
  signingMethod: string
  batchCode: string
  batchTitle: string
  investorName: string
  amount: number
  contributionStatus: string
  nextSigner: string | null
  createdAt: string
  fullySignedAt: string | null
}

export interface ContributionResponse {
  contributionId: number
  batchCode: string
  batchTitle: string
  amount: number
  status: string
  reservedAt: string
  expiresAt: string
  confirmedAt: string | null
}

export interface CostActualRequest {
  costItemId?: number
  amount?: number
  incurredOn?: string
  documentEvidenceId?: number | null
  documentRef?: string | null
  note?: string | null
}

export interface CostItemRequest {
  category: string
  description: string
  quantity?: number
  unit: string
  unitPrice?: number
  basis?: string | null
  costBearer?: string
}

export interface CostItemResponse {
  costItemId: number
  category: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  basis: string | null
  costBearer: string | null
  actualAmount: number
}

export interface CostPlanRequest {
  items: CostItemRequest[]
  milestones?: MilestoneRequest[] | null
}

export interface CostPlanResponse {
  versionNo: number
  status: string
  total: number
  costPerCrab: number
  lockedTotal: number
  items: CostItemResponse[]
  milestones: MilestoneResponse[]
  lockedAt: string | null
}

export interface CrabEventRequest {
  eventType: string
  evidenceId?: number | null
  note?: string | null
  occurredAt?: string | null
}

export interface CrabUnitResponse {
  crabCode: string
  batchCode: string
  lotCode: string
  originRegion: string
  harvestedOn: string
  species: string
  sex: string
  maturity: string
  receivedWeightG: number
  condition: string
  inventoryStatus: string
  currentSlotCode: string | null
  replacesCrabCode: string | null
  receivedAt: string
  boxes: BoxHistoryResponse[]
  events: InventoryEventResponse[]
}

export interface CreateBoxRequest {
  slotCode: string
  rowCode?: string | null
  rackNo?: number | null
  tierNo?: number | null
  columnNo?: number | null
}

export interface CreateRuleSetRequest {
  crabType: string
  nearThresholdPct?: number | null
  effectiveFrom?: string | null
  note?: string | null
  rules?: GradeRuleRequest[] | null
}

export interface CreateShipmentRequest {
  scheduledAt: string | null
  transportCondition?: string | null
  allowSubstitution?: boolean
}

export interface CustomerReplyRequest {
  agree?: boolean
}

export interface DashboardAlert {
  id: number
  batchCode: string
  farmName: string
  severity: string
  message: string
  raisedAt: string
}

export interface DashboardLog {
  id: number
  batchCode: string
  date: string
  ph: number | null
  waterTempC: number | null
  salinityPpt: number | null
  feedKg: number | null
}

export interface DecisionResponse {
  decisionNo: string
  batchCode: string
  kind: string
  proposal: string
  status: string
  openedAt: string
  closesAt: string
  eligibleCapital: number
  yesCapital: number
  noCapital: number
  yesPct: number
  noPct: number
  myChoice: string | null
  canVote: boolean
  decidedAt: string | null
}

export interface DepositPaymentResponse {
  paymentRequestId: number
  referenceCode: string
  amount: number
  qrContent: string
  expiresAt: string
  batchAccountNo: string
  status: string
}

export interface DeviceCommandRequest {
  commandType: string
  boxCode?: string | null
  reason?: string | null
}

export interface DeviceCommandResponse {
  commandId: number
  commandType: string
  boxCode: string | null
  createdAt: string
}

export interface DeviceImageResponse {
  deviceImageId: number
  slotCode: string
  crabCode: string | null
  capturedAt: string
  receivedAt: string
  crabDetected: boolean | null
  detectionConfidence: number | null
  deviceCode: string
  runId: string | null
}

export interface DeviceRegisteredResponse {
  device: DeviceResponse
  deviceKey: string
}

export interface DeviceResponse {
  deviceCode: string
  deviceType: string
  operatorId: number
  scopeType: string
  scope: string
  source: string
  status: string
  firmwareVersion: string | null
  lastSeenAt: string | null
  lastCalibratedAt: string | null
  calibrationPeriodDays: number
  calibrationDue: boolean
  queueLength: number | null
  keyPrefix: string
}

export interface DirectSaleResponse {
  orderNo: string
  orderType: string
  saleReason: string | null
  status: string
  buyerName: string
  crabs: number
  kg: number
  pricePerKg: number
  totalAmount: number
  invoiceNo: string | null
  payment: BalancePaymentResponse | null
  placedAt: string
  completedAt: string | null
}

export interface DispatchLineRequest {
  lineId?: number
  dispatchedCrabs?: number
  dispatchedKg?: number
}

export interface DispatchRequest {
  lines: DispatchLineRequest[]
  transportCondition?: string | null
}

export interface EnvironmentDay {
  date: string
  ph: number | null
  waterTempC: number | null
}

export interface EvidenceDetectionResponse {
  crabDetected: boolean | null
  confidence: number | null
  modelVersion: string
}

export interface EvidenceExplanationRequest {
  text: string
}

export interface EvidenceResponse {
  id: number
  batchCode: string
  slotCode: string
  capturedAt: string
  receivedAt: string
  latitude: number
  longitude: number
  sha256: string
  perceptualHash: string
  riskScore: number
  reviewStatus: string
  duplicateMatch: string
  detection: EvidenceDetectionResponse
  captureRequestId: number | null
  captureRequestStatus: string | null
}

export interface EvidenceVerdictRequest {
  verdict: string
  note: string
}

export interface ExploreBatchResponse {
  batchCode: string
  batchMode: string
  status: string
  title: string
  crabType: string
  executorName: string
  plannedQuantity: number
  fundedQuantity: number | null
  hasHolding: boolean
  holdingDays: number | null
  saleDays: number | null
  expectedAvgWeightG: number | null
  expectedGrade: string | null
  expectedReceiptDate: string | null
  deliveryRadiusKm: number | null
  distanceKm: number | null
  standardCostTotal: number
  standardCostPerCrab: number | null
  offers: ExploreOffer[]
  floorPricePerKg: number | null
  offtakeBuyerName: string | null
  platformFeeRatePct: number | null
  settlementBasis: string
  targetCapital: number
  confirmedCapital: number
  reservedCapital: number
  remainingCapital: number
  investorCount: number
  minContribution: number
  sellableCrabs: number
  depositedPreorderCrabs: number
  preorderRatioPct: number
  fundingOpenAt: string | null
  fundingDeadline: string | null
  preorderDeadline: string | null
  costByCategory: ExploreCostCategory[] | null
}

export interface ExploreCostCategory {
  category: string
  amount: number
}

export interface ExploreOffer {
  specCode: string
  specName: string
  sizeCode: string
  gradeCode: string
  pricePerKg: number
  conversionWeightG: number
  offeredQuantity: number
}

export interface ExternalPartyRequest {
  legalName: string
  partyType: string
  registrationNo?: string | null
  representative?: string | null
  phone: string
  roleType: string
  site?: SiteRequest | null
}

export interface FarmDashboardBatch {
  batchCode: string
  title: string
  status: string
  aliveCount: number
  expectedOutputKg: number
  openAlerts: number
  loggedToday: boolean
}

export interface FinalOrderRequest {
  kg?: number
  pricePerKg?: number
}

export interface FundingBatchResponse {
  batchCode: string
  title: string
  crabType: string
  status: string
  operatorName: string
  minContribution: number
  minViableCapital: number
  targetCapital: number
  maxCapital: number
  confirmedCapital: number
  reservedCapital: number
  remainingCapacity: number
  investorCount: number
  fundingOpenAt: string | null
  fundingDeadline: string | null
  isOpen: boolean
  reservationMinutes: number
  me: FundingEligibility
  myActiveReservation: ContributionResponse | null
}

export interface FundingBatchSummary {
  batchCode: string
  title: string
  crabType: string
  operatorName: string
  minContribution: number
  targetCapital: number
  maxCapital: number
  confirmedCapital: number
  remainingCapacity: number
  fundingDeadline: string | null
}

export interface FundingCloseResult {
  expiredReservations: number
  batches: BatchCloseOutcome[]
}

export interface FundingEligibility {
  kycVerified: boolean
  riskAcknowledged: boolean
}

export interface GoodsReceiptRequest {
  lotCode?: string | null
  originRegion: string
  harvestedOn?: string
  declaredSpecies: string
  declaredCount?: number
  declaredWeightKg?: number
  siteId?: number | null
  receivedAt?: string | null
  note?: string | null
}

export interface GoodsReceiptResponse {
  receiptNo: string
  poNo: string
  lotCode: string
  originRegion: string
  harvestedOn: string
  declaredCount: number
  declaredWeightKg: number
  receivedAt: string
  status: string
  acceptedCount: number
  rejectedCount: number
  acceptedWeightG: number
  qcUserId: number | null
  completedAt: string | null
}

export interface GradeDecisionResponse {
  decisionNo: string
  batchCode: string
  crabCode: string
  sessionNo: string
  ruleSetVersion: number
  versionNo: number
  status: string
  isCurrent: boolean
  weightG: number | null
  carapaceLengthCm: number | null
  cIndex: number | null
  edgeBandMm: number | null
  proposedSize: string | null
  proposedCLevel: string | null
  proposedSensory: string | null
  proposedGrade: string | null
  holdReasons: string[]
  finalSize: string | null
  finalGrade: string | null
  specCode: string | null
  isSubstandard: boolean
  liveStatus: string | null
  foodSafety: string | null
  sensoryNote: string | null
  reason: string | null
  hasPhoto: boolean
  decidedBy: number | null
  decidedAt: string | null
  heldBy: number | null
  secondQcId: number | null
  secondConfirmedAt: string | null
  createdAt: string
}

export interface GradeRuleRequest {
  ruleKind: string
  metric: string
  lowerBound?: number | null
  upperBound?: number | null
  unit: string
  resultLabel: string
  boundary?: string
  sortOrder?: number
  note?: string | null
}

export interface GradeRuleResponse {
  id: number
  ruleKind: string
  metric: string
  lowerBound: number | null
  upperBound: number | null
  unit: string
  resultLabel: string
  boundary: string
  sortOrder: number
  note: string | null
}

export interface GradeRuleSetResponse {
  id: number
  crabType: string
  versionNo: number
  status: string
  effectiveFrom: string
  nearThresholdPct: number
  note: string | null
  approvedAt: string | null
  rules: GradeRuleResponse[]
}

export interface GradingStandardResponse {
  standardCode: string
  revision: string
  issuer: string
  scope: string
  effectiveFrom: string
  note: string | null
  ruleSets: GradeRuleSetResponse[]
}

export interface GrantQcRequest {
  userId?: number
}

export interface HeartbeatMessage {
  deviceCode: string
  firmwareVersion?: string | null
  status?: string | null
  lastCalibratedAt?: string | null
  queueLength?: number | null
}

export interface HeartbeatResponse {
  serverTime: string
  status: string
  lastCalibratedAt: string | null
  calibrationDue: boolean
}

export interface HoldDecisionRequest {
  reason: string
}

export interface HoldingResponse {
  holdingCode: string
  batchCode: string
  method: string
  stockedAt: string
  expectedEndDate: string
  actualEndAt: string | null
  status: string
  boxed: number
  dead: number
  restocked: number
  maxRestock: number
  received: number
}

export type IFormFile = File

export interface IncomingInspectionRequest {
  species: string
  sex: string
  maturity: string
  speciesOk?: boolean
  alive?: boolean
  healthy?: boolean
  twoClaws?: boolean
  foodSafe?: boolean
  weightG?: number
  note?: string | null
}

export interface IngestAccepted {
  status: string
  sessionNo?: string | null
  id?: number | null
}

export interface InspectionResponse {
  inspectionNo: string
  conclusion: string
  rejectReason: string | null
  crabCode: string | null
  weightG: number
}

export interface InventoryEventResponse {
  eventType: string
  occurredAt: string
  slotCode: string | null
  weightG: number | null
  reason: string | null
  source: string
  evidenceId: number | null
}

export interface InvestorNotification {
  id: string
  type: string
  title: string
  body: string
  at: string
  batchCode: string
  canOpenPortfolio: boolean
  amount: number | null
}

export interface InvoicedSaleRequest {
  saleReason: string
  buyerName: string
  buyerPhone?: string | null
  buyerPartyId?: number | null
  crabCodes: string[]
  kg?: number
  pricePerKg?: number
  sourceOrderNo?: string | null
}

export interface InvoiceResponse {
  invoiceNo: string
  trancheSeq: number | null
  amount: number
  sellerName: string
  buyerName: string
  status: string
  issuedAt: string
}

export type JsonElement = unknown

export interface KycCheckResponse {
  id: number
  checkType: string
  result: string
  providerReference: string | null
  consentAt: string | null
  checkedAt: string
  failureReason: string | null
}

export interface KycStatusResponse {
  verificationStatus: string
  verifiedAt: string | null
  lastCheck: KycCheckResponse | null
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ManualCalibrationRequest {
  kind: string
  performedAt?: string | null
  errorG?: number | null
  note?: string | null
}

export interface MeasurementValueResponse {
  metric: string
  value: number
  unit: string
  method: string
  confidence: number | null
  verificationStatus: string
  recordedAt: string
}

export interface MeasurementValuesRequest {
  weightG?: number | null
  carapaceLengthCm?: number | null
  carapaceWidthCm?: number | null
  edgeBandMm?: number | null
}

export interface MeResponse {
  userId: number
  email: string
  fullName: string
  phone: string | null
  status: string
  roles: string[]
  operatorId: number | null
}

export interface MilestoneRequest {
  no?: number
  kind: string
  name: string
  pct?: number
  unlockCondition?: string | null
}

export interface MilestoneResponse {
  no: number
  kind: string
  name: string
  pct: number
  unlockCondition: string
  plannedAmount: number | null
}

export interface MoneyFigures {
  contributed: number
  disbursed: number
  heldInAccount: number
}

export interface MoneySummaryResponse {
  batchCode: string
  batch: MoneyFigures
  mine: MoneyFigures | null
  note: string
}

export interface MoveRequest {
  slotCode: string
  evidenceId?: number | null
  reason?: string | null
}

export interface NotificationPage {
  items: InvestorNotification[]
  page: number
  pageSize: number
  total: number
  asOf: string
}

export interface OfferRequest {
  specCode: string
  pricePerKg?: number
  conversionWeightG?: number
  offeredQuantity?: number
}

export interface OfferResponse {
  offerId: number
  specCode: string
  specName: string
  sizeCode: string
  gradeCode: string
  pricePerKg: number
  conversionWeightG: number
  offeredQuantity: number
}

export interface OpenSessionRequest {
  crabCode: string
  stationCode?: string | null
  procedure?: string
}

export interface OpenSessionResponse {
  sessionNo: string
  crabTag: string
  openedAt: string
}

export interface OperatorDashboardResponse {
  from: string
  to: string
  asOf: string
  farmName: string
  selectedBatchCode: string | null
  batches: FarmDashboardBatch[]
  aliveCount: number
  openAlerts: number
  pendingCaptureRequests: number
  logsDueToday: number
  ordersToPack: number
  ordersToShip: number
  environmentByDay: EnvironmentDay[]
  recentLogs: DashboardLog[]
}

export interface OperatorDecisionRequest {
  reason: string
}

export interface OperatorEvidenceItem {
  id: number
  batchCode: string
  slotCode: string | null
  mediaType: string
  reviewStatus: string
  riskScore: number | null
  capturedAt: string | null
  receivedAt: string
  latitude: number | null
  longitude: number | null
  explanation: string | null
  explainedAt: string | null
  latestReview: OperatorEvidenceReview | null
  canExplain: boolean
}

export interface OperatorEvidenceReview {
  verdict: string
  note: string | null
  reviewedAt: string
}

export interface OperatorMemberResponse {
  userId: number
  fullName: string
  email: string
  memberRole: string
  joinedAt: string
}

export interface OperatorProfileRequest {
  legalName: string
  taxCode: string
  businessRegNo: string
  farmAddress: string
}

export interface OperatorResponse {
  operatorId: number
  legalName: string
  taxCode: string
  businessRegNo: string
  farmAddress: string
  status: string
  submittedAt: string | null
  memberRole: string
  canEdit: boolean
  canSubmit: boolean
}

export interface OrderDeliveriesResponse {
  orderNo: string
  status: string
  depositAmount: number
  depositApplied: number
  traceCode: string | null
  shipments: ShipmentResponse[]
  invoices: InvoiceResponse[]
  returnWindowEndsAt: string | null
}

export interface OrderRatingResponse {
  orderNo: string
  stars: number
  comment: string | null
  createdAt: string
}

export interface OrderTraceResponse {
  traceCode: string
  batchCode: string
  batchTitle: string
  crabType: string
  farmName: string
  sourceLots: TraceSourceLot[]
  lines: TraceLine[]
  deliveries: string[]
  standardNote: string
}

export interface PagedResultOfAdminBatchResponse {
  items: AdminBatchResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfAdminKycResponse {
  items: AdminKycResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfAdminOperatorResponse {
  items: AdminOperatorResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfAdminUserResponse {
  items: AdminUserResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfAlertResponse {
  items: AlertResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfBatchResponse {
  items: BatchResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfCaptureRequestResponse {
  items: CaptureRequestResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfExploreBatchResponse {
  items: ExploreBatchResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfOperatorEvidenceItem {
  items: OperatorEvidenceItem[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfPartySummaryResponse {
  items: PartySummaryResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfPreorderResponse {
  items: PreorderResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfProductionBatchResponse {
  items: ProductionBatchResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfProductionLogResponse {
  items: ProductionLogResponse[]
  page: number
  pageSize: number
  total: number
}

export interface PagedResultOfReviewEvidenceSummary {
  items: ReviewEvidenceSummary[]
  page: number
  pageSize: number
  total: number
}

export interface ParameterChangeRequest {
  key: string
  value?: number
  effectiveFrom?: string
  note?: string | null
}

export interface ParameterValueResponse {
  key: string
  label: string
  value: number
  effectiveFrom: string
  note: string | null
}

export interface PartnerRoleResponse {
  roleType: string
  status: string
  validFrom: string
  validTo: string | null
  note: string | null
}

export interface PartyAccountResponse {
  userId: number
  email: string
  fullName: string
  phone: string | null
  status: string
  roles: string[]
  investorVerification: string | null
  ekycResult: string | null
  ekycCheckedAt: string | null
  ekycFailureReason: string | null
}

export interface PartyDecisionRequest {
  reason?: string | null
}

export interface PartyDocumentResponse {
  documentId: number
  docType: string
  contentType: string
  note: string | null
  uploadedAt: string
}

export interface PartyDossierResponse {
  accounts: PartyAccountResponse[]
  documents: PartyDocumentResponse[]
}

export interface PartyRefResponse {
  partyId: number
  partyCode: string
  legalName: string
}

export interface PartyResponse {
  partyId: number
  partyCode: string
  legalName: string
  partyType: string
  registrationNo: string | null
  representative: string | null
  phone: string | null
  verificationStatus: string
  rejectReason: string | null
  isPlatform: boolean
  roles: PartnerRoleResponse[]
  sites: PartySiteResponse[]
}

export interface PartySiteResponse {
  siteId: number
  siteCode: string
  siteType: string
  name: string
  addressLine: string
  province: string | null
  latitude: number | null
  longitude: number | null
  contactName: string | null
  contactPhone: string | null
  isDefault: boolean
  status: string
}

export interface PartySummaryResponse {
  partyId: number
  partyCode: string
  legalName: string
  partyType: string
  verificationStatus: string
  activeRoles: string[]
}

export interface PaymentInstructionResponse {
  instructionId: number
  type: string
  amount: number
  status: string
  batchCode: string
  beneficiary: string | null
  contributionId: number | null
  orderId: number | null
  trancheId: number | null
  trancheNo: number | null
  settlementLineId: number | null
  note: string | null
  createdAt: string
  sentAt: string | null
  completedAt: string | null
}

export interface PaymentRequestResponse {
  paymentRequestId: number
  purpose: string
  status: string
  batchCode: string
  referenceCode: string
  amount: number
  qrContent: string | null
  expiresAt: string
  providerName: string
  accountNo: string
}

export interface PayoutAccountRequest {
  bankCode: string
  accountNo: string
  accountHolderName: string
}

export interface PayoutAccountResponse {
  payoutAccountId: number
  bankCode: string
  accountNo: string
  accountHolderName: string
  nameMatchStatus: string
  status: string
  updatedAt: string
}

export interface PayoutProfileResponse {
  ownerType: string
  expectedHolderName: string
  account: PayoutAccountResponse | null
}

export interface PayoutStatus {
  status: string
  count: number
  amount: number
}

export interface PortfolioBatch {
  code: string
  title: string
  operatorName: string
  crabType: string
  status: string
  targetCapital: number
  raisedCapital: number
  minContribution: number
  cycleDays: number
  seedQuantity: number
  fundingDeadline: string | null
  stockedAt: string | null
  expectedHarvestDate: string | null
  dayOfCycle: number | null
  aliveCount: number | null
  openAlerts: number
}

export interface PortfolioContribution {
  id: number
  amount: number
  status: string
  reservedAt: string
  confirmedAt: string | null
  contractNo: string | null
  contractStatus: string | null
  fullySignedAt: string | null
}

export interface PortfolioDetail {
  position: PortfolioItem
  contributions: PortfolioContribution[]
  timeline: PortfolioTimelineEvent[]
  latestProduction: PortfolioProduction | null
}

export interface PortfolioItem {
  batch: PortfolioBatch
  confirmedAmount: number
  capitalRatio: number | null
  capitalBasis: string
  lastConfirmedAt: string | null
  settlement: PortfolioSettlement | null
}

export interface PortfolioPage {
  items: PortfolioItem[]
  page: number
  pageSize: number
  total: number
  summary: PortfolioSummary
}

export interface PortfolioProduction {
  logDate: string
  ph: number | null
  waterTempC: number | null
  salinityPpt: number | null
  feedKg: number | null
  source: string
  plausibilityFlag: string
  verifiedAt: string | null
}

export interface PortfolioSettlement {
  status: string
  capitalReturn: number
  profitShare: number
  taxWithheld: number
  netPayout: number
  inKindQtyKg: number
}

export interface PortfolioSummary {
  totalConfirmedAmount: number
  activeConfirmedAmount: number
  totalBatches: number
  activeBatches: number
  approvedNetPayout: number
}

export interface PortfolioTimelineEvent {
  type: string
  label: string
  at: string
}

export interface PreorderLineRequest {
  specCode: string
  mode: string
  qtyCrabs?: number | null
  qtyKg?: number | null
  minGrade?: string | null
}

export interface PreorderLineResponse {
  lineId: number
  specCode: string
  specName: string
  mode: string
  qtyCrabs: number | null
  qtyKg: number | null
  convertedCrabs: number
  pricePerKg: number
  conversionWeightG: number
  minGrade: string | null
  estimatedKg: number
  estimatedValue: number
}

export interface PreorderRequest {
  batchCode: string
  deliverySiteId?: number
  lines: PreorderLineRequest[]
  tranches?: TrancheRequest[] | null
}

export interface PreorderResponse {
  orderNo: string
  batchCode: string
  batchMode: string
  status: string
  estimatedValue: number
  depositRatePct: number
  depositAmount: number
  convertedCrabs: number
  placedAt: string
  holdExpiresAt: string | null
  depositedAt: string | null
  confirmedAt: string | null
  deliveryAddress: string
  deliveryDistanceKm: number | null
  lines: PreorderLineResponse[]
  tranches: TrancheResponse[]
  deposit: DepositPaymentResponse | null
  cancelReason: string | null
}

export interface ProcurementOrderRequest {
  supplierPartyId?: number
  orderedOn?: string
  agreedSpec: string
  quantity?: number
  unitPrice?: number
}

export interface ProcurementOrderResponse {
  poNo: string
  batchCode: string
  supplierPartyId: number
  supplierName: string
  orderedOn: string
  agreedSpec: string
  quantity: number
  unitPrice: number
  status: string
  receivedCount: number
}

export interface ProductionBatchResponse {
  batchCode: string
  title: string
  crabType: string
  status: string
  cycleDays: number
  seedQuantity: number
  aliveCount: number
  dayOfCycle: number | null
  latestLog: ProductionLogResponse | null
  loggedToday: boolean
  canRecord: boolean
  businessDate: string
}

export interface ProductionLogRequest {
  ph: number | null
  waterTempC: number | null
  salinityPpt: number | null
  feedKg: number | null
  note?: string | null
}

export interface ProductionLogResponse {
  id: number
  batchCode: string
  logDate: string
  ph: number | null
  waterTempC: number | null
  salinityPpt: number | null
  feedKg: number | null
  note: string | null
  source: string
  plausibilityFlag: string
  recordedBy: number | null
  createdAt: string
  thresholdVersion: number | null
  thresholdsApplied: ProductionThresholdResponse | null
}

export interface ProductionThresholdRequest {
  expectedVersionNo: number
  phMin: number | null
  phMax: number | null
  waterTempMinC: number | null
  waterTempMaxC: number | null
  salinityMinPpt: number | null
  salinityMaxPpt: number | null
}

export interface ProductionThresholdResponse {
  id: number
  versionNo: number
  phMin: number
  phMax: number
  waterTempMinC: number
  waterTempMaxC: number
  salinityMinPpt: number
  salinityMaxPpt: number
  createdBy: number
  createdAt: string
}

export interface ProductionThresholdState {
  businessDate: string
  canConfigure: boolean
  canRecord: boolean
  current: ProductionThresholdResponse | null
}

export interface ProposeDecisionRequest {
  kind: string
  proposal: string
  votingHours?: number
}

export interface ProposeSettlementRequest {
  feedbackDays?: number
}

export interface QcInspectorResponse {
  userId: number
  fullName: string
  email: string
  partyCode: string | null
  grantedAt: string
  approvedCount: number
  acceptedClaimCount: number
}

export interface QcTaskResponse {
  assignmentId: number
  kind: string
  batchCode: string
  targetType: string
  targetId: number
  assignedAt: string
}

export interface RateOrderRequest {
  stars?: number
  comment?: string | null
}

export interface ReadinessCondition {
  no: number
  code: string
  description: string
  met: boolean
  pending: number
}

export interface ReceiptLineRequest {
  lineId?: number
  receivedCrabs?: number
  receivedKg?: number
  acceptedCrabs?: number
  acceptedKg?: number
}

export interface ReceiptRequest {
  lines: ReceiptLineRequest[]
  rejectedCrabCodes?: string[] | null
  discrepancyReason?: string | null
}

export interface RefuseDeliveryRequest {
  reason: string
}

export interface RegisterDeviceRequest {
  deviceCode: string
  deviceType: string
  operatorId?: number
  slotCode?: string | null
  rackCode?: string | null
  batchCode?: string | null
  siteId?: number | null
  source?: string
  calibrationPeriodDays?: number | null
  cameraHeightMm?: number | null
}

export interface RegisterRequest {
  email: string
  password: string
  fullName: string
  phone?: string | null
  role?: SelfRegisterRole
  partyType?: string
  legalName?: string | null
  registrationNo?: string | null
  customerType?: string | null
}

export interface RejectBatchRequest {
  reason: string
}

export interface RelatedPartyRequest {
  fullName: string
  relation: string
  idNumber: string
  linkedPartyCode?: string | null
}

export interface RelatedPartyResponse {
  relatedPartyId: number
  fullName: string
  relation: string
  idNumberLast4: string
  linkedPartyCode: string | null
}

export interface RemunerationTierRequest {
  survivalFromPct?: number
  survivalToPct?: number
  ratePct?: number
}

export interface RemunerationTierResponse {
  tierNo: number
  survivalFromPct: number
  survivalToPct: number
  ratePct: number
}

export interface ReplaceRulesRequest {
  rules: GradeRuleRequest[]
  nearThresholdPct?: number | null
  note?: string | null
}

export interface ReserveContributionRequest {
  amount?: number
  pct?: number | null
}

export interface ResolveAlertRequest {
  note: string
}

export interface RespondClaimRequest {
  accept?: boolean
  response: string
  refundKg?: number | null
}

export interface ReviewDecision {
  id: number
  reviewerId: number
  reviewerName: string
  verdict: string
  note: string | null
  reviewedAt: string
}

export interface ReviewDetection {
  modelVersion: string
  crabDetected: boolean | null
  confidence: number | null
  bboxJson: string | null
  detectedAt: string
}

export interface ReviewEvidenceDetail {
  evidence: ReviewEvidenceSummary
  source: string
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
  sha256: string
  perceptualHash: string | null
  explanation: string | null
  explainedAt: string | null
  detections: ReviewDetection[]
  reviews: ReviewDecision[]
  canReview: boolean
}

export interface ReviewEvidenceSummary {
  id: number
  batchCode: string
  batchTitle: string
  farmName: string
  slotCode: string | null
  mediaType: string
  reviewStatus: string
  riskScore: number | null
  receivedAt: string
}

export interface RiskAcknowledgementResponse {
  riskDisclosureId: number
  versionCode: string
  acknowledgedAt: string
}

export interface RiskDisclosureResponse {
  riskDisclosureId: number
  versionCode: string
  effectiveFrom: string
  contentHash: string
  content: string
  acknowledgedAt: string | null
}

export interface RoleChangeRequest {
  roleType: string
  status: string
  note?: string | null
}

export type SelfRegisterRole = "Customer" | "Investor"

export interface SellableCrab {
  crabCode: string
  specCode: string | null
  finalSize: string
  finalGrade: string
  isSubstandard: boolean
  weightG: number | null
  inventoryStatus: string
}

export interface SessionMeasurementsResponse {
  session: SessionResponse
  values: MeasurementValueResponse[]
  inferences: AiInferenceResponse[]
  decision: GradeDecisionResponse | null
}

export interface SessionResponse {
  sessionNo: string
  batchCode: string
  crabCode: string
  procedure: string
  stationCode: string | null
  status: string
  openedAt: string
  capturedAt: string | null
  receivedAt: string | null
  weightG: number | null
  tofMm: number | null
  cameraHeightMm: number | null
  hasWhiteImage: boolean
  hasRedImage: boolean
  failReason: string | null
}

export interface SettlementBreakdown {
  mode: string
  basis: string
  preOrderRevenue: number
  invoicedSaleRevenue: number
  forfeitedDeposits: number
  finalOrderRevenue: number
  platformFeeRatePct: number
  platformFee: number
  standardCostDeductible: number
  actualCostTotal: number
  excludedFaultCost: number
  disbursedTotal: number
  undisbursedCost: number
  customerRefunds: number
  receivedCount: number
  deadCount: number
  survivalRatePct: number | null
  commissionPct: number | null
  commissionAmount: number
  supplierPayout: number
  isLiquidation: boolean
}

export interface SettlementFeedbackRequest {
  content: string
}

export interface SettlementFeedbackResponse {
  feedbackId: number
  authorName: string
  content: string
  status: string
  response: string | null
  createdAt: string
  respondedAt: string | null
  isMine: boolean
}

export interface SettlementLineResponse {
  settlementLineId: number
  investorId: number
  investorName: string
  capitalReturn: number
  profitShare: number
  taxWithheld: number
  netPayout: number
  isMine: boolean
  payoutStatus: string | null
}

export interface SettlementReadinessResponse {
  batchCode: string
  batchStatus: string
  ready: boolean
  conditions: ReadinessCondition[]
}

export interface SettlementResponse {
  settlementId: number
  batchCode: string
  batchTitle: string
  operatorName: string
  batchStatus: string
  status: string
  revisionNo: number
  orderRevenue: number
  forfeitedDeposits: number
  complaintRefunds: number
  actualRevenue: number
  lockedStandardCost: number
  revenuePool: number
  operatorSharePct: number
  operatorRemuneration: number
  distributable: number
  depreciationAmount: number
  taxTotal: number
  uncoveredLoss: number
  reconciliationDifference: number
  totalCapital: number
  totalNetPayout: number
  investorCount: number
  proposedAt: string | null
  feedbackDeadline: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  lines: SettlementLineResponse[]
  feedback: SettlementFeedbackResponse[]
  taxNotice: string
  auditAnchors: AuditAnchorResponse[]
  breakdown: SettlementBreakdown
}

export interface SettlementSummary {
  settlementId: number
  batchCode: string
  batchTitle: string
  status: string
  revisionNo: number
  revenuePool: number
  myNetPayout: number | null
  feedbackDeadline: string | null
  feedbackOpen: boolean
  openFeedback: number
}

export interface ShipmentLineResponse {
  lineId: number
  specCode: string
  pricePerKg: number
  dispatchedCrabs: number | null
  dispatchedKg: number | null
  receivedCrabs: number | null
  receivedKg: number | null
  acceptedCrabs: number | null
  acceptedKg: number | null
  rejectedCrabs: number | null
  transportLossKg: number | null
  goodsValue: number | null
}

export interface ShipmentResponse {
  shipmentNo: string
  orderNo: string
  trancheSeq: number
  status: string
  scheduledAt: string
  dispatchedAt: string | null
  deliveredAt: string | null
  returnWindowEndsAt: string | null
  transportCondition: string | null
  lines: ShipmentLineResponse[]
  acceptance: AcceptanceResponse | null
  balance: BalancePaymentResponse | null
  traceCode: string | null
}

export interface SimulatePaymentRequest {
  referenceCode: string
  amount?: number | null
}

export interface SiteRefResponse {
  siteId: number
  siteCode: string
  name: string
  addressLine: string
  latitude: number | null
  longitude: number | null
}

export interface SiteRequest {
  siteCode?: string | null
  siteType: string
  name: string
  addressLine: string
  province?: string | null
  latitude?: number | null
  longitude?: number | null
  contactName?: string | null
  contactPhone?: string | null
  isDefault?: boolean
}

export interface SiteVisitReportResponse {
  reportNo: string
  batchCode: string
  qcUserId: number
  visitedAt: string
  latitude: number
  longitude: number
  distanceToFarmM: number | null
  boxCodes: string[]
  crabsSeen: number
  findings: string
}

export interface SpecAvailability {
  specCode: string
  specName: string
  pricePerKg: number
  conversionWeightG: number
  offeredQuantity: number
  committed: number
  remaining: number
}

export interface SpecCount {
  specCode: string
  size: string
  grade: string
  count: number
}

export interface SpecResponse {
  specId: number
  specCode: string
  crabType: string
  sizeCode: string
  gradeCode: string
  liveCondition: string
  name: string
}

export interface SplitTranchesRequest {
  tranches: TrancheRequest[]
}

export interface StatusCount {
  status: string
  count: number
}

export interface TimelineAlert {
  type: string
  severity: string
  message: string
  status: string
  acknowledgedAt: string | null
  escalatedAt: string | null
}

export interface TimelineCrabEvent {
  eventType: string
  crabCode: string
  slotCode: string | null
  source: string
  reason: string | null
}

export interface TimelineDay {
  date: string
  items: TimelineItem[]
}

export interface TimelineEvidence {
  mediaType: string
  source: string
  slotCode: string | null
  reviewStatus: string
  fileUrl: string
}

export interface TimelineItem {
  id: string
  type: string
  sourceId: string
  businessDate: string
  occurredAt: string | null
  timeBasis: string
  productionLog?: TimelineLog | null
  slotEvent?: TimelineSlot | null
  evidence?: TimelineEvidence | null
  alert?: TimelineAlert | null
  crabEvent?: TimelineCrabEvent | null
}

export interface TimelineLog {
  ph: number | null
  waterTempC: number | null
  salinityPpt: number | null
  feedKg: number | null
  source: string
  plausibilityFlag: string
  note: string | null
}

export interface TimelinePage {
  batchCode: string
  timeZone: string
  groups: TimelineDay[]
  nextBefore: string | null
  hasMore: boolean
}

export interface TimelineSlot {
  eventType: string
  slotCode: string
  destinationSlotCode: string | null
  quantity: number
  note: string | null
}

export interface TraceLine {
  specCode: string
  specName: string
  crabs: number
}

export interface TraceSourceLot {
  originRegion: string | null
  harvestedOn: string | null
  species: string
}

export interface TrancheDecisionRequest {
  reason: string
}

export interface TrancheLineRequest {
  specCode: string
  qtyCrabs?: number | null
  qtyKg?: number | null
}

export interface TrancheLineResponse {
  specCode: string
  qtyCrabs: number | null
  qtyKg: number | null
  convertedCrabs: number
}

export interface TrancheLineStatus {
  lineId: number
  specCode: string
  orderedCrabs: number
  allocatedCrabs: number
  substitutedCrabs: number
  pricePerKg: number
}

export interface TrancheRequest {
  seq?: number
  dueDate?: string
  lines: TrancheLineRequest[]
}

export interface TrancheResponse {
  trancheId: number
  seq: number
  dueDate: string
  status: string
  lines: TrancheLineResponse[]
}

export interface TrancheStatusResponse {
  trancheId: number
  orderNo: string
  orderStatus: string
  seq: number
  dueDate: string
  status: string
  recipientName: string
  recipientPhone: string
  deliveryAddress: string
  lines: TrancheLineStatus[]
  shipmentNo: string | null
  shipmentStatus: string | null
}

export interface UnmatchedTransactionResponse {
  transactionId: number
  providerTxnId: string
  batchCode: string
  amount: number
  content: string | null
  matchStatus: string
  occurredAt: string
  receivedAt: string
  paymentRequestReference: string | null
  paymentRequestStatus: string | null
  paymentRequestAmount: number | null
}

export interface UpdateBoxRequest {
  status: string
}

export interface UpdatePartyRequest {
  legalName: string
  partyType: string
  registrationNo?: string | null
  representative?: string | null
  phone?: string | null
}

export interface WaterReadingMessage {
  messageId?: string
  deviceCode: string
  measuredAt?: string | null
  temperatureC?: number | null
  salinityPpt?: number | null
  ph?: number | null
  qualityFlag?: string | null
  lastCalibratedAt?: string | null
}

export interface WaterReadingResponse {
  measuredAt: string
  temperatureC: number | null
  salinityPpt: number | null
  ph: number | null
  quality: string
  deviceCode: string
}

export interface WebhookResult {
  outcome: string
  transactionId: number | null
  referenceCode: string | null
  paymentRequestId: number | null
  purpose: string | null
  refundInstructionId: number | null
}

