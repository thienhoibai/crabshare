/* Dữ liệu giả lập của cổng Quản trị (/admin/…) và trang cảnh báo của người nuôi (/operator/alerts).
   Kiểu lấy từ src/shared/api/api.gen.ts. Hai kiểu mà api.gen.ts sinh lệch (mốc giải ngân) được khai lại như trong trang. */
import type {
  AdminBatchResponse, AdminFundingBatch, AdminKycResponse, AdminSettlementSummary, AdminUserDetailResponse, AdminUserResponse, AlertResponse,
  AuditLogPage, AuditLogRow, BatchProgressResponse, BatchResponse, CostPlanResponse, FundingCloseResult, MoneySummaryResponse, OperatorResponse,
  PagedResultOfAdminKycResponse, PagedResultOfAdminUserResponse, PagedResultOfAlertResponse, PagedResultOfReviewEvidenceSummary,
  ReviewEvidenceDetail, ReviewEvidenceSummary, SettlementReadinessResponse, SettlementResponse,
} from '../../src/shared/api/api.gen'
import type { DisbursementTranche } from '../../src/features/admin/finance/financeModel'
import type { Locator } from '@playwright/test'
import { PNG, dateFromNow, daysFromNow, expect, file, reply, type Api, type Call, type Page, type PageUnderTest } from './app'

export type { DisbursementTranche }

/* ---------- ngày giờ ---------- */

const VN = 'Asia/Ho_Chi_Minh'

/** Ngày như formatDate của ứng dụng. Tính trong trình duyệt để không lệch bản ICU giữa Node và Chrome. */
export const shownDate = (page: Page, iso: string) =>
  page.evaluate(([iso, timeZone]) => new Intl.DateTimeFormat('vi-VN', { timeZone }).format(new Date(iso)), [iso, VN])

/** Ngày giờ như formatDateTime của ứng dụng. */
export const shownDateTime = (page: Page, iso: string) =>
  page.evaluate(([iso, timeZone]) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(new Date(iso)), [iso, VN])

/** Giá trị gõ vào ô datetime-local (giờ Việt Nam, tới phút) cách hiện tại một số ngày. Spec dùng nó phải đặt timezoneId là giờ Việt Nam. */
export const vnLocalFromNow = (days: number) => new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 16)

/** ISO mà trang phải gửi cho một giá trị datetime-local theo giờ Việt Nam. */
export const vnLocalToIso = (local: string) => new Date(`${local}:00+07:00`).toISOString()

const notFound = (what: string) => reply(404, { status: 404, detail: `Không tìm thấy ${what}.` })
const page1 = <T>(items: T[], pageSize: number, total = items.length) => ({ items, page: 1, pageSize, total })

/* ---------- Lô: /admin/batches, /admin/batches/:code ---------- */

/** Mốc giải ngân trong hồ sơ duyệt Lô. api.gen.ts gắn nhầm kiểu đợt giao, trang khai lại ở features/admin/adminPartA.tsx. */
export interface AdminBatchTranche {
  no: number
  kind: string | null
  name: string | null
  pct: number | null
  plannedAmount: number
  status: string
  unlockCondition: string
  releasedAt: string | null
}
export type AdminBatch = Omit<AdminBatchResponse, 'tranches'> & { tranches: AdminBatchTranche[] }

export const costPlan: CostPlanResponse = {
  versionNo: 1, status: 'Submitted', total: 180_000_000, costPerCrab: 300_000, lockedTotal: 0, lockedAt: null,
  items: [
    { costItemId: 1, category: 'Seed', description: 'Cua nguồn 600 con', quantity: 600, unit: 'con', unitPrice: 200_000, amount: 120_000_000, basis: null, costBearer: 'Batch', actualAmount: 0 },
    { costItemId: 2, category: 'Feed', description: 'Cá tạp và ốc', quantity: 30, unit: 'ngày', unitPrice: 1_500_000, amount: 45_000_000, basis: null, costBearer: 'Batch', actualAmount: 0 },
    { costItemId: 3, category: 'Labour', description: 'Công chăm sóc', quantity: 1, unit: 'vụ', unitPrice: 15_000_000, amount: 15_000_000, basis: null, costBearer: 'Batch', actualAmount: 0 },
  ],
  milestones: [
    { no: 1, kind: 'Receipt', name: 'Nhận cua xong', pct: 60, unlockCondition: 'Kiểm đầu vào xong và đã xếp hộp', plannedAmount: 108_000_000 },
    { no: 2, kind: 'MidCycle', name: 'Giữa vụ', pct: 30, unlockCondition: 'Có biên bản thăm trại giữa vụ', plannedAmount: 54_000_000 },
    { no: 3, kind: 'Settlement', name: 'Quyết toán', pct: 10, unlockCondition: 'Bảng quyết toán được duyệt', plannedAmount: 18_000_000 },
  ],
}

/** Lô P người nuôi vừa gửi duyệt: đủ chi phí, chào giá, bên cam kết thu mua. */
export const pendingBatch: BatchResponse = {
  batchCode: 'P-2612-07', batchMode: 'P', status: 'PendingApproval', title: 'Cua gạch Đầm Dơi tháng 1', crabType: 'RoeCrab', operatorId: 7,
  executor: { partyId: 21, partyCode: 'PT-0021', legalName: 'HTX Đầm Dơi' },
  plannedQuantity: 600, fundedQuantity: null, hasHolding: true, holdingDays: 30, restockCutoffDays: 7, expectedAvgWeightG: 420, expectedGrade: 'Cấp 1',
  saleDays: 14, deliveryRadiusKm: 350,
  dispatchSite: { siteId: 5, siteCode: 'ST-0005', name: 'Trại Đầm Dơi', addressLine: 'Ấp Tân Điền, Đầm Dơi, Cà Mau', latitude: null, longitude: null },
  expectedReceiptDate: dateFromNow(25),
  targetCapital: 200_000_000, minViableCapital: 150_000_000, minViableBasis: 'Đủ mua 450 con cua nguồn', minContribution: 5_000_000,
  survivalThresholdPct: 85, baseRemunerationPct: 10,
  remunerationTiers: [
    { tierNo: 1, survivalFromPct: 85, survivalToPct: 92, ratePct: 10 },
    { tierNo: 2, survivalFromPct: 92, survivalToPct: 100, ratePct: 14 },
  ],
  floorPricePerKg: 380_000, offtakeBuyer: { partyId: 33, partyCode: 'PT-0033', legalName: 'Công ty Hải sản Đất Mũi' },
  settlementBasis: 'StandardCost', platformFeeRatePct: 3,
  offers: [
    { offerId: 11, specCode: 'RC-L-G1', specName: 'Cua gạch L cấp 1', sizeCode: 'L', gradeCode: 'G1', pricePerKg: 520_000, conversionWeightG: 420, offeredQuantity: 300 },
    { offerId: 12, specCode: 'RC-M-G1', specName: 'Cua gạch M cấp 1', sizeCode: 'M', gradeCode: 'G1', pricePerKg: 480_000, conversionWeightG: 380, offeredQuantity: 240 },
  ],
  costPlan, fundingOpenAt: null, fundingDeadline: null, preorderDeadline: null, rejectionReason: null, cancelReason: null,
  canEdit: false, canSubmit: false, canCancel: false,
}

export const pendingDetail: AdminBatch = {
  batch: pendingBatch, operatorName: 'HTX Đầm Dơi', operatorStatus: 'Approved', approvedAt: null, approvedBy: null, tranches: [],
}

/** Lô P đã duyệt, đang gọi vốn: chi phí đã khoá, các mốc giải ngân đã lập. */
export const fundingDetail: AdminBatch = {
  batch: {
    ...pendingBatch, batchCode: 'P-2611-04', title: 'Cua gạch Năm Căn tháng 12', status: 'Funding',
    executor: { partyId: 22, partyCode: 'PT-0022', legalName: 'HTX Năm Căn' },
    fundingOpenAt: daysFromNow(-5), fundingDeadline: daysFromNow(10),
    costPlan: { ...costPlan, status: 'Locked', lockedTotal: costPlan.total, lockedAt: daysFromNow(-6) },
  },
  operatorName: 'HTX Năm Căn', operatorStatus: 'Approved', approvedAt: daysFromNow(-6), approvedBy: 104,
  tranches: costPlan.milestones.map((m) => ({
    no: m.no, kind: m.kind, name: m.name, pct: m.pct, plannedAmount: m.plannedAmount ?? 0, status: 'Planned', unlockCondition: m.unlockCondition, releasedAt: null,
  })),
}

/** Lô T do Quản trị soạn, đang chờ duyệt: không gọi vốn, chỉ có hạn nhận đặt trước. */
export const pendingTDetail: AdminBatch = {
  batch: {
    ...pendingBatch, batchCode: 'T-2612-03', batchMode: 'T', title: 'Cua thịt Ngọc Hiển đợt 3', crabType: 'FatteningMudCrab',
    executor: { partyId: 23, partyCode: 'PT-0023', legalName: 'Trại cua Tư Bền' },
    plannedQuantity: 400, targetCapital: 0, minViableCapital: 0, minViableBasis: null, minContribution: 0,
    survivalThresholdPct: null, baseRemunerationPct: null, remunerationTiers: [], floorPricePerKg: 310_000, platformFeeRatePct: null,
    offers: [{ offerId: 21, specCode: 'FM-L-G1', specName: 'Cua thịt L cấp 1', sizeCode: 'L', gradeCode: 'G1', pricePerKg: 360_000, conversionWeightG: 350, offeredQuantity: 360 }],
    costPlan: { ...costPlan, total: 96_000_000, costPerCrab: 240_000, milestones: [] },
  },
  operatorName: 'Trại cua Tư Bền', operatorStatus: 'Approved', approvedAt: null, approvedBy: null, tranches: [],
}

export const adminBatches: AdminBatch[] = [pendingDetail, pendingTDetail, fundingDetail]

/** Trang danh sách Lô, lọc theo status và batchMode như máy chủ. */
export const batchListReply = (rows: AdminBatch[]) => ({ query }: Call) =>
  page1(rows.filter((r) => (!query.status || r.batch.status === query.status) && (!query.batchMode || r.batch.batchMode === query.batchMode)), 20)

/* Tab "Tiến độ" của Lô đã duyệt. */
export const batchProgress: BatchProgressResponse = {
  batchCode: fundingDetail.batch.batchCode, status: 'Funding', crabsAlive: 0, daysRaised: null, isParticipant: true,
  deadCrabs: 0, restockedCrabs: 0, gradedCrabs: 0, deliveredOrSoldCrabs: 0,
}
export const batchMoney: MoneySummaryResponse = {
  batchCode: fundingDetail.batch.batchCode, batch: { contributed: 120_000_000, disbursed: 0, heldInAccount: 120_000_000 }, mine: null, note: '',
}
export const batchReadiness: SettlementReadinessResponse = {
  batchCode: fundingDetail.batch.batchCode, batchStatus: 'Funding', ready: false,
  conditions: [
    { no: 1, code: 'AllCrabsAccounted', description: 'Mọi con cua đã giao, bán hoặc ghi nhận hao hụt', met: false, pending: 600 },
    { no: 2, code: 'NoOpenClaims', description: 'Không còn khiếu nại chưa xử lý', met: true, pending: 0 },
  ],
}

/* ---------- Mốc giải ngân: /admin/tranches ---------- */

const trancheBase: DisbursementTranche = {
  trancheId: 41, batchCode: 'P-2610-02', batchTitle: 'Cua gạch Cái Nước tháng 11', operatorName: 'Trại cua Tư Bền', trancheNo: 2,
  plannedAmount: 54_000_000, plannedDate: dateFromNow(-2), unlockCondition: 'Có biên bản thăm trại giữa vụ', status: 'Requested',
  requestedAt: daysFromNow(-1), explanationDeadline: null, releasedAt: null, canRequest: false, blockedReason: null, instructionId: null, instructionStatus: null,
}

/** Người nuôi đã xin, chờ Quản trị duyệt. */
export const requestedTranche: DisbursementTranche = trancheBase
export const requestedTranche2: DisbursementTranche = {
  ...trancheBase, trancheId: 42, batchCode: 'P-2611-04', batchTitle: 'Cua gạch Năm Căn tháng 12', operatorName: 'HTX Năm Căn', trancheNo: 1,
  plannedAmount: 108_000_000, unlockCondition: 'Kiểm đầu vào xong và đã xếp hộp', requestedAt: daysFromNow(-0.2),
}
/** Đã yêu cầu giải trình, người nuôi để quá hạn 72 giờ. */
export const overdueTranche: DisbursementTranche = {
  ...trancheBase, trancheId: 43, batchCode: 'P-2609-05', batchTitle: 'Cua gạch Phú Tân tháng 10', operatorName: 'HTX Phú Tân', trancheNo: 3,
  plannedAmount: 18_000_000, unlockCondition: 'Bảng quyết toán được duyệt', status: 'NeedsExplanation',
  requestedAt: daysFromNow(-5), explanationDeadline: daysFromNow(-1),
}
/** Đã duyệt, lệnh chi lập xong nhưng chưa gửi. */
export const releasedTranche: DisbursementTranche = {
  ...trancheBase, trancheId: 40, trancheNo: 1, plannedAmount: 108_000_000, unlockCondition: 'Kiểm đầu vào xong và đã xếp hộp',
  status: 'Released', requestedAt: daysFromNow(-12), releasedAt: daysFromNow(-11), instructionId: 90, instructionStatus: 'Created',
}
export const plannedTranche: DisbursementTranche = {
  ...trancheBase, trancheId: 44, trancheNo: 3, plannedAmount: 18_000_000, unlockCondition: 'Bảng quyết toán được duyệt', status: 'Planned',
  plannedDate: dateFromNow(30), requestedAt: null, blockedReason: 'Lô chưa có bảng quyết toán được duyệt',
}

export const tranches: DisbursementTranche[] = [requestedTranche, requestedTranche2, overdueTranche, releasedTranche, plannedTranche]

/** GET /api/admin/tranches: không gửi status thì trả các mốc đang chờ xử lý, có status thì lọc đúng trạng thái đó. */
export const trancheListReply = (rows: DisbursementTranche[]) => ({ query }: Call) =>
  rows.filter((t) => (query.status ? t.status === query.status : t.status === 'Requested' || t.status === 'NeedsExplanation'))

/* ---------- Gọi vốn: /admin/funding ---------- */

export const fundingBatches: AdminFundingBatch[] = [
  {
    batchCode: 'P-2611-04', title: 'Cua gạch Năm Căn tháng 12', operatorName: 'HTX Năm Căn', status: 'Funding', stage: 'Open',
    minViableCapital: 150_000_000, targetCapital: 200_000_000, maxCapital: 200_000_000, confirmedCapital: 120_000_000, reservedCapital: 10_000_000, investorCount: 8,
    fundingOpenAt: daysFromNow(-5), fundingDeadline: daysFromNow(10), capitalClosedAt: null, totalConfirmedCapital: null, refundCount: 0, refundOpenCount: 0,
  },
  {
    batchCode: 'P-2610-08', title: 'Cua gạch Thới Bình tháng 11', operatorName: 'Hộ nuôi Sáu Thơ', status: 'Funding', stage: 'AwaitingClose',
    minViableCapital: 90_000_000, targetCapital: 120_000_000, maxCapital: 120_000_000, confirmedCapital: 60_000_000, reservedCapital: 0, investorCount: 4,
    fundingOpenAt: daysFromNow(-20), fundingDeadline: daysFromNow(-0.5), capitalClosedAt: null, totalConfirmedCapital: null, refundCount: 0, refundOpenCount: 0,
  },
  {
    batchCode: 'P-2610-02', title: 'Cua gạch Cái Nước tháng 11', operatorName: 'Trại cua Tư Bền', status: 'InProduction', stage: 'CapitalClosed',
    minViableCapital: 150_000_000, targetCapital: 180_000_000, maxCapital: 180_000_000, confirmedCapital: 180_000_000, reservedCapital: 0, investorCount: 12,
    fundingOpenAt: daysFromNow(-40), fundingDeadline: daysFromNow(-25), capitalClosedAt: daysFromNow(-25), totalConfirmedCapital: 180_000_000, refundCount: 2, refundOpenCount: 1,
  },
]

/** Kết quả một lượt chốt vốn: Lô quá hạn không đủ vốn tối thiểu nên bị huỷ và hoàn tiền. */
export const closeResult: FundingCloseResult = {
  expiredReservations: 2,
  batches: [{ batchCode: 'P-2610-08', outcome: 'Cancelled', confirmedCapital: 60_000_000, investorCount: 4, refundCount: 4 }],
}

/* ---------- Quyết toán: /admin/settlements ---------- */

export const settlements: AdminSettlementSummary[] = [
  {
    batchCode: 'P-2608-01', batchTitle: 'Cua gạch Ngọc Hiển tháng 9', operatorName: 'HTX Ngọc Hiển', batchStatus: 'AwaitingSettlement',
    settlementId: null, status: null, revisionNo: null, actualRevenue: 265_000_000, revenuePool: null, feedbackDeadline: null, openFeedback: 0, updatedAt: null,
  },
  {
    batchCode: 'P-2607-03', batchTitle: 'Cua gạch Phú Tân tháng 8', operatorName: 'HTX Phú Tân', batchStatus: 'Settling',
    settlementId: 31, status: 'Proposed', revisionNo: 2, actualRevenue: 310_000_000, revenuePool: 96_000_000, feedbackDeadline: daysFromNow(4), openFeedback: 2, updatedAt: daysFromNow(-3),
  },
  {
    batchCode: 'P-2610-02', batchTitle: 'Cua gạch Cái Nước tháng 11', operatorName: 'Trại cua Tư Bền', batchStatus: 'Selling',
    settlementId: null, status: null, revisionNo: null, actualRevenue: 84_000_000, revenuePool: null, feedbackDeadline: null, openFeedback: 0, updatedAt: null,
  },
  {
    batchCode: 'T-2606-02', batchTitle: 'Cua thịt Ngọc Hiển đợt 1', operatorName: 'Trại cua Tư Bền', batchStatus: 'Closed',
    settlementId: 12, status: 'Closed', revisionNo: 1, actualRevenue: 142_000_000, revenuePool: 21_000_000, feedbackDeadline: null, openFeedback: 0, updatedAt: daysFromNow(-60),
  },
]

/** Lô đang bán còn thiếu hai trong các điều kiện chờ quyết toán. */
export const sellingReadiness: SettlementReadinessResponse = {
  batchCode: 'P-2610-02', batchStatus: 'Selling', ready: false,
  conditions: [
    { no: 1, code: 'AllCrabsAccounted', description: 'Mọi con cua đã giao, bán hoặc ghi nhận hao hụt', met: false, pending: 35 },
    { no: 2, code: 'AllOrdersPaid', description: 'Mọi đơn đã thu đủ tiền', met: false, pending: 2 },
    { no: 3, code: 'NoOpenClaims', description: 'Không còn khiếu nại chưa xử lý', met: true, pending: 0 },
  ],
}

/** Bảng nháp vừa tính cho Lô P chờ quyết toán: 265 triệu doanh thu, phí 3%, chi phí chuẩn 180 triệu, thù lao 10% phần còn lại. */
export const draftSettlement: SettlementResponse = {
  settlementId: 45, batchCode: 'P-2608-01', batchTitle: 'Cua gạch Ngọc Hiển tháng 9', operatorName: 'HTX Ngọc Hiển', batchStatus: 'Settling',
  status: 'Draft', revisionNo: 1, orderRevenue: 265_000_000, forfeitedDeposits: 0, complaintRefunds: 0, actualRevenue: 265_000_000,
  lockedStandardCost: 180_000_000, revenuePool: 77_050_000, operatorSharePct: 10, operatorRemuneration: 7_705_000, distributable: 69_345_000,
  depreciationAmount: 0, taxTotal: 0, uncoveredLoss: 0, reconciliationDifference: 0, totalCapital: 200_000_000, totalNetPayout: 269_345_000, investorCount: 2,
  proposedAt: null, feedbackDeadline: null, approvedAt: null, createdAt: daysFromNow(0), updatedAt: daysFromNow(0),
  lines: [
    { settlementLineId: 1, investorId: 101, investorName: 'Lê Minh Khôi', capitalReturn: 120_000_000, profitShare: 41_607_000, taxWithheld: 0, netPayout: 161_607_000, isMine: false, payoutStatus: null },
    { settlementLineId: 2, investorId: 142, investorName: 'Nguyễn An', capitalReturn: 80_000_000, profitShare: 27_738_000, taxWithheld: 0, netPayout: 107_738_000, isMine: false, payoutStatus: null },
  ],
  feedback: [], taxNotice: '', auditAnchors: [],
  breakdown: {
    mode: 'P', basis: 'StandardCost', preOrderRevenue: 230_000_000, invoicedSaleRevenue: 20_000_000, forfeitedDeposits: 0, finalOrderRevenue: 15_000_000,
    platformFeeRatePct: 3, platformFee: 7_950_000, standardCostDeductible: 180_000_000, actualCostTotal: 0, excludedFaultCost: 0,
    disbursedTotal: 162_000_000, undisbursedCost: 18_000_000, customerRefunds: 0, receivedCount: 600, deadCount: 42, survivalRatePct: 93,
    commissionPct: null, commissionAmount: 0, supplierPayout: 0, isLiquidation: false,
  },
}

/* ---------- Thẩm định bằng chứng: /admin/evidence, /admin/evidence/:id ---------- */

export const evidence: ReviewEvidenceSummary = {
  id: 54, batchCode: 'P-2611-04', batchTitle: 'Cua gạch Năm Căn tháng 12', farmName: 'HTX Năm Căn', slotCode: '0014',
  mediaType: 'Photo', reviewStatus: 'Flagged', riskScore: 0.92, receivedAt: daysFromNow(-1),
}
export const acceptedEvidence: ReviewEvidenceSummary = {
  ...evidence, id: 51, slotCode: '0009', reviewStatus: 'Accepted', riskScore: 0.12, receivedAt: daysFromNow(-3),
}
export const evidenceList: ReviewEvidenceSummary[] = [evidence, acceptedEvidence]

export const evidenceDetail: ReviewEvidenceDetail = {
  evidence, source: 'InAppCapture', capturedAt: daysFromNow(-1.01), latitude: 8.7712, longitude: 105.0195,
  sha256: 'a'.repeat(64), perceptualHash: 'b'.repeat(16),
  explanation: 'Ảnh chụp bổ sung cho hộp 0014 sau khi thay nước', explainedAt: daysFromNow(-0.5),
  detections: [{ modelVersion: 'crab-det-1.2', crabDetected: null, confidence: null, bboxJson: null, detectedAt: daysFromNow(-1) }],
  reviews: [], canReview: true,
}

/** GET /api/review/evidence: Status rỗng là mọi trạng thái, không gửi Status thì máy chủ chỉ trả bằng chứng bị gắn cờ; Q tìm theo mã hộp, Lô, trại. */
export const evidenceListReply = (rows: ReviewEvidenceSummary[]) => ({ query }: Call): PagedResultOfReviewEvidenceSummary => {
  const status = query.Status ?? 'Flagged'
  const q = (query.Q ?? '').toLowerCase()
  const hits = rows.filter((e) => (!status || e.reviewStatus === status) && (!q || `${e.slotCode} ${e.batchCode} ${e.farmName}`.toLowerCase().includes(q)))
  return { items: hits, page: Number(query.Page ?? 1), pageSize: Number(query.PageSize ?? 20), total: hits.length }
}

/* ---------- Cảnh báo: /admin/alerts, /operator/alerts ---------- */

/** Người nuôi phản hồi trễ hạn nên cảnh báo đã chuyển lên Quản trị. */
export const escalatedAlert: AlertResponse = {
  id: 37, batchCode: 'P-2611-04', farmName: 'HTX Năm Căn', type: 'WaterQuality', severity: 'High', message: 'Độ mặn dàn 2 xuống dưới ngưỡng',
  raisedAt: daysFromNow(-1), ackDeadline: daysFromNow(-0.9), status: 'Escalated', acknowledgedAt: daysFromNow(-0.5), acknowledgedBy: 102,
  responseNote: 'Đã thay nước', escalatedAt: daysFromNow(-0.9), resolutionNote: null,
}
export const acknowledgedAlert: AlertResponse = {
  id: 35, batchCode: 'P-2610-02', farmName: 'Trại cua Tư Bền', type: 'Mortality', severity: 'Medium', message: 'Ba con chết trong một ngày ở dàn 1',
  raisedAt: daysFromNow(-2), ackDeadline: daysFromNow(-1.9), status: 'Acknowledged', acknowledgedAt: daysFromNow(-1.95), acknowledgedBy: 102,
  responseNote: 'Đã tách hộp và kiểm tra nước', escalatedAt: null, resolutionNote: null,
}
export const adminAlerts: AlertResponse[] = [escalatedAlert, acknowledgedAlert]

/** GET /api/admin/alerts: Status rỗng là mọi trạng thái, không gửi Status thì máy chủ chỉ trả cảnh báo đã chuyển cấp. */
export const alertListReply = (rows: () => AlertResponse[]) => ({ query }: Call): PagedResultOfAlertResponse => {
  const status = query.Status ?? 'Escalated'
  const q = (query.Q ?? '').toLowerCase()
  const hits = rows().filter((a) => (!status || a.status === status) && (!query.Severity || a.severity === query.Severity)
    && (!q || `${a.batchCode} ${a.farmName} ${a.message}`.toLowerCase().includes(q)))
  return { items: hits, page: Number(query.Page ?? 1), pageSize: Number(query.PageSize ?? 20), total: hits.length }
}

/** Hộ nuôi của người nuôi mẫu (thẻ đầu menu cổng người nuôi gọi GET /api/operators/me). */
export const operatorProfile: OperatorResponse = {
  operatorId: 7, legalName: 'HTX Năm Căn', taxCode: '2001234567', businessRegNo: '61A8001234', farmAddress: 'Ấp Chống Mỹ, Năm Căn, Cà Mau',
  status: 'Approved', submittedAt: daysFromNow(-90), memberRole: 'Owner', canEdit: false, canSubmit: false,
}

/** Cảnh báo mới của trại, còn trong hạn phản hồi. */
export const openAlert: AlertResponse = {
  id: 38, batchCode: 'P-2611-04', farmName: 'HTX Năm Căn', type: 'WaterQuality', severity: 'High', message: 'Nhiệt độ nước dàn 1 vượt 32 °C',
  raisedAt: daysFromNow(-0.02), ackDeadline: daysFromNow(0.06), status: 'Open', acknowledgedAt: null, acknowledgedBy: null,
  responseNote: null, escalatedAt: null, resolutionNote: null,
}
export const operatorAlerts: AlertResponse[] = [openAlert, { ...acknowledgedAlert, batchCode: 'P-2611-04', farmName: 'HTX Năm Căn' }]

/* ---------- Nhật ký kiểm toán: /admin/audit-log ---------- */

export const auditRow: AuditLogRow = {
  auditId: 76, entityType: 'batch', entityId: 73, actionType: 'Approve', oldValue: '{"status":"PendingApproval"}', newValue: '{"status":"Funding"}',
  actorUserId: 104, occurredAt: daysFromNow(-1), prevHash: 'a'.repeat(64), rowHash: 'b'.repeat(64),
}
export const systemAuditRow: AuditLogRow = {
  auditId: 75, entityType: 'Alert', entityId: 37, actionType: 'Escalate', oldValue: null, newValue: '{"status":"Escalated"}',
  actorUserId: null, occurredAt: daysFromNow(-1.2), prevHash: 'c'.repeat(64), rowHash: 'a'.repeat(64),
}
export const auditPage = (extra: Partial<AuditLogPage> = {}): AuditLogPage => ({
  items: [auditRow, systemAuditRow], page: 1, pageSize: 50, total: 2, throughAuditId: 76,
  chain: { isValid: true, checkedRows: 76, brokenAuditId: null, problem: null },
  ...extra,
})

/* ---------- Người dùng và eKYC: /admin/users, /admin/users/:id ---------- */

export const investorUser: AdminUserResponse = {
  userId: 42, fullName: 'Nguyễn An', email: 'nguyen-an@test.local', phone: '0901234567', status: 'Active', roles: ['Investor', 'Customer'],
  verificationStatus: 'Rejected', createdAt: daysFromNow(-30), lastLoginAt: null,
}
export const operatorUser: AdminUserResponse = {
  userId: 43, fullName: 'Trần Văn Bền', email: 'tu-ben@test.local', phone: null, status: 'Locked', roles: ['OperatorMember'],
  verificationStatus: null, createdAt: daysFromNow(-200), lastLoginAt: daysFromNow(-9),
}
export const adminUsers: AdminUserResponse[] = [investorUser, operatorUser]

/** Lần eKYC giấy tờ và khuôn mặt không đạt, mới nhất, đã có đồng ý: duyệt ngoại lệ được. */
export const failedKyc: AdminKycResponse = {
  id: 7, userId: 42, fullName: investorUser.fullName, email: investorUser.email, checkType: 'EkycIdFace', result: 'Failed', providerReference: 'EKYC-TEST-0007',
  consentAt: daysFromNow(-2.1), checkedAt: daysFromNow(-2), failureReason: 'Không khớp khuôn mặt', reviewedBy: null, canApproveException: true,
}
/** Lần khớp tên tài khoản ngân hàng không đạt: không duyệt ngoại lệ được. */
export const bankKyc: AdminKycResponse = {
  ...failedKyc, id: 8, userId: 44, fullName: 'Lê Thị Hoa', email: 'le-hoa@test.local', checkType: 'BankNameMatch', providerReference: null,
  failureReason: 'Tên chủ tài khoản khác tên đăng ký', canApproveException: false,
}
export const kycChecks: AdminKycResponse[] = [failedKyc, bankKyc]

export const userDetail: AdminUserDetailResponse = { user: investorUser, verifiedAt: null, kycChecks: [failedKyc] }

export const userListReply = (rows: AdminUserResponse[], total?: number) => ({ query }: Call): PagedResultOfAdminUserResponse => ({
  items: rows.filter((u) => (!query.role || u.roles.includes(query.role)) && (!query.status || u.status === query.status)
    && (!query.q || `${u.fullName} ${u.email} ${u.phone ?? ''}`.toLowerCase().includes(query.q.toLowerCase()))),
  page: Number(query.page ?? 1), pageSize: 20, total: total ?? rows.length,
})

/** GET /api/admin/kyc-checks: result rỗng là mọi kết quả, không gửi result thì máy chủ chỉ trả lần không đạt. */
export const kycListReply = (rows: AdminKycResponse[]) => ({ query }: Call): PagedResultOfAdminKycResponse => {
  const result = query.result ?? 'Failed'
  const hits = rows.filter((c) => (!result || c.result === result) && (!query.checkType || c.checkType === query.checkType))
  return { items: hits, page: 1, pageSize: 20, total: hits.length }
}

/* ---------- giả lập mặc định và danh sách trang ---------- */

/** Giả lập mặc định cho mọi trang trong ADMIN_PAGES. Test ghi đè từng endpoint khi cần dữ liệu khác. */
export function mockAdmin(api: Api): void {
  // Lô
  api.get('/api/admin/batches', batchListReply(adminBatches))
  api.get(/^\/api\/admin\/batches\/[^/]+$/, (call) => adminBatches.find((b) => call.path.endsWith(`/${b.batch.batchCode}`)) ?? notFound('Lô'))
  api.get(/^\/api\/batches\/[^/]+\/progress$/, batchProgress)
  api.get(/^\/api\/batches\/[^/]+\/money-summary$/, batchMoney)
  api.get(/^\/api\/batches\/[^/]+\/settlement-readiness$/, (call) => (call.path.includes(sellingReadiness.batchCode) ? sellingReadiness : batchReadiness))
  // Tiền
  api.get('/api/admin/tranches', trancheListReply(tranches))
  api.get('/api/admin/funding/batches', fundingBatches)
  api.get('/api/admin/settlements', settlements)
  api.get(`/api/admin/settlements/${draftSettlement.settlementId}`, draftSettlement)
  // Chất lượng
  api.get('/api/review/evidence', evidenceListReply(evidenceList))
  api.get(`/api/review/evidence/${evidence.id}`, evidenceDetail)
  api.get(`/api/review/evidence/${evidence.id}/image`, file(PNG, 'image/png'))
  api.get('/api/admin/alerts', alertListReply(() => adminAlerts))
  // Cổng người nuôi
  api.get('/api/operators/me', operatorProfile)
  api.get('/api/operators/me/alerts', operatorAlerts)
  // Hệ thống và tài khoản
  api.get('/api/admin/audit-log', auditPage())
  api.get('/api/admin/users', userListReply(adminUsers))
  api.get(`/api/admin/users/${investorUser.userId}`, userDetail)
  api.get('/api/admin/kyc-checks', kycListReply(kycChecks))
}

/** Mọi trang mà các spec của cổng Quản trị mở. Mỗi trang dựng đủ chỉ với signIn(role) và mockAdmin(api). */
export const ADMIN_PAGES: PageUnderTest[] = [
  { role: 'PlatformAdmin', path: '/admin/batches', ready: pendingBatch.title },
  { role: 'PlatformAdmin', path: `/admin/batches/${pendingBatch.batchCode}`, ready: 'Chờ quyết định duyệt' },
  { role: 'PlatformAdmin', path: `/admin/batches/${pendingBatch.batchCode}?tab=cost`, ready: 'Tổng chi phí Lô chịu' },
  { role: 'PlatformAdmin', path: `/admin/batches/${fundingDetail.batch.batchCode}`, ready: 'Còn giữ trong tài khoản' },
  { role: 'PlatformAdmin', path: '/admin/tranches', ready: 'Tiền chờ duyệt' },
  { role: 'PlatformAdmin', path: '/admin/funding', ready: 'Lô đang nhận góp' },
  { role: 'PlatformAdmin', path: '/admin/settlements', ready: 'HTX Ngọc Hiển' },
  { role: 'PlatformAdmin', path: `/admin/settlements/${draftSettlement.settlementId}`, ready: 'Phần chia cho nhà đầu tư' },
  { role: 'EvidenceReviewer', path: '/admin/evidence', ready: '92 / 100' },
  { role: 'EvidenceReviewer', path: `/admin/evidence/${evidence.id}`, ready: `Bằng chứng #${evidence.id}` },
  { role: 'PlatformAdmin', path: '/admin/alerts', ready: escalatedAlert.message },
  { role: 'OperatorMember', path: '/operator/alerts', ready: openAlert.message },
  { role: 'PlatformAdmin', path: '/admin/audit-log', ready: /Chuỗi băm còn nguyên/ },
  { role: 'PlatformAdmin', path: '/admin/users', ready: investorUser.email },
  { role: 'PlatformAdmin', path: '/admin/users?tab=kyc', ready: bankKyc.failureReason! },
  { role: 'PlatformAdmin', path: `/admin/users/${investorUser.userId}`, ready: 'Lịch sử kiểm tra danh tính' },
]

/* ---------- tìm phần tử ---------- */

/** Một ô nhãn và giá trị (OpFacts, OpKv, OpDl) tìm theo nhãn, để kiểm tra giá trị đi đúng với nhãn của nó. */
export const fact = (scope: Page | Locator, label: string) =>
  scope.locator('dl > div').filter({ has: ('page' in scope ? scope.page() : scope).getByText(label, { exact: true }) })

/** Cổng chặn để giữ một lời gọi API ở trạng thái đang gửi cho tới khi test mở. */
export function gate() {
  let open!: () => void
  const wait = new Promise<void>((resolve) => { open = resolve })
  return { wait, open }
}

/**
 * Mở một trang mà vai trò đang đăng nhập không được vào và chờ ứng dụng đưa về trang chủ.
 * Trang chủ tải phông và ảnh từ máy chủ ngoài, nên chỉ chờ ứng dụng chạy chứ không chờ sự kiện load.
 */
export async function expectTurnedAway(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL('/')
}
