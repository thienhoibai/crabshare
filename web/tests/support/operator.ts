/* Dữ liệu giả lập của cổng người nuôi (/operator/…): hồ sơ hộ nuôi, các Lô, nhật ký chăm sóc, lượt đo và phân hạng,
   đơn đặt trước, đợt giao, chuyến giao, hộp nuôi, ảnh bằng chứng và trang tổng quan.
   `mockOperator(api)` đăng ký dữ liệu mặc định cho mọi trang trong OPERATOR_PAGES; từng test ghi đè phần nó cần
   (đăng ký sau thắng đăng ký trước). */
import type {
  AlertResponse, AllocationResponse, BatchGradingSummary, BatchProgressResponse, BatchResponse, CaptureRequestResponse, CostPlanResponse, CrabUnitResponse,
  DeviceResponse, GoodsReceiptResponse, GradeDecisionResponse, MoneySummaryResponse, OperatorDashboardResponse, OperatorEvidenceItem, OperatorResponse,
  PartySiteResponse, PartySummaryResponse, PreorderLineResponse, PreorderResponse, ProductionBatchResponse, ProductionLogResponse, ProductionThresholdResponse,
  ProductionThresholdState, SessionMeasurementsResponse, SessionResponse, ShipmentResponse, SpecResponse, TimelinePage, TrancheStatusResponse, WaterReadingResponse,
} from '../../src/shared/api/api.gen'
import type { Locator } from '@playwright/test'
import { PNG, dateFromNow, daysFromNow, file, paged, reply, type Api, type Call, type Page, type PageUnderTest } from './app'

const notFound = (what: string) => reply(404, { status: 404, detail: `Không tìm thấy ${what}.` })

/** Mã Lô nằm ngay sau /batches/ trong đường dẫn API. */
const codeIn = (call: Call) => /\/batches\/([^/]+)/.exec(call.path)?.[1] ?? ''

/* ---------- tiện ích cho spec ---------- */

/**
 * Giữ trang đứng yên khi có tệp trong web/ được lưu lúc test đang chạy. Máy chủ dev của Vite báo qua kênh HMR và trình duyệt tải lại
 * cả trang, kể cả khi tệp vừa lưu chỉ là một spec khác; hộp thoại đang mở và số đang nhập mất theo nên test hỏng ngẫu nhiên.
 * Ở đây kênh HMR (WebSocket duy nhất của trang) được thay bằng một kết nối câm. Gọi trước page.goto.
 */
export const noDevReload = (page: Page) => page.routeWebSocket(() => true, () => {})

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Một thẻ nội dung (OpPanel) tìm theo tiêu đề. Tiêu đề có thể kèm nút (i) "Giải thích: …" nên chỉ so phần đầu. */
export const panel = (page: Page, title: string | RegExp) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: typeof title === 'string' ? new RegExp(`^${escapeRegExp(title)}`) : title }) })

/** Dòng tiêu đề của một khối gấp (OpMore); bấm để mở hoặc đóng. */
export const more = (root: Page | Locator, label: string) => root.locator('summary').filter({ hasText: label })

/** Một ô số liệu nhỏ (OpFacts) tìm theo nhãn; trả về phần giá trị. */
export const fact = (root: Page | Locator, label: string) =>
  root.locator('dl.op-facts > div').filter({ has: ('page' in root ? root.page() : root).getByText(label, { exact: true }) }).locator('dd')

/** Hàng tab của trang làm việc một Lô. */
export const batchTabs = (page: Page) => page.getByRole('navigation', { name: 'Các mục của Lô' })

/**
 * Giá trị cho ô datetime-local, giống toLocalInput của ứng dụng. Trình duyệt của bộ test luôn ở giờ Việt Nam (playwright.config.ts),
 * còn trình chạy test thì theo máy (máy CI ở UTC), nên giờ được tính thẳng theo UTC+7 chứ không theo giờ máy.
 */
export const localInput = (date: Date) => new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 16)

/** Ngày dạng 13/11/2026 như formatDate của ứng dụng (giờ Việt Nam). */
export const vnDay = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/* ---------- hộ nuôi ---------- */

export const farm: OperatorResponse = {
  operatorId: 7, legalName: 'HTX Cua Năm Căn', taxCode: '2001234567', businessRegNo: 'HTX-0042', farmAddress: 'Ấp Chà Là, Năm Căn, Cà Mau',
  status: 'Approved', submittedAt: daysFromNow(-90), memberRole: 'Owner', canEdit: false, canSubmit: false,
}

/* ---------- Lô ---------- */

export const CODE = 'P-2610-04'

export const costPlan: CostPlanResponse = {
  versionNo: 1, status: 'Locked', total: 180_000_000, costPerCrab: 300_000, lockedTotal: 180_000_000, lockedAt: daysFromNow(-45),
  items: [
    { costItemId: 1, category: 'Seed', description: 'Cua đầu vào', quantity: 600, unit: 'con', unitPrice: 220_000, amount: 132_000_000, basis: null, costBearer: 'Batch', actualAmount: 0 },
    { costItemId: 2, category: 'Feed', description: 'Thức ăn', quantity: 1_200, unit: 'kg', unitPrice: 30_000, amount: 36_000_000, basis: null, costBearer: 'Batch', actualAmount: 0 },
    { costItemId: 3, category: 'MortalityReserve', description: 'Dự phòng hao hụt', quantity: 1, unit: 'gói', unitPrice: 12_000_000, amount: 12_000_000, basis: null, costBearer: 'Batch', actualAmount: 0 },
  ],
  milestones: [
    { no: 1, kind: 'Receipt', name: 'Nhận cua xong', pct: 60, unlockCondition: 'Nhận đủ cua và kiểm đầu vào xong', plannedAmount: 108_000_000 },
    { no: 2, kind: 'MidCycle', name: 'Giữa vụ', pct: 30, unlockCondition: 'Qua nửa số ngày nuôi', plannedAmount: 54_000_000 },
    { no: 3, kind: 'Settlement', name: 'Quyết toán', pct: 10, unlockCondition: 'Bảng quyết toán được duyệt', plannedAmount: 18_000_000 },
  ],
}

/** Lô P có lưu nuôi, đang thu hoạch: Lô này hiện đủ mười mục của trang làm việc. */
export const batch: BatchResponse = {
  batchCode: CODE, batchMode: 'P', status: 'Harvesting', title: 'Cua gạch Năm Căn vụ tháng 10', crabType: 'RoeCrab', operatorId: farm.operatorId,
  executor: { partyId: 21, partyCode: 'PT-0021', legalName: farm.legalName },
  plannedQuantity: 600, fundedQuantity: 560, hasHolding: true, holdingDays: 30, restockCutoffDays: 7,
  expectedAvgWeightG: 420, expectedGrade: 'Cấp 1', saleDays: 14, deliveryRadiusKm: 350,
  dispatchSite: { siteId: 3, siteCode: 'ST-0003', name: 'Trại Chà Là', addressLine: 'Ấp Chà Là, Năm Căn, Cà Mau', latitude: 8.76, longitude: 104.99 },
  expectedReceiptDate: dateFromNow(-32),
  targetCapital: 180_000_000, minViableCapital: 150_000_000, minViableBasis: 'Đủ nuôi 500 con', minContribution: 5_000_000,
  survivalThresholdPct: 85, baseRemunerationPct: 12, remunerationTiers: [],
  floorPricePerKg: 380_000, offtakeBuyer: { partyId: 33, partyCode: 'PT-0033', legalName: 'Công ty Hải sản Đất Mũi' },
  settlementBasis: 'StandardCost', platformFeeRatePct: 3,
  offers: [
    { offerId: 11, specCode: 'RC-L-G1', specName: 'Cua gạch · Size L · Cấp 1', sizeCode: 'L', gradeCode: 'G1', pricePerKg: 520_000, conversionWeightG: 420, offeredQuantity: 360 },
    { offerId: 12, specCode: 'RC-XL-SP', specName: 'Cua gạch · Size XL · Đặc cấp', sizeCode: 'XL', gradeCode: 'SPECIAL', pricePerKg: 680_000, conversionWeightG: 520, offeredQuantity: 180 },
  ],
  costPlan,
  fundingOpenAt: daysFromNow(-60), fundingDeadline: daysFromNow(-45), preorderDeadline: daysFromNow(-5),
  rejectionReason: null, cancelReason: null, canEdit: false, canSubmit: false, canCancel: false,
}

/** Lô mẫu với vài trường khác đi (trạng thái, phương thức, có lưu nuôi hay không). */
export const batchOf = (extra: Partial<BatchResponse> = {}): BatchResponse => ({ ...batch, ...extra })

/** Lô T do Admin tạo, đang lưu nuôi. */
export const batchRaising = batchOf({
  batchCode: 'T-2611-02', batchMode: 'T', status: 'InProduction', title: 'Cua thịt Ngọc Hiển đợt 2', crabType: 'FatteningMudCrab',
  plannedQuantity: 400, fundedQuantity: null, holdingDays: 21, expectedReceiptDate: dateFromNow(-9),
  targetCapital: 0, minViableCapital: 0, minViableBasis: null, minContribution: 0, survivalThresholdPct: null, baseRemunerationPct: null,
  floorPricePerKg: null, offtakeBuyer: null, costPlan: null, fundingOpenAt: null, fundingDeadline: null, preorderDeadline: daysFromNow(6),
  offers: [{ offerId: 21, specCode: 'FM-L-G1', specName: 'Cua thịt · Size L · Cấp 1', sizeCode: 'L', gradeCode: 'G1', pricePerKg: 360_000, conversionWeightG: 350, offeredQuantity: 360 }],
})

/** Lô P đang gọi vốn. */
export const batchFunding = batchOf({
  batchCode: 'P-2611-05', status: 'Funding', title: 'Cua gạch Đầm Dơi vụ tháng 12', fundedQuantity: null, expectedReceiptDate: dateFromNow(18),
  fundingOpenAt: daysFromNow(-4), fundingDeadline: daysFromNow(10), preorderDeadline: daysFromNow(15), costPlan: { ...costPlan, status: 'Approved', lockedAt: null },
})

/** Lô P nháp đã đủ điều kiện gửi duyệt. */
export const batchDraft = batchOf({
  batchCode: 'P-2612-01', status: 'Draft', title: 'Cua gạch Năm Căn vụ Tết', fundedQuantity: null, expectedReceiptDate: dateFromNow(30),
  fundingOpenAt: null, fundingDeadline: null, preorderDeadline: null, costPlan: { ...costPlan, status: 'Draft', lockedAt: null },
  canEdit: true, canSubmit: true, canCancel: true,
})

export const batches = [batch, batchRaising, batchFunding, batchDraft]

export const progress: BatchProgressResponse = {
  batchCode: CODE, status: 'Harvesting', crabsAlive: 540, daysRaised: 31, isParticipant: true, deadCrabs: 12, restockedCrabs: 8, gradedCrabs: 96, deliveredOrSoldCrabs: 40,
}

export const money: MoneySummaryResponse = {
  batchCode: CODE, batch: { contributed: 168_000_000, disbursed: 108_000_000, heldInAccount: 71_450_000 }, mine: null, note: '',
}

/* ---------- nhật ký chăm sóc ---------- */

export const thresholds: ProductionThresholdResponse = {
  id: 4, versionNo: 2, phMin: 7.5, phMax: 8.5, waterTempMinC: 26, waterTempMaxC: 31, salinityMinPpt: 15, salinityMaxPpt: 25, createdBy: 102, createdAt: daysFromNow(-30),
}

/** Ngày nghiệp vụ mà máy chủ trả về; nhật ký "hôm nay" là bản ghi tay có logDate bằng ngày này. */
export const BUSINESS_DATE = dateFromNow(0)

export const thresholdState: ProductionThresholdState = { businessDate: BUSINESS_DATE, canConfigure: true, canRecord: true, current: thresholds }

export const careLog = (extra: Partial<ProductionLogResponse> = {}): ProductionLogResponse => ({
  id: 51, batchCode: CODE, logDate: dateFromNow(-1), ph: 8.1, waterTempC: 28.5, salinityPpt: 20, feedKg: 3.5, note: 'Thay 30% nước dàn 1',
  source: 'Manual', plausibilityFlag: 'Ok', recordedBy: 102, createdAt: daysFromNow(-1), thresholdVersion: 2, thresholdsApplied: thresholds, ...extra,
})

/** Hôm qua ghi tay; hôm kia có một bản ngoài khoảng và một bản do thiết bị gửi. Hôm nay chưa ghi. */
export const careLogs: ProductionLogResponse[] = [
  careLog(),
  careLog({ id: 50, logDate: dateFromNow(-2), ph: 8.9, feedKg: 3.2, note: null, plausibilityFlag: 'OutOfRange', createdAt: daysFromNow(-2) }),
  careLog({ id: 49, logDate: dateFromNow(-2), ph: 8.2, feedKg: null, note: null, source: 'Device', recordedBy: null, createdAt: daysFromNow(-2) }),
]

/** Số đo cảm biến nước: bản mới nhất nằm cuối, được điền sẵn vào form nhật ký sau khi làm tròn một chữ số. */
export const waterReadings: WaterReadingResponse[] = [
  { measuredAt: daysFromNow(-0.2), temperatureC: 28.2, salinityPpt: 19.5, ph: 7.9, quality: 'Calibrated', deviceCode: 'WS-01' },
  { measuredAt: daysFromNow(-0.02), temperatureC: 28.64, salinityPpt: 20.26, ph: 8.04, quality: 'Calibrated', deviceCode: 'WS-01' },
]

export const timeline: TimelinePage = {
  batchCode: CODE, timeZone: 'Asia/Ho_Chi_Minh', nextBefore: null, hasMore: false,
  groups: [{
    date: dateFromNow(-1),
    items: [
      {
        id: 'log-51', type: 'ProductionLog', sourceId: '51', businessDate: dateFromNow(-1), occurredAt: daysFromNow(-1), timeBasis: 'Recorded',
        productionLog: { ph: 8.1, waterTempC: 28.5, salinityPpt: 20, feedKg: 3.5, source: 'Manual', plausibilityFlag: 'Ok', note: 'Thay 30% nước dàn 1' },
      },
      {
        id: 'crab-9', type: 'CrabEvent', sourceId: '9', businessDate: dateFromNow(-1), occurredAt: daysFromNow(-1), timeBasis: 'Recorded',
        crabEvent: { eventType: 'Molted', crabCode: 'C-000117', slotCode: '0117', source: 'App', reason: null },
      },
    ],
  }],
}

/** Các Lô đang nuôi ở trang /operator/log: một Lô chưa ghi hôm nay, một Lô đã ghi. */
export const productionBatches: ProductionBatchResponse[] = [
  {
    batchCode: CODE, title: batch.title, crabType: batch.crabType, status: 'Harvesting', cycleDays: 30, seedQuantity: 560, aliveCount: 540, dayOfCycle: 30,
    latestLog: careLogs[0], loggedToday: false, canRecord: true, businessDate: BUSINESS_DATE,
  },
  {
    batchCode: batchRaising.batchCode, title: batchRaising.title, crabType: batchRaising.crabType, status: 'InProduction', cycleDays: 21, seedQuantity: 400, aliveCount: 372, dayOfCycle: 9,
    latestLog: careLog({ id: 61, batchCode: batchRaising.batchCode, logDate: BUSINESS_DATE, feedKg: 2.4, note: null, createdAt: daysFromNow(0) }),
    loggedToday: true, canRecord: true, businessDate: BUSINESS_DATE,
  },
]

/* ---------- đo và phân hạng ---------- */

export const grading: BatchGradingSummary = {
  batchCode: CODE, batchStatus: 'Harvesting', crabType: 'RoeCrab', ruleSetVersion: 2, received: 560, notMeasured: 440, draft: 14, hold: 6, approved: 96, rejected: 4, substandard: 3,
  bySpec: [
    { specCode: 'RC-L-G1', size: 'L', grade: 'G1', count: 70 },
    { specCode: 'RC-XL-SP', size: 'XL', grade: 'SPECIAL', count: 23 },
    { specCode: 'SUBSTANDARD', size: 'M', grade: 'BELOW', count: 3 },
  ],
  assignedQcUserId: 103,
}

export const decisionOf = (extra: Partial<GradeDecisionResponse> = {}): GradeDecisionResponse => ({
  decisionNo: 'GD-2611-0101', batchCode: CODE, crabCode: 'C-000101', sessionNo: 'MS-2611-0101', ruleSetVersion: 2, versionNo: 1, status: 'Draft', isCurrent: true,
  weightG: 452, carapaceLengthCm: 9.4, cIndex: 1.12, edgeBandMm: 3.2, proposedSize: 'L', proposedCLevel: 'C1', proposedSensory: null, proposedGrade: 'G1', holdReasons: [],
  finalSize: null, finalGrade: null, specCode: null, isSubstandard: false, liveStatus: null, foodSafety: null, sensoryNote: null, reason: null, hasPhoto: false,
  decidedBy: null, decidedAt: null, heldBy: null, secondQcId: null, secondConfirmedAt: null, createdAt: daysFromNow(-0.1), ...extra,
})

/** Mỗi trạng thái một con: chờ duyệt, giữ lại vì cần thước kẹp, đã duyệt, loại bỏ. */
export const decisions: GradeDecisionResponse[] = [
  decisionOf(),
  decisionOf({ decisionNo: 'GD-2611-0102', crabCode: 'C-000102', sessionNo: 'MS-2611-0102', status: 'Hold', weightG: 398, carapaceLengthCm: null, cIndex: null, proposedSize: 'M', proposedGrade: null, holdReasons: ['CaliperRequired'] }),
  decisionOf({ decisionNo: 'GD-2611-0090', crabCode: 'C-000090', sessionNo: 'MS-2611-0090', status: 'Approved', weightG: 548, proposedSize: 'XL', proposedGrade: 'SPECIAL', finalSize: 'XL', finalGrade: 'SPECIAL', specCode: 'RC-XL-SP', decidedBy: 103, decidedAt: daysFromNow(-0.5) }),
  decisionOf({ decisionNo: 'GD-2611-0091', crabCode: 'C-000091', sessionNo: 'MS-2611-0091', status: 'Rejected', weightG: 301, proposedSize: 'M', proposedGrade: 'BELOW', reason: 'Cua yếu, gãy càng', decidedBy: 103, decidedAt: daysFromNow(-0.5) }),
]

export const crabOf = (crabCode: string, slotCode: string | null, extra: Partial<CrabUnitResponse> = {}): CrabUnitResponse => ({
  crabCode, batchCode: CODE, lotCode: 'LOT-2610-01', originRegion: 'Năm Căn, Cà Mau', harvestedOn: dateFromNow(-34), species: 'Scylla paramamosain', sex: 'Female',
  maturity: 'Mature', receivedWeightG: 380, condition: 'Healthy', inventoryStatus: 'Holding', currentSlotCode: slotCode, replacesCrabCode: null, receivedAt: daysFromNow(-32),
  boxes: [], events: [], ...extra,
})

/** Bốn con đang lưu nuôi: hai con đã có đề xuất phân hạng (0101, 0102), hai con chưa đo. */
export const crabs: CrabUnitResponse[] = [crabOf('C-000101', '0101'), crabOf('C-000102', '0102'), crabOf('C-000103', '0103'), crabOf('C-000104', '0104')]

export const deviceOf = (extra: Partial<DeviceResponse> = {}): DeviceResponse => ({
  deviceCode: 'ST-01', deviceType: 'Station', operatorId: farm.operatorId, scopeType: 'Site', scope: 'ST-0003', source: 'Device', status: 'Active', firmwareVersion: '0.3.1',
  lastSeenAt: daysFromNow(0), lastCalibratedAt: daysFromNow(-6), calibrationPeriodDays: 30, calibrationDue: false, queueLength: 0, keyPrefix: 'st01', ...extra,
})

export const devices: DeviceResponse[] = [deviceOf(), deviceOf({ deviceCode: 'WS-01', deviceType: 'WaterSensor', scopeType: 'Holding', scope: CODE, keyPrefix: 'ws01', queueLength: null })]

export const SESSION_NO = 'MS-2611-0140'

/** Lượt đo vừa mở ở trạm ST-01 cho con C-000103, chưa có bản tin của trạm. */
export const sessionOf = (extra: Partial<SessionResponse> = {}): SessionResponse => ({
  sessionNo: SESSION_NO, batchCode: CODE, crabCode: 'C-000103', procedure: 'Station', stationCode: 'ST-01', status: 'Open', openedAt: daysFromNow(0), capturedAt: null,
  receivedAt: null, weightG: null, tofMm: null, cameraHeightMm: null, hasWhiteImage: false, hasRedImage: false, failReason: null, ...extra,
})

export const measurementsOf = (session: SessionResponse, extra: Partial<Omit<SessionMeasurementsResponse, 'session'>> = {}): SessionMeasurementsResponse => ({
  session, values: [], inferences: [], decision: null, ...extra,
})

/** Lượt đo đã có số đo của con C-000101, khớp với dòng đầu của bảng "Kết quả từng con". */
export const measuredSession: SessionMeasurementsResponse = measurementsOf(
  sessionOf({ sessionNo: 'MS-2611-0101', crabCode: 'C-000101', status: 'Measured', capturedAt: daysFromNow(-0.1), receivedAt: daysFromNow(-0.1), weightG: 452, tofMm: 248, cameraHeightMm: 320, hasWhiteImage: true, hasRedImage: true }),
  {
    values: [
      { metric: 'WeightG', value: 452, unit: 'g', method: 'Scale', confidence: null, verificationStatus: 'Verified', recordedAt: daysFromNow(-0.1) },
      { metric: 'CarapaceLengthCm', value: 9.4, unit: 'cm', method: 'AI', confidence: 0.93, verificationStatus: 'Unverified', recordedAt: daysFromNow(-0.1) },
      { metric: 'EdgeBandMm', value: 3.2, unit: 'mm', method: 'AI', confidence: 0.88, verificationStatus: 'Unverified', recordedAt: daysFromNow(-0.1) },
    ],
    inferences: [{
      imageKind: 'White', modelName: 'crab-carapace', modelVersion: '0.3', isSimulated: true, status: 'Succeeded', imageQuality: 'Good', carapaceLengthCm: 9.4, carapaceWidthCm: 12.8,
      carapaceAreaCm2: 96.2, edgeBandMm: null, confidence: 0.93, errorReason: null, createdAt: daysFromNow(-0.1),
    }],
    decision: decisions[0],
  },
)

/* ---------- đặt trước và giao hàng ---------- */

const line = (lineId: number, specCode: 'RC-L-G1' | 'RC-XL-SP', crabsCount: number): PreorderLineResponse => {
  const offer = batch.offers.find((o) => o.specCode === specCode)!
  const estimatedKg = (crabsCount * offer.conversionWeightG) / 1000
  return {
    lineId, specCode, specName: offer.specName, mode: 'Crabs', qtyCrabs: crabsCount, qtyKg: null, convertedCrabs: crabsCount, pricePerKg: offer.pricePerKg,
    conversionWeightG: offer.conversionWeightG, minGrade: null, estimatedKg, estimatedValue: Math.round(estimatedKg * offer.pricePerKg),
  }
}

const preorderOf = (orderNo: string, trancheId: number, dueDate: string, lines: PreorderLineResponse[], extra: Partial<PreorderResponse> = {}): PreorderResponse => {
  const estimatedValue = lines.reduce((sum, l) => sum + l.estimatedValue, 0)
  const convertedCrabs = lines.reduce((sum, l) => sum + l.convertedCrabs, 0)
  return {
    orderNo, batchCode: CODE, batchMode: 'P', status: 'Confirmed', estimatedValue, depositRatePct: 30, depositAmount: Math.round(estimatedValue * 0.3), convertedCrabs,
    placedAt: daysFromNow(-20), holdExpiresAt: null, depositedAt: daysFromNow(-20), confirmedAt: daysFromNow(-19), deliveryAddress: '12 Trần Phú, Phường 5, Cà Mau', deliveryDistanceKm: 48,
    lines, tranches: [{ trancheId, seq: 1, dueDate, status: 'Allocated', lines: lines.map((l) => ({ specCode: l.specCode, qtyCrabs: l.qtyCrabs, qtyKg: null, convertedCrabs: l.convertedCrabs })) }],
    deposit: null, cancelReason: null, ...extra,
  }
}

/** Đơn có đợt đang chờ lập chuyến. */
export const orderToShip = preorderOf('PO-2611-0012', 801, dateFromNow(2), [line(301, 'RC-L-G1', 40), line(302, 'RC-XL-SP', 20)])
/** Đơn có chuyến SH-2611-0031 đã lập, chờ xuất. */
export const orderScheduled = preorderOf('PO-2611-0015', 802, dateFromNow(1), [line(311, 'RC-L-G1', 30), line(312, 'RC-XL-SP', 12)], { deliveryAddress: '88 Nguyễn Tất Thành, Phường 8, Cà Mau' })
/** Đơn đã giao và nghiệm thu xong. */
export const orderDone = preorderOf('PO-2611-0009', 803, dateFromNow(-3), [line(321, 'RC-L-G1', 24)], { status: 'Delivered' })

export const preorders = [orderToShip, orderScheduled, orderDone]

const trancheOf = (order: PreorderResponse, recipientName: string, recipientPhone: string, extra: Partial<TrancheStatusResponse> = {}): TrancheStatusResponse => ({
  trancheId: order.tranches[0].trancheId, orderNo: order.orderNo, orderStatus: order.status, seq: 1, dueDate: order.tranches[0].dueDate, status: 'Allocated',
  recipientName, recipientPhone, deliveryAddress: order.deliveryAddress,
  lines: order.lines.map((l) => ({ lineId: l.lineId, specCode: l.specCode, orderedCrabs: l.convertedCrabs, allocatedCrabs: l.convertedCrabs, substitutedCrabs: 0, pricePerKg: l.pricePerKg })),
  shipmentNo: null, shipmentStatus: null, ...extra,
})

export const SHIPMENT_NO = 'SH-2611-0031'

/** Đợt chờ lập chuyến: dòng XL mới phân bổ 18 trên 20 con, trong đó 2 con thay hạng. */
export const trancheToShip = trancheOf(orderToShip, 'Nhà hàng Biển Đông', '0903 111 222', {
  lines: [
    { lineId: 301, specCode: 'RC-L-G1', orderedCrabs: 40, allocatedCrabs: 40, substitutedCrabs: 0, pricePerKg: 520_000 },
    { lineId: 302, specCode: 'RC-XL-SP', orderedCrabs: 20, allocatedCrabs: 18, substitutedCrabs: 2, pricePerKg: 680_000 },
  ],
})
export const trancheScheduled = trancheOf(orderScheduled, 'Nhà hàng Hương Biển', '0918 333 444', { shipmentNo: SHIPMENT_NO, shipmentStatus: 'Scheduled' })
export const trancheDone = trancheOf(orderDone, 'Bếp Cô Ba', '0977 555 666', { status: 'Accepted', shipmentNo: 'SH-2611-0027', shipmentStatus: 'Accepted' })

export const tranches = [trancheToShip, trancheScheduled, trancheDone]

const allocationOf = (crabCode: string, order: PreorderResponse, specCode: string, extra: Partial<AllocationResponse> = {}): AllocationResponse => ({
  crabCode, orderNo: order.orderNo, orderType: 'PreOrder', trancheSeq: 1, lineSpecCode: specCode, crabSpecCode: specCode, isSubstitution: false, status: 'Active',
  allocatedAt: daysFromNow(-1), releasedAt: null, releaseReason: null, ...extra,
})

export const allocations: AllocationResponse[] = [
  allocationOf('C-000201', orderScheduled, 'RC-L-G1'),
  allocationOf('C-000202', orderScheduled, 'RC-L-G1'),
  allocationOf('C-000203', orderScheduled, 'RC-XL-SP'),
  allocationOf('C-000150', orderToShip, 'RC-XL-SP', { crabSpecCode: 'RC-XL-SP', lineSpecCode: 'RC-L-G1', isSubstitution: true }),
  allocationOf('C-000099', orderDone, 'RC-L-G1', { status: 'Released', releasedAt: daysFromNow(-4), releaseReason: 'Cua chết trước khi xuất' }),
]

/** Các con đã lên chuyến SH-2611-0031: dùng cho form nhận hàng khi khách từ chối một phần. */
export const shippedAllocations: AllocationResponse[] = allocations.map((a) => (a.orderNo === orderScheduled.orderNo ? { ...a, status: 'Shipped' } : a))

/** Chuyến vừa lập cho đợt 1 của một đơn: chưa xuất hàng nên các dòng chưa có số cân. */
export const shipmentOf = (order: PreorderResponse, shipmentNo: string, extra: Partial<ShipmentResponse> = {}): ShipmentResponse => ({
  shipmentNo, orderNo: order.orderNo, trancheSeq: 1, status: 'Scheduled', scheduledAt: daysFromNow(0.1), dispatchedAt: null, deliveredAt: null,
  returnWindowEndsAt: null, transportCondition: null,
  lines: order.lines.map((l) => ({
    lineId: l.lineId, specCode: l.specCode, pricePerKg: l.pricePerKg, dispatchedCrabs: null, dispatchedKg: null, receivedCrabs: null, receivedKg: null,
    acceptedCrabs: null, acceptedKg: null, rejectedCrabs: null, transportLossKg: null, goodsValue: null,
  })),
  acceptance: null, balance: null, traceCode: null, ...extra,
})

/** Chuyến đã lập cho đợt 1 của đơn PO-2611-0015, chưa xuất hàng. */
export const shipment = shipmentOf(orderScheduled, SHIPMENT_NO, { transportCondition: 'Thùng xốp, đá khô', traceCode: 'TRC7K2M9QX' })

/** Chuyến SH-2611-0031 sau khi xuất hàng: 30 con 12,8 kg và 12 con 6,3 kg. */
export const shipmentDispatched: ShipmentResponse = {
  ...shipment, status: 'Dispatched', dispatchedAt: daysFromNow(-0.05),
  lines: shipment.lines.map((l, i) => ({ ...l, dispatchedCrabs: [30, 12][i], dispatchedKg: [12.8, 6.3][i] })),
}

/* ---------- hộp nuôi (GET /api/boxes trả IActionResult nên api.gen.ts không có kiểu; theo FarmBox ở features/operator/opA.ts) ---------- */

export interface FarmBox {
  slotCode: string
  status: string
  rowCode: string | null
  rackNo: number | null
  tierNo: number | null
  columnNo: number | null
  batchCode: string | null
  latestEvidence: { id: number; receivedAt: string; reviewStatus: string } | null
}

export const boxOf = (slotCode: string, status: string, extra: Partial<FarmBox> = {}): FarmBox => ({
  slotCode, status, rowCode: 'A', rackNo: 1, tierNo: 1, columnNo: Number(slotCode.slice(-2)), batchCode: status === 'Occupied' ? CODE : null, latestEvidence: null, ...extra,
})

/** Sáu hộp: ba hộp có cua, hai hộp trống, một hộp bảo trì. */
export const boxes: FarmBox[] = [
  boxOf('0101', 'Occupied', { latestEvidence: { id: 57, receivedAt: daysFromNow(-1), reviewStatus: 'Flagged' } }),
  boxOf('0102', 'Occupied'),
  boxOf('0103', 'Occupied', { batchCode: batchRaising.batchCode }),
  boxOf('0104', 'Available'),
  boxOf('0105', 'Available'),
  boxOf('0106', 'Maintenance'),
]

/** Trả lời GET /api/boxes như máy chủ: lọc theo trạng thái, Lô, số hộp rồi cắt trang. */
export const boxPage = (all: FarmBox[]) => (call: Call) => {
  const { status, batchCode, search } = call.query
  const pageSize = Number(call.query.pageSize ?? 50)
  const page = Number(call.query.page ?? 1)
  const found = all.filter((b) => (!status || b.status === status) && (!batchCode || b.batchCode === batchCode) && (!search || b.slotCode.includes(search)))
  return { items: found.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: found.length }
}

/* ---------- ảnh bằng chứng ---------- */

export const EVIDENCE_ID = 57

export const evidenceOf = (extra: Partial<OperatorEvidenceItem> = {}): OperatorEvidenceItem => ({
  id: EVIDENCE_ID, batchCode: CODE, slotCode: '0101', mediaType: 'Photo', reviewStatus: 'Flagged', riskScore: 80, capturedAt: daysFromNow(-1), receivedAt: daysFromNow(-1),
  latitude: 8.7601, longitude: 104.9903, explanation: null, explainedAt: null, canExplain: true,
  latestReview: { verdict: 'NeedMoreEvidence', note: 'Ảnh trùng với ảnh hộp 0102, cần giải thích.', reviewedAt: daysFromNow(-0.5) }, ...extra,
})

export const evidenceItems: OperatorEvidenceItem[] = [
  evidenceOf(),
  evidenceOf({ id: 58, slotCode: '0102', reviewStatus: 'Flagged', riskScore: 60, latestReview: null, explanation: 'Chụp lại vì ảnh đầu bị mờ.', explainedAt: daysFromNow(-0.3) }),
  evidenceOf({ id: 44, slotCode: '0104', reviewStatus: 'Accepted', riskScore: 5, latestReview: { verdict: 'Pass', note: null, reviewedAt: daysFromNow(-3) }, canExplain: false }),
]

export const captureRequests: CaptureRequestResponse[] = [
  { id: 901, batchCode: CODE, slotCode: '0102', requestedAt: daysFromNow(-0.1), dueAt: daysFromNow(0.4), status: 'Open', fulfilledAt: null },
]

/** Trả lời GET /api/operators/me/evidence như máy chủ: lọc theo trạng thái (bỏ trống là mọi trạng thái), từ khoá rồi cắt trang. */
export const evidencePage = (all: OperatorEvidenceItem[]) => (call: Call) => {
  const { status, q } = call.query
  const pageSize = Number(call.query.pageSize ?? 20)
  const page = Number(call.query.page ?? 1)
  const found = all.filter((e) => (!status || e.reviewStatus === status) && (!q || e.batchCode.includes(q) || (e.slotCode ?? '').includes(q)))
  return { items: found.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: found.length }
}

/* ---------- trang tổng quan ---------- */

export const alerts: AlertResponse[] = [
  {
    id: 71, batchCode: CODE, farmName: farm.legalName, type: 'Mortality', severity: 'High', message: 'Hai con chết trong 24 giờ ở dàn 1', raisedAt: daysFromNow(-0.3),
    ackDeadline: daysFromNow(0.7), status: 'Open', acknowledgedAt: null, acknowledgedBy: null, responseNote: null, escalatedAt: null,
  },
  {
    id: 64, batchCode: batchRaising.batchCode, farmName: farm.legalName, type: 'MissingCareLog', severity: 'Medium', message: 'Thiếu nhật ký ngày hôm kia', raisedAt: daysFromNow(-2),
    ackDeadline: daysFromNow(-1), status: 'Resolved', acknowledgedAt: daysFromNow(-1.5), acknowledgedBy: 102, responseNote: 'Đã ghi bù', escalatedAt: null,
  },
]

export const dashboard: OperatorDashboardResponse = {
  from: dateFromNow(-29), to: dateFromNow(0), asOf: daysFromNow(0), farmName: farm.legalName, selectedBatchCode: null,
  batches: [
    { batchCode: CODE, title: batch.title, status: 'Harvesting', aliveCount: 540, expectedOutputKg: 230, openAlerts: 1, loggedToday: false },
    { batchCode: batchRaising.batchCode, title: batchRaising.title, status: 'InProduction', aliveCount: 372, expectedOutputKg: 130, openAlerts: 0, loggedToday: false },
  ],
  aliveCount: 912, openAlerts: 1, pendingCaptureRequests: 2, logsDueToday: 1, ordersToPack: 0, ordersToShip: 0,
  environmentByDay: [{ date: dateFromNow(-2), ph: 8.2, waterTempC: 28.4 }, { date: dateFromNow(-1), ph: 8.1, waterTempC: 28.5 }],
  recentLogs: [],
}

/** GET /api/operator/tranches: trang tổng quan chỉ đọc các trường này (OperatorTrancheBrief ở features/operator/opA.ts). */
export const disbursementTranches = [
  { trancheId: 41, batchCode: CODE, trancheNo: 2, plannedAmount: 54_000_000, canRequest: true },
  { trancheId: 42, batchCode: CODE, trancheNo: 3, plannedAmount: 18_000_000, canRequest: false },
]

export const goodsReceipts: GoodsReceiptResponse[] = [{
  receiptNo: 'GR-2611-0007', poNo: 'PUR-2611-0003', lotCode: 'LOT-2611-02', originRegion: 'Ngọc Hiển, Cà Mau', harvestedOn: dateFromNow(-1), declaredCount: 60, declaredWeightKg: 21,
  receivedAt: daysFromNow(-0.2), status: 'Inspecting', acceptedCount: 0, rejectedCount: 0, acceptedWeightG: 0, qcUserId: 103, completedAt: null,
}]

/* ---------- form soạn Lô P ---------- */

export const sites: PartySiteResponse[] = [{
  siteId: 3, siteCode: 'ST-0003', siteType: 'Farm', name: 'Trại Chà Là', addressLine: 'Ấp Chà Là, Năm Căn, Cà Mau', province: 'Cà Mau', latitude: 8.76, longitude: 104.99,
  contactName: 'Nguyễn Văn Năm', contactPhone: '0903 000 111', isDefault: true, status: 'Active',
}]

export const offtakeBuyers: PartySummaryResponse[] = [
  { partyId: 33, partyCode: 'PT-0033', legalName: 'Công ty Hải sản Đất Mũi', partyType: 'Company', verificationStatus: 'Verified', activeRoles: ['OfftakeBuyer'] },
]

export const roeSpecs: SpecResponse[] = [
  { specId: 1, specCode: 'RC-L-G1', crabType: 'RoeCrab', sizeCode: 'L', gradeCode: 'G1', liveCondition: 'Live', name: 'Cua gạch · Size L · Cấp 1' },
  { specId: 2, specCode: 'RC-XL-SP', crabType: 'RoeCrab', sizeCode: 'XL', gradeCode: 'SPECIAL', liveCondition: 'Live', name: 'Cua gạch · Size XL · Đặc cấp' },
]

/* ---------- giả lập mặc định ---------- */

/** Giả lập mặc định cho mọi trang trong OPERATOR_PAGES. Chỉ có GET; lời gọi ghi do từng test đăng ký. */
export function mockOperator(api: Api): void {
  // Khung cổng: thẻ hồ sơ hộ nuôi ở đầu menu.
  api.get('/api/operators/me', farm)

  // Lô và trang làm việc của Lô.
  api.get('/api/operators/me/batches', (call) => {
    const found = batches.filter((b) => (!call.query.status || b.status === call.query.status) && (!call.query.batchMode || b.batchMode === call.query.batchMode))
    return { items: found, page: Number(call.query.page ?? 1), pageSize: Number(call.query.pageSize ?? 50), total: found.length }
  })
  api.get(/^\/api\/operators\/me\/batches\/[^/]+$/, (call) => batches.find((b) => b.batchCode === codeIn(call)) ?? notFound('Lô'))
  api.get(/^\/api\/batches\/[^/]+\/progress$/, (call) => ({ ...progress, batchCode: codeIn(call) }))
  api.get(/^\/api\/batches\/[^/]+\/money-summary$/, (call) => ({ ...money, batchCode: codeIn(call) }))

  // Nhật ký chăm sóc.
  api.get(/^\/api\/batches\/[^/]+\/production-thresholds$/, thresholdState)
  api.get(/^\/api\/batches\/[^/]+\/production-logs$/, (call) => paged(careLogs.filter((l) => l.batchCode === codeIn(call)), 20))
  api.get(/^\/api\/batches\/[^/]+\/water-readings$/, waterReadings)
  api.get(/^\/api\/batches\/[^/]+\/timeline$/, timeline)
  api.get('/api/operators/me/production-batches', paged(productionBatches, 100))
  api.get('/api/operators/me/production-logs', paged([productionBatches[1].latestLog!, ...careLogs], 20))

  // Đo và phân hạng.
  api.get(/^\/api\/batches\/[^/]+\/grading$/, grading)
  api.get(/^\/api\/batches\/[^/]+\/grade-decisions$/, decisions)
  api.get(/^\/api\/batches\/[^/]+\/crab-units$/, crabs)
  api.get('/api/operators/me/devices', devices)
  api.get(/^\/api\/measurement-sessions\/[^/]+\/measurements$/, (call) => (call.path.includes(measuredSession.session.sessionNo) ? measuredSession : notFound('lượt đo')))
  api.get(/^\/api\/measurement-sessions\/[^/]+\/images\/(white|red)$/, file(PNG, 'image/png'))

  // Đặt trước, đợt giao, chuyến giao.
  api.get('/api/operators/me/preorders', (call) => paged(preorders.filter((o) => !call.query.batchCode || o.batchCode === call.query.batchCode), 100))
  api.get(/^\/api\/batches\/[^/]+\/delivery-tranches$/, (call) => (codeIn(call) === CODE ? tranches : []))
  api.get(/^\/api\/batches\/[^/]+\/allocations$/, (call) => (codeIn(call) === CODE ? allocations : []))
  api.get(`/api/shipments/${SHIPMENT_NO}`, shipment)

  // Hộp nuôi.
  api.get('/api/boxes', boxPage(boxes))

  // Ảnh bằng chứng và yêu cầu chụp.
  api.get('/api/operators/me/evidence', evidencePage(evidenceItems))
  api.get(/^\/api\/operators\/me\/evidence\/\d+$/, (call) => evidenceItems.find((e) => call.path.endsWith(`/${e.id}`)) ?? notFound('bằng chứng của hộ nuôi'))
  api.get(/^\/api\/operators\/me\/evidence\/\d+\/image$/, file(PNG, 'image/png'))
  api.get('/api/operators/me/capture-requests', (call) => paged(captureRequests.filter((r) => r.status === call.query.status), Number(call.query.pageSize ?? 50)))

  // Trang tổng quan.
  api.get('/api/operators/me/dashboard', dashboard)
  api.get('/api/operators/me/alerts', alerts)
  api.get('/api/operator/tranches', disbursementTranches)
  api.get(/^\/api\/batches\/[^/]+\/goods-receipts$/, (call) => (codeIn(call) === batchRaising.batchCode ? goodsReceipts : []))

  // Form soạn Lô P.
  api.get('/api/me/sites', sites)
  api.get('/api/parties/directory', offtakeBuyers)
  api.get('/api/specs', (call) => roeSpecs.filter((s) => s.crabType === call.query.crabType))
}

/** Mọi trang của cổng người nuôi mà các spec operator-*, dashboard, boxes, production-logs, evidence-explanation, batches mở. */
export const OPERATOR_PAGES: PageUnderTest[] = [
  { role: 'OperatorMember', path: '/operator', ready: `${batchRaising.batchCode}: 1 phiếu nhận chờ kiểm đầu vào` },
  { role: 'OperatorMember', path: '/operator/batches', ready: batchFunding.title },
  { role: 'OperatorMember', path: '/operator/batches/new', ready: farm.legalName },
  { role: 'OperatorMember', path: `/operator/batches/${batchDraft.batchCode}/edit`, ready: batchDraft.title },
  { role: 'OperatorMember', path: `/operator/batches/${CODE}`, ready: 'Còn giữ ở tài khoản Lô' },
  { role: 'OperatorMember', path: `/operator/batches/${CODE}/nhat-ky`, ready: 'Thay 30% nước dàn 1' },
  { role: 'OperatorMember', path: `/operator/batches/${CODE}/thu-hoach`, ready: 'Kết quả từng con' },
  { role: 'OperatorMember', path: `/operator/batches/${CODE}/giao-hang`, ready: 'Cần lập chuyến giao' },
  { role: 'OperatorMember', path: '/operator/log', ready: 'Ghi hôm nay' },
  { role: 'OperatorMember', path: '/operator/boxes', ready: '0101' },
  { role: 'OperatorMember', path: '/operator/evidence', ready: 'Chờ giải trình' },
  { role: 'OperatorMember', path: `/operator/evidence/${EVIDENCE_ID}`, ready: 'Người thẩm định: Cần bổ sung' },
  { role: 'OperatorMember', path: '/operator/deliveries', ready: trancheToShip.recipientName },
  { role: 'OperatorMember', path: `/operator/deliveries/${SHIPMENT_NO}`, ready: `Giao cho ${trancheScheduled.recipientName}` },
]
