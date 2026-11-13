/* Dữ liệu giả lập của cổng nhà đầu tư (/nha-dau-tu/…): tổng quan, Lô đang gọi vốn, luồng góp vốn, Lô tôi đã góp, biểu quyết, hợp đồng,
   quyết toán, thông báo, hồ sơ.
   Bốn Lô mẫu: RUN đã chốt vốn và đang lưu nuôi, OPEN còn gọi vốn và tôi đã góp, DONE đã đóng và chi trả xong, NEW còn gọi vốn và tôi chưa góp. */
import type {
  BatchProgressResponse, ContractResponse, ContractSummary, ContributionResponse, DecisionResponse, DeviceImageResponse, ExploreBatchResponse,
  FundingBatchResponse, FundingBatchSummary, KycStatusResponse, MoneySummaryResponse, NotificationPage, PartyResponse, PaymentRequestResponse,
  PayoutProfileResponse, PortfolioDetail, PortfolioItem, PortfolioPage, RiskDisclosureResponse, SettlementReadinessResponse, SettlementResponse,
  SettlementSummary, TimelineItem, TimelinePage, WaterReadingResponse,
} from '../../src/shared/api/api.gen'
import type { Locator } from '@playwright/test'
import { PNG, dateFromNow, daysFromNow, file, userOf, type Api, type Call, type Page, type PageUnderTest } from './app'

export const investor = userOf('Investor')

export const RUN = 'P-2610-04'
export const OPEN = 'P-2611-07'
export const DONE = 'P-2608-02'
export const NEW = 'P-2611-09'

/** Ngày như formatDate của ứng dụng (giờ Việt Nam, không thêm số 0): "5/11/2026". */
export const viDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/** Ngày giờ như formatDateTime của ứng dụng: "09:30 5/11/26". */
export const viDateTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/** "2026-11-05" → "05/11/2026": phần ngày trong tiêu đề một ngày của nhật trình. */
export const dmy = (date: string) => date.slice(0, 10).split('-').reverse().join('/')

/** Một khối OpPanel, tìm theo đúng tiêu đề của nó (tiêu đề có thể kèm nút "Giải thích: …" của phần giải thích). */
export const panel = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`^${escapeRegExp(title)}(\\s*Giải thích: .+)?$`) }) })

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const pageOf = (scope: Page | Locator): Page => ('page' in scope ? scope.page() : scope)

/** Một ô nhãn và giá trị (OpFacts, OpKv, OpDl), tìm theo đúng nhãn. */
export const fact = (scope: Page | Locator, label: string) =>
  scope.locator('dl > div').filter({ has: pageOf(scope).locator('dt', { hasText: new RegExp(`^${escapeRegExp(label)}$`) }) })

/** Một khối gấp OpMore, tìm theo nhãn của nó. Bấm `.locator('summary')` để mở. */
export const more = (scope: Page | Locator, label: string | RegExp) =>
  scope.locator('details').filter({ has: pageOf(scope).locator('summary', { hasText: label }) })

/* ---------- Lô tôi đã góp ---------- */

/** Lô đã chốt vốn, đang lưu nuôi: có ba số tiền, biểu quyết, nhật trình, thiết bị. */
export const running: PortfolioItem = {
  batch: {
    code: RUN, title: 'Cua gạch Năm Căn tháng 11', operatorName: 'HTX Năm Căn', crabType: 'RoeCrab', status: 'InProduction',
    targetCapital: 200_000_000, raisedCapital: 200_000_000, minContribution: 5_000_000, cycleDays: 30, seedQuantity: 600,
    fundingDeadline: daysFromNow(-20), stockedAt: daysFromNow(-11), expectedHarvestDate: dateFromNow(19), dayOfCycle: 12, aliveCount: 571, openAlerts: 1,
  },
  confirmedAmount: 30_000_000, capitalRatio: 0.15, capitalBasis: 'Frozen', lastConfirmedAt: daysFromNow(-22), settlement: null,
}

/** Lô còn gọi vốn: khoản góp đã xác nhận nhưng vốn chưa chốt, nên chưa có ba số tiền và biểu quyết. */
export const open: PortfolioItem = {
  batch: {
    code: OPEN, title: 'Cua thịt Ngọc Hiển tháng 12', operatorName: 'Trại cua Tư Bền', crabType: 'FatteningMudCrab', status: 'Funding',
    targetCapital: 120_000_000, raisedCapital: 60_000_000, minContribution: 2_000_000, cycleDays: 45, seedQuantity: 400,
    fundingDeadline: daysFromNow(9), stockedAt: null, expectedHarvestDate: null, dayOfCycle: null, aliveCount: null, openAlerts: 0,
  },
  confirmedAmount: 10_000_000, capitalRatio: 0.166667, capitalBasis: 'LiveConfirmed', lastConfirmedAt: daysFromNow(-1), settlement: null,
}

/** Lô đã đóng: bảng quyết toán đã duyệt và đã chi trả. */
export const closed: PortfolioItem = {
  batch: {
    code: DONE, title: 'Cua gạch Đầm Dơi tháng 9', operatorName: 'Hộ nuôi Sáu Thơ', crabType: 'RoeCrab', status: 'Closed',
    targetCapital: 200_000_000, raisedCapital: 200_000_000, minContribution: 5_000_000, cycleDays: 30, seedQuantity: 600,
    fundingDeadline: daysFromNow(-80), stockedAt: daysFromNow(-70), expectedHarvestDate: dateFromNow(-40), dayOfCycle: 30, aliveCount: 0, openAlerts: 0,
  },
  confirmedAmount: 20_000_000, capitalRatio: 0.1, capitalBasis: 'Frozen', lastConfirmedAt: daysFromNow(-82),
  settlement: { status: 'PaidOut', capitalReturn: 20_000_000, profitShare: 1_850_000, taxWithheld: 92_500, netPayout: 21_757_500, inKindQtyKg: 0 },
}

export const portfolioItems = [running, open, closed]

/** Tổng của cả danh mục: không đổi theo bộ lọc. */
export const portfolioSummary: PortfolioPage['summary'] = {
  totalConfirmedAmount: 60_000_000, activeConfirmedAmount: 40_000_000, totalBatches: 3, activeBatches: 2, approvedNetPayout: 21_757_500,
}

export const portfolioPage = (items: PortfolioItem[] = portfolioItems, extra: Partial<PortfolioPage> = {}): PortfolioPage => ({
  items, page: 1, pageSize: 20, total: items.length, summary: portfolioSummary, ...extra,
})

/** Lọc như máy chủ: theo trạng thái Lô và theo chữ trong mã, tên Lô, người nuôi. */
const portfolioFor = (call: Call): PortfolioPage => {
  const q = (call.query.q ?? '').toLowerCase()
  const items = portfolioItems.filter((p) => (!call.query.status || p.batch.status === call.query.status)
    && (!q || `${p.batch.code} ${p.batch.title} ${p.batch.operatorName}`.toLowerCase().includes(q)))
  return portfolioPage(items, { page: Number(call.query.page ?? 1), pageSize: Number(call.query.pageSize ?? 20) })
}

const MONEY_NOTE = 'Phần của bạn trong số đã giải ngân tính theo tỷ lệ vốn, làm tròn xuống. Số dư tài khoản của Lô gồm cả tiền cọc và tiền hàng của khách.'

export const moneyRunning: MoneySummaryResponse = {
  batchCode: RUN, batch: { contributed: 200_000_000, disbursed: 80_000_000, heldInAccount: 131_500_000 },
  mine: { contributed: 30_000_000, disbursed: 12_000_000, heldInAccount: 18_000_000 }, note: MONEY_NOTE,
}

export const moneyClosed: MoneySummaryResponse = {
  batchCode: DONE, batch: { contributed: 200_000_000, disbursed: 200_000_000, heldInAccount: 0 },
  mine: { contributed: 20_000_000, disbursed: 20_000_000, heldInAccount: 0 }, note: MONEY_NOTE,
}

export const progressRunning: BatchProgressResponse = {
  batchCode: RUN, status: 'InProduction', crabsAlive: 571, daysRaised: 12, isParticipant: true, deadCrabs: 9, restockedCrabs: 4, gradedCrabs: 0, deliveredOrSoldCrabs: 0,
}
export const progressOpen: BatchProgressResponse = {
  batchCode: OPEN, status: 'Funding', crabsAlive: 0, daysRaised: null, isParticipant: true, deadCrabs: 0, restockedCrabs: 0, gradedCrabs: 0, deliveredOrSoldCrabs: 0,
}
export const progressClosed: BatchProgressResponse = {
  batchCode: DONE, status: 'Closed', crabsAlive: 0, daysRaised: 30, isParticipant: true, deadCrabs: 21, restockedCrabs: 6, gradedCrabs: 579, deliveredOrSoldCrabs: 579,
}

export const detailRunning: PortfolioDetail = {
  position: running,
  contributions: [
    { id: 412, amount: 20_000_000, status: 'Confirmed', reservedAt: daysFromNow(-23), confirmedAt: daysFromNow(-23), contractNo: 'HD-2610-0412', contractStatus: 'FullySigned', fullySignedAt: daysFromNow(-22) },
    { id: 415, amount: 10_000_000, status: 'Confirmed', reservedAt: daysFromNow(-22), confirmedAt: daysFromNow(-22), contractNo: 'HD-2610-0415', contractStatus: 'FullySigned', fullySignedAt: daysFromNow(-21) },
  ],
  timeline: [
    { type: 'Production', label: 'Nhận nhật ký nuôi', at: daysFromNow(-1) },
    { type: 'Stocked', label: 'Thả giống', at: daysFromNow(-11) },
    { type: 'CapitalClosed', label: 'Chốt vốn lô', at: daysFromNow(-20) },
  ],
  latestProduction: { logDate: dateFromNow(-1), ph: 7.8, waterTempC: 28.5, salinityPpt: 22, feedKg: 14.25, source: 'Manual', plausibilityFlag: 'Ok', verifiedAt: null },
}

export const detailOpen: PortfolioDetail = {
  position: open,
  contributions: [
    { id: 731, amount: 10_000_000, status: 'Confirmed', reservedAt: daysFromNow(-1), confirmedAt: daysFromNow(-1), contractNo: 'HD-2611-0731', contractStatus: 'OperatorSigned', fullySignedAt: null },
  ],
  timeline: [{ type: 'Funding', label: 'Mở gọi vốn', at: daysFromNow(-5) }],
  latestProduction: null,
}

export const detailClosed: PortfolioDetail = {
  position: closed,
  contributions: [
    { id: 208, amount: 20_000_000, status: 'Confirmed', reservedAt: daysFromNow(-82), confirmedAt: daysFromNow(-82), contractNo: 'HD-2608-0208', contractStatus: 'FullySigned', fullySignedAt: daysFromNow(-81) },
  ],
  timeline: [{ type: 'Closed', label: 'Đóng lô', at: daysFromNow(-12) }],
  latestProduction: null,
}

/* ---------- biểu quyết, hợp đồng, quyết toán, khoản góp ---------- */

/** Cuộc biểu quyết đang mở mà tôi chưa bỏ phiếu. */
export const decisionOpen: DecisionResponse = {
  decisionNo: 'QD-2610-04-02', batchCode: RUN, kind: 'EarlyLiquidation', proposal: 'Cua chết tăng ba ngày liền, đề nghị thanh lý sớm phần cua còn lại.',
  status: 'Open', openedAt: daysFromNow(-1), closesAt: daysFromNow(2), eligibleCapital: 200_000_000, yesCapital: 80_000_000, noCapital: 20_000_000,
  yesPct: 40, noPct: 10, myChoice: null, canVote: true, decidedAt: null,
}

/** Cuộc biểu quyết đã thông qua, tôi đã chọn đồng ý. */
export const decisionPassed: DecisionResponse = {
  decisionNo: 'QD-2610-04-01', batchCode: RUN, kind: 'SurplusSale', proposal: 'Bán 40 con dư mà bên cam kết thu mua không nhận.',
  status: 'Passed', openedAt: daysFromNow(-8), closesAt: daysFromNow(-5), eligibleCapital: 200_000_000, yesCapital: 150_000_000, noCapital: 10_000_000,
  yesPct: 75, noPct: 5, myChoice: 'Yes', canVote: false, decidedAt: daysFromNow(-6),
}

export const decisionsRunning = [decisionPassed, decisionOpen]

const contractOf = (extra: Partial<ContractSummary>): ContractSummary => ({
  contractId: 0, contractNo: '', status: 'FullySigned', signingMethod: 'DigitalSignature', batchCode: RUN, batchTitle: running.batch.title,
  investorName: investor.fullName, amount: 0, contributionStatus: 'Confirmed', nextSigner: null, createdAt: daysFromNow(-23), fullySignedAt: daysFromNow(-22), ...extra,
})

/** Hợp đồng ở Lô OPEN đang chờ tôi ký (người nuôi đã ký). */
export const contractToSign = contractOf({
  contractId: 731, contractNo: 'HD-2611-0731', status: 'OperatorSigned', batchCode: OPEN, batchTitle: open.batch.title, amount: 10_000_000,
  nextSigner: 'Investor', createdAt: daysFromNow(-1), fullySignedAt: null,
})

export const contracts: ContractSummary[] = [
  contractToSign,
  contractOf({ contractId: 412, contractNo: 'HD-2610-0412', amount: 20_000_000 }),
  contractOf({ contractId: 415, contractNo: 'HD-2610-0415', amount: 10_000_000 }),
  contractOf({ contractId: 208, contractNo: 'HD-2608-0208', batchCode: DONE, batchTitle: closed.batch.title, amount: 20_000_000, createdAt: daysFromNow(-82), fullySignedAt: daysFromNow(-81) }),
]

export const LEGAL_NOTICE = 'Bản demo: mẫu hợp đồng chưa được rà soát pháp lý, chỉ dùng để minh hoạ luồng ký số.'

/** Hợp đồng đầy đủ dựng từ một dòng tóm tắt: người nuôi đã ký; đủ chữ ký thì có thêm chữ ký của tôi, chưa đủ thì tới lượt tôi. */
export const contractDetail = (summary: ContractSummary, extra: Partial<ContractResponse> = {}): ContractResponse => {
  const signed = summary.status === 'FullySigned'
  const at = summary.fullySignedAt ?? summary.createdAt
  return {
    contractId: summary.contractId, contractNo: summary.contractNo, status: summary.status, signingMethod: summary.signingMethod,
    batchCode: summary.batchCode, batchTitle: summary.batchTitle, operatorName: portfolioItems.find((p) => p.batch.code === summary.batchCode)?.batch.operatorName ?? 'HTX Năm Căn',
    investorName: summary.investorName, contributionId: summary.contractId, amount: summary.amount, contributionStatus: summary.contributionStatus,
    templateVersion: 'HDGV-2026.1', draftHash: 'a1'.repeat(32), currentHash: (signed ? 'f6' : 'b2').repeat(32), finalHash: signed ? 'f6'.repeat(32) : null,
    fullySignedAt: summary.fullySignedAt, createdAt: summary.createdAt,
    signatures: [
      { role: 'Operator', order: 1, signerName: 'Nguyễn Văn Năm', signedAt: at, signedHash: 'b2'.repeat(32), providerReference: `SIG-OP-${summary.contractId}` },
      ...(signed ? [{ role: 'Investor', order: 2, signerName: summary.investorName, signedAt: at, signedHash: 'f6'.repeat(32), providerReference: `SIG-IV-${summary.contractId}` }] : []),
    ],
    nextSigner: summary.nextSigner, canSign: summary.nextSigner === 'Investor', legalNotice: LEGAL_NOTICE, ...extra,
  }
}

/** Tệp PDF tối thiểu cho GET /api/contracts/{id}/file. */
export const PDF = file('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'application/pdf')

export const settlementPaid: SettlementSummary = {
  settlementId: 31, batchCode: DONE, batchTitle: closed.batch.title, status: 'PaidOut', revisionNo: 1, revenuePool: 23_125_000, myNetPayout: 21_757_500,
  feedbackDeadline: daysFromNow(-20), feedbackOpen: false, openFeedback: 0,
}

/**
 * Sao kê quyết toán của Lô DONE, đã chi trả. Nhà đầu tư chỉ nhận dòng của chính mình.
 * Doanh thu 220 triệu − phí nền tảng 3% − chi phí được trừ = 23.125.000 đ; trừ thù lao người nuôi 20% còn 18.500.000 đ chia theo vốn, tôi giữ 10%.
 */
export const settlementDone: SettlementResponse = {
  settlementId: 31, batchCode: DONE, batchTitle: closed.batch.title, operatorName: closed.batch.operatorName, batchStatus: 'Closed', status: 'PaidOut', revisionNo: 1,
  orderRevenue: 217_000_000, forfeitedDeposits: 3_000_000, complaintRefunds: 0, actualRevenue: 220_000_000, lockedStandardCost: 190_275_000, revenuePool: 23_125_000,
  operatorSharePct: 20, operatorRemuneration: 4_625_000, distributable: 18_500_000, depreciationAmount: 0, taxTotal: 925_000, uncoveredLoss: 0,
  reconciliationDifference: 0, totalCapital: 200_000_000, totalNetPayout: 217_575_000, investorCount: 8,
  proposedAt: daysFromNow(-27), feedbackDeadline: daysFromNow(-20), approvedAt: daysFromNow(-19), createdAt: daysFromNow(-28), updatedAt: daysFromNow(-12),
  lines: [{
    settlementLineId: 3101, investorId: investor.userId, investorName: investor.fullName, capitalReturn: 20_000_000, profitShare: 1_850_000, taxWithheld: 92_500,
    netPayout: 21_757_500, isMine: true, payoutStatus: 'Succeeded',
  }],
  feedback: [],
  taxNotice: 'Thuế khấu trừ do nền tảng khai và nộp thay theo quy định hiện hành; số liệu trên không phải tư vấn thuế.',
  auditAnchors: [{ milestone: 'Approved', occurredAt: daysFromNow(-19), auditId: 5001, rowHash: 'e5'.repeat(32) }],
  breakdown: {
    mode: 'P', basis: 'StandardCost', preOrderRevenue: 170_000_000, invoicedSaleRevenue: 30_000_000, forfeitedDeposits: 3_000_000, finalOrderRevenue: 17_000_000,
    platformFeeRatePct: 3, platformFee: 6_600_000, standardCostDeductible: 190_275_000, actualCostTotal: 186_400_000, excludedFaultCost: 0,
    disbursedTotal: 200_000_000, undisbursedCost: 0, customerRefunds: 0, receivedCount: 600, deadCount: 21, survivalRatePct: 96.5,
    commissionPct: null, commissionAmount: 0, supplierPayout: 0, isLiquidation: false,
  },
}

const contributionOf = (contributionId: number, item: PortfolioItem, amount: number, days: number): ContributionResponse => ({
  contributionId, batchCode: item.batch.code, batchTitle: item.batch.title, amount, status: 'Confirmed',
  reservedAt: daysFromNow(days), expiresAt: daysFromNow(days), confirmedAt: daysFromNow(days),
})

/** Mọi khoản góp của tôi; không có khoản nào đang giữ chỗ. */
export const contributions: ContributionResponse[] = [
  contributionOf(731, open, 10_000_000, -1),
  contributionOf(412, running, 20_000_000, -23),
  contributionOf(415, running, 10_000_000, -22),
  contributionOf(208, closed, 20_000_000, -82),
]

/* ---------- Lô đang gọi vốn và luồng góp vốn ---------- */

/** Lô tôi chưa góp: đã xác minh danh tính và đã xác nhận rủi ro nên vào thẳng bước số tiền. */
export const fundingNew: FundingBatchResponse = {
  batchCode: NEW, title: 'Cua gạch Phú Tân tháng 12', crabType: 'RoeCrab', status: 'Funding', operatorName: 'HTX Phú Tân',
  minContribution: 2_000_000, minViableCapital: 80_000_000, targetCapital: 120_000_000, maxCapital: 150_000_000,
  confirmedCapital: 55_000_000, reservedCapital: 5_000_000, remainingCapacity: 90_000_000, investorCount: 6,
  fundingOpenAt: daysFromNow(-4), fundingDeadline: daysFromNow(10), isOpen: true, reservationMinutes: 15,
  me: { kycVerified: true, riskAcknowledged: true }, myActiveReservation: null,
}

export const fundingOpen: FundingBatchResponse = {
  ...fundingNew, batchCode: OPEN, title: open.batch.title, crabType: open.batch.crabType, operatorName: open.batch.operatorName,
  confirmedCapital: 60_000_000, reservedCapital: 0, remainingCapacity: 90_000_000, investorCount: 5, fundingDeadline: open.batch.fundingDeadline,
}

const summaryOf = (f: FundingBatchResponse): FundingBatchSummary => ({
  batchCode: f.batchCode, title: f.title, crabType: f.crabType, operatorName: f.operatorName, minContribution: f.minContribution,
  targetCapital: f.targetCapital, maxCapital: f.maxCapital, confirmedCapital: f.confirmedCapital, remainingCapacity: f.remainingCapacity, fundingDeadline: f.fundingDeadline,
})

export const fundingList: FundingBatchSummary[] = [summaryOf(fundingNew), summaryOf(fundingOpen)]

/** Bản công khai của Lô NEW mà nhà đầu tư nhận từ GET /api/batches/{code}. */
export const exploreNew: ExploreBatchResponse = {
  batchCode: NEW, batchMode: 'P', status: 'Funding', title: fundingNew.title, crabType: 'RoeCrab', executorName: fundingNew.operatorName,
  plannedQuantity: 500, fundedQuantity: null, hasHolding: true, holdingDays: 30, saleDays: 14, expectedAvgWeightG: 420, expectedGrade: 'G1',
  expectedReceiptDate: dateFromNow(15), deliveryRadiusKm: 300, distanceKm: null, standardCostTotal: 100_000_000, standardCostPerCrab: 200_000,
  offers: [], floorPricePerKg: 380_000, offtakeBuyerName: 'Công ty Hải sản Đất Mũi', platformFeeRatePct: 3, settlementBasis: 'StandardCost',
  targetCapital: 120_000_000, confirmedCapital: 55_000_000, reservedCapital: 5_000_000, remainingCapital: 60_000_000, investorCount: 6, minContribution: 2_000_000,
  sellableCrabs: 450, depositedPreorderCrabs: 0, preorderRatioPct: 0, fundingOpenAt: fundingNew.fundingOpenAt, fundingDeadline: fundingNew.fundingDeadline,
  preorderDeadline: null,
  costByCategory: [{ category: 'Seed', amount: 70_000_000 }, { category: 'Feed', amount: 20_000_000 }, { category: 'Labour', amount: 10_000_000 }],
}

export const exploreOpen: ExploreBatchResponse = {
  ...exploreNew, batchCode: OPEN, title: open.batch.title, crabType: open.batch.crabType, executorName: open.batch.operatorName, investorCount: 5,
  confirmedCapital: 60_000_000, reservedCapital: 0,
}

/** Bản công bố rủi ro đủ dài để khung phải cuộn; mặc định tôi đã xác nhận. */
export const riskDisclosure: RiskDisclosureResponse = {
  riskDisclosureId: 4, versionCode: 'RR-2026.2', effectiveFrom: daysFromNow(-60), contentHash: 'c3'.repeat(32),
  content: [
    '# Công bố rủi ro khi góp vốn vào Lô',
    'Đọc hết các mục dưới đây trước khi góp vốn.',
    '1. ★ Bạn có thể mất một phần hoặc toàn bộ số tiền đã góp.',
    '2. Cua là sinh vật sống: dịch bệnh, thời tiết và chất lượng nước có thể làm cua chết hàng loạt.',
    '3. Giá bán thực tế có thể thấp hơn giá chào lúc gọi vốn.',
    '4. Tới hạn mà Lô chưa đủ vốn tối thiểu thì Lô huỷ và tiền được hoàn, thời gian hoàn phụ thuộc ngân hàng.',
    '5. Tiền chỉ giải ngân theo mốc khi có bằng chứng; mốc bị dừng thì Lô có thể chậm.',
    '6. Phần được chia chỉ biết khi quyết toán, theo số đã ghi nhận thật.',
    '7. Khoản góp không chuyển nhượng và không rút trước hạn.',
    '8. Biểu quyết tính theo vốn đã chốt; kết quả ràng buộc cả người không bỏ phiếu.',
    '9. Hạng cua theo chuẩn nội bộ tham chiếu, không phải chứng nhận.',
    '10. Hợp đồng ở bản demo chưa được rà soát pháp lý.',
    '# Trách nhiệm của bạn',
    '11. Chỉ góp số tiền bạn chấp nhận mất.',
    '12. Tự theo dõi nhật trình, cảnh báo và bảng quyết toán của Lô.',
    '13. Giữ thông tin tài khoản nhận tiền đúng với hồ sơ đã xác minh.',
    '14. ★ Bấm xác nhận nghĩa là bạn đã đọc hết và hiểu các rủi ro trên.',
  ].join('\n'),
  acknowledgedAt: daysFromNow(-30),
}

/** Khoản vừa giữ chỗ ở Lô NEW, còn 14 phút. Là hàm vì hạn tính bằng phút: phải tính lúc test chạy, không phải lúc nạp tệp. */
export const reserved = (extra: Partial<ContributionResponse> = {}): ContributionResponse => ({
  contributionId: 905, batchCode: NEW, batchTitle: fundingNew.title, amount: 10_000_000, status: 'Reserved',
  reservedAt: daysFromNow(0), expiresAt: daysFromNow(14 / 1440), confirmedAt: null, ...extra,
})

export const REFERENCE = 'CSG905K7M2'

/** Mã VietQR thử nghiệm của một khoản đang giữ chỗ; mã hết hạn cùng lúc với giữ chỗ. */
export const paymentFor = (r: ContributionResponse): PaymentRequestResponse => ({
  paymentRequestId: 6001, purpose: 'Contribution', status: 'Pending', batchCode: r.batchCode, referenceCode: REFERENCE,
  amount: r.amount, qrContent: `VIETQR|SANDBOX|${REFERENCE}|${r.amount}`, expiresAt: r.expiresAt,
  providerName: 'Ngân hàng thử nghiệm', accountNo: '9704001122334455',
})

/* ---------- nhật trình và thiết bị của Lô RUN ---------- */

const entry = (type: string, id: number, date: string, extra: Partial<TimelineItem>): TimelineItem => ({
  id: `${type}:${id}`, type, sourceId: String(id), businessDate: date, occurredAt: `${date}T02:30:00Z`, timeBasis: 'Occurred', ...extra,
})

/** Ngày gần nhất trong nhật trình mặc định. */
export const TIMELINE_DAY = dateFromNow(-1)

export const timelineEntries: TimelineItem[] = [
  entry('Alert', 1, TIMELINE_DAY, { alert: { type: 'WaterQuality', severity: 'Medium', message: 'Độ mặn ngoài khoảng hộ nuôi đã cấu hình.', status: 'Acknowledged', acknowledgedAt: daysFromNow(-0.9), escalatedAt: null } }),
  entry('Evidence', 2, TIMELINE_DAY, { evidence: { mediaType: 'Photo', source: 'InAppCapture', slotCode: 'A-12', reviewStatus: 'Accepted', fileUrl: `/api/batches/${RUN}/timeline/evidence/2/file` } }),
  entry('SlotEvent', 3, TIMELINE_DAY, { slotEvent: { eventType: 'Relocated', slotCode: 'A-12', destinationSlotCode: 'A-18', quantity: 1, note: 'Chuyển sang hộp sạch' } }),
  entry('CrabEvent', 4, TIMELINE_DAY, { crabEvent: { eventType: 'Died', crabCode: 'C-000127', slotCode: 'B-03', source: 'App', reason: 'Yếu sau lột xác' } }),
  entry('ProductionLog', 5, TIMELINE_DAY, {
    occurredAt: null, timeBasis: 'Date',
    productionLog: { ph: 7.5, waterTempC: 28, salinityPpt: 20, feedKg: 1.25, source: 'Manual', plausibilityFlag: 'Ok', note: 'Kiểm tra nước buổi sáng' },
  }),
]

export const timelinePage = (extra: Partial<TimelinePage> = {}): TimelinePage => ({
  batchCode: RUN, timeZone: 'Asia/Ho_Chi_Minh', groups: [{ date: TIMELINE_DAY, items: timelineEntries }], nextBefore: null, hasMore: false, ...extra,
})

export const waterReadings: WaterReadingResponse[] = [-2.5, -2, -1.5, -1, -0.5, -0.1].map((days, i) => ({
  measuredAt: daysFromNow(days), temperatureC: 27.5 + i * 0.2, salinityPpt: 21 + i * 0.3, ph: 7.6 + i * 0.05,
  quality: i === 1 ? 'Uncalibrated' : 'Calibrated', deviceCode: 'WS-01',
}))

const image = (deviceImageId: number, slotCode: string, days: number, crabDetected: boolean | null = true): DeviceImageResponse => ({
  deviceImageId, slotCode, crabCode: null, capturedAt: daysFromNow(days), receivedAt: daysFromNow(days), crabDetected,
  detectionConfidence: crabDetected === null ? null : 0.93, deviceCode: 'CAM-A', runId: null,
})

/** Ảnh mới xếp trước, như máy chủ trả về: hộp A-01 có hai ảnh, hộp A-02 ảnh mới nhất không thấy cua. */
export const deviceImages: DeviceImageResponse[] = [image(9004, 'A-01', -0.1), image(9003, 'A-02', -0.2, false), image(9001, 'A-01', -1.1)]

const CONDITIONS = [
  'Mọi con cua đã được giao, bán, ghi chết hoặc huỷ',
  'Mọi đơn đặt trước ở trạng thái cuối',
  'Đơn có hoá đơn và đơn hàng cuối đã thu đủ tiền',
  'Mọi lệnh hoàn tiền cho khách đã thành công',
  'Hết hạn đổi trả, không còn khiếu nại mở',
  'Không còn giao dịch tiền chưa khớp',
]

/** Sáu điều kiện chờ quyết toán; `pending[i]` là số mục còn thiếu của điều kiện thứ i (0 là đạt). */
export const readiness = (batchCode: string, batchStatus: string, pending: number[] = []): SettlementReadinessResponse => ({
  batchCode, batchStatus, ready: pending.every((n) => n === 0),
  conditions: CONDITIONS.map((description, i) => ({ no: i + 1, code: `C${i + 1}`, description, met: !pending[i], pending: pending[i] ?? 0 })),
})

/* ---------- thông báo, hồ sơ ---------- */

export const notifications: NotificationPage = {
  items: [
    { id: 'AlertRaised:88', type: 'AlertRaised', title: 'Cảnh báo vận hành', body: `Lô ${RUN} có cảnh báo mới. Mở danh mục để theo dõi lô.`, at: daysFromNow(-0.2), batchCode: RUN, canOpenPortfolio: true, amount: null },
    { id: 'PaymentConfirmed:731', type: 'PaymentConfirmed', title: 'Đã nhận tiền', body: `Khoản góp 10.000.000 đ cho lô ${OPEN} đã được xác nhận.`, at: daysFromNow(-1), batchCode: OPEN, canOpenPortfolio: true, amount: 10_000_000 },
    { id: 'PayoutSucceeded:31', type: 'PayoutSucceeded', title: 'Đã chi trả', body: `Lệnh chi trả 21.757.500 đ cho phần của bạn trong lô ${DONE} đã thành công.`, at: daysFromNow(-12), batchCode: DONE, canOpenPortfolio: true, amount: 21_757_500 },
  ],
  page: 1, pageSize: 20, total: 3, asOf: daysFromNow(0),
}

export const kycVerified: KycStatusResponse = {
  verificationStatus: 'Verified', verifiedAt: daysFromNow(-40),
  lastCheck: { id: 12, checkType: 'EkycIdFace', result: 'Passed', providerReference: 'EKYC-7F3A21', consentAt: daysFromNow(-40), checkedAt: daysFromNow(-40), failureReason: null },
}

export const kycUnverified: KycStatusResponse = { verificationStatus: 'Unverified', verifiedAt: null, lastCheck: null }

export const party: PartyResponse = {
  partyId: 55, partyCode: 'PT-000055', legalName: investor.fullName, partyType: 'Individual', registrationNo: null, representative: null, phone: '0901234567',
  verificationStatus: 'Verified', rejectReason: null, isPlatform: false,
  roles: [{ roleType: 'Investor', status: 'Active', validFrom: dateFromNow(-40), validTo: null, note: null }], sites: [],
}

/** Tên chủ tài khoản phải khớp tên trên hồ sơ. */
export const HOLDER = 'LE MINH KHOI'

export const payoutEmpty: PayoutProfileResponse = { ownerType: 'Investor', expectedHolderName: HOLDER, account: null }

export const payoutActive: PayoutProfileResponse = {
  ownerType: 'Investor', expectedHolderName: HOLDER,
  account: { payoutAccountId: 9, bankCode: 'VCB', accountNo: '0071000123456', accountHolderName: HOLDER, nameMatchStatus: 'Matched', status: 'Active', updatedAt: daysFromNow(-30) },
}

/* ---------- giả lập mặc định ---------- */

/** Đăng ký cùng một endpoint theo Lô cho nhiều Lô: /api/batches/{code}/{tail}. */
const perBatch = (api: Api, tail: string, data: Record<string, unknown>) => {
  for (const [code, body] of Object.entries(data)) api.get(`/api/batches/${code}/${tail}`, body)
}

/** Giả lập mặc định cho mọi trang trong INVESTOR_PAGES. Test ghi đè từng endpoint khi cần tình huống khác. */
export function mockInvestor(api: Api): void {
  // Lô tôi đã góp
  api.get('/api/investor/portfolio', portfolioFor)
  for (const d of [detailRunning, detailOpen, detailClosed]) api.get(`/api/investor/portfolio/${d.position.batch.code}`, d)
  perBatch(api, 'money-summary', { [RUN]: moneyRunning, [DONE]: moneyClosed })
  perBatch(api, 'progress', { [RUN]: progressRunning, [OPEN]: progressOpen, [DONE]: progressClosed })
  perBatch(api, 'decisions', { [RUN]: decisionsRunning, [DONE]: [] })
  perBatch(api, 'settlement-readiness', { [RUN]: readiness(RUN, 'InProduction', [571, 3]), [DONE]: readiness(DONE, 'Closed') })
  perBatch(api, 'timeline', { [RUN]: timelinePage() })
  api.get(`/api/batches/${RUN}/timeline/evidence/2/file`, file(PNG, 'image/png'))
  perBatch(api, 'water-readings', { [RUN]: waterReadings })
  api.get(`/api/batches/${RUN}/device-images`, (call) => deviceImages.filter((i) => !call.query.slotCode || i.slotCode === call.query.slotCode))
  api.get(/^\/api\/device-images\/900\d\/file$/, file(PNG, 'image/png'))

  // Việc cần làm, hợp đồng, quyết toán
  api.get('/api/me/contracts', contracts)
  for (const c of contracts) api.get(`/api/contracts/${c.contractId}`, contractDetail(c))
  api.get(new RegExp(`^/api/contracts/(${contracts.map((c) => c.contractId).join('|')})/file$`), PDF)
  api.get('/api/me/settlements', [settlementPaid])
  api.get(`/api/settlements/${settlementDone.settlementId}`, settlementDone)
  api.get('/api/me/contributions', contributions)

  // Lô đang gọi vốn và luồng góp vốn
  api.get('/api/funding/batches', fundingList)
  api.get(`/api/funding/batches/${NEW}`, fundingNew)
  api.get(`/api/funding/batches/${OPEN}`, fundingOpen)
  api.get(`/api/batches/${NEW}`, exploreNew)
  api.get(`/api/batches/${OPEN}`, exploreOpen)
  api.get('/api/risk-disclosures/active', riskDisclosure)

  // Thông báo, hồ sơ
  api.get('/api/me/notifications', notifications)
  api.get('/api/me/kyc', kycVerified)
  api.get('/api/me/party', party)
  api.get('/api/me/payout-account', payoutActive)
}

/** Đường dẫn trang một Lô tôi đã góp, kèm mục đang mở. */
export const lot = (code: string, tab?: string) => `/nha-dau-tu/danh-muc/${code}${tab ? `?tab=${tab}` : ''}`

/** Mọi trang của cổng nhà đầu tư mà các spec mở; mỗi trang tải đủ dữ liệu chỉ với signIn(page, 'Investor') và mockInvestor(api). */
export const INVESTOR_PAGES: PageUnderTest[] = [
  { role: 'Investor', path: '/nha-dau-tu', ready: /2 Lô đã chốt vốn/ },
  { role: 'Investor', path: '/nha-dau-tu/lo', ready: fundingNew.title },
  { role: 'Investor', path: `/nha-dau-tu/lo/${NEW}`, ready: 'Mua cua nguồn' },
  { role: 'Investor', path: `/nha-dau-tu/gop-von/${NEW}`, ready: 'Giữ chỗ 15 phút' },
  { role: 'Investor', path: '/nha-dau-tu/danh-muc', ready: 'Vốn đã xác nhận' },
  { role: 'Investor', path: lot(RUN), ready: 'Khoản góp của tôi' },
  { role: 'Investor', path: lot(RUN, 'nhat-trinh'), ready: 'Kiểm tra nước buổi sáng' },
  { role: 'Investor', path: lot(RUN, 'thiet-bi'), ready: /6 lượt đo/ },
  { role: 'Investor', path: lot(RUN, 'bieu-quyet'), ready: decisionOpen.proposal },
  { role: 'Investor', path: lot(RUN, 'quyet-toan'), ready: 'Còn 2 điều kiện' },
  { role: 'Investor', path: lot(OPEN), ready: 'Khoản góp của tôi' },
  { role: 'Investor', path: lot(DONE, 'quyet-toan'), ready: 'Mở bảng quyết toán' },
  { role: 'Investor', path: '/nha-dau-tu/bieu-quyet', ready: decisionOpen.proposal },
  { role: 'Investor', path: '/nha-dau-tu/hop-dong', ready: LEGAL_NOTICE },
  { role: 'Investor', path: '/nha-dau-tu/quyet-toan', ready: closed.batch.title },
  { role: 'Investor', path: `/nha-dau-tu/quyet-toan/${settlementDone.settlementId}`, ready: 'Doanh thu thực thu' },
  { role: 'Investor', path: '/nha-dau-tu/thong-bao', ready: 'Cảnh báo vận hành' },
  { role: 'Investor', path: '/nha-dau-tu/ho-so', ready: 'Đang nhận tiền' },
  { role: 'Investor', path: '/nha-dau-tu/ho-so?tab=xac-minh', ready: /Xác minh lúc/ },
  { role: 'Investor', path: '/nha-dau-tu/ho-so?tab=ho-so', ready: 'Lưu hồ sơ' },
]
